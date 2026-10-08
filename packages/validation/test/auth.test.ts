import { describe, expect, it } from 'vitest';
import { indianMobileNumberSchema } from '../src/auth.js';

describe('indianMobileNumberSchema', () => {
  it('validates valid 10-digit Indian mobile numbers starting with 6-9', () => {
    expect(indianMobileNumberSchema.parse('9876543210')).toBe('9876543210');
    expect(indianMobileNumberSchema.parse('6123456789')).toBe('6123456789');
  });

  it('validates and normalizes 10-digit mobile numbers with +91 prefix', () => {
    expect(indianMobileNumberSchema.parse('+919876543210')).toBe('9876543210');
    expect(indianMobileNumberSchema.parse('+91 9876543210')).toBe('9876543210');
  });

  it('rejects invalid numbers', () => {
    expect(() => indianMobileNumberSchema.parse('1234567890')).toThrow();
    expect(() => indianMobileNumberSchema.parse('98765')).toThrow();
    expect(() => indianMobileNumberSchema.parse('abcdefghij')).toThrow();
  });
});
