import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = resolve('bash-tools/git/clean-branch.sh');

function makeFakeGit(dir, { scenario = 'clean', name = 'git' } = {}) {
    const logPath = join(dir, `${name}.log`);
    const binPath = join(dir, name);
    writeFileSync(
        binPath,
        `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
case "$1" in
  show-ref) exit 0 ;;
  ls-remote) [[ "${scenario}" == no-network ]] && exit 1 || exit 0 ;;
  status)
    if [[ "$2" == --porcelain && "${scenario}" == dirty ]]; then
      printf ' M src/app.js\\n'
    fi
    exit 0
    ;;
  fetch|checkout|pull) exit 0 ;;
  branch)
    if [[ "$2" == --merged ]]; then
      case "${scenario}" in
        protected) printf '  release/keep\\n  feature/old\\n' ;;
        none) ;;
        *) printf '  feature/old\\n' ;;
      esac
      exit 0
    fi
    if [[ "$2" == -r && "$3" == --merged ]]; then
      case "${scenario}" in
        remote-only) printf '  origin/feature/old\\n' ;;
        *) ;;
      esac
      exit 0
    fi
    if [[ "$2" == -d ]]; then exit 0; fi
    ;;
  push) exit 0 ;;
esac
exit 0
`,
    );
    chmodSync(binPath, 0o755);
    return { binPath, logPath };
}

function runCleanBranch({ args = [], input = '', scenario = 'clean', env = {}, pathGit = true } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'clean-branch-test-'));
    const fake = pathGit ? makeFakeGit(dir, { scenario }) : null;
    const result = spawnSync('bash', [scriptPath, ...args], {
        input,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: pathGit ? `${dir}:${process.env.PATH}` : process.env.PATH,
            ...env,
        },
    });
    const log = fake ? readFileSync(fake.logPath, 'utf8') : '';
    return { ...result, stdout: result.stdout ?? '', stderr: result.stderr ?? '', log, dir };
}

test('clean-branch aborts before checkout or deletion when worktree has uncommitted changes', () => {
    const result = runCleanBranch({ scenario: 'dirty', input: 'y\ny\n' });

    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /未提交|工作區/);
    assert.doesNotMatch(result.log, /^checkout /m);
    assert.doesNotMatch(result.log, /^branch -d /m);
});

test('clean-branch protects caller-provided branch patterns from local deletion', () => {
    const result = runCleanBranch({ scenario: 'protected', args: ['--protect', 'release/.*'], input: 'y\n' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /保護|跳過/);
    assert.match(result.log, /^branch -d feature\/old$/m);
    assert.doesNotMatch(result.log, /^branch -d release\/keep$/m);
});

test('clean-branch does not delete remote branches unless remote cleanup is explicitly enabled', () => {
    const result = runCleanBranch({ scenario: 'remote-only', input: 'y\ny\n' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /遠端.*未啟用|--remote/);
    assert.doesNotMatch(result.log, /^push origin --delete /m);
});

test('clean-branch can run against a caller-provided git binary for simulation tests', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clean-branch-git-bin-'));
    const good = makeFakeGit(dir, { scenario: 'none', name: 'good-git' });
    writeFileSync(join(dir, 'git'), '#!/usr/bin/env bash\nexit 99\n');
    chmodSync(join(dir, 'git'), 0o755);

    const result = spawnSync('bash', [scriptPath], {
        input: '',
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            DEVKIT_GIT_BIN: good.binPath,
        },
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(good.logPath, 'utf8'), /^show-ref /m);
});


test('clean-branch requires an explicit DELETE_REMOTE phrase before deleting remote branches', () => {
    const declined = runCleanBranch({ scenario: 'remote-only', args: ['--remote'], input: 'y\ny\n' });

    assert.equal(declined.status, 0, declined.stdout + declined.stderr);
    assert.match(declined.stdout + declined.stderr, /DELETE_REMOTE|取消刪除遠端/);
    assert.doesNotMatch(declined.log, /^push origin --delete /m);

    const confirmed = runCleanBranch({ scenario: 'remote-only', args: ['--remote'], input: 'y\ny\nDELETE_REMOTE\n' });

    assert.equal(confirmed.status, 0, confirmed.stdout + confirmed.stderr);
    assert.match(confirmed.log, /^push origin --delete feature\/old$/m);
});
