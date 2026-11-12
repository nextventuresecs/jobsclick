import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env.js';
import { validateWebEnv } from '../../web/src/config/env.js';

describe('Spec 0: Fail-Open Auth Startup Hardening', () => {
  const validBase = {
    NODE_ENV: 'test',
    OTP_PEPPER: '12345678901234567890123456789012', // 32 chars
    TURNSTILE_SECRET_KEY: 'test-turnstile-secret-key-dummy',
    MSG91_AUTH_KEY: 'test-msg91-auth-key-dummy',
    JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
    REDIS_URL: 'redis://127.0.0.1:6379',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    WEB_URL: 'https://jobsclick.live',
  };

  describe('API validateEnv() universal mandatory keys', () => {
    it('refuses to start when TURNSTILE_SECRET_KEY is missing in test or dev mode', () => {
      const env = { ...validBase, TURNSTILE_SECRET_KEY: undefined };
      expect(() => validateEnv(env)).toThrowError(/TURNSTILE_SECRET_KEY/);
    });

    it('refuses to start when MSG91_AUTH_KEY is missing in test or dev mode', () => {
      const env = { ...validBase, MSG91_AUTH_KEY: undefined };
      expect(() => validateEnv(env)).toThrowError(/MSG91_AUTH_KEY/);
    });

    it('refuses to start when OTP_PEPPER is missing in test or dev mode', () => {
      const env = { ...validBase, OTP_PEPPER: undefined };
      expect(() => validateEnv(env)).toThrowError(/OTP_PEPPER/);
    });

    it('refuses to start when OTP_PEPPER is shorter than 32 characters in test or dev mode', () => {
      const env = { ...validBase, OTP_PEPPER: 'too-short-pepper' };
      expect(() => validateEnv(env)).toThrowError(/OTP_PEPPER/);
    });

    it('refuses to start when WEB_URL is missing in strict environments (production/staging)', () => {
      const strictEnv = {
        ...validBase,
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://app:secure_pwd@db.example.com:5432/jobsclick',
        REDIS_URL: 'rediss://default:pwd@redis.example.com:6379',
        SUPABASE_URL: 'https://supabase.example.com',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validServiceRoleKeyMockDataLongEnough',
        CF_ORIGIN_LOCKED: 'true',
        TRUSTED_PROXY_CIDRS: '103.21.244.0/22,173.245.48.0/20',
        TURNSTILE_SECRET_KEY: '0x4AAAAAAtestkey20charsminlength_',
        MSG91_AUTH_KEY: 'live-msg91-auth-key-valid-32chars',
        WEB_URL: undefined,
      };
      expect(() => validateEnv(strictEnv)).toThrowError(/WEB_URL/);
    });

    it('refuses to start when WEB_URL points to localhost in strict environments', () => {
      const strictEnv = {
        ...validBase,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://app:secure_pwd@db.example.com:5432/jobsclick',
        REDIS_URL: 'rediss://default:pwd@redis.example.com:6379',
        SUPABASE_URL: 'https://supabase.example.com',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validServiceRoleKeyMockDataLongEnough',
        CF_ORIGIN_LOCKED: 'true',
        TRUSTED_PROXY_CIDRS: '103.21.244.0/22,173.245.48.0/20',
        TURNSTILE_SECRET_KEY: '0x4AAAAAAtestkey20charsminlength_',
        MSG91_AUTH_KEY: 'live-msg91-auth-key-valid-32chars',
        WEB_URL: 'http://localhost:3000',
      };
      expect(() => validateEnv(strictEnv)).toThrowError(/WEB_URL/);
    });
  });

  describe('Web validateWebEnv() universal JWT_SECRET enforcement', () => {
    it('refuses to start when JWT_SECRET is missing in development mode', () => {
      expect(() =>
        validateWebEnv({
          NODE_ENV: 'development',
          JWT_SECRET: undefined,
        }),
      ).toThrowError(/JWT_SECRET/);
    });

    it('refuses to start when JWT_SECRET is shorter than 32 characters in development mode', () => {
      expect(() =>
        validateWebEnv({
          NODE_ENV: 'development',
          JWT_SECRET: 'short-secret-123',
        }),
      ).toThrowError(/JWT_SECRET/);
    });

    it('refuses to start when JWT_SECRET fails production validation in production mode', () => {
      expect(() =>
        validateWebEnv({
          NODE_ENV: 'production',
          NEXT_PUBLIC_API_URL: 'https://api.jobsclick.live',
          NEXT_PUBLIC_APP_URL: 'https://jobsclick.live',
          JWT_SECRET: 'invalid-non-64-hex-secret-key-too-short-for-production',
        }),
      ).toThrowError(/JWT_SECRET/);
    });
  });
});
