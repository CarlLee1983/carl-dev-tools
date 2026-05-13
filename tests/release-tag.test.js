import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = resolve('bash-tools/git/release-tag.sh');

/**
 * 建一支假的 git binary，依照測試情境回應 tag/rev-parse/branch 等子指令。
 * tags 透過檔案傳遞，避免 quoting 噩夢。
 */
function makeFakeGit(dir, {
    tags = [],
    head = 'aaaaaaaaaaaa',
    tagSha = 'bbbbbbbbbbbb',
    currentBranch = 'main',
    branches = ['main'],
    remoteTags = [],
    name = 'git',
} = {}) {
    const logPath = join(dir, `${name}.log`);
    const tagsFile = join(dir, `${name}.tags`);
    const remoteTagsFile = join(dir, `${name}.remote-tags`);
    const branchesFile = join(dir, `${name}.branches`);
    const binPath = join(dir, name);

    writeFileSync(tagsFile, tags.length ? tags.join('\n') + '\n' : '');
    writeFileSync(remoteTagsFile, remoteTags.map(t => `deadbeef refs/tags/${t}`).join('\n') + (remoteTags.length ? '\n' : ''));
    writeFileSync(branchesFile, branches.map(b => `  ${b}`).join('\n') + (branches.length ? '\n' : ''));

    writeFileSync(binPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
TAGS_FILE=${JSON.stringify(tagsFile)}
REMOTE_TAGS_FILE=${JSON.stringify(remoteTagsFile)}
BRANCHES_FILE=${JSON.stringify(branchesFile)}
case "$1" in
  rev-parse)
    case "$2" in
      --git-dir) echo ".git" ;;
      HEAD) echo ${JSON.stringify(head)} ;;
    esac
    exit 0 ;;
  status) exit 0 ;;
  branch)
    case "$2" in
      --show-current) echo ${JSON.stringify(currentBranch)} ;;
      -a) cat "$BRANCHES_FILE" ;;
    esac
    exit 0 ;;
  remote)
    [[ "$2" == -v ]] && echo "origin git@example.com:repo.git (fetch)"
    exit 0 ;;
  fetch) exit 0 ;;
  tag)
    if [[ "$2" == -l ]]; then
      if [[ -n "\${3:-}" ]]; then
        pattern="$3"
        regex=$(printf '%s' "$pattern" | sed 's/\\./\\\\./g; s/\\*/.*/g')
        grep -E "^\${regex}\\$" "$TAGS_FILE" 2>/dev/null || true
      else
        cat "$TAGS_FILE"
      fi
      exit 0
    fi
    if [[ "$2" == -a ]]; then exit 0; fi
    ;;
  rev-list) echo ${JSON.stringify(tagSha)}; exit 0 ;;
  ls-remote) cat "$REMOTE_TAGS_FILE"; exit 0 ;;
  push|checkout|pull) exit 0 ;;
esac
exit 0
`);
    chmodSync(binPath, 0o755);
    return { binPath, logPath, tagsFile };
}

function runReleaseTag({ args = ['--force'], input = '', fakeOpts = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'release-tag-test-'));
    const fake = makeFakeGit(dir, fakeOpts);
    const result = spawnSync('bash', [scriptPath, ...args], {
        input,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            DEVKIT_GIT_BIN: fake.binPath,
        },
    });
    return {
        ...result,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        log: readFileSync(fake.logPath, 'utf8'),
    };
}

function runHelper(snippet) {
    return spawnSync('bash', ['-c', `source "${scriptPath}"; ${snippet}`], {
        encoding: 'utf8',
    });
}

test('release-tag scaffold: --help exits 0 without touching git', () => {
    const r = spawnSync('bash', [scriptPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /Git 智慧版本標籤工具/);
});

test('release-tag scaffold: source guard prevents main() from running when sourced', () => {
    const r = runHelper('echo "sourced ok"');
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /sourced ok/);
    // 不應該看到 main() 第一行的 banner
    assert.doesNotMatch(r.stdout ?? '', /🏷️/);
});
