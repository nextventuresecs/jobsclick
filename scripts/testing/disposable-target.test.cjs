const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertDisposableTargets, assertAllowedConnection, parseCliStatus, assertDisposableDatabase } = require('./disposable-target.cjs');

const manifest = { version: 1, runId: 'jc-auth-test-12345678', apiPort: 56121, databasePort: 56122, redisPort: 56379 };
const targets = { databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:56122/postgres', apiUrl: 'http://127.0.0.1:56121', redisUrl: 'redis://127.0.0.1:56379' };
test('rejects the persistent dev DB even with an explicit opt-in flag', () => {
  assert.throws(() => assertDisposableTargets({ ...targets, databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' }, manifest), /DISPOSABLE_TEST_TARGET_REQUIRED/);
});
test('rejects missing or mismatched run manifests', () => {
  assert.throws(() => assertDisposableTargets(targets), /DISPOSABLE_TEST_TARGET_REQUIRED/);
  assert.throws(() => assertDisposableTargets(targets, { ...manifest, databasePort: 56123 }), /DISPOSABLE_TEST_TARGET_REQUIRED/);
});
test('accepts only the exact provisioned localhost endpoints', () => {
  assert.doesNotThrow(() => assertDisposableTargets(targets, manifest));
  for (const databaseUrl of ['not-a-url', 'postgresql://postgres:postgres@remote.invalid:56122/postgres']) {
    assert.throws(() => assertDisposableTargets({ ...targets, databaseUrl }, manifest), /DISPOSABLE_TEST_TARGET_REQUIRED/);
  }
});
test('network backstop rejects hardcoded dev ports and remote connections', () => {
  for (const port of [5432, 54321, 54322, 6379]) assert.throws(() => assertAllowedConnection('127.0.0.1', port), /TEST_NETWORK_TARGET_DENIED/);
  assert.throws(() => assertAllowedConnection('remote.invalid', 443), /TEST_NETWORK_TARGET_DENIED/);
  assert.doesNotThrow(() => assertAllowedConnection('127.0.0.1', 56122));
});
test('parses CLI v3 status JSON surrounded by local startup notices', () => {
  const status = { DB_URL: targets.databaseUrl, API_URL: targets.apiUrl };
  assert.deepEqual(parseCliStatus(`Started local services.\n${JSON.stringify(status, null, 2)}\nUpdate notice.\n`), status);
});
test('standalone database tools refuse an absent run marker before connecting', async () => {
  await assert.rejects(() => assertDisposableDatabase('postgresql://postgres:postgres@127.0.0.1:54322/postgres', ''), /DISPOSABLE_TEST_TARGET_REQUIRED/);
});
