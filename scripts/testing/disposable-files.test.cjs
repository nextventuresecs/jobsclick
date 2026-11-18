const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const modulePath = path.resolve(__dirname, '../../apps/api/src/database/supabase.provider.ts');

test('test-mode JSON persistence refuses an unmarked working directory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobsclick-fs-test-'));
  try {
    const env = { ...process.env, NODE_ENV: 'test' }; delete env.JOBSCLICK_TEST_MANIFEST;
    const script = `try { const { PersistentDatabaseStore } = require(${JSON.stringify(modulePath)}); PersistentDatabaseStore.getInstance(); console.log('NO_REFUSAL'); } catch (error) { console.log(error.message); }`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '-e', script], { cwd: directory, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'DISPOSABLE_TEST_DATA_REQUIRED');
    assert.equal(fs.existsSync(path.join(directory, '.scratch')), false);
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'jobsclick-fs-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test('JSON fixtures live only under the marked run directory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobsclick-fs-test-'));
  try {
    const runDirectory = path.join(directory, 'jc-auth-test-12345678');
    fs.mkdirSync(runDirectory);
    const manifestPath = path.join(runDirectory, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, runId: 'jc-auth-test-12345678' }));
    const script = `const { PersistentDatabaseStore } = require(${JSON.stringify(modulePath)}); PersistentDatabaseStore.getInstance().setRow('users', 'synthetic-fixture', { id: 'synthetic-fixture' });`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '-e', script], { cwd: directory, env: { ...process.env, NODE_ENV: 'test', JOBSCLICK_TEST_MANIFEST: manifestPath }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(directory, '.scratch')), false);
    const workers = fs.readdirSync(path.join(runDirectory, 'fixture-json'));
    assert.equal(workers.length, 1);
    const data = JSON.parse(fs.readFileSync(path.join(runDirectory, 'fixture-json', workers[0], 'db-persistence.json'), 'utf8'));
    assert.equal(data.users['synthetic-fixture'].id, 'synthetic-fixture');
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'jobsclick-fs-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
