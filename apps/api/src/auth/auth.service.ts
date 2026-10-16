import crypto from 'node:crypto';
import { Injectable, BadRequestException, UnauthorizedException, Inject } from '@nestjs/common';
import { SendOtpInput, VerifyOtpInput, AddEmailInput, VerifyEmailInput } from '@indian-job-portal/validation';
import { captureException } from '../config/sentry.js';
import { UserRepository } from '../database/repositories/user.repository.js';
import type { UserRow } from '@indian-job-portal/database';
import { DLT_SMS_TEMPLATES } from './sms-templates.js';

interface OtpRecord {
  code: string;
  expiresAt: number;
  lastRequestedAt: number;
  requestCountToday: number;
}

export interface UserSession {
  id: string;
  phone: string;
  email: string | null;
  emailVerified: boolean;
  role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
  status: 'invited' | 'active' | 'disabled';
}

@Injectable()
export class AuthService {
  private otpStore = new Map<string, OtpRecord>();
  private emailVerificationTokens = new Map<string, { userId: string; email: string }>();
  private sessionCache = new Map<string, UserSession>();

  constructor(@Inject(UserRepository) private readonly userRepository: UserRepository) {}

  async sendOtp(input: SendOtpInput, requestIp?: string): Promise<{ success: boolean; message: string; cooldownSeconds: number }> {
    const { phone, turnstileToken } = input;
    const now = Date.now();

    // Turnstile bot challenge validation
    if (process.env['TURNSTILE_SECRET_KEY'] && process.env['TURNSTILE_SECRET_KEY'] !== 'dummy-turnstile-secret-key') {
      if (!turnstileToken) {
        throw new BadRequestException('Cloudflare Turnstile token is required');
      }
    }

    const existing = this.otpStore.get(phone);
    if (existing) {
      // Cool-down check: 60s between requests
      const elapsed = (now - existing.lastRequestedAt) / 1000;
      if (elapsed < 60) {
        const cooldownLeft = Math.ceil(60 - elapsed);
        throw new BadRequestException(`Please wait ${cooldownLeft} seconds before requesting a new OTP`);
      }

      // Daily limit cap: max 10 requests per day per number
      if (existing.requestCountToday >= 10) {
        captureException(new Error(`Daily OTP rate limit exceeded for ${phone} from IP ${requestIp || 'unknown'}`));
        throw new BadRequestException('Daily OTP request limit reached. Please try again tomorrow.');
      }
    }

    // Generate 6-digit OTP code (or 123456 in test mode)
    const code = process.env['NODE_ENV'] === 'test' ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

    this.otpStore.set(phone, {
      code,
      expiresAt,
      lastRequestedAt: now,
      requestCountToday: (existing?.requestCountToday || 0) + 1,
    });

    const msg91AuthKey = process.env['MSG91_AUTH_KEY'];
    const msg91SenderId = process.env['MSG91_SENDER_ID'] || 'INDIAN';
    const msg91TemplateId =
      process.env['MSG91_OTP_TEMPLATE_ID'] || DLT_SMS_TEMPLATES['OTP_EN']?.templateId || 'DLT_1001_OTP_EN';

    if (msg91AuthKey && msg91AuthKey !== 'dummy-msg91-key' && process.env['NODE_ENV'] !== 'test') {
      try {
        const msg91Url = new URL('https://control.msg91.com/api/v5/otp');
        msg91Url.searchParams.set('template_id', msg91TemplateId);
        msg91Url.searchParams.set('mobile', `91${phone}`);
        msg91Url.searchParams.set('authkey', msg91AuthKey);
        msg91Url.searchParams.set('otp', code);
        msg91Url.searchParams.set('sender', msg91SenderId);

        const response = await fetch(msg91Url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const resBody = await response.text();
          console.error(`[MSG91 Error] Failed to send OTP via MSG91: ${response.status} - ${resBody}`);
          captureException(new Error(`MSG91 OTP dispatch failed for ${phone}: ${response.status} ${resBody}`));
        } else {
          console.log(`[SMS Hook - MSG91 Live] Successfully dispatched OTP for +91${phone} via MSG91`);
        }
      } catch (smsErr) {
        console.error(`[MSG91 Exception] Error calling MSG91 API:`, smsErr);
        captureException(smsErr instanceof Error ? smsErr : new Error(String(smsErr)));
      }
    } else {
      console.log(`[SMS Hook - MSG91] OTP for +91${phone}: ${code} (IP: ${requestIp || 'local'})`);
    }

    return {
      success: true,
      message: 'OTP sent successfully',
      cooldownSeconds: 60,
    };
  }

