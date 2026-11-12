import crypto from 'node:crypto';
import { Test, type ModuleMetadata } from '@nestjs/testing';
import { TestAuthModule } from './test-auth.module.js';

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

const ALLOWED_LOCALHOST = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
function assertTestTargetLocalhost(urlStr: string | undefined, name: string): void {
  if (!urlStr) return;
  try {
    const url = new URL(urlStr);
    if (!ALLOWED_LOCALHOST.has(url.hostname.toLowerCase())) {
      throw new Error(
        `[SECURITY REFUSAL] Test suite target ${name} "${url.hostname}" is not localhost! ` +
        `Tests are strictly forbidden from executing against remote infrastructure.`
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('[SECURITY REFUSAL]')) {
      throw err;
    }
  }
}

assertTestTargetLocalhost(process.env['DATABASE_URL'], 'DATABASE_URL');
assertTestTargetLocalhost(process.env['SUPABASE_URL'], 'SUPABASE_URL');
assertTestTargetLocalhost(process.env['REDIS_URL'], 'REDIS_URL');

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
  return origCreateTestingModule(metadata);
};
