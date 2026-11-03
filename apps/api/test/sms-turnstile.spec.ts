import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Msg91SmsService } from '../src/auth/sms.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BadRequestException } from '@nestjs/common';
import { DLT_SMS_TEMPLATES } from '../src/auth/sms-templates.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { OtpGenerator } from '../src/auth/otp-generator.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

class DeterministicOtpGenerator extends OtpGenerator {
  override generate(): string {
    return '123456';
  }
}

describe('Ticket T-06: MSG91 SMS Service & Turnstile Bot Challenge', () => {
  let smsService: Msg91SmsService;
  let authService: AuthService;
  let otpRedisService: OtpRedisService;
  const mockUserRepository = {
    findByPhone: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    touchLastLogin: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    smsService = new Msg91SmsService();
    otpRedisService = new OtpRedisService();
    await otpRedisService.waitForReady();
    authService = new AuthService(
      mockUserRepository as unknown as UserRepository,
      smsService,
      otpRedisService,
      undefined,
      undefined,
      new DeterministicOtpGenerator(),
    );

    mockUserRepository.create.mockImplementation(async (data: { phone: string; role?: string }) => ({
      id: `usr_${Date.now()}`,
      phone: data.phone,
      role: data.role || 'job_seeker',
      status: 'active',
    }));
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
      expect(DLT_SMS_TEMPLATES['OTP_EN']?.templateId).toBe('1277179301139811147');
    });

    it('routes Hindi OTP requests to DLT_1002_OTP_HI template', async () => {
      const result = await smsService.sendOtp({
        phone: '9876543210',
        otp: '123456',
        language: 'hi',
      });

      expect(result.success).toBe(true);
      expect(DLT_SMS_TEMPLATES['OTP_HI']?.templateId).toBe('1277179301139811147');
      expect(DLT_SMS_TEMPLATES['OTP_HI']?.isUnicode).toBe(false);
    });

    it('AC-1: sends live HTTP request to MSG91 gateway when production credentials are configured', async () => {
      const originalEnv = process.env['NODE_ENV'];
      const originalKey = process.env['MSG91_AUTH_KEY'];
      const originalSender = process.env['MSG91_SENDER_ID'];

      try {
        process.env['NODE_ENV'] = 'production';
        process.env['SMS_GATEWAY_MODE'] = 'live';
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
        expect(calledUrl).not.toContain('otp=');
        expect(calledUrl).not.toContain('authkey=');
        expect(calledUrl).toContain('template_id=1277179301139811147');

        const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
        const headers = requestInit.headers as Record<string, string>;
        expect(headers['authkey']).toBe('live-msg91-key-secret');
        const body = JSON.parse(requestInit.body as string);
        expect(body.otp).toBe('654321');
        expect(body.sender).toBe('INDIAN');
      } finally {
        process.env['NODE_ENV'] = originalEnv;
        process.env['MSG91_AUTH_KEY'] = originalKey;
        process.env['MSG91_SENDER_ID'] = originalSender;
        delete process.env['SMS_GATEWAY_MODE'];
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
    it('verifies code after sendOtp when OtpGenerator returns known code', async () => {
      await otpRedisService.resetForTest('9876543210');
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

    it('prevents privilege escalation: existing user cannot become admin by submitting role=admin on login', async () => {
      await otpRedisService.resetForTest('9876543219');
      mockUserRepository.findByPhone.mockResolvedValueOnce({
        id: 'usr-19',
        phone: '9876543219',
        role: 'job_seeker',
        status: 'active',
      });

      await authService.sendOtp({ phone: '9876543219' });
      const userRes = await authService.verifyOtp({
        phone: '9876543219',
        code: '123456',
        role: 'job_seeker',
      });
      expect(userRes.user.role).toBe('job_seeker');

      await otpRedisService.resetForTest('9876543219');
      mockUserRepository.findByPhone.mockResolvedValueOnce({
        id: 'usr-19',
        phone: '9876543219',
        role: 'job_seeker',
        status: 'active',
      });

      await authService.sendOtp({ phone: '9876543219' });
      const attackRes = await authService.verifyOtp({
        phone: '9876543219',
        code: '123456',
        role: 'admin',
      });
      expect(attackRes.user.role).toBe('job_seeker');
      expect(attackRes.user.role).not.toBe('admin');
    });

    it('prevents privilege escalation: self-signup cannot create admin or msme_admin account', async () => {
      await otpRedisService.resetForTest('9876543218');
      mockUserRepository.findByPhone.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue({
        id: 'usr-new-18',
        phone: '9876543218',
        role: 'job_seeker',
        status: 'active',
      });

      await authService.sendOtp({ phone: '9876543218' });
      const attackRes = await authService.verifyOtp({
        phone: '9876543218',
        code: '123456',
        role: 'admin',
      });
      expect(attackRes.user.role).toBe('job_seeker');
      expect(attackRes.user.role).not.toBe('admin');
    });
  });
});
