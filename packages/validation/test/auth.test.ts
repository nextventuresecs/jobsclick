import { describe, expect, it } from 'vitest';
import { indianMobileNumberSchema, sendOtpSchema, verifyOtpSchema, addEmailSchema } from '../src/auth.js';

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

describe('OTP & Auth Schemas', () => {
  it('validates sendOtpSchema payload', () => {
    const valid = sendOtpSchema.parse({ phone: '9876543210', turnstileToken: 'token_123' });
    expect(valid.phone).toBe('9876543210');
  });

  it('validates verifyOtpSchema payload', () => {
    const valid = verifyOtpSchema.parse({ phone: '9876543210', code: '123456', role: 'employer' });
    expect(valid.code).toBe('123456');
    expect(valid.role).toBe('employer');
  });

  it('validates addEmailSchema payload', () => {
    const valid = addEmailSchema.parse({ email: 'user@example.com' });
    expect(valid.email).toBe('user@example.com');
  });
});

describe('Matt Pocock Role Typing & MSME Udyam Validation', async () => {
  const {
    clientRoleSchema,
    toBackendRole,
    toClientRole,
    isClientRole,
    udyamNumberSchema,
  } = await import('../src/auth.js');

  it('validates all 5 client roles with zero TypeScript any', () => {
    expect(clientRoleSchema.parse('jobseeker')).toBe('jobseeker');
    expect(clientRoleSchema.parse('employer')).toBe('employer');
    expect(clientRoleSchema.parse('institution')).toBe('institution');
    expect(clientRoleSchema.parse('msme_dept')).toBe('msme_dept');
    expect(clientRoleSchema.parse('platform_admin')).toBe('platform_admin');
    expect(() => clientRoleSchema.parse('invalid_role')).toThrow();
  });

  it('provides bidirectional lossless mapping between client and backend roles', () => {
    expect(toBackendRole('jobseeker')).toBe('job_seeker');
    expect(toBackendRole('institution')).toBe('intermediary');
    expect(toBackendRole('msme_dept')).toBe('msme_admin');
    expect(toBackendRole('platform_admin')).toBe('admin');

    expect(toClientRole('job_seeker')).toBe('jobseeker');
    expect(toClientRole('intermediary')).toBe('institution');
    expect(toClientRole('msme_admin')).toBe('msme_dept');
    expect(toClientRole('admin')).toBe('platform_admin');
  });

  it('validates client role type guards', () => {
    expect(isClientRole('jobseeker')).toBe(true);
    expect(isClientRole('employer')).toBe(true);
    expect(isClientRole('random_string')).toBe(false);
    expect(isClientRole(123)).toBe(false);
  });

  it('validates Udyam registration number format strictly', () => {
    expect(udyamNumberSchema.parse('UDYAM-MH-26-0019482')).toBe('UDYAM-MH-26-0019482');
    expect(udyamNumberSchema.parse('udyam-kr-03-0098231')).toBe('UDYAM-KR-03-0098231');
    expect(() => udyamNumberSchema.parse('INVALID-NUMBER')).toThrow();
    expect(() => udyamNumberSchema.parse('UDYAM-M-26-0019482')).toThrow();
  });
});

