import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EnvValidator } from '../src/utils/validator.js';

async function withTempEnv(content, callback) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devkit-env-validator-'));
    const envPath = path.join(tempDir, '.env');

    try {
        await fs.writeFile(envPath, content, 'utf8');
        return await callback(envPath);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

test('parseEnvFile ignores comments and preserves values containing equals signs', async () => {
    await withTempEnv('# comment\nAPP_ENV=local\nTOKEN=a=b=c\nEMPTY=\n', async (envPath) => {
        const result = await EnvValidator.parseEnvFile(envPath);

        assert.deepEqual(result, {
            APP_ENV: 'local',
            TOKEN: 'a=b=c',
            EMPTY: ''
        });
    });
});

test('validateFormat reports duplicate keys and malformed lines', async () => {
    await withTempEnv('APP_ENV=local\nINVALID_LINE\nAPP_ENV=staging\n', async (envPath) => {
        const result = await EnvValidator.validateFormat(envPath);

        assert.equal(result.valid, false);
        assert.match(result.errors.join('\n'), /格式錯誤/);
        assert.match(result.errors.join('\n'), /重複的變數名稱: APP_ENV/);
    });
});
