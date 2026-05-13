import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const doctorPath = resolve('bash-tools/docker/doctor.sh');
const cleanPath = resolve('bash-tools/docker/clean.sh');

/**
 * 建一支假的 docker binary，依測試情境回應 info/version/compose version/system df/system prune。
 * 所有呼叫的 "$*" 會 append 到 log 檔，測試讀檔比對。
 */
function makeFakeDocker(dir, {
    infoExit = 0,
    versionExit = 0,
    composeExit = 0,
    dfExit = 0,
    pruneExit = 0,
    name = 'docker',
} = {}) {
    const logPath = join(dir, `${name}.log`);
    const binPath = join(dir, name);

    writeFileSync(binPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
case "$1" in
  info) exit ${infoExit} ;;
  version) exit ${versionExit} ;;
  compose)
    case "$2" in
      version) exit ${composeExit} ;;
    esac
    exit 0 ;;
  system)
    case "$2" in
      df) exit ${dfExit} ;;
      prune) exit ${pruneExit} ;;
    esac
    exit 0 ;;
esac
exit 0
`);
    chmodSync(binPath, 0o755);
    return { binPath, logPath };
}

function runScript(scriptPath, { args = [], input = '', fakeOpts = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'docker-tool-test-'));
    const fake = makeFakeDocker(dir, fakeOpts);
    const result = spawnSync('bash', [scriptPath, ...args], {
        input,
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            DEVKIT_DOCKER_BIN: fake.binPath,
        },
    });
    return {
        ...result,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        log: readFileSync(fake.logPath, 'utf8'),
    };
}

const runDoctor = (opts) => runScript(doctorPath, opts);
const runClean = (opts) => runScript(cleanPath, opts);

test('doctor: --help exits 0 without touching docker', () => {
    const r = spawnSync('bash', [doctorPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /Docker 健康狀態檢查/);
});

test('doctor: calls info, version, compose version, system df in order', () => {
    const r = runDoctor({ fakeOpts: {} });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = r.log.split('\n').filter(Boolean);
    assert.deepEqual(lines, ['info', 'version', 'compose version', 'system df']);
});

test('doctor: exits 1 when docker info fails', () => {
    const r = runDoctor({ fakeOpts: { infoExit: 1 } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    // info 仍會被呼叫一次
    assert.match(r.log, /^info$/m);
    // 但不應該再呼叫 version / compose / df
    assert.doesNotMatch(r.log, /^version$/m);
    assert.doesNotMatch(r.log, /^compose version$/m);
    assert.doesNotMatch(r.log, /^system df$/m);
});

test('clean: --help exits 0 without touching docker', () => {
    const r = spawnSync('bash', [cleanPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
    assert.match(r.stdout ?? '', /Docker 保守資源清理/);
    assert.match(r.stdout ?? '', /DELETE_DOCKER_VOLUMES/);
});

test('clean: --dry-run does not invoke prune; prints planned command', () => {
    const r = runClean({ args: ['--dry-run', '--force'] });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // pre-check 會跑一次 info，但不該出現 system prune
    assert.match(r.log, /^info$/m);
    assert.doesNotMatch(r.log, /system prune/);
    // 預計指令仍須在 stdout 列出
    assert.match(r.stdout, /預計指令.*system prune --force/);
});

test('clean: --force runs docker system prune --force without --volumes', () => {
    const r = runClean({ args: ['--force'] });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = r.log.split('\n').filter(Boolean);
    // 最後一筆呼叫須是 system prune --force（前面是 pre-check 的 info）
    assert.equal(lines[lines.length - 1], 'system prune --force');
    // 任何呼叫都不該帶 --volumes
    assert.doesNotMatch(r.log, /--volumes/);
});
