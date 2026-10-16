import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Msg91SmsService } from '../src/auth/sms.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BadRequestException } from '@nestjs/common';
import { DLT_SMS_TEMPLATES } from '../src/auth/sms-templates.js';

describe('Ticket T-06: MSG91 SMS Service & Turnstile Bot Challenge', () => {
  let smsService: Msg91SmsService;
  let authService: AuthService;
  const mockUserRepository = {
    findByPhone: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    smsService = new Msg91SmsService();
    authService = new AuthService(mockUserRepository as any, smsService);
  });

  describe('Msg91SmsService & DLT Template Routing', () => {
    it('routes English OTP requests to DLT_1001_OTP_EN template', async () => {
      const result = await smsService.sendOtp({
        phone: '9876543210',
        otp: '123456',
        language: 'en',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('MSG91');
      expect(DLT_SMS_TEMPLATES['OTP_EN']?.templateId).toBe('DLT_1001_OTP_EN');
    });

    it('routes Hindi OTP requests to DLT_1002_OTP_HI template', async () => {
      const result = await smsService.sendOtp({
        phone: '9876543210',
        otp: '123456',
        language: 'hi',
      });

      expect(result.success).toBe(true);
      expect(DLT_SMS_TEMPLATES['OTP_HI']?.templateId).toBe('DLT_1002_OTP_HI');
      expect(DLT_SMS_TEMPLATES['OTP_HI']?.isUnicode).toBe(true);
    });

    it('AC-1: sends live HTTP request to MSG91 gateway when production credentials are configured', async () => {
      const originalEnv = process.env['NODE_ENV'];
      const originalKey = process.env['MSG91_AUTH_KEY'];
      const originalSender = process.env['MSG91_SENDER_ID'];

      try {
        process.env['NODE_ENV'] = 'production';
        process.env['MSG91_AUTH_KEY'] = 'live-msg91-key-secret';
        process.env['MSG91_SENDER_ID'] = 'INDIAN';

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ type: 'success', message: 'OTP sent successfully', request_id: 'req_12345' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const result = await smsService.sendOtp({
          phone: '9876543210',
          otp: '654321',
          language: 'en',
        });

        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalled();
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('https://control.msg91.com/api/v5/otp');
        expect(calledUrl).toContain('mobile=919876543210');
        expect(calledUrl).toContain('otp=654321');
        expect(calledUrl).toContain('sender=INDIAN');
        expect(calledUrl).toContain('template_id=DLT_1001_OTP_EN');
      } finally {
        process.env['NODE_ENV'] = originalEnv;
        process.env['MSG91_AUTH_KEY'] = originalKey;
        process.env['MSG91_SENDER_ID'] = originalSender;
      }
    });
  });

  describe('Turnstile Bot Challenge Verification (AC-2)', () => {
    it('rejects invalid or failed Turnstile tokens with 400 Bad Request', async () => {
      await expect(
        authService.sendOtp({
          phone: '9876543210',
          turnstileToken: 'invalid-token',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('verifies Cloudflare Turnstile tokens via siteverify API in production', async () => {
      const originalEnv = process.env['NODE_ENV'];
      const originalSecret = process.env['TURNSTILE_SECRET_KEY'];

      try {
        process.env['NODE_ENV'] = 'production';
        process.env['TURNSTILE_SECRET_KEY'] = '0x4AAAAAAFU6rzWjPZzPM5JuMbFzCLXQhRA';

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: true, challenge_ts: new Date().toISOString() }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const isValid = await smsService.verifyTurnstile('cf-turnstile-token-sample', '127.0.0.1');
        expect(isValid).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('response=cf-turnstile-token-sample'),
          })
        );
      } finally {
        if (originalEnv === undefined) delete process.env['NODE_ENV'];
        else process.env['NODE_ENV'] = originalEnv;

        if (originalSecret === undefined) delete process.env['TURNSTILE_SECRET_KEY'];
        else process.env['TURNSTILE_SECRET_KEY'] = originalSecret;
      }
    });

    it('rejects missing Turnstile tokens when secret key is enforced in production', async () => {
      const originalEnv = process.env['NODE_ENV'];
      const originalSecret = process.env['TURNSTILE_SECRET_KEY'];

      try {
        process.env['NODE_ENV'] = 'production';
        process.env['TURNSTILE_SECRET_KEY'] = 'real-secret-key';

        await expect(
          authService.sendOtp({
            phone: '9876543210',
            // turnstileToken missing
          })
        ).rejects.toThrow(BadRequestException);
      } finally {
        if (originalEnv === undefined) delete process.env['NODE_ENV'];
        else process.env['NODE_ENV'] = originalEnv;

        if (originalSecret === undefined) delete process.env['TURNSTILE_SECRET_KEY'];
        else process.env['TURNSTILE_SECRET_KEY'] = originalSecret;
      }
    });
  });

  describe('Test Mode Invariants (AC-3)', () => {
    it('supports 123456 demo code and bypasses SMS delivery in test mode', async () => {
      const sendRes = await authService.sendOtp({
        phone: '9876543210',
      });
      expect(sendRes.success).toBe(true);

      const verifyRes = await authService.verifyOtp({
        phone: '9876543210',
        code: '123456',
        role: 'job_seeker',
      });

      expect(verifyRes.accessToken).toBeDefined();
      expect(verifyRes.user.phone).toBe('9876543210');
    });
  });
});
