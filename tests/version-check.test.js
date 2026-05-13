import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VersionChecker } from '../src/utils/version-check.js';

test('VersionChecker can be imported and validates the supported Node range', () => {
    assert.equal(typeof VersionChecker.checkNodeVersion, 'function');
    assert.equal(VersionChecker.checkNodeVersion(), true);
});
