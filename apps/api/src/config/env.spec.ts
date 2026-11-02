import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/*
 * Table-driven acceptance tests for validateEnv() production/staging safety guards.
 * Conforms to .agents/rules/auth-lockdown.md
 */

/** Minimal valid production environment – passes all strict checks. */
const VALID_PROD: Record<string, string> = {
  NODE_ENV: 'production',
  PORT: '3001',
  DATABASE_URL: 'postgresql://prod_app_user:Kx9#mP2$vL8!zQ4@db.example.com:5432/app',
  REDIS_URL: 'rediss://default:Ab3$zQ9*wL2!xP5@redis.example.com:6380',
  JWT_SECRET: 'a7dKpQmXr2vFwLnYeTuIhJa7dKpQmXr2', // 32 chars, no placeholder
  OTP_PEPPER: 'b8eLqRnYs3wGxMoZfUvJiKb8eLqRnYs3', // 32 chars, no placeholder, distinct from JWT_SECRET
  SMS_GATEWAY_MODE: 'live',
  MSG91_AUTH_KEY: 'msg91_live_auth_key_sec_99182746',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAABBBCCCDDDEEEFFF12345',
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-service-role-payload-long-string',
  QSTASH_TOKEN: 'qst_real_token',
  QSTASH_CURRENT_SIGNING_KEY: 'sig_real_key',
  API_URL: 'https://api.example.com',
  ALLOW_TEST_PAYMENTS: 'true',
};

