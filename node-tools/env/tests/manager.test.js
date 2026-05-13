import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EnvManager } from '../src/manager.js';

async function withTempProject(callback) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-env-manager-'));

    try {
        return await callback(tempDir);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

test('switch copies the named environment to .env and current reports it', async () => {
    await withTempProject(async (projectPath) => {
        await fs.writeFile(
            path.join(projectPath, '.env.local'),
            'APP_ENV=local\nAPP_NAME=Demo\nDB_DATABASE=demo_local\n',
            'utf8'
        );
        const manager = new EnvManager(projectPath);

        await manager.switch('local');
        const current = await manager.current();

        assert.equal(current.environment, 'local');
        assert.equal(current.variableCount, 3);
        assert.equal(
            await fs.readFile(path.join(projectPath, '.env'), 'utf8'),
            'APP_ENV=local\nAPP_NAME=Demo\nDB_DATABASE=demo_local\n'
        );
    });
});

test('list marks the environment matching the current key variables', async () => {
    await withTempProject(async (projectPath) => {
        await fs.writeFile(
            path.join(projectPath, '.env.local'),
            'APP_ENV=local\nAPP_NAME=Demo\nDB_DATABASE=demo_local\n',
            'utf8'
        );
        await fs.writeFile(
            path.join(projectPath, '.env.staging'),
            'APP_ENV=staging\nAPP_NAME=Demo\nDB_DATABASE=demo_staging\n',
            'utf8'
        );
        await fs.writeFile(
            path.join(projectPath, '.env'),
            'APP_ENV=local\nAPP_NAME=Demo\nDB_DATABASE=demo_local\n',
            'utf8'
        );
        const manager = new EnvManager(projectPath);

        const environments = await manager.list();
        const local = environments.find((env) => env.name === 'local');
        const staging = environments.find((env) => env.name === 'staging');

        assert.equal(local.isCurrent, true);
        assert.equal(staging.isCurrent, false);
    });
});
