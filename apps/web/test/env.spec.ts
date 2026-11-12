import { describe, it, expect, vi } from 'vitest';
import { validateWebEnv, isStrictEnv, clientEnvSchema } from '../src/config/env.js';

describe('Web Environment Configuration (Phase 1.1 Remediation)', () => {
  const baseValidProd = {
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'https://api.jobsclick.live',
    NEXT_PUBLIC_APP_URL: 'https://jobsclick.live',
    JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
  };

  describe('Development & Default Behavior', () => {
    it('provides safe defaults in development mode', () => {
      const env = validateWebEnv({
        NODE_ENV: 'development',
    JWT_SECRET: 'test-development-jwt-secret-key-32chars',
      });
      expect(env.NODE_ENV).toBe('development');
      expect(env.PORT).toBe(3000);
      expect(env.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001');
      expect(env.NEXT_PUBLIC_APP_URL).toBe('https://jobsclick.live');
      expect(env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBe(false);
    });

    it('correctly classifies strict vs non-strict environments', () => {
      expect(isStrictEnv('development')).toBe(false);
      expect(isStrictEnv('test')).toBe(false);
      expect(isStrictEnv('production')).toBe(true);
      expect(isStrictEnv('staging')).toBe(true);
      expect(isStrictEnv('')).toBe(true);

      const envObj = process.env as Record<string, string | undefined>;
      const orig = envObj['NODE_ENV'];
      try {
        delete envObj['NODE_ENV'];
        expect(isStrictEnv()).toBe(true);
      } finally {
        envObj['NODE_ENV'] = orig;
      }
    });

    it('safely parses valid boolean flags (true, false, 1, 0, empty string, undefined)', () => {
      const envFalseStr = validateWebEnv({
        NODE_ENV: 'development',
    JWT_SECRET: 'test-development-jwt-secret-key-32chars',
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: 'false',
      });
      expect(envFalseStr.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBe(false);

      const envZero = validateWebEnv({
        NODE_ENV: 'development',
    JWT_SECRET: 'test-development-jwt-secret-key-32chars',
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: '0',
      });
      expect(envZero.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBe(false);

      const envEmpty = validateWebEnv({
        NODE_ENV: 'development',
    JWT_SECRET: 'test-development-jwt-secret-key-32chars',
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: '',
      });
      expect(envEmpty.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBe(false);

      const envTrueStr = validateWebEnv({
        NODE_ENV: 'development',
    JWT_SECRET: 'test-development-jwt-secret-key-32chars',
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: 'true',
      });
      expect(envTrueStr.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBe(true);

      const envOne = validateWebEnv({
        NODE_ENV: 'development',
    JWT_SECRET: 'test-development-jwt-secret-key-32chars',
        NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: '1',
      });
      expect(envOne.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBe(true);
    });

    it('rejects malformed boolean values rather than silently coercing them to false', () => {
      const invalidValues = ['garbage', 'no', 'yes', '2', 'invalid', 'true_bad'];
      for (const badVal of invalidValues) {
        expect(() =>
          validateWebEnv({
            NODE_ENV: 'development',
    JWT_SECRET: 'test-development-jwt-secret-key-32chars',
            NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: badVal,
          }),
        ).toThrow();
      }
    });
  });

  describe('Production & Staging Fail-Closed Assertions', () => {
    it('accepts completely valid production configuration', () => {
      const env = validateWebEnv(baseValidProd);
      expect(env.NODE_ENV).toBe('production');
      expect(env.NEXT_PUBLIC_API_URL).toBe(baseValidProd.NEXT_PUBLIC_API_URL);
      expect(env.JWT_SECRET).toBe(baseValidProd.JWT_SECRET);
    });

    it('rejects missing or non-64-hex format JWT_SECRET in production', () => {
      expect(() =>
        validateWebEnv({
          ...baseValidProd,
          JWT_SECRET: '',
        }),
      ).toThrowError(/JWT_SECRET must be set/);

      expect(() =>
        validateWebEnv({
          ...baseValidProd,
          JWT_SECRET: 'too-short-secret',
        }),
      ).toThrowError(/must be a 64-character hexadecimal string/);

      expect(() =>
        validateWebEnv({
          ...baseValidProd,
          JWT_SECRET: 'g'.repeat(64),
        }),
      ).toThrowError(/must be a 64-character hexadecimal string/);
    });

    it('rejects placeholder and weak repeating pattern JWT_SECRET in production', () => {
      expect(() =>
        validateWebEnv({
          ...baseValidProd,
          JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533ftest1234',
        }),
      ).toThrowError(/JWT_SECRET must not contain placeholder/);

      expect(() =>
        validateWebEnv({
          ...baseValidProd,
          JWT_SECRET: '0'.repeat(64),
        }),
      ).toThrowError(/obvious weak repeating pattern/);
    });

    it('rejects non-HTTPS NEXT_PUBLIC_API_URL in production', () => {
      expect(() =>
        validateWebEnv({
          ...baseValidProd,
          NEXT_PUBLIC_API_URL: 'http://api.jobsclick.live',
        }),
      ).toThrowError(/NEXT_PUBLIC_API_URL must use HTTPS in production/);
    });
  });

  describe('Public vs Server-Only Isolation', () => {
    it('ensures client schema strictly ignores or omits server-only secrets', () => {
      const parsedClient = clientEnvSchema.parse({
        NEXT_PUBLIC_API_URL: 'https://api.jobsclick.live',
        JWT_SECRET: 'secret-should-not-exist-on-client',
      });
      expect(parsedClient).not.toHaveProperty('JWT_SECRET');
      expect((parsedClient as Record<string, unknown>)['JWT_SECRET']).toBeUndefined();
    });
  });

  describe('Next.js Runtime Startup Validation (instrumentation)', () => {
    it('executes at server startup and fails closed when mandatory config is missing', async () => {
      const envObj = process.env as Record<string, string | undefined>;
      const origRuntime = envObj['NEXT_RUNTIME'];
      const origNodeEnv = envObj['NODE_ENV'];
      const origJwt = envObj['JWT_SECRET'];

      try {
        envObj['NEXT_RUNTIME'] = 'nodejs';
        envObj['NODE_ENV'] = 'production';
        delete envObj['JWT_SECRET'];

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
          throw new Error('process.exit called with ' + code);
        }) as never);
        const { register } = await import('../src/instrumentation.js');
        await expect(register()).rejects.toThrowError(/process\.exit called with 1/);
        exitSpy.mockRestore();
      } finally {
        envObj['NEXT_RUNTIME'] = origRuntime;
        envObj['NODE_ENV'] = origNodeEnv;
        envObj['JWT_SECRET'] = origJwt;
      }
    });

    it('succeeds at server startup when mandatory config is present', async () => {
      const envObj = process.env as Record<string, string | undefined>;
      const origRuntime = envObj['NEXT_RUNTIME'];
      const origNodeEnv = envObj['NODE_ENV'];
      const origJwt = envObj['JWT_SECRET'];

      try {
        envObj['NEXT_RUNTIME'] = 'nodejs';
        envObj['NODE_ENV'] = 'production';
        envObj['JWT_SECRET'] = 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1';

        const { register } = await import('../src/instrumentation.js');
        await expect(register()).resolves.toBeUndefined();
      } finally {
        envObj['NEXT_RUNTIME'] = origRuntime;
        envObj['NODE_ENV'] = origNodeEnv;
        envObj['JWT_SECRET'] = origJwt;
      }
    });

    it('skips validation during static production build phase', async () => {
      const envObj = process.env as Record<string, string | undefined>;
      const origPhase = envObj['NEXT_PHASE'];
      const origRuntime = envObj['NEXT_RUNTIME'];
      const origNodeEnv = envObj['NODE_ENV'];
      const origJwt = envObj['JWT_SECRET'];

      try {
        envObj['NEXT_PHASE'] = 'phase-production-build';
        envObj['NEXT_RUNTIME'] = 'nodejs';
        envObj['NODE_ENV'] = 'production';
        delete envObj['JWT_SECRET'];

        const { register } = await import('../src/instrumentation.js');
        await expect(register()).resolves.toBeUndefined();
      } finally {
        envObj['NEXT_PHASE'] = origPhase;
        envObj['NEXT_RUNTIME'] = origRuntime;
        envObj['NODE_ENV'] = origNodeEnv;
        envObj['JWT_SECRET'] = origJwt;
      }
    });
  });
});