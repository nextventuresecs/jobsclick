const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Execute the runner's first child-process boundary; provision no services or files.
async function firstChildEnvironment(parent) {
  const file = path.join(__dirname, 'run-disposable.cjs');
  const load = createRequire(file);
  const calls = [];
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    __dirname, Buffer, URL,
    process: { env: parent, argv: [process.execPath, file], execPath: process.execPath },
    console: { log() {}, error() {} },
    require(name) {
      if (name === 'node:fs') return { mkdirSync() {}, rmSync() {} };
      if (name === 'node:child_process') return { spawnSync(binary, args, options) {
        calls.push({ binary, args, env: options.env });
        return { status: 1, stdout: '', stderr: 'synthetic stop before provisioning' };
      } };
      return load(name);
    },
  }, { filename: file });
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  return calls[0].env;
}

test('disposable child processes never inherit parent credentials, provider settings or runtime injection', async () => {
  const parent = {
    PATH: '/fixture/tools', SystemRoot: 'C:\\Windows', HOME: '/fixture/home',
    RAZORPAY_KEY_SECRET: 'synthetic-payment-secret', MSG91_AUTH_KEY: 'synthetic-sms-secret',
    FUTURE_PROVIDER_CREDENTIAL: 'synthetic-unknown-secret', NODE_ENV: 'production',
    ENABLE_P2_PAYMENTS: 'true', DATABASE_URL: 'postgresql://persistent.invalid/postgres',
    DOCKER_HOST: 'tcp://remote.invalid:2376', DOCKER_CONTEXT: 'production',
    NODE_OPTIONS: '--require=synthetic-untrusted-preload.cjs',
    npm_config_registry: 'https://synthetic-credentials.invalid',
    JOBSCLICK_TEST_SMS_HOOK_SECRET: 'synthetic-parent-hook',
  };
  const child = await firstChildEnvironment(parent);
  for (const name of Object.keys(parent).filter(name => !['PATH', 'SystemRoot', 'HOME'].includes(name))) {
    assert.equal(child[name], undefined, 'inherited forbidden parent variable: ' + name);
  }
  assert.equal(parent.RAZORPAY_KEY_SECRET, 'synthetic-payment-secret');
});

test('disposable children retain OS tool discovery and force local telemetry opt-out', async () => {
  const child = await firstChildEnvironment({ Path: '/fixture/tools', SystemRoot: 'C:\\Windows', TEMP: '/fixture/tmp', HOME: '/fixture/home', CI: 'true', DO_NOT_TRACK: '0' });
  assert.equal(child.Path, '/fixture/tools');
  assert.equal(child.SystemRoot, 'C:\\Windows');
  assert.equal(child.TEMP, '/fixture/tmp');
  assert.equal(child.HOME, '/fixture/home');
  assert.equal(child.CI, 'true');
  assert.equal(child.DO_NOT_TRACK, '1');
});
