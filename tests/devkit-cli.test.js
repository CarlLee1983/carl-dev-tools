import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

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
