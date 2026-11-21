import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../src/config/env.js';
import { paymentEnv, validatePaymentEnv } from '../src/config/payment-env.js';

describe('Payment & Reverse Proxy Environment Hardening (Task 0)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const VALID_PROD: Record<string, string> = {
    NODE_ENV: 'production',
    PORT: '3001',
    DATABASE_URL: 'postgresql://prod_app_user:Kx9#mP2$vL8!zQ4@db.example.com:5432/app',
    REDIS_URL: 'rediss://default:Ab3$zQ9*wL2!xP5@redis.example.com:6380',
    JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
    OTP_PEPPER: 'b8eLqRnYs3wGxMoZfUvJiKb8eLqRnYs3',
    CF_ORIGIN_LOCKED: 'true',
    SMS_GATEWAY_MODE: 'live',
    MSG91_AUTH_KEY: 'msg91_live_auth_key_sec_99182746',
    TURNSTILE_SECRET_KEY: '0x4AAAAAAABBBCCCDDDEEEFFF12345',
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-service-role-payload-long-string',
    QSTASH_TOKEN: 'qst_real_token',
    QSTASH_CURRENT_SIGNING_KEY: 'sig_real_key',
    API_URL: 'https://api.example.com',
    WEB_URL: 'https://jobsclick.live',
    TRUSTED_PROXY_CIDRS: '127.0.0.1/32,10.0.0.0/8',
    RAZORPAY_KEY_ID: 'rzp_live_1234567890abcdef',
    RAZORPAY_KEY_SECRET: 'live_secret_key_16_chars_min',
    RAZORPAY_WEBHOOK_SECRET: 'live_webhook_secret_20_chars_min',
    TRUST_PROXY_HOPS: '1',
  };

  const VALID_PAYMENT_CONFIG = {
    RAZORPAY_KEY_ID: 'rzp_live_1234567890abcdef',
    RAZORPAY_KEY_SECRET: 'live_secret_key_16_chars_min',
    RAZORPAY_WEBHOOK_SECRET: 'live_webhook_secret_20_chars_min',
    TRUST_PROXY_HOPS: 1,
  };

  describe('Bootloader validateEnv() Gate', () => {
    it('passes boot with complete, valid production payment & proxy configuration', () => {
      expect(() => validateEnv(VALID_PROD)).not.toThrow();
      const parsed = validateEnv(VALID_PROD);
      expect(parsed.RAZORPAY_KEY_ID).toBe('rzp_live_1234567890abcdef');
      expect(parsed.TRUST_PROXY_HOPS).toBe(1);
    });

    it('fails boot in production when RAZORPAY_KEY_ID is missing', () => {
      const env = { ...VALID_PROD, RAZORPAY_KEY_ID: undefined };
      expect(() => validateEnv(env)).toThrowError(/Payment configuration error/);
    });

    it('fails boot in production when RAZORPAY_KEY_SECRET is missing', () => {
      const env = { ...VALID_PROD, RAZORPAY_KEY_SECRET: undefined };
      expect(() => validateEnv(env)).toThrowError(/Payment configuration error/);
    });

    it('fails boot in production when RAZORPAY_WEBHOOK_SECRET is missing', () => {
      const env = { ...VALID_PROD, RAZORPAY_WEBHOOK_SECRET: undefined };
      expect(() => validateEnv(env)).toThrowError(/Payment configuration error/);
    });

    it('fails boot in production when RAZORPAY_KEY_ID is a test key (rzp_test_)', () => {
      const env = { ...VALID_PROD, RAZORPAY_KEY_ID: 'rzp_test_1234567890' };
      expect(() => validateEnv(env)).toThrowError(/live key required in production/);
    });

    it('fails boot when RAZORPAY_KEY_ID contains dummy/placeholder values', () => {
      const dummies = [
        'rzp_live_dummy_key_id',
        'rzp_live_changeme_key',
        'rzp_live_example_key',
        'rzp_live_placeholder_key',
        'rzp_live_test_key_123',
        'rzp_live_xxxxxx1234',
      ];

      for (const dummy of dummies) {
        const env = { ...VALID_PROD, RAZORPAY_KEY_ID: dummy };
        expect(() => validateEnv(env)).toThrowError(/dummy value/);
      }
    });

    it('fails boot when RAZORPAY_KEY_SECRET contains dummy/placeholder values', () => {
      const dummies = [
        'dummy_razorpay_key_secret',
        'changeme_secret_key_123',
        'example_secret_key_123',
        'placeholder_secret_key',
        'test_key_secret_1234',
        'xxxxxx_secret_key_123',
      ];

      for (const dummy of dummies) {
        const env = { ...VALID_PROD, RAZORPAY_KEY_SECRET: dummy };
        expect(() => validateEnv(env)).toThrowError(/dummy value/);
      }
    });

    it('fails boot when RAZORPAY_WEBHOOK_SECRET contains dummy/placeholder values', () => {
      const dummies = [
        'dummy_razorpay_webhook_secret',
        'changeme_webhook_secret_key',
        'example_webhook_secret_key',
        'placeholder_webhook_secret',
        'test_key_webhook_secret_12',
        'xxxxxx_webhook_secret_key',
      ];

      for (const dummy of dummies) {
        const env = { ...VALID_PROD, RAZORPAY_WEBHOOK_SECRET: dummy };
        expect(() => validateEnv(env)).toThrowError(/dummy value/);
      }
    });

    it('fails boot when TRUST_PROXY_HOPS is out of range (<0 or >5)', () => {
      expect(() => validateEnv({ ...VALID_PROD, TRUST_PROXY_HOPS: '-1' })).toThrowError(/Payment configuration error/);
      expect(() => validateEnv({ ...VALID_PROD, TRUST_PROXY_HOPS: '6' })).toThrowError(/Payment configuration error/);
      expect(() => validateEnv({ ...VALID_PROD, TRUST_PROXY_HOPS: 'abc' })).toThrowError(/Payment configuration error/);
    });

    it('fails boot in dev/test if dummy Razorpay values are passed from .env.example', () => {
      const devWithDummies = {
        NODE_ENV: 'development',
        OTP_PEPPER: 'b8eLqRnYs3wGxMoZfUvJiKb8eLqRnYs3',
        TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
        MSG91_AUTH_KEY: 'test-msg91-auth-key',
        RAZORPAY_KEY_ID: 'rzp_test_dummy_key_id',
        RAZORPAY_KEY_SECRET: 'dummy_razorpay_key_secret',
        RAZORPAY_WEBHOOK_SECRET: 'dummy_razorpay_webhook_secret',
      };
      expect(() => validateEnv(devWithDummies)).toThrowError(/dummy/i);
    });

    it('fails boot in dev/test if only a single dummy Razorpay key is set and others are unset', () => {
      const devWithSingleDummy = {
        NODE_ENV: 'development',
        OTP_PEPPER: 'b8eLqRnYs3wGxMoZfUvJiKb8eLqRnYs3',
        TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
        MSG91_AUTH_KEY: 'test-msg91-auth-key',
        RAZORPAY_KEY_ID: 'dummy_test_key_placeholder',
      };
      expect(() => validateEnv(devWithSingleDummy)).toThrowError(/dummy or placeholder values are rejected/);
    });
  });

  describe('paymentEnv Schema Direct Validation', () => {
    it('accepts valid live configuration in production mode', () => {
      process.env['NODE_ENV'] = 'production';
      const result = paymentEnv.safeParse(VALID_PAYMENT_CONFIG);
      expect(result.success).toBe(true);
    });

    it('accepts valid test configuration in test/development mode', () => {
      process.env['NODE_ENV'] = 'test';
      const result = paymentEnv.safeParse({
        ...VALID_PAYMENT_CONFIG,
        RAZORPAY_KEY_ID: 'rzp_test_1234567890abcdef',
      });
      expect(result.success).toBe(true);
    });

    it('strictly rejects test key (rzp_test_) when NODE_ENV is production', () => {
      process.env['NODE_ENV'] = 'production';
      const result = paymentEnv.safeParse({
        ...VALID_PAYMENT_CONFIG,
        RAZORPAY_KEY_ID: 'rzp_test_1234567890abcdef',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('live key required in production');
      }
    });

    it('enforces RAZORPAY_KEY_ID pattern /^rzp_(live|test)_[A-Za-z0-9]{10,}$/', () => {
      const invalidKeys = [
        'invalid_key_format',
        'rzp_stage_1234567890',
        'rzp_live_short',
        'rzp_test_!@#$',
      ];

      for (const key of invalidKeys) {
        const result = paymentEnv.safeParse({
          ...VALID_PAYMENT_CONFIG,
          RAZORPAY_KEY_ID: key,
        });
        expect(result.success).toBe(false);
      }
    });

    it('enforces RAZORPAY_KEY_SECRET minimum length of 16 characters', () => {
      const result = paymentEnv.safeParse({
        ...VALID_PAYMENT_CONFIG,
        RAZORPAY_KEY_SECRET: 'short_secret_12',
      });
      expect(result.success).toBe(false);
    });

    it('enforces RAZORPAY_WEBHOOK_SECRET minimum length of 20 characters', () => {
      const result = paymentEnv.safeParse({
        ...VALID_PAYMENT_CONFIG,
        RAZORPAY_WEBHOOK_SECRET: 'short_secret_len_19',
      });
      expect(result.success).toBe(false);
    });

    it('enforces TRUST_PROXY_HOPS integer range [0, 5]', () => {
      for (let hops = 0; hops <= 5; hops++) {
        const result = paymentEnv.safeParse({
          ...VALID_PAYMENT_CONFIG,
          TRUST_PROXY_HOPS: hops,
        });
        expect(result.success).toBe(true);
      }

      expect(paymentEnv.safeParse({ ...VALID_PAYMENT_CONFIG, TRUST_PROXY_HOPS: -1 }).success).toBe(false);
      expect(paymentEnv.safeParse({ ...VALID_PAYMENT_CONFIG, TRUST_PROXY_HOPS: 6 }).success).toBe(false);
    });

    it('validatePaymentEnv helper parses valid input and throws on invalid', () => {
      process.env['NODE_ENV'] = 'production';
      expect(() => validatePaymentEnv(VALID_PAYMENT_CONFIG)).not.toThrow();
      expect(() =>
        validatePaymentEnv({
          ...VALID_PAYMENT_CONFIG,
          RAZORPAY_KEY_SECRET: 'dummy_secret_key_16',
        }),
      ).toThrow();
    });
  });
});
