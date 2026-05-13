import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const devkitPath = resolve('devkit');

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\[[0-9;]*m/g;

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
