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

const origCreateTestingModule = Test.createTestingModule.bind(Test);
const testContainer = Test as unknown as {
  createTestingModule: (metadata: ModuleMetadata) => ReturnType<typeof Test.createTestingModule>;
};
testContainer.createTestingModule = (metadata: ModuleMetadata) => {
  const testPath = expect.getState().testPath || '';
  const isLockdown =
    testPath.includes('auth-server-state-lockdown.spec') ||
    testPath.includes('jwt-guard.spec') ||
    testPath.includes('jwt-guard-hardening.spec');

  if (!isLockdown && metadata) {
    metadata.imports = metadata.imports ? [...metadata.imports, TestAuthModule] : [TestAuthModule];
  }
  return origCreateTestingModule(metadata);
};
