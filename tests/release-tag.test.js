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

test('tag_glob: empty prefix returns v*', () => {
    const r = runHelper('printf "%s" "$(tag_glob "")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'v*');
});

test('tag_glob: non-empty prefix returns prefix/v*', () => {
    const r = runHelper('printf "%s" "$(tag_glob "release")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'release/v*');
});

test('format_tag: empty prefix returns v<version>', () => {
    const r = runHelper('printf "%s" "$(format_tag "" "1.2.3")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'v1.2.3');
});

test('format_tag: non-empty prefix returns prefix/v<version>', () => {
    const r = runHelper('printf "%s" "$(format_tag "release" "1.2.3")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'release/v1.2.3');
});

test('parse_tag_version: strips leading v from plain semver tag', () => {
    const r = runHelper('printf "%s" "$(parse_tag_version "v1.2.3" "")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '1.2.3');
});

test('parse_tag_version: strips prefix/v from prefixed tag', () => {
    const r = runHelper('printf "%s" "$(parse_tag_version "release/v1.2.3" "release")"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '1.2.3');
});

test('select_track: mixed tags show (無前綴) first then existing prefixes', () => {
    const r = runReleaseTag({
        input: '1\n1\n', // 選軌道 1 (無前綴)、增量 1 (patch)
        fakeOpts: {
            tags: ['v1.1.0', 'v1.1.1', 'release/v1.2.3'],
        },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // 選單置頂
    assert.match(r.stdout, /1\. \(無前綴\) — 目前 v1\.1\.1/);
    assert.match(r.stdout, /2\. release\/ — 目前 release\/v1\.2\.3/);
    assert.match(r.stdout, /✅ 已選擇軌道：\(無前綴\)/);
});

test('select_track: plain-only tags still show (無前綴) as the lone option', () => {
    const r = runReleaseTag({
        input: '1\n1\n',
        fakeOpts: { tags: ['v1.0.0', 'v1.1.0'] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1\. \(無前綴\) — 目前 v1\.1\.0/);
    // 軌道選單用 2-space 縮排，不應該出現第 2 項
    assert.doesNotMatch(r.stdout, /^ {2}2\. /m);
    assert.match(r.stdout, /✅ 已選擇軌道：\(無前綴\)/);
});

test('select_track: prefix-only tags show (無前綴) — 將建立 v0.0.1 as top entry', () => {
    const r = runReleaseTag({
        input: '2\n1\n', // 選軌道 2 (release/)
        fakeOpts: { tags: ['release/v1.2.3'] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1\. \(無前綴\) — 將建立 v0\.0\.1/);
    assert.match(r.stdout, /2\. release\/ — 目前 release\/v1\.2\.3/);
    assert.match(r.stdout, /✅ 已選擇軌道：release\//);
});

test('select_track: zero tags + default N creates plain v0.0.1', () => {
    const r = runReleaseTag({
        input: '\n1\n', // Enter 走預設 N、增量 1
        fakeOpts: { tags: [] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // read -p 的 prompt 在 bash 走 stderr；assert 兩邊合併
    const out = r.stdout + r.stderr;
    assert.match(out, /是否要加上 prefix？\(y\/N\)/);
    assert.match(out, /將建立第一個標籤：v0\.0\.1/);
});

test('select_track: zero tags + Y prompts for prefix and creates release/v0.0.1', () => {
    const r = runReleaseTag({
        input: 'y\nrelease\n1\n',
        fakeOpts: { tags: [] },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = r.stdout + r.stderr;
    assert.match(out, /是否要加上 prefix？\(y\/N\)/);
    assert.match(out, /將建立第一個標籤：release\/v0\.0\.1/);
});
