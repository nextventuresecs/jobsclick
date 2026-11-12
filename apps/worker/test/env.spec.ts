import { describe, it, expect } from 'vitest';
import { validateEnv, isStrictEnv } from '../src/config/env.js';

describe('Worker Environment Configuration (Phase 1.1 Remediation)', () => {
  const baseValidProd = {
    NODE_ENV: 'production',
    REDIS_URL: 'rediss://default:token@remote-redis.upstash.io:6379',
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'valid_service_role_key_for_production_workers_not_placeholder',
  };

  describe('Development & Default Behavior', () => {
    it('provides safe defaults in development mode', () => {
      const env = validateEnv({
        NODE_ENV: 'development',
      });
      expect(env.NODE_ENV).toBe('development');
      expect(env.REDIS_URL).toBe('redis://localhost:6379');
    });

    it('correctly classifies strict vs non-strict environments', () => {
      expect(isStrictEnv('development')).toBe(false);
      expect(isStrictEnv('test')).toBe(false);
      expect(isStrictEnv('production')).toBe(true);
      expect(isStrictEnv('staging')).toBe(true);
      expect(isStrictEnv('')).toBe(true);

      const orig = process.env['NODE_ENV'];
      try {
        delete process.env['NODE_ENV'];
        expect(isStrictEnv()).toBe(true);
      } finally {
        process.env['NODE_ENV'] = orig;
      }
    });
  });

  describe('Production & Staging Fail-Closed Assertions', () => {
    it('accepts completely valid production configuration', () => {
      const env = validateEnv(baseValidProd);
      expect(env.NODE_ENV).toBe('production');
      expect(env.REDIS_URL).toBe(baseValidProd.REDIS_URL);
      expect(env.SUPABASE_URL).toBe(baseValidProd.SUPABASE_URL);
    });

    it('rejects missing REDIS_URL in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          REDIS_URL: '',
        }),
      ).toThrowError(/REDIS_URL must be set/);
    });

    it('rejects localhost REDIS_URL in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          REDIS_URL: 'rediss://localhost:6379',
        }),
      ).toThrowError(/must not point to localhost/);
    });

    it('rejects plaintext redis:// in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          REDIS_URL: 'redis://remote-redis.upstash.io:6379',
        }),
      ).toThrowError(/REDIS_URL must start with rediss:\/\//);
    });

    it('rejects REDIS_ALLOW_PLAINTEXT in production/staging (insecure TLS override flags are forbidden)', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          REDIS_ALLOW_PLAINTEXT: '1',
        }),
      ).toThrowError(/REDIS_ALLOW_PLAINTEXT is strictly forbidden/);
    });

    it('rejects DB_ALLOW_INSECURE_TLS in production/staging (insecure TLS override flags are forbidden)', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          DB_ALLOW_INSECURE_TLS: '1',
        }),
      ).toThrowError(/DB_ALLOW_INSECURE_TLS is strictly forbidden/);
    });

    it('permits plaintext redis:// in development mode', () => {
      const env = validateEnv({
        NODE_ENV: 'development',
        REDIS_URL: 'redis://localhost:6379',
      });
      expect(env.REDIS_URL).toBe('redis://localhost:6379');
    });

    it('rejects missing SUPABASE_URL in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          SUPABASE_URL: '',
        }),
      ).toThrowError(/SUPABASE_URL must be set/);
    });

    it('rejects localhost SUPABASE_URL in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          SUPABASE_URL: 'http://127.0.0.1:54321',
        }),
      ).toThrowError(/must not point to localhost/);
    });

    it('rejects placeholder SUPABASE_SERVICE_ROLE_KEY in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-role-key',
        }),
      ).toThrowError(/must be set and not a placeholder/);
    });

    it('rejects USE_MOCK_REDIS in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          USE_MOCK_REDIS: 'true',
        }),
      ).toThrowError(/USE_MOCK_REDIS must not be set/);
    });

    it('rejects VITEST in production', () => {
      expect(() =>
        validateEnv({
          ...baseValidProd,
          VITEST: 'true',
        }),
      ).toThrowError(/VITEST must not be set/);
    });
  });

  describe('Test-Mode Safety Gate', () => {
    it('permits local URLs in test mode', () => {
      const env = validateEnv({
        NODE_ENV: 'test',
        REDIS_URL: 'redis://127.0.0.1:6379',
        SUPABASE_URL: 'http://localhost:54321',
      });
      expect(env.REDIS_URL).toBe('redis://127.0.0.1:6379');
      expect(env.SUPABASE_URL).toBe('http://localhost:54321');
    });

    it('rejects unapproved remote URLs in test mode', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'test',
          REDIS_URL: 'rediss://unapproved-remote-redis.com:6379',
        }),
      ).toThrowError(/must point to a local host in test mode/);
    });

    it('allows remote URLs in test mode if explicitly listed in TEST_ALLOWED_HOSTS', () => {
      const env = validateEnv({
        NODE_ENV: 'test',
        REDIS_URL: 'rediss://custom-test-redis.com:6379',
        TEST_ALLOWED_HOSTS: 'custom-test-redis.com',
      });
      expect(env.REDIS_URL).toBe('rediss://custom-test-redis.com:6379');
    });
  });
});
