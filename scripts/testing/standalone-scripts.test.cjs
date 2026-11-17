const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
for (const script of ['db-security-drill.ts', 'smoke-postgrest.ts']) {
  test(script + ' refuses an unmarked target before opening a connection', () => {
    const env = { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/postgres', SUPABASE_URL: 'http://127.0.0.1:1' };
    delete env.JOBSCLICK_TEST_MANIFEST;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', path.join(root,'scripts',script)], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DISPOSABLE_TEST_TARGET_REQUIRED/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
  });
}
test('fresh drill refuses caller-selected databases', () => {
  const modulePath = path.join(root,'scripts/drill-fresh-database.ts');
  const script = `require(${JSON.stringify(modulePath)}).drillFreshDatabase('postgresql://postgres:postgres@127.0.0.1:1/postgres').catch(error => { console.error(error.message); process.exitCode = 1; });`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types','-e',script], { cwd:root,encoding:'utf8',timeout:10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DISPOSABLE_TEST_TARGET_REQUIRED/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});