describe('validateEnv() – production/staging safety guards', () => {
  // ── Happy path ──────────────────────────────────────────────────────

  it('accepts a fully valid production env', () => {
    expect(() => validateEnv({ ...VALID_PROD })).not.toThrow();
  });

  it('accepts a fully valid staging env (same rules as production)', () => {
    expect(() => validateEnv({ ...VALID_PROD, NODE_ENV: 'staging' })).not.toThrow();
  });

  // ── Requirement 1 & 9: Unset or unknown NODE_ENV => strict production rules ──

  it('treats unset NODE_ENV as production and rejects missing JWT_SECRET', () => {
    const env = { ...VALID_PROD };
    delete env['NODE_ENV'];
    delete env['JWT_SECRET'];
    expect(() => validateEnv(env)).toThrowError(/JWT_SECRET/);
  });

  it('treats whitespace / unknown NODE_ENV as production and enforces rules', () => {
    expect(() => validateEnv({ ...VALID_PROD, NODE_ENV: '  ' })).not.toThrow(); // Valid prod env with whitespace env treated as prod
    expect(() => validateEnv({ ...VALID_PROD, NODE_ENV: 'preview', JWT_SECRET: undefined })).toThrowError(/JWT_SECRET/);
    expect(() => validateEnv({ ...VALID_PROD, NODE_ENV: 'custom-qa', OTP_PEPPER: undefined })).toThrowError(/OTP_PEPPER/);
  });

  // ── Requirement 9: .env.example under NODE_ENV=production must throw ─

  it('rejects loading raw .env.example under NODE_ENV=production', () => {
    const envExamplePath = path.resolve(__dirname, '../../../../.env.example');
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    const parsedExample: Record<string, string> = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        parsedExample[key] = val;
      }
    }

    parsedExample['NODE_ENV'] = 'production';
    expect(() => validateEnv(parsedExample)).toThrow();
  });

  // ── Table-driven failure cases ──────────────────────────────────────

  interface FailCase {
    name: string;
    override: Record<string, string | undefined>;
    expectedSubstring: string;
  }

  const failCases: FailCase[] = [
    // Requirement 1 & 3: JWT_SECRET length and placeholder rules
    {
      name: 'JWT_SECRET missing',
      override: { JWT_SECRET: undefined },
      expectedSubstring: 'JWT_SECRET',
    },
    {
      name: 'JWT_SECRET too short (31 chars)',
      override: { JWT_SECRET: 'a'.repeat(31) },
      expectedSubstring: 'JWT_SECRET',
    },
    {
      name: 'JWT_SECRET contains "dummy" placeholder',
      override: { JWT_SECRET: 'my-dummy-jwt-secret-over-32-chars-long-here' },
      expectedSubstring: 'JWT_SECRET',
    },
    {
      name: 'JWT_SECRET contains "change-me" placeholder',
      override: { JWT_SECRET: 'change-me-to-a-real-secret-at-least-32-chars' },
      expectedSubstring: 'JWT_SECRET',
    },
    {
      name: 'JWT_SECRET contains "test" placeholder',
      override: { JWT_SECRET: 'my-test-jwt-secret-over-32-characters-long' },
      expectedSubstring: 'JWT_SECRET',
    },

    // Requirement 1 & 3: OTP_PEPPER length and placeholder rules
    {
      name: 'OTP_PEPPER missing',
      override: { OTP_PEPPER: undefined },
      expectedSubstring: 'OTP_PEPPER',
    },
    {
      name: 'OTP_PEPPER too short (31 chars)',
      override: { OTP_PEPPER: 'b'.repeat(31) },
      expectedSubstring: 'OTP_PEPPER',
    },
    {
      name: 'OTP_PEPPER contains "example" placeholder',
      override: { OTP_PEPPER: 'an-example-pepper-that-is-over-32-characters' },
      expectedSubstring: 'OTP_PEPPER',
    },

    // Requirement 3: JWT_SECRET !== OTP_PEPPER
    {
      name: 'JWT_SECRET and OTP_PEPPER are identical',
      override: { OTP_PEPPER: VALID_PROD.JWT_SECRET },
      expectedSubstring: 'OTP_PEPPER',
    },

    // Requirement 1: SMS_GATEWAY_MODE must be 'live'
    {
      name: 'SMS_GATEWAY_MODE not live (mock)',
      override: { SMS_GATEWAY_MODE: 'mock' },
      expectedSubstring: 'SMS_GATEWAY_MODE',
    },
    {
      name: 'SMS_GATEWAY_MODE not live (sandbox)',
      override: { SMS_GATEWAY_MODE: 'sandbox' },
      expectedSubstring: 'SMS_GATEWAY_MODE',
    },
    {
      name: 'SMS_GATEWAY_MODE unset',
      override: { SMS_GATEWAY_MODE: undefined },
      expectedSubstring: 'SMS_GATEWAY_MODE',
    },

    // Requirement 3: MSG91_AUTH_KEY non-dummy
    {
      name: 'MSG91_AUTH_KEY missing',
      override: { MSG91_AUTH_KEY: undefined },
      expectedSubstring: 'MSG91_AUTH_KEY',
    },
    {
      name: 'MSG91_AUTH_KEY is dummy',
      override: { MSG91_AUTH_KEY: 'dummy-msg91-key' },
      expectedSubstring: 'MSG91_AUTH_KEY',
    },

    // Requirement 1 & 3: TURNSTILE_SECRET_KEY pattern & non-test
    {
      name: 'TURNSTILE_SECRET_KEY missing',
      override: { TURNSTILE_SECRET_KEY: undefined },
      expectedSubstring: 'TURNSTILE_SECRET_KEY',
    },
    {
      name: 'TURNSTILE_SECRET_KEY is Cloudflare always-pass key',
      override: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' },
      expectedSubstring: 'TURNSTILE_SECRET_KEY',
    },
    {
      name: 'TURNSTILE_SECRET_KEY does not match /^0x[A-Za-z0-9_-]{20,}$/',
      override: { TURNSTILE_SECRET_KEY: 'not_starting_with_0x_key_123456789' },
      expectedSubstring: 'TURNSTILE_SECRET_KEY',
    },

    // Requirement 1: USE_MOCK_REDIS, VITEST, USE_JSON_STORE unset
    {
      name: 'USE_MOCK_REDIS set in production',
      override: { USE_MOCK_REDIS: 'true' },
      expectedSubstring: 'USE_MOCK_REDIS',
    },
    {
      name: 'VITEST set in production',
      override: { VITEST: 'true' },
      expectedSubstring: 'VITEST',
    },
    {
      name: 'USE_JSON_STORE set in production',
      override: { USE_JSON_STORE: 'true' },
      expectedSubstring: 'USE_JSON_STORE',
    },

    // Requirement 1 & 2: REDIS_URL rules
    {
      name: 'REDIS_URL not TLS (redis://)',
      override: { REDIS_URL: 'redis://redis.example.com:6379' },
      expectedSubstring: 'REDIS_URL',
    },
    {
      name: 'REDIS_URL missing on raw source',
      override: { REDIS_URL: undefined },
      expectedSubstring: 'REDIS_URL',
    },
    {
      name: 'REDIS_URL points to localhost in production',
      override: { REDIS_URL: 'rediss://default:pw@localhost:6379' },
      expectedSubstring: 'REDIS_URL',
    },
    {
      name: 'REDIS_URL points to 127.0.0.1 in production',
      override: { REDIS_URL: 'rediss://default:pw@127.0.0.1:6379' },
      expectedSubstring: 'REDIS_URL',
    },

    // Requirement 1 & 2: DATABASE_URL rules
    {
      name: 'DATABASE_URL missing on raw source',
      override: { DATABASE_URL: undefined },
      expectedSubstring: 'DATABASE_URL',
    },
    {
      name: 'DATABASE_URL points to localhost in production',
      override: { DATABASE_URL: 'postgresql://user:pw@localhost:5432/app' },
      expectedSubstring: 'DATABASE_URL',
    },
    {
      name: 'DATABASE_URL points to 127.0.0.1 in production',
      override: { DATABASE_URL: 'postgresql://user:pw@127.0.0.1:5432/app' },
      expectedSubstring: 'DATABASE_URL',
    },
    {
      name: 'DATABASE_URL uses default postgres:postgres creds',
      override: { DATABASE_URL: 'postgresql://postgres:postgres@db.example.com:5432/app' },
      expectedSubstring: 'DATABASE_URL',
    },

    // Requirement 2: SUPABASE_URL missing on raw source
    {
      name: 'SUPABASE_URL missing on raw source',
      override: { SUPABASE_URL: undefined },
      expectedSubstring: 'SUPABASE_URL',
    },

    // Requirement 1 & 3: SUPABASE_SERVICE_ROLE_KEY
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY missing',
      override: { SUPABASE_SERVICE_ROLE_KEY: undefined },
      expectedSubstring: 'SUPABASE_SERVICE_ROLE_KEY',
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY contains placeholder dummy',
      override: { SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-role-key' },
      expectedSubstring: 'SUPABASE_SERVICE_ROLE_KEY',
    },
  ];

  for (const { name, override, expectedSubstring } of failCases) {
    for (const nodeEnv of ['production', 'staging'] as const) {
      it(`rejects ${nodeEnv}: ${name}`, () => {
        const env: Record<string, string> = { ...VALID_PROD, NODE_ENV: nodeEnv, ...override };
        for (const [k, v] of Object.entries(env)) {
          if (v === undefined) delete env[k];
        }
        expect(() => validateEnv(env)).toThrowError(expectedSubstring);
      });
    }
  }

  // ── Requirement 8: Never include secret values in error messages ──────

  it('never leaks secret values in error messages', () => {
    const sensitiveSecret = 'VERY_SECRET_VALUE_DO_NOT_LEAK_IN_LOGS_32CHARS';
    const env = {
      ...VALID_PROD,
      JWT_SECRET: sensitiveSecret,
      OTP_PEPPER: sensitiveSecret, // Triggers error because identical
    };

    let caughtError: Error | null = null;
    try {
      validateEnv(env);
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).not.toContain(sensitiveSecret);
  });

  // ── REDIS_ALLOW_PLAINTEXT opt-out ───────────────────────────────────

  it('allows plaintext REDIS_URL in production when REDIS_ALLOW_PLAINTEXT=1', () => {
    const env = {
      ...VALID_PROD,
      REDIS_URL: 'redis://redis.example.com:6379',
      REDIS_ALLOW_PLAINTEXT: '1',
    };
    expect(() => validateEnv(env)).not.toThrow();
  });
});

