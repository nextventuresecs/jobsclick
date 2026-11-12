import { describe, expect, it } from 'vitest';
import {
  IndianPhoneSchema,
  SendOtpSchema,
  VerifyOtpSchema,
  AddEmailSchema,
  SelfSignupRoleSchema,
  UserRoleSchema,
  clientRoleSchema,
  toBackendRole,
  toClientRole,
  isClientRole,
  isUserRole,
  udyamNumberSchema,
} from '../src/auth.js';

describe('IndianPhoneSchema Normalization & Validation', () => {
  it('normalizes various valid Indian phone formats to 10 canonical digits', () => {
    // 10 digits unchanged
    expect(IndianPhoneSchema.parse('9123456789')).toBe('9123456789');
    expect(IndianPhoneSchema.parse('9876543210')).toBe('9876543210');
    expect(IndianPhoneSchema.parse('6123456789')).toBe('6123456789');

    // 12 digits with 91 prefix -> 10 digits
    expect(IndianPhoneSchema.parse('919123456789')).toBe('9123456789');
    expect(IndianPhoneSchema.parse('919876543210')).toBe('9876543210');
    expect(IndianPhoneSchema.parse('+919876543210')).toBe('9876543210');
    expect(IndianPhoneSchema.parse('+91 98765-43210')).toBe('9876543210');

    // 13 digits with +91 and trunk 0 (+91 09876543210 -> stripped 910)
    expect(IndianPhoneSchema.parse('+91 09876543210')).toBe('9876543210');

    // 14 digits with 0091 international prefix (0091 9876543210 -> stripped 0091)
    expect(IndianPhoneSchema.parse('0091 9876543210')).toBe('9876543210');

    // 11 digits with 0 trunk prefix
    expect(IndianPhoneSchema.parse('09876543210')).toBe('9876543210');
  });

  it('rejects invalid numbers, non-Indian prefixes, and improper start digits', () => {
    // 14 digits without 0091 prefix (rejected)
    expect(() => IndianPhoneSchema.parse('91234567890123')).toThrow();

    expect(() => IndianPhoneSchema.parse('5876543210')).toThrow();
    expect(() => IndianPhoneSchema.parse('98765')).toThrow();
    expect(() => IndianPhoneSchema.parse('+1 9876543210')).toThrow();
    expect(() => IndianPhoneSchema.parse('1234567890')).toThrow();
    expect(() => IndianPhoneSchema.parse('abcdefghij')).toThrow();
  });
});

describe('OTP & Auth Schemas Strict Enforcement', () => {
  it('validates SendOtpSchema payload', () => {
    const valid = SendOtpSchema.parse({ phone: '9876543210', turnstileToken: 'token_123' });
    expect(valid.phone).toBe('9876543210');
    expect(valid.language).toBe('en');
  });

  it('validates VerifyOtpSchema payload with self-signup roles and defaults', () => {
    const validSeeker = VerifyOtpSchema.parse({ phone: '9876543210', code: '123456', role: 'job_seeker' });
    expect(validSeeker.role).toBe('job_seeker');

    const validEmployer = VerifyOtpSchema.parse({ phone: '9876543210', code: '123456', role: 'employer' });
    expect(validEmployer.role).toBe('employer');

    const defaultRole = VerifyOtpSchema.parse({ phone: '9876543210', code: '123456' });
    expect(defaultRole.role).toBe('job_seeker');
  });

  it('strictly rejects non-self-signup roles in VerifyOtpSchema (Audit P0-5)', () => {
    const forbiddenRoles = [
      'admin',
      'msme_admin',
      'intermediary',
      'institution',
      'msme_dept',
      'platform_admin',
      'jobseeker',
      'institution_admin',
      'ADMIN',
      'superadmin',
    ];

    for (const role of forbiddenRoles) {
      expect(() => VerifyOtpSchema.parse({ phone: '9876543210', code: '123456', role })).toThrow();
    }
  });

  it('enforces .strict() on VerifyOtpSchema and validates optional consentVersion', () => {
    // Valid with consentVersion <= 32 chars
    const withConsent = VerifyOtpSchema.parse({
      phone: '9876543210',
      code: '123456',
      role: 'job_seeker',
      consentVersion: 'v1.2-2026-10',
    });
    expect(withConsent.consentVersion).toBe('v1.2-2026-10');

    // Reject consentVersion > 32 chars
    expect(() =>
      VerifyOtpSchema.parse({
        phone: '9876543210',
        code: '123456',
        role: 'job_seeker',
        consentVersion: 'v'.repeat(33),
      }),
    ).toThrow();

    // Reject unknown properties due to .strict()
    expect(() =>
      VerifyOtpSchema.parse({
        phone: '9876543210',
        code: '123456',
        role: 'job_seeker',
        extraField: 'unexpected',
      }),
    ).toThrow();
  });

  it('validates AddEmailSchema payload with RFC 5321 length limits (max 254)', () => {
    const valid = AddEmailSchema.parse({ email: 'user@example.com' });
    expect(valid.email).toBe('user@example.com');

    // Exactly 254 chars: local (64) + @ + domain (189)
    const longDomain = 'a'.repeat(185) + '.com';
    const longLocal = 'b'.repeat(64);
    const maxEmail = `${longLocal}@${longDomain}`; // length 64 + 1 + 189 = 254
    expect(maxEmail.length).toBe(254);
    expect(AddEmailSchema.parse({ email: maxEmail }).email).toBe(maxEmail);

    // 255 chars exceeds limit
    const tooLongEmail = 'a' + maxEmail;
    expect(() => AddEmailSchema.parse({ email: tooLongEmail })).toThrow();
  });
});

