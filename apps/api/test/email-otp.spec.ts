import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EmailOtpService } from '../src/auth/email-otp.service.js';

describe('EmailOtpService', () => {
  let service: EmailOtpService;
  let mockEmailService: { sendEmail: ReturnType<typeof vi.fn> };
  let mockRedis: Map<string, string>;

  beforeEach(() => {
    mockEmailService = {
      sendEmail: vi.fn().mockResolvedValue({ id: 'resend_msg_123', success: true }),
    };
    mockRedis = new Map<string, string>();

    const fakeRedisClient = {
      get: vi.fn(async (key: string) => mockRedis.get(key) || null),
      set: vi.fn(async (key: string, val: string) => {
        mockRedis.set(key, val);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => {
        mockRedis.delete(key);
        return 1;
      }),
      incr: vi.fn(async (key: string) => {
        const current = parseInt(mockRedis.get(key) || '0', 10);
        const next = current + 1;
        mockRedis.set(key, String(next));
        return next;
      }),
      expire: vi.fn(async () => 1),
    };

    service = new EmailOtpService(mockEmailService as any, undefined, fakeRedisClient as any);
  });

  it('generates 6-digit cryptographic OTP, sends email, and stores in Redis with 300s TTL', async () => {
    const res = await service.sendOtp('student@college.ac.in', 'en');
    expect(res.success).toBe(true);
    expect(res.ttlSeconds).toBe(300);
    expect(res.codeForTest).toMatch(/^\d{6}$/);

    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@college.ac.in',
        subject: expect.stringContaining('JobsClick'),
      })
    );

    // Verify correct code passes
    const verifyRes = await service.verifyOtp('student@college.ac.in', res.codeForTest!);
    expect(verifyRes.verified).toBe(true);
  });

  it('rejects incorrect OTP and enforces 1-time consumption', async () => {
    const res = await service.sendOtp('employer@msme.in');
    const code = res.codeForTest!;

    // Wrong code fails
    await expect(service.verifyOtp('employer@msme.in', '000000')).rejects.toThrow(BadRequestException);

    // Right code succeeds
    const verify1 = await service.verifyOtp('employer@msme.in', code);
    expect(verify1.verified).toBe(true);

    // Second attempt fails because code is consumed
    await expect(service.verifyOtp('employer@msme.in', code)).rejects.toThrow(BadRequestException);
  });

  it('enforces 60-second cooldown between consecutive sends', async () => {
    await service.sendOtp('cooldown@test.com');
    await expect(service.sendOtp('cooldown@test.com')).rejects.toThrow('Please wait 60 seconds');
  });
});