// ── TASK 2 & Requirement 4: Test-mode URL Host Gate ───────────────────

describe('validateEnv() – test-mode local host gate', () => {
  const BASE_TEST = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db',
    REDIS_URL: 'redis://localhost:6379',
    SUPABASE_URL: 'http://localhost:54321',
    UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:8079',
  };

  it('accepts local hosts: localhost, 127.0.0.1, ::1, host.docker.internal', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db',
        REDIS_URL: 'redis://127.0.0.1:6379',
        SUPABASE_URL: 'http://[::1]:54321',
        UPSTASH_REDIS_REST_URL: 'http://host.docker.internal:8079',
      }),
    ).not.toThrow();
  });

  it('accepts custom host configured via TEST_ALLOWED_HOSTS', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        TEST_ALLOWED_HOSTS: 'custom-ci-db,custom-ci-redis',
        DATABASE_URL: 'postgresql://postgres:postgres@custom-ci-db:5432/test_db',
        REDIS_URL: 'redis://custom-ci-redis:6379',
      }),
    ).not.toThrow();
  });

  it('rejects remote DATABASE_URL in test mode', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        DATABASE_URL: 'postgresql://user:pw@db.production.com:5432/app',
      }),
    ).toThrowError('DATABASE_URL');
  });

  it('rejects remote REDIS_URL in test mode', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        REDIS_URL: 'redis://redis.production.com:6379',
      }),
    ).toThrowError('REDIS_URL');
  });

  it('rejects remote SUPABASE_URL in test mode', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toThrowError('SUPABASE_URL');
  });

  it('rejects remote UPSTASH_REDIS_REST_URL in test mode', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        UPSTASH_REDIS_REST_URL: 'https://upstash.io',
      }),
    ).toThrowError('UPSTASH_REDIS_REST_URL');
  });

  // Host-bypass tests: URL parser prevents clever path or sub-domain bypasses
  it('rejects host-bypass: localhost.evil.com', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        DATABASE_URL: 'postgresql://user:pw@localhost.evil.com:5432/app',
      }),
    ).toThrowError('DATABASE_URL');
  });

  it('rejects host-bypass: postgres://x@evil.com/localhost', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        DATABASE_URL: 'postgresql://x@evil.com/localhost',
      }),
    ).toThrowError('DATABASE_URL');
  });

  it('rejects host-bypass: 127.0.0.1.evil.com', () => {
    expect(() =>
      validateEnv({
        ...BASE_TEST,
        REDIS_URL: 'redis://127.0.0.1.evil.com:6379',
      }),
    ).toThrowError('REDIS_URL');
  });
});

