import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { EmailService } from '../email/email.service.js';
import { OtpRedisService } from './otp-redis.service.js';

export interface SendEmailOtpResult {
  success: boolean;
  ttlSeconds: number;
  codeForTest?: string;
}

export interface VerifyEmailOtpResult {
  verified: boolean;
}

export interface EmailOtpRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, mode?: string, ttl?: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
  del(key: string): Promise<number>;
}

@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);
  private readonly redisClient?: EmailOtpRedisClient;

  constructor(
    @Inject(EmailService) private readonly emailService: EmailService,
    @Optional() @Inject(OtpRedisService) private readonly otpRedisService?: OtpRedisService,
    customRedisClient?: EmailOtpRedisClient,
  ) {
    this.redisClient = customRedisClient || (this.otpRedisService?.client as unknown as EmailOtpRedisClient);
  }

  async sendOtp(email: string, language: 'en' | 'hi' = 'en'): Promise<SendEmailOtpResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const cooldownKey = `cooldown:email-otp:${normalizedEmail}`;
    const dailyKey = `ratelimit:email-otp:${normalizedEmail}`;
    const otpKey = `otp:email:${normalizedEmail}`;

    if (this.redisClient) {
      // 1. Cooldown check (60 seconds)
      const inCooldown = await this.redisClient.get(cooldownKey);
      if (inCooldown) {
        throw new BadRequestException('Please wait 60 seconds before requesting another code');
      }

      // 2. Daily limit check (max 5 requests per 24 hours)
      const dailyCount = parseInt((await this.redisClient.get(dailyKey)) || '0', 10);
      if (dailyCount >= 5) {
        throw new HttpException(
          'Too many OTP requests. Daily limit of 5 exceeded for this email.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 3. Cryptographic 6-digit OTP generation
    const code = crypto.randomInt(100000, 1000000).toString();
    const ttlSeconds = 300; // 5 minutes

    if (this.redisClient) {
      // Store OTP with 300s TTL
      await this.redisClient.set(otpKey, code, 'EX', ttlSeconds);
      // Set cooldown with 60s TTL
      await this.redisClient.set(cooldownKey, '1', 'EX', 60);
      // Increment daily count
      const count = await this.redisClient.incr(dailyKey);
      if (count === 1) {
        await this.redisClient.expire(dailyKey, 86400);
      }
    }

    // 4. Send email via EmailService
    const isHi = language === 'hi';
    const subject = isHi
      ? `JobsClick - आपका लॉगिन सत्यापन कोड: ${code}`
      : `JobsClick - Your Sign-In Verification Code: ${code}`;

    const html = isHi
      ? `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">JobsClick सत्यापन कोड</h2>
          <p>नमस्ते,</p>
          <p>JobsClick में लॉगिन करने के लिए आपका 6-अंकीय सत्यापन कोड है:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e293b; margin: 24px 0;">
            ${code}
          </p>
          <p style="color: #64748b; font-size: 14px;">यह कोड 5 मिनट के लिए वैध है। इसे किसी के साथ साझा न करें।</p>
        </div>
      `
      : `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">JobsClick Verification Code</h2>
          <p>Hello,</p>
          <p>Your 6-digit verification code to sign in to JobsClick is:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e293b; margin: 24px 0;">
            ${code}
          </p>
          <p style="color: #64748b; font-size: 14px;">This code is valid for 5 minutes. Do not share it with anyone.</p>
        </div>
      `;

    const dispatchResult = await this.emailService.sendEmail({
      to: normalizedEmail,
      subject,
      html,
    });

    if (!dispatchResult.success) {
      this.logger.error(`Failed to dispatch email OTP to ${normalizedEmail}: ${dispatchResult.error}`);
    }

    const isTest = process.env['NODE_ENV'] === 'test';
    return {
      success: true,
      ttlSeconds,
      codeForTest: isTest ? code : undefined,
    };
  }

  async verifyOtp(email: string, code: string): Promise<VerifyEmailOtpResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const otpKey = `otp:email:${normalizedEmail}`;

    if (!this.redisClient) {
      throw new BadRequestException('Redis client is unavailable for OTP verification');
    }

    const storedCode = await this.redisClient.get(otpKey);
    if (!storedCode) {
      throw new BadRequestException('OTP has expired or does not exist');
    }

    const isMatch =
      storedCode.length === code.length &&
      crypto.timingSafeEqual(Buffer.from(storedCode), Buffer.from(code));

    if (!isMatch) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Single-use: delete immediately upon successful verification
    await this.redisClient.del(otpKey);

    return { verified: true };
  }
}