describe('Role Typing & Enums (Postgres Derived)', () => {
  it('validates canonical Postgres backend roles via UserRoleSchema', () => {
    expect(UserRoleSchema.parse('job_seeker')).toBe('job_seeker');
    expect(UserRoleSchema.parse('employer')).toBe('employer');
    expect(UserRoleSchema.parse('intermediary')).toBe('intermediary');
    expect(UserRoleSchema.parse('admin')).toBe('admin');
    expect(UserRoleSchema.parse('msme_admin')).toBe('msme_admin');
    expect(() => UserRoleSchema.parse('platform_admin')).toThrow();
    expect(() => UserRoleSchema.parse('institution')).toThrow();
  });

  it('validates SelfSignupRoleSchema options strictly', () => {
    expect(SelfSignupRoleSchema.parse('job_seeker')).toBe('job_seeker');
    expect(SelfSignupRoleSchema.parse('employer')).toBe('employer');
    expect(() => SelfSignupRoleSchema.parse('intermediary')).toThrow();
    expect(() => SelfSignupRoleSchema.parse('admin')).toThrow();
  });

  it('validates all 5 client roles', () => {
    expect(clientRoleSchema.parse('jobseeker')).toBe('jobseeker');
    expect(clientRoleSchema.parse('employer')).toBe('employer');
    expect(clientRoleSchema.parse('institution')).toBe('institution');
    expect(clientRoleSchema.parse('msme_dept')).toBe('msme_dept');
    expect(clientRoleSchema.parse('platform_admin')).toBe('platform_admin');
    expect(() => clientRoleSchema.parse('invalid_role')).toThrow();
  });

  it('provides bidirectional mapping between client and backend roles', () => {
    expect(toBackendRole('jobseeker')).toBe('job_seeker');
    expect(toBackendRole('employer')).toBe('employer');
    expect(toBackendRole('institution')).toBe('intermediary');
    expect(toBackendRole('msme_dept')).toBe('msme_admin');
    expect(toBackendRole('platform_admin')).toBe('admin');

    expect(toClientRole('job_seeker')).toBe('jobseeker');
    expect(toClientRole('employer')).toBe('employer');
    expect(toClientRole('intermediary')).toBe('institution');
    expect(toClientRole('msme_admin')).toBe('msme_dept');
    expect(toClientRole('admin')).toBe('platform_admin');
  });

  it('validates role type guards', () => {
    expect(isClientRole('jobseeker')).toBe(true);
    expect(isClientRole('employer')).toBe(true);
    expect(isClientRole('random_string')).toBe(false);
    expect(isClientRole(123)).toBe(false);

    expect(isUserRole('job_seeker')).toBe(true);
    expect(isUserRole('employer')).toBe(true);
    expect(isUserRole('intermediary')).toBe(true);
    expect(isUserRole('admin')).toBe(true);
    expect(isUserRole('msme_admin')).toBe(true);
    expect(isUserRole('platform_admin')).toBe(false);
  });

  it('validates Udyam registration number format strictly', () => {
    expect(udyamNumberSchema.parse('UDYAM-MH-26-0019482')).toBe('UDYAM-MH-26-0019482');
    expect(udyamNumberSchema.parse('udyam-kr-03-0098231')).toBe('UDYAM-KR-03-0098231');
    expect(() => udyamNumberSchema.parse('INVALID-NUMBER')).toThrow();
    expect(() => udyamNumberSchema.parse('UDYAM-M-26-0019482')).toThrow();
  });
});