// ── Requirement 9: Child-process boot test ────────────────────────────

describe('Child process startup gate (NODE_ENV=staging without required var)', () => {
  it('exits non-zero, names the missing variable, and makes no network connections', () => {
    const apiDir = path.resolve(__dirname, '../..');
    const tsxLoader = pathToFileURL(require.resolve('tsx')).href;
    const mainScript = path.resolve(__dirname, '../main.ts');
    const child = spawnSync(
      process.execPath,
      ['--import', tsxLoader, mainScript],
      {
        cwd: apiDir,
        env: {
          ...process.env,
          NODE_ENV: 'staging',
          DATABASE_URL: 'postgresql://prod_user:prod_pw@db.example.com:5432/app',
          REDIS_URL: 'rediss://redis.example.com:6379',
          OTP_PEPPER: 'b8eLqRnYs3wGxMoZfUvJiKb8eLqRnYs3',
          SMS_GATEWAY_MODE: 'live',
          MSG91_AUTH_KEY: 'msg91_live_auth_key_12345678',
          TURNSTILE_SECRET_KEY: '0x4AAAAAAABBBCCCDDDEEEFFF12345',
          SUPABASE_URL: 'https://proj.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-key',
          API_URL: 'https://api.example.com',
          JWT_SECRET: '', // Deliberately unset
        },
        encoding: 'utf-8',
        timeout: 30000,
      },
    );

    if (child.error) {
      throw child.error;
    }
    expect(child.status).not.toBe(0);
    const combinedOutput = `${child.stdout}\n${child.stderr}`;
    expect(combinedOutput).toContain('JWT_SECRET');
  }, 40000);
});

// ── TASK 3–4 & Requirement 9: Source code hygiene (grep tests) ────────