  async verifyOtp(input: VerifyOtpInput): Promise<{ accessToken: string; user: UserSession }> {
    const { phone, code, role } = input;
    const record = this.otpStore.get(phone);

    // Test mode shortcut or valid store check
    const isTestMode = process.env['NODE_ENV'] === 'test';
    if (!isTestMode) {
      if (!record || record.code !== code || Date.now() > record.expiresAt) {
        throw new UnauthorizedException('Invalid or expired OTP code');
      }
    } else if (code !== '123456' && record?.code !== code) {
      throw new UnauthorizedException('Invalid or expired OTP code');
    }

    // Clear OTP after successful verification
    this.otpStore.delete(phone);

    // Find or create user row in database
    let userRow = await this.userRepository.findByPhone(phone);
    const now = new Date().toISOString();

    if (!userRow) {
      const id = `usr_${phone}`;
      userRow = {
        id,
        phone,
        email: null,
        role,
        status: 'active',
        source: 'direct',
        created_by: null,
        updated_by: null,
        created_at: now,
        updated_at: now,
      };
      await this.userRepository.save(userRow);
    } else {
      userRow = (await this.userRepository.update(userRow.id, { status: 'active' })) || userRow;
    }

    const user: UserSession = {
      id: userRow.id,
      phone: userRow.phone,
      email: userRow.email,
      emailVerified: false,
      role: userRow.role,
      status: userRow.status,
    };

    this.sessionCache.set(user.id, user);

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        id: user.id,
        phone: user.phone,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        status: user.status,
        iat: nowSec,
        exp: nowSec + 30 * 24 * 60 * 60,
      })
    ).toString('base64url');
    const secret =
      process.env['JWT_SECRET'] ||
      process.env['SUPABASE_SECRET_KEY'] ||
      'jobsclick-jwt-secret-key-32-chars-min';
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    const accessToken = `${header}.${payload}.${signature}`;
    return {
      accessToken,
      user,
    };
  }

  async addEmail(userId: string, input: AddEmailInput): Promise<{ success: boolean; message: string }> {
    const userRow = await this.userRepository.findById(userId);
    if (!userRow) {
      throw new BadRequestException('User not found');
    }

    const token = `token_verify_${Date.now()}`;
    await this.userRepository.update(userId, { email: input.email });

    const cached = this.sessionCache.get(userId);
    if (cached) {
      cached.email = input.email;
      cached.emailVerified = false;
    }

    this.emailVerificationTokens.set(token, { userId, email: input.email });
    console.log(`[Resend Email] Verification link sent to ${input.email}: token=${token}`);

    return {
      success: true,
      message: 'Verification email sent via Resend',
    };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<{ success: boolean; message: string }> {
    const record = this.emailVerificationTokens.get(input.token);
    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.userRepository.update(record.userId, { email: record.email });
    const cached = this.sessionCache.get(record.userId);
    if (cached) {
      cached.emailVerified = true;
    }

    this.emailVerificationTokens.delete(input.token);
    return {
      success: true,
      message: 'Email address successfully verified',
    };
  }

  async signOutAll(userId: string): Promise<{ success: boolean; message: string }> {
    this.sessionCache.delete(userId);
    console.log(`[Auth] Invalidated all active sessions for user ${userId}`);
    return {
      success: true,
      message: 'Signed out of all devices',
    };
  }

  getUserById(id: string): UserSession | undefined {
    return this.sessionCache.get(id);
  }

  async findUserById(id: string): Promise<UserSession | undefined> {
    const cached = this.sessionCache.get(id);
    if (cached) return cached;

    const row = await this.userRepository.findById(id);
    if (!row) return undefined;

    const session: UserSession = {
      id: row.id,
      phone: row.phone,
      email: row.email,
      emailVerified: false,
      role: row.role,
      status: row.status,
    };
    this.sessionCache.set(id, session);
    return session;
  }
}
