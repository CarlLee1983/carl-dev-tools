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

test('install.sh --user --force --non-interactive completes without prompting', () => {
    withSandboxHome((home) => {
        const r = runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        assert.equal(r.status, 0, r.combined);
        const symlink = join(home, '.local', 'bin', 'devkit');
        assert.ok(existsSync(symlink), `symlink missing: ${symlink}\n${r.combined}`);
        assert.equal(readlinkSync(symlink), join(repoDir, 'devkit'));
    });
});

test('install.sh --user --force --non-interactive is idempotent on second run', () => {
    withSandboxHome((home) => {
        const first = runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        assert.equal(first.status, 0, first.combined);
        const second = runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        assert.equal(second.status, 0, second.combined);
        const symlink = join(home, '.local', 'bin', 'devkit');
        assert.equal(readlinkSync(symlink), join(repoDir, 'devkit'));
    });
});

test('install.sh --non-interactive implies --force (no prompt when symlink exists)', () => {
    withSandboxHome((home) => {
        // Seed: install once with --force.
        runInstall(['--user', '--force', '--non-interactive'], { HOME: home });
        // Now re-install without explicit --force; --non-interactive alone must skip the y/N prompt.
        const r = runInstall(['--user', '--non-interactive'], { HOME: home });
        assert.equal(r.status, 0, r.combined);
        assert.doesNotMatch(r.combined, /是否要覆蓋/);
    });
});
