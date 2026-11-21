import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { paymentEnv, validatePaymentEnv } from './payment-env.js';

describe('Task 3: Payment env safety (payment-env.ts)', () => {
  const originalEnv = { ...process.env };

  const validTestKey = 'rzp_test_1234567890abcdef';
  const validLiveKey = 'rzp_live_1234567890abcdef';
  const validSecret = 'valid_secret_key_16_chars_min';
  const validWebhookSecret = 'valid_webhook_secret_20_chars_min';

  beforeEach(() => {
    delete process.env['APP_ENV'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('production vs staging key prefix enforcement', () => {
    it('validatePaymentEnv helper parses valid source correctly', () => {
      const parsed = validatePaymentEnv({
        RAZORPAY_KEY_ID: validLiveKey,
        RAZORPAY_KEY_SECRET: validSecret,
        RAZORPAY_WEBHOOK_SECRET: validWebhookSecret,
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'production',
      });
      expect(parsed.RAZORPAY_KEY_ID).toBe(validLiveKey);
    });

    it('combo 2: production with rzp_test_ key fails validation', () => {
      const result = paymentEnv.safeParse({
        RAZORPAY_KEY_ID: validTestKey,
        RAZORPAY_KEY_SECRET: validSecret,
        RAZORPAY_WEBHOOK_SECRET: validWebhookSecret,
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'production',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/live key required in production/);
      }
    });

    it('combo 3: staging with rzp_test_ key passes validation', () => {
      const result = paymentEnv.safeParse({
        RAZORPAY_KEY_ID: validTestKey,
        RAZORPAY_KEY_SECRET: validSecret,
        RAZORPAY_WEBHOOK_SECRET: validWebhookSecret,
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'staging',
      });
      expect(result.success).toBe(true);
    });

    it('combo 4: staging with rzp_live_ key fails validation ("live key forbidden in staging")', () => {
      const result = paymentEnv.safeParse({
        RAZORPAY_KEY_ID: validLiveKey,
        RAZORPAY_KEY_SECRET: validSecret,
        RAZORPAY_WEBHOOK_SECRET: validWebhookSecret,
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'staging',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/live key forbidden in staging/);
      }
    });

    it('APP_ENV=staging overrides NODE_ENV=production and forbids rzp_live_ key', () => {
      const result = paymentEnv.safeParse({
        RAZORPAY_KEY_ID: validLiveKey,
        RAZORPAY_KEY_SECRET: validSecret,
        RAZORPAY_WEBHOOK_SECRET: validWebhookSecret,
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'production',
        APP_ENV: 'staging',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/live key forbidden in staging/);
      }
    });

    it('APP_ENV=staging with NODE_ENV=production passes with rzp_test_ key', () => {
      const result = paymentEnv.safeParse({
        RAZORPAY_KEY_ID: validTestKey,
        RAZORPAY_KEY_SECRET: validSecret,
        RAZORPAY_WEBHOOK_SECRET: validWebhookSecret,
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'production',
        APP_ENV: 'staging',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('dummy and placeholder value rejection', () => {
    it('rejects dummy values in RAZORPAY_KEY_SECRET', () => {
      const result = paymentEnv.safeParse({
        RAZORPAY_KEY_ID: validTestKey,
        RAZORPAY_KEY_SECRET: 'dummy_secret_key_16_chars',
        RAZORPAY_WEBHOOK_SECRET: validWebhookSecret,
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'dummy value')).toBe(true);
      }
    });

    it('rejects placeholder values in RAZORPAY_WEBHOOK_SECRET', () => {
      const result = paymentEnv.safeParse({
        RAZORPAY_KEY_ID: validTestKey,
        RAZORPAY_KEY_SECRET: validSecret,
        RAZORPAY_WEBHOOK_SECRET: 'placeholder_webhook_secret_20',
        TRUST_PROXY_HOPS: 1,
        NODE_ENV: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === 'dummy value')).toBe(true);
      }
    });
  });
});
