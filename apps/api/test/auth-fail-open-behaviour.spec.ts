import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { TurnstileVerifier, CloudflareTurnstileVerifier } from '../src/auth/turnstile.service.js';
import { SmsGateway, Msg91SmsGateway } from '../src/auth/sms.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { RateLimitService } from '../src/auth/rate-limit.service.js';
import { OtpGenerator } from '../src/auth/otp-generator.service.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';

describe('Spec 0: Fail-Open Auth Behaviour (No DI Overrides)', () => {
  let moduleRef: TestingModule;
  let authService: AuthService;
  let otpRedisService: OtpRedisService;

  const mockUserRepo = {
    findByPhone: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    touchLastLogin: vi.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env['OTP_PEPPER'] = '12345678901234567890123456789012';
    process.env['TURNSTILE_SECRET_KEY'] = 'test-turnstile-key-not-empty-at-all';
    process.env['MSG91_AUTH_KEY'] = 'test-msg91-key-not-empty-at-all';

    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserRepository,
          useValue: mockUserRepo,
        },
        {
          provide: TurnstileVerifier,
          useClass: CloudflareTurnstileVerifier,
        },
        {
          provide: SmsGateway,
          useClass: Msg91SmsGateway,
        },
        OtpRedisService,
        JwtService,
        RateLimitService,
        OtpGenerator,
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
    otpRedisService = moduleRef.get(OtpRedisService);
    await otpRedisService.waitForReady();
  });

  afterAll(async () => {
    await otpRedisService?.onModuleDestroy?.();
    await moduleRef?.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects sendOtp when Turnstile token is missing even in NODE_ENV=test', async () => {
    await expect(
      authService.sendOtp({
        phone: '9876543210',
        turnstileToken: '',
      }),
    ).rejects.toThrowError(BadRequestException);
  });

  it('rejects sendOtp when Turnstile verification fails via real CloudflareTurnstileVerifier', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('turnstile')) {
        return new Response(JSON.stringify({ success: false }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    await expect(
      authService.sendOtp({
        phone: '9876543210',
        turnstileToken: 'any-turnstile-token',
      }),
    ).rejects.toThrowError(/Bot challenge verification failed/);
  });

  it('surfaces SMS delivery failure as ServiceUnavailableException instead of faking success', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('turnstile')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (String(url).includes('msg91')) {
        return new Response(JSON.stringify({ message: 'Authentication failure' }), { status: 401 });
      }
      return new Response('{}', { status: 200 });
    });

    await expect(
      authService.sendOtp({
        phone: '9876543210',
        turnstileToken: 'valid-turnstile-token',
      }),
    ).rejects.toThrowError(ServiceUnavailableException);
  });
});
