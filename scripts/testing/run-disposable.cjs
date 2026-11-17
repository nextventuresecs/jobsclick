const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { assertDisposableTargets, parseCliStatus } = require('./disposable-target.cjs');

const root = path.resolve(__dirname, '../..');
const runId = `jc-auth-test-${crypto.randomUUID().slice(0, 8)}`;
const directory = path.join(root, '.scratch', 'auth-disposable', runId);
const cli = [path.join(root, 'node_modules/supabase/dist/supabase.js')];
const environment = { ...process.env, DO_NOT_TRACK: '1' };
for (const key of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'JWT_SECRET', 'OTP_PEPPER', 'MSG91_AUTH_KEY', 'TURNSTILE_SECRET_KEY', 'RESEND_API_KEY']) delete environment[key];
const args = process.argv.slice(2).filter(arg => arg !== '--');
const contracts = args.includes('--auth-contracts');
const testArgs = args.filter(arg => arg !== '--auth-contracts');
const evidence = process.env.JOBSCLICK_TEST_EVIDENCE;
let started = false;
let redisStarted = false;
function redact(text) {
  return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[local JWT redacted]')
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[local key redacted]')
    .replace(/("(?:JWT_SECRET|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)"\s*:\s*")[^"]*/g, '$1[local value redacted]');
}
function command(binary, commandArgs, env = environment) {
  return cp.spawnSync(binary, commandArgs, { cwd: root, env, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}
function localCli(commandArgs) {
  return command(process.execPath, [...cli, ...commandArgs, '--workdir', directory]);
}
function requireSuccess(result, name) {
  if (result.status !== 0) throw new Error(`${name} failed (${result.status}): ${redact((result.stdout || '') + (result.stderr || '')).slice(-4000)}`);
}
async function freePorts(count) {
  const servers = [];
  try {
    for (let index = 0; index < count; index++) {
      const server = net.createServer();
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      servers.push(server);
    }
    return servers.map(server => server.address().port);
  } finally { await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))); }
}
async function main() {
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory); // Refuse reuse of an existing run directory.
  requireSuccess(localCli(['init']), 'supabase init');
  const [apiPort, databasePort, shadowPort, smtpPort, redisPort] = await freePorts(5);
  const manifest = { version: 1, runId, apiPort, databasePort, redisPort };
  const targets = { databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres`, apiUrl: `http://127.0.0.1:${apiPort}`, redisUrl: `redis://127.0.0.1:${redisPort}` };
  assertDisposableTargets(targets, manifest);
  const configPath = path.join(directory, 'supabase/config.toml');
  let config = fs.readFileSync(configPath, 'utf8').replace(/^project_id = .*$/m, () => `project_id = "${runId}"`);
  for (const [from, to] of [[54321, apiPort], [54322, databasePort], [54320, shadowPort], [54324, smtpPort]]) config = config.replaceAll(String(from), String(to));
  for (const section of ['db.seed', 'studio', 'analytics', 'realtime', 'edge_runtime', 'storage.vector']) {
    config = config.replace(new RegExp(`(\\[${section.replaceAll('.', '\\.')}\\][\\s\\S]*?enabled = )true`), (_, prefix) => prefix + 'false');
  }
  fs.writeFileSync(configPath, config.replace('jwt_expiry = 3600', 'jwt_expiry = 900'));
  const migrationDirectory = path.join(directory, 'supabase/migrations');
  fs.mkdirSync(migrationDirectory, { recursive: true });
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(file => file.endsWith('.sql'))) {
    fs.copyFileSync(path.join(root, 'supabase/migrations', file), path.join(migrationDirectory, file));
  }
  started = true;
  console.log(`Starting isolated Supabase ${runId}; developer database is excluded.`);
  const startup = localCli(['start', '--output', 'json']);
  requireSuccess(startup, 'supabase start');
  // start's display varies with agent detection; status has a stable JSON contract.
  const inspection = localCli(['status', '--output', 'json']);
  requireSuccess(inspection, 'supabase status');
  const status = parseCliStatus(inspection.stdout);
  const reportedDatabase = new URL(status.DB_URL);
  if (reportedDatabase.hostname !== '127.0.0.1' || Number(reportedDatabase.port) !== databasePort
    || reportedDatabase.pathname !== '/postgres' || new URL(status.API_URL).origin !== targets.apiUrl) throw new Error('DISPOSABLE_STACK_IDENTITY_MISMATCH');
  const redis = command('docker', ['run', '--detach', '--rm', '--name', runId + '-redis', '--label', 'jobsclick.disposable=' + runId, '-p', `127.0.0.1:${redisPort}:6379`, 'redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no']);
  requireSuccess(redis, 'isolated Redis');
  redisStarted = true;
  const db = new Client({ connectionString: targets.databaseUrl });
  await db.connect();
  try {
    const counts = (await db.query('select (select count(*)::int from public.users) as users,(select count(*)::int from auth.users) as auth')).rows[0];
    if (counts.users || counts.auth) throw new Error('DISPOSABLE_STACK_NOT_EMPTY');
    await db.query('create schema test_support; revoke all on schema test_support from public,anon,authenticated,service_role; create table test_support.run_identity(run_id text primary key); alter table test_support.run_identity enable row level security');
    await db.query('insert into test_support.run_identity values($1)', [runId]);
  } finally { await db.end(); }
  const manifestPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const env = { ...environment, NODE_ENV: 'test', DATABASE_URL: targets.databaseUrl, SUPABASE_URL: targets.apiUrl, REDIS_URL: targets.redisUrl,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, SUPABASE_ANON_KEY: status.ANON_KEY, RUN_LOCAL_SUPABASE: '1', JOBSCLICK_TEST_MANIFEST: manifestPath, JOBSCLICK_TEST_DB_PORT: String(databasePort) };
  const tests = command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...testArgs], env);
  const output = `Project: ${runId}\nFresh Supabase + Redis; no dev data. Before fixtures: users=0, auth=0 (asserted).\nExit: ${tests.status}\n${redact((tests.stdout || '') + (tests.stderr || ''))}`;
  if (evidence) { fs.mkdirSync(path.dirname(evidence), { recursive: true }); fs.writeFileSync(evidence, output.replace(/\x1b\[[0-9;]*m/g, '')); }
  console.log(redact((tests.stdout || '').slice(-6000)));
  requireSuccess(tests, 'Vitest');
  if (contracts) {
    const tapPath = path.join(directory, 'supabase/tests');
    fs.mkdirSync(tapPath, { recursive: true });
    for (const file of ['auth_contacts_v21.pgtap.sql', 'auth_claims_v21.pgtap.sql']) {
      fs.writeFileSync(path.join(tapPath, file), "BEGIN;\nCREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;\nSET search_path=extensions,public;\n" + fs.readFileSync(path.join(root, 'packages/database/test/sql', file), 'utf8') + '\nROLLBACK;\n');
    }
    const tap = localCli(['test', 'db', tapPath]);
    if (evidence) fs.writeFileSync(evidence.replace(/\.txt$/, '-pgtap.txt'), `Project: ${runId}\nExit: ${tap.status}\n${redact((tap.stdout || '') + (tap.stderr || ''))}`);
    console.log(redact((tap.stdout || '').slice(-4000)));
    requireSuccess(tap, 'native Supabase pgTAP');
    const native = command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'apps/api/test/auth-native.local.spec.ts'], { ...env, RUN_AUTH_NATIVE: '1', JOBSCLICK_TEST_RUN_ID: runId });
    if (evidence) fs.writeFileSync(evidence.replace(/\.txt$/, '-native-auth.txt'), `Project: ${runId}\nExit: ${native.status}\n${redact((native.stdout || '') + (native.stderr || ''))}`);
    console.log(redact((native.stdout || '').slice(-3000)));
    requireSuccess(native, 'actual GoTrue identity/claim/ban');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  // Names are generated here, never read from user env or an existing dev project.
  if (!/^jc-auth-test-[a-f0-9]{8}$/.test(runId) || !directory.startsWith(path.join(root, '.scratch', 'auth-disposable') + path.sep)) throw new Error('DISPOSABLE_CLEANUP_REFUSED');
  if (started) { const result = localCli(['stop', '--project-id', runId, '--no-backup']); if (result.status !== 0) { console.error('Disposable Supabase cleanup failed'); process.exitCode = 1; } }
  if (redisStarted) { const result = command('docker', ['rm', '--force', runId + '-redis']); if (result.status !== 0) { console.error('Disposable Redis cleanup failed'); process.exitCode = 1; } }
  const fixtureDirectory = path.resolve(directory, 'fixture-json');
  if (path.dirname(fixtureDirectory) !== path.resolve(directory)) throw new Error('DISPOSABLE_CLEANUP_REFUSED');
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  console.log(`Disposed only ${runId}; developer stack preserved.`);
});
