import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthModal } from '../src/components/auth/AuthModal.js';
import { LinkPhoneModal } from '../src/components/auth/LinkPhoneModal.js';
import { SendEmailOtpSchema, OAuthExchangeSchema, LinkPhoneSchema, VerifyLinkPhoneSchema } from '@indian-job-portal/validation';

describe('Web Multi-Channel Auth & Phone Linking UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports AuthModal and LinkPhoneModal components', () => {
    expect(AuthModal).toBeDefined();
    expect(typeof AuthModal).toBe('function');
    expect(LinkPhoneModal).toBeDefined();
    expect(typeof LinkPhoneModal).toBe('function');
  });

  it('validates email OTP dispatch schema for web client', () => {
    const validEmail = 'applicant@domain.edu.in';
    const parsed = SendEmailOtpSchema.safeParse({
      email: validEmail,
      role: 'job_seeker',
      turnstileToken: 'client_turnstile_pass',
      language: 'hi',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe(validEmail);
      expect(parsed.data.role).toBe('job_seeker');
      expect(parsed.data.language).toBe('hi');
    }
  });

  it('validates Google OAuth token exchange payload', () => {
    const parsed = OAuthExchangeSchema.safeParse({
      providerToken: 'mock_oauth_provider_token_xyz',
      role: 'employer',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.role).toBe('employer');
    }
  });

  it('validates phone linking schemas for non-dismissible modal', () => {
    const sendParse = LinkPhoneSchema.safeParse({
      phone: '9820012345',
      turnstileToken: 'token_123',
    });
    expect(sendParse.success).toBe(true);

    const verifyParse = VerifyLinkPhoneSchema.safeParse({
      phone: '9820012345',
      code: '654321',
    });
    expect(verifyParse.success).toBe(true);

    const invalidVerify = VerifyLinkPhoneSchema.safeParse({
      phone: '9820012345',
      code: '123', // less than 6 digits
    });
    expect(invalidVerify.success).toBe(false);
  });
});
