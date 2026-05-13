import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const devkitPath = resolve('devkit');

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1B\[[0-9;]*m/g;

function stripAnsi(input) {
    return input.replace(ANSI_PATTERN, '');
}

function runDevkit(args = []) {
    const result = spawnSync('bash', [devkitPath, ...args], {
        encoding: 'utf8',
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    return {
        status: result.status,
        stdout,
        stderr,
        combined: stripAnsi(stdout + stderr),
    };
}

test('devkit --version prints a concise version line and exits 0', () => {
    const r = runDevkit(['--version']);
    assert.equal(r.status, 0, r.combined);
    assert.match(r.combined, /DevKit v\d+\.\d+\.\d+/);
});

test('devkit default output does not contain malformed Ugit/Uenv labels', () => {
    const r = runDevkit([]);
    assert.equal(r.status, 0, r.combined);
    assert.doesNotMatch(r.combined, /Ugit/);
    assert.doesNotMatch(r.combined, /Uenv/);
});

test('devkit default output uses the new section structure', () => {
    const r = runDevkit([]);
    assert.equal(r.status, 0, r.combined);
    assert.match(r.combined, /DevKit v\d+\.\d+\.\d+/);
    assert.match(r.combined, /^分類$/m);
    assert.match(r.combined, /^工具$/m);
    assert.match(r.combined, /^使用方式$/m);
    // categories still rendered with their lowercase slug for invocation
    assert.match(r.combined, /\bgit\b/);
    assert.match(r.combined, /\benv\b/);
    // tool names appear under the 工具 grouping
    assert.match(r.combined, /clean-branch/);
    assert.match(r.combined, /release-tag/);
    assert.match(r.combined, /sync-all/);
});

test('devkit <category> shows a clean category view with usage hint', () => {
    const r = runDevkit(['git']);
    assert.equal(r.status, 0, r.combined);
    assert.doesNotMatch(r.combined, /Ugit/);
    assert.match(r.combined, /Git 工具/);
    assert.match(r.combined, /clean-branch/);
    assert.match(r.combined, /release-tag/);
    assert.match(r.combined, /sync-all/);
    assert.match(r.combined, /^使用方式$/m);
    assert.match(r.combined, /devkit git:<tool>/);
});

test('devkit unknown category exits non-zero with a clear error and category list', () => {
    const r = runDevkit(['definitely-not-a-category']);
    assert.notEqual(r.status, 0, r.combined);
    assert.match(r.combined, /錯誤：分類 'definitely-not-a-category' 不存在/);
    assert.match(r.combined, /^可用分類$/m);
    assert.match(r.combined, /\bgit\b/);
    assert.match(r.combined, /\benv\b/);
    // The error must not leak the old emoji-flagged format
    assert.doesNotMatch(r.combined, /❌/);
});

test('devkit <existing-category>:<unknown-tool> exits non-zero with available tool list', () => {
    const r = runDevkit(['git:definitely-not-a-tool']);
    assert.notEqual(r.status, 0, r.combined);
    assert.match(r.combined, /錯誤：工具 'git:definitely-not-a-tool' 不存在/);
    assert.match(r.combined, /git 可用工具/);
    assert.match(r.combined, /devkit git:clean-branch/);
    assert.doesNotMatch(r.combined, /❌/);
});

test('devkit <unknown-category>:<tool> routes to a category-not-exist error', () => {
    const r = runDevkit(['definitely-not-a-category:whatever']);
    assert.notEqual(r.status, 0, r.combined);
    assert.match(r.combined, /錯誤：分類 'definitely-not-a-category' 不存在/);
    assert.match(r.combined, /^可用分類$/m);
});

test('devkit --update outside a git work tree exits non-zero with bootstrap hint', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'devkit-non-git-'));
    try {
        const devkitCopy = join(tmpDir, 'devkit');
        cpSync(devkitPath, devkitCopy);
        chmodSync(devkitCopy, 0o755);

        const result = spawnSync('bash', [devkitCopy, '--update'], { encoding: 'utf8' });
        const combined = stripAnsi((result.stdout ?? '') + (result.stderr ?? ''));

        assert.notEqual(result.status, 0, combined);
        assert.match(combined, /錯誤：DevKit 安裝目錄不是 git 倉庫/);
        assert.match(combined, /bootstrap\.sh \| bash/);
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('devkit --doctor prints the health report sections without emoji', () => {
    const r = runDevkit(['--doctor']);
    assert.match(r.combined, /^DevKit 體檢$/m);
    assert.match(r.combined, /^bash$/m);
    assert.match(r.combined, /^Node\.js$/m);
    assert.match(r.combined, /^PATH$/m);
    assert.match(r.combined, /^結果$/m);
    assert.doesNotMatch(r.combined, /❌|✅|⚠️/);
});

test('devkit --doctor exits 1 when required tooling is missing from PATH', () => {
    const result = spawnSync('bash', [devkitPath, '--doctor'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    const combined = stripAnsi((result.stdout ?? '') + (result.stderr ?? ''));
    assert.equal(result.status, 1, combined);
    assert.match(combined, /錯誤/);
});