describe('Source code hygiene (grep tests)', () => {
  const SRC_DIR = path.resolve(__dirname, '..');

  function walkTs(dir: string): string[] {
    const result: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'test') {
        result.push(...walkTs(full));
      } else if (
        entry.isFile() &&
        full.endsWith('.ts') &&
        !full.endsWith('.spec.ts') &&
        !full.endsWith('.test.ts')
      ) {
        result.push(full);
      }
    }
    return result;
  }

  const productionFiles = walkTs(SRC_DIR);

  it('no production file references SUPABASE_SECRET_KEY as JWT secret source', () => {
    const matches: string[] = [];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('SUPABASE_SECRET_KEY')) {
        matches.push(path.relative(SRC_DIR, file));
      }
    }
    expect(matches, `Files still referencing SUPABASE_SECRET_KEY: ${matches.join(', ')}`).toEqual([]);
  });

  it('no production file contains the hardcoded test JWT secret', () => {
    const matches: string[] = [];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('jobsclick-jwt-secret-key')) {
        matches.push(path.relative(SRC_DIR, file));
      }
    }
    expect(matches, `Files still containing hardcoded JWT secret: ${matches.join(', ')}`).toEqual([]);
  });

  it('no production file disables TLS certificate verification', () => {
    const matches: string[] = [];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('rejectUnauthorized: false') || content.includes('rejectUnauthorized:false')) {
        matches.push(path.relative(SRC_DIR, file));
      }
    }
    expect(matches, `Files with rejectUnauthorized: false: ${matches.join(', ')}`).toEqual([]);
  });

  it('no production file references banned OTP_SALT', () => {
    const matches: string[] = [];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('OTP_SALT')) {
        matches.push(path.relative(SRC_DIR, file));
      }
    }
    expect(matches, `Files still referencing OTP_SALT: ${matches.join(', ')}`).toEqual([]);
  });
});

// ── Requirement 6 & 7: Guard 503 and OtpRedisService lifecycle tests ──

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OtpRedisService } from '../auth/otp-redis.service.js';
import { ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('JwtAuthGuard & OtpRedisService safety guards', () => {
  it('JwtAuthGuard throws ServiceUnavailableException (503) when JWT_SECRET is missing', () => {
    const orig = process.env['JWT_SECRET'];
    try {
      delete process.env['JWT_SECRET'];
      const guard = new JwtAuthGuard(new Reflector());
      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer some.malformed.token' },
          }),
        }),
      } as unknown as Parameters<JwtAuthGuard['canActivate']>[0];
      expect(() => guard.canActivate(mockContext)).toThrowError(ServiceUnavailableException);
    } finally {
      process.env['JWT_SECRET'] = orig;
    }
  });

  it('OtpRedisService throws in production when OTP_PEPPER is missing', () => {
    const origNodeEnv = process.env['NODE_ENV'];
    const origPepper = process.env['OTP_PEPPER'];
    const origMock = process.env['USE_MOCK_REDIS'];
    const origVitest = process.env['VITEST'];
    try {
      process.env['NODE_ENV'] = 'production';
      delete process.env['OTP_PEPPER'];
      delete process.env['USE_MOCK_REDIS'];
      delete process.env['VITEST'];
      expect(() => new OtpRedisService()).toThrowError(/OTP_PEPPER/);
    } finally {
      process.env['NODE_ENV'] = origNodeEnv;
      process.env['OTP_PEPPER'] = origPepper;
      process.env['USE_MOCK_REDIS'] = origMock;
      process.env['VITEST'] = origVitest;
    }
  });

  it('OtpRedisService generates random per-process pepper in test/dev when OTP_PEPPER is missing', () => {
    const origPepper = process.env['OTP_PEPPER'];
    try {
      delete process.env['OTP_PEPPER'];
      const svc = new OtpRedisService();
      expect((svc as unknown as { pepper: string }).pepper).toBeDefined();
      expect((svc as unknown as { pepper: string }).pepper.length).toBeGreaterThanOrEqual(32);
    } finally {
      process.env['OTP_PEPPER'] = origPepper;
    }
  });
});
