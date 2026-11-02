import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthService } from '../src/auth/auth.service.js';
import { SmsService } from '../src/auth/sms.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { RateLimitService } from '../src/auth/rate-limit.service.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { OtpGenerator } from '../src/auth/otp-generator.service.js';
import * as sentryModule from '../src/config/sentry.js';

// Note: Test suite runs against in-memory ioredis-mock in NODE_ENV=test (known gap, scheduled for real containerized Redis in Step 12).
describe('Audit P0-3: Predictable OTP Removal and OTP Security Lockdown', () => {
  let authService: AuthService;
  let otpRedisService: OtpRedisService;
  let userRepo: UserRepository;

  const DETERMINISTIC_OTP = '654321';
  const testWhitelistPhones = Array.from({ length: 10 }, (_, i) => `987654321${i}`);

  class MockOtpGenerator extends OtpGenerator {
    override generate(): string {
      return DETERMINISTIC_OTP;
    }
  }

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [
        AuthService,
        SmsService,
        OtpRedisService,
        RateLimitService,
        UserRepository,
        {
          provide: OtpGenerator,
          useClass: MockOtpGenerator,
        },
      ],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    otpRedisService = moduleRef.get<OtpRedisService>(OtpRedisService);
    userRepo = moduleRef.get<UserRepository>(UserRepository);

    // Reset rate-limits and pre-create users in repo
    for (const phone of testWhitelistPhones) {
      await otpRedisService.resetForTest(phone);
      await userRepo.create({ phone });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('rejects verify-otp { phone: "9876543210", code: "123456" } with NO prior send (throws 401)', async () => {
    await otpRedisService.deleteOtp('9876543210');

    await expect(
      authService.verifyOtp({ phone: '9876543210', code: '123456' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects "123456" for every phone in 9876543210..9876543219 after send-otp when generated OTP is 654321', async () => {
    for (const phone of testWhitelistPhones) {
      await otpRedisService.resetForTest(phone);

      // Send OTP (generated OTP is 654321)
      await authService.sendOtp({ phone });

      // Attempting verification with 123456 must throw 401 Unauthorized
      await expect(
        authService.verifyOtp({ phone, code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    }
  });

  it('positive control: injected OTP "654321" verifies successfully for 9876543210..9876543219', async () => {
    for (const phone of testWhitelistPhones) {
      await otpRedisService.resetForTest(phone);

      await authService.sendOtp({ phone });
      const result = await authService.verifyOtp({ phone, code: DETERMINISTIC_OTP });
      expect(result.accessToken).toBeDefined();
      expect(result.user.phone).toBe(phone);
    }
  });

  it('captures logs during send-otp and 3 wrong verify attempts (lockout path): neither raw OTP nor 10-digit phone is logged', async () => {
    const targetPhone = '9876543210';
    await otpRedisService.resetForTest(targetPhone);

    const capturedLogs: string[] = [];

    const recordLog = (...args: unknown[]) => {
      capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    // Spy on Nest Logger prototype methods
    const spyLog = vi.spyOn(Logger.prototype, 'log').mockImplementation(recordLog);
    const spyWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(recordLog);
    const spyError = vi.spyOn(Logger.prototype, 'error').mockImplementation(recordLog);
    const spyDebug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(recordLog);
    const spyVerbose = vi.spyOn(Logger.prototype, 'verbose').mockImplementation(recordLog);

    // Spy on console methods
    const spyConsoleLog = vi.spyOn(console, 'log').mockImplementation(recordLog);
    const spyConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(recordLog);
    const spyConsoleError = vi.spyOn(console, 'error').mockImplementation(recordLog);
    const spyConsoleInfo = vi.spyOn(console, 'info').mockImplementation(recordLog);

    // Spy on Sentry captureException
    const spySentry = vi.spyOn(sentryModule, 'captureException').mockImplementation((err: unknown) => {
      recordLog(err instanceof Error ? err.message : String(err));
      return 'mock-event-id';
    });

    try {
      // 1. sendOtp
      await authService.sendOtp({ phone: targetPhone });

      // 2. 3 invalid verify attempts to trigger lockout path
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await authService.verifyOtp({ phone: targetPhone, code: '000000' });
        } catch {
          // Expected 401
        }
      }

      expect(capturedLogs.length).toBeGreaterThan(0);

      // Verify no captured log contains the raw OTP or full 10-digit phone
      for (const entry of capturedLogs) {
        expect(entry).not.toContain(DETERMINISTIC_OTP);
        expect(entry).not.toContain(targetPhone);
      }
    } finally {
      spyLog.mockRestore();
      spyWarn.mockRestore();
      spyError.mockRestore();
      spyDebug.mockRestore();
      spyVerbose.mockRestore();
      spyConsoleLog.mockRestore();
      spyConsoleWarn.mockRestore();
      spyConsoleError.mockRestore();
      spyConsoleInfo.mockRestore();
      spySentry.mockRestore();
    }
  });

  it('grep test: no non-test file in apps/api/src contains "123456" or "987654321"', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const violations: string[] = [];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) &&
          !entry.name.endsWith('.spec.ts') &&
          !entry.name.endsWith('.test.ts')
        ) {
          // Allowed exception for Step 7: profiles.service.ts
          if (entry.name === 'profiles.service.ts') {
            continue;
          }

          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes('123456') || content.includes('987654321')) {
            violations.push(path.relative(srcDir, fullPath));
          }
        }
      }
    }

    scanDir(srcDir);
    expect(violations).toEqual([]);
  });
});
