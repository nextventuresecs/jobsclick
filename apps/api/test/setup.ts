import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { assertDisposableTargets, installTestNetworkFence } from '../../../scripts/testing/disposable-target.cjs';
import { Test, type ModuleMetadata } from '@nestjs/testing';
import { TestAuthModule } from './test-auth.module.js';
import { TurnstileVerifier } from '../src/auth/turnstile.service.js';
import { MockTurnstileVerifier } from './mocks/mock-turnstile.verifier.js';
import { SmsGateway } from '../src/auth/sms.service.js';
import { MockSmsGateway } from './mocks/mock-sms.gateway.js';

// Vitest global setup: generate cryptographically secure random secrets per test run
// Ensures tests run against valid entropy without hardcoding literal secrets in src
if (!process.env['JWT_SECRET']) {
  process.env['JWT_SECRET'] = crypto.randomBytes(32).toString('hex');
}
if (!process.env['OTP_PEPPER']) {
  process.env['OTP_PEPPER'] = crypto.randomBytes(32).toString('hex');
}
if (!process.env['TURNSTILE_SECRET_KEY']) {
  process.env['TURNSTILE_SECRET_KEY'] = 'test-turnstile-secret-key-fixture';
}
if (!process.env['MSG91_AUTH_KEY']) {
  process.env['MSG91_AUTH_KEY'] = 'test-msg91-auth-key-fixture';
}
if (!process.env['WEB_URL']) {
  process.env['WEB_URL'] = 'https://jobsclick.live';
}
if (!process.env['SUPABASE_URL']) {
  process.env['SUPABASE_URL'] = 'http://127.0.0.1:54321';
}
if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) {
  process.env['SUPABASE_SERVICE_ROLE_KEY'] =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
}
if (!process.env['SUPABASE_ANON_KEY']) {
  process.env['SUPABASE_ANON_KEY'] =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
}
process.env['REDIS_URL'] = process.env['REDIS_URL'] || 'redis://127.0.0.1:6379';
if (process.env['REDIS_URL'].includes('upstash.io')) {
  process.env['REDIS_URL'] = 'redis://127.0.0.1:6379';
}

// Every Vitest run must be provisioned by scripts/testing/run-disposable.cjs.
// Loopback alone is insufficient: the developer's persistent stack is also loopback.
const manifestPath = process.env['JOBSCLICK_TEST_MANIFEST'];
if (!manifestPath) throw new Error('DISPOSABLE_TEST_TARGET_REQUIRED');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assertDisposableTargets({ databaseUrl: process.env['DATABASE_URL'], apiUrl: process.env['SUPABASE_URL'], redisUrl: process.env['REDIS_URL'] }, manifest);
installTestNetworkFence();
const marker = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
try {
  await marker.connect();
  const proof = await marker.query('select run_id from test_support.run_identity');
  if (proof.rows.length !== 1 || proof.rows[0].run_id !== manifest.runId) throw new Error('DISPOSABLE_TEST_TARGET_REQUIRED');
} finally { await marker.end(); }

const origCreateTestingModule = Test.createTestingModule.bind(Test);
const testContainer = Test as unknown as {
  createTestingModule: (metadata: ModuleMetadata) => ReturnType<typeof Test.createTestingModule>;
};
testContainer.createTestingModule = (metadata: ModuleMetadata) => {
  const testPath = expect.getState().testPath || '';
  const isLockdown =
    testPath.includes('auth-server-state-lockdown.spec') ||
    testPath.includes('jwt-guard.spec') ||
    testPath.includes('jwt-guard-hardening.spec') || testPath.includes('session-invalidation-p0-8.spec');

  if (!isLockdown && metadata) {
    metadata.imports = metadata.imports ? [...metadata.imports, TestAuthModule] : [TestAuthModule];
  }
  const builder = origCreateTestingModule(metadata);
  const isNoOverride =
    testPath.includes('sms-turnstile.spec') ||
    testPath.includes('auth-fail-open-behaviour.spec');
  if (!isNoOverride) {
    builder.overrideProvider(TurnstileVerifier).useClass(MockTurnstileVerifier);
    builder.overrideProvider(SmsGateway).useClass(MockSmsGateway);
  }
  return builder;
};
