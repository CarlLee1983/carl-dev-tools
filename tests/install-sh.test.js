import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readlinkSync, cpSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const installPath = resolve('install.sh');
const devkitPath = resolve('devkit');
const repoDir = resolve('.');

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1B\[[0-9;]*m/g;

function stripAnsi(input) {
    return input.replace(ANSI_PATTERN, '');
}

function runInstall(args = [], env = {}) {
    const result = spawnSync('bash', [installPath, ...args], {
        encoding: 'utf8',
        cwd: repoDir,
        env: { ...process.env, ...env },
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

function withSandboxHome(fn) {
    const home = mkdtempSync(join(tmpdir(), 'devkit-install-'));
    try {
        return fn(home);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('install.sh --help exits 0', () => {
    const r = runInstall(['--help']);
    assert.equal(r.status, 0, r.combined);
});
