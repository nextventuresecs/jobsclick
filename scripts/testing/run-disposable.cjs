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
// Inherit OS tool discovery only. Unknown credentials and runtime injection must stay out.
const hostVariables = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC',
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'XDG_RUNTIME_DIR', 'CI', 'NO_COLOR']);
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => hostVariables.has(key.toUpperCase())));
environment.DO_NOT_TRACK = '1';
const args = process.argv.slice(2).filter(arg => arg !== '--');
const contracts = args.includes('--auth-contracts');
const dbTools = args.includes('--db-tools');
const writeTypes = args.includes('--write-generated-types');
const nativeOtp = args.includes('--native-otp');
const captchaReject = args.includes('--captcha-reject');
if (captchaReject && !nativeOtp) throw Error('NATIVE_OTP_REQUIRED');
const localSecrets = [];
if (nativeOtp) {
  environment.JOBSCLICK_TEST_SMS_HOOK_SECRET = 'v1,whsec_' + crypto.randomBytes(32).toString('base64');
  environment.JOBSCLICK_TEST_SMS_HMAC_KEY = crypto.randomBytes(32).toString('base64');
  environment.JOBSCLICK_TEST_CAPTCHA_MODE = captchaReject ? 'reject' : 'pass';
  environment.JOBSCLICK_TEST_TURNSTILE_SECRET = captchaReject ? '2x0000000000000000000000000000000AA' : '1x0000000000000000000000000000000AA'; // Public Cloudflare test key.
  localSecrets.push(environment.JOBSCLICK_TEST_SMS_HOOK_SECRET, environment.JOBSCLICK_TEST_SMS_HMAC_KEY);
}
const testArgs = args.filter(arg => !['--auth-contracts','--db-tools','--write-generated-types','--native-otp','--captcha-reject'].includes(arg));
const evidence = process.env.JOBSCLICK_TEST_EVIDENCE;
let started = false;
let redisStarted = false;
function redact(text) {
  for (const secret of localSecrets) text = text.replaceAll(secret, '[local secret redacted]');
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
  const [apiPort, databasePort, shadowPort, smtpPort, redisPort, hookPort] = await freePorts(6);
  const manifest = { version: 1, runId, apiPort, databasePort, redisPort, hookPort, mailPort: smtpPort };
  const targets = { databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres`, apiUrl: `http://127.0.0.1:${apiPort}`, redisUrl: `redis://127.0.0.1:${redisPort}` };
  assertDisposableTargets(targets, manifest);
  const configPath = path.join(directory, 'supabase/config.toml');
  let config = fs.readFileSync(configPath, 'utf8').replace(/^project_id = .*$/m, () => `project_id = "${runId}"`);
  for (const [from, to] of [[54321, apiPort], [54322, databasePort], [54320, shadowPort], [54324, smtpPort]]) config = config.replaceAll(String(from), String(to));
  for (const section of ['db.seed', 'studio', 'analytics', 'realtime', 'edge_runtime', 'storage.vector']) {
    config = config.replace(new RegExp(`(\\[${section.replaceAll('.', '\\.')}\\][\\s\\S]*?enabled = )true`), (_, prefix) => prefix + 'false');
  }
  if (nativeOtp) {
    config = config.replace(/(\[auth\.sms\][\s\S]*?enabled = )false/, (_, start) => start + 'true');
    config = config.replace(/(\[auth\.sms\][\s\S]*?enable_confirmations = )false/, (_, start) => start + 'true');
    config = config.replace(/(\[auth\.sms\][\s\S]*?max_frequency = )"5s"/, (_, start) => start + '"1s"');
    config = config.replace(/(\[auth\.email\][\s\S]*?enable_confirmations = )false/, (_, start) => start + 'true');
    // CLI currently derives phone-enabled from an enabled SMS adapter even with a custom hook.
    // Placeholder adapter credentials are deliberately invalid; the signed hook is the only sender.
    config = config.replace(/(\[auth\.sms\.twilio\][\s\S]*?enabled = )false/, (_, start) => start + 'true');
    config = config.replace('account_sid = ""', 'account_sid = "fixture-not-a-real-account"').replace('message_service_sid = ""', 'message_service_sid = "fixture-not-a-real-service"');
    environment.SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN = 'fixture-not-a-real-token';
    const templates = path.join(directory, 'supabase/templates'); fs.mkdirSync(templates, { recursive: true });
    fs.writeFileSync(path.join(templates, 'otp-fixture.html'), '<code>{{ .Token }}</code>');
    config += '\n[auth.hook.send_sms]\nenabled = true\nuri = "http://host.docker.internal:' + hookPort + '/supabase-sms-hook"\nsecrets = "env(JOBSCLICK_TEST_SMS_HOOK_SECRET)"\n';
    config += '\n[auth.email.template.magic_link]\ncontent_path = "./supabase/templates/otp-fixture.html"\n';
    config += '\n[auth.email.template.confirmation]\ncontent_path = "./supabase/templates/otp-fixture.html"\n';
    config += '\n[auth.captcha]\nenabled = true\nprovider = "turnstile"\nsecret = "env(JOBSCLICK_TEST_TURNSTILE_SECRET)"\n';
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
  if (nativeOtp) {
    const inspected = command('docker', ['inspect', 'supabase_auth_' + runId, 'supabase_inbucket_' + runId]);
    requireSuccess(inspected, 'inspect disposable services');
    const info = JSON.parse(inspected.stdout).map(container => ({ image: container.Config.Image,
      environment: container.Config.Env.filter(value => /^(GOTRUE_EXTERNAL_PHONE_ENABLED|GOTRUE_SMS_AUTOCONFIRM|GOTRUE_HOOK_SEND_SMS_ENABLED|GOTRUE_HOOK_SEND_SMS_URI|GOTRUE_SECURITY_CAPTCHA_ENABLED|GOTRUE_SMTP_HOST|GOTRUE_SMTP_PORT)=/.test(value)) }));
    if (evidence) fs.writeFileSync(evidence.replace(/\.txt$/, '-services.json'), JSON.stringify(info, null, 2));
  }
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
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_JWT_SECRET: status.JWT_SECRET, RUN_LOCAL_SUPABASE: '1', JOBSCLICK_TEST_HOOK_PORT: String(hookPort), JOBSCLICK_TEST_MAIL_URL: 'http://127.0.0.1:' + smtpPort, JOBSCLICK_TEST_MANIFEST: manifestPath, JOBSCLICK_TEST_DB_PORT: String(databasePort) };
  const toolsToRun = [];
  if (writeTypes) toolsToRun.push(['types-write', ['scripts/generate-types.js', '--write']]);
  if (dbTools) toolsToRun.push(['types-check', ['scripts/generate-types.js', '--check']],
    ['catalog', ['--experimental-strip-types', 'scripts/db-catalog-check.ts']],
    ['security-drill', ['--experimental-strip-types', 'scripts/db-security-drill.ts']],
    ['http-smoke', ['--experimental-strip-types', 'scripts/smoke-postgrest.ts']],
    ['security-advisors', ['node_modules/supabase/dist/supabase.js', 'db', 'advisors', '--type', 'all', '--fail-on', 'error', '--output-format', 'json', '--agent', 'no', '--workdir', directory]]);
  for (const [name, toolArgs] of toolsToRun) {
    const result = command(process.execPath, toolArgs, env);
    const receipt = 'Project: ' + runId + '\nExit: ' + result.status + '\n' + redact((result.stdout || '') + (result.stderr || ''));
    if (evidence) { fs.mkdirSync(path.dirname(evidence), { recursive: true }); fs.writeFileSync(evidence.replace(/\.txt$/, '-' + name + '.txt'), receipt); }
    requireSuccess(result, 'disposable ' + name);
  }
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
    const native = command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', nativeOtp ? 'apps/api/test/auth-native-otp.local.spec.ts' : 'apps/api/test/auth-native.local.spec.ts', ...(captchaReject ? ['-t', 'with an invalid CAPTCHA'] : [])], { ...env, RUN_AUTH_NATIVE: nativeOtp ? '0' : '1', RUN_AUTH_NATIVE_OTP: nativeOtp ? '1' : '0', JOBSCLICK_TEST_RUN_ID: runId });
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
