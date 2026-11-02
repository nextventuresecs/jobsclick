import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import type { UserRow } from '@indian-job-portal/database';
import {
  SendOtpInput,
  VerifyOtpInput,
  AddEmailInput,
  UserRole,
  SELF_SIGNUP_ROLES,
} from '@indian-job-portal/validation';
export interface VerifyEmailInput {
  token: string;
}
import { UserRepository } from '../database/repositories/user.repository.js';
import { SmsService } from './sms.service.js';
import { OtpRedisService, AuthUserSession } from './otp-redis.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { EmailService } from '../email/email.service.js';
import { OtpGenerator } from './otp-generator.service.js';
import { maskPhone } from '../common/mask.js';
export type UserSession = AuthUserSession;

export interface SendOtpResult {
  success: boolean;
  message: string;
  expiresInSeconds: number;
  cooldownSeconds: number;
}

export interface VerifyOtpResult {
  success: boolean;
  accessToken: string;
  user: {
    id: string;
    phone: string;
    email: string | null;
    emailVerified: boolean;
    role: UserRole;
    status: 'invited' | 'active' | 'disabled';
  };
}

/**
 * Principal-Engineer Architected AuthService
 *
 * Implements Platform Hard Invariants:
 * - Invariant #1: Privacy-first opaque UUID identifiers (Zero phone numbers in IDs or public claims).
 * - Invariant #4: Strict OTP abuse protections (Turnstile, 60s cooldown, 10/day cap, 20/hr IP limits).
 * - Invariant #5: Defense-in-depth authorization, zero privilege escalation, immutable assigned roles.
 * - Multi-tier distributed session caching (L1 local Map + L2 Redis cluster) with instantaneous revocation.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // L1 ephemeral read-through cache for ultra-fast local evaluation
  private readonly localSessionCache = new Map<string, UserSession>();
  private readonly localTokenCache = new Map<string, { userId: string; email: string }>();

  private readonly otpRedisService: OtpRedisService;
  private readonly rateLimitService: RateLimitService;
  private readonly otpGenerator: OtpGenerator;

  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(SmsService) private readonly smsService: SmsService,
    @Optional() @Inject(OtpRedisService) otpRedisService?: OtpRedisService,
    @Optional() @Inject(RateLimitService) rateLimitService?: RateLimitService,
    @Optional() @Inject(WalletService) private readonly walletService?: WalletService,
    @Optional() @Inject(EmailService) private readonly emailService?: EmailService,
    @Optional() @Inject(OtpGenerator) otpGenerator: OtpGenerator = new OtpGenerator(),
  ) {
    this.otpRedisService = otpRedisService ?? new OtpRedisService();
    this.rateLimitService = rateLimitService ?? new RateLimitService(this.otpRedisService);
    this.otpGenerator = otpGenerator ?? new OtpGenerator();
  }

  /**
   * Dispatches a one-time password with bot challenge verification and multi-tier rate limiting.
   * Hard Invariant #4: Turnstile before send, per-number/device/IP limits, cool-down, daily cap.
   */
  async sendOtp(input: SendOtpInput, clientIp?: string): Promise<SendOtpResult> {
    const isTestMode = process.env['NODE_ENV'] === 'test';
    const secretKey = process.env['TURNSTILE_SECRET_KEY'];

    // 1. Verify Cloudflare Turnstile bot challenge (bypassed in test mode or if token is explicitly mocked)
    if (!isTestMode && (process.env['NODE_ENV'] === 'production' || (secretKey && secretKey !== 'dummy-turnstile-secret-key'))) {
      if (!input.turnstileToken) {
        throw new BadRequestException('Cloudflare Turnstile token is required');
      }
      const isValid = await this.smsService.verifyTurnstile(input.turnstileToken, clientIp);
      if (!isValid) {
        throw new BadRequestException('Bot challenge verification failed. Please try again.');
      }
    } else if (input.turnstileToken) {
      const isValid = await this.smsService.verifyTurnstile(input.turnstileToken, clientIp);
      if (!isValid) {
        throw new BadRequestException('Bot challenge verification failed. Please try again.');
      }
    }

    // 2. Enforce normalized phone & IP rate limits (sliding window IP, 60s cooldown, 10/day cap)
    await this.rateLimitService.checkAndIncrementOtpLimits(input.phone, clientIp);

    // 3. Generate cryptographically secure 6-digit OTP code (Zero predictable backdoors in production)
    const otpCode = this.otpGenerator.generate();

    // 4. Store salted HMAC hash in Redis cluster with 5-minute (300s) TTL
    await this.otpRedisService.storeOtp(input.phone, otpCode, 300);

    // 5. Dispatch SMS via approved MSG91 DLT template (language-aware: EN or HI)
    // Never logs raw OTP code to stdout or monitoring in production
    const smsResult = await this.smsService.sendOtp({
      phone: input.phone,
      otp: otpCode,
      language: input.language || 'en',
    });

    if (!smsResult.success) {
      await this.otpRedisService.deleteOtp(input.phone);
      throw new ServiceUnavailableException('Failed to deliver SMS. Please try again later.');
    }

    return {
      success: true,
      message: 'OTP dispatched successfully',
      expiresInSeconds: 300,
      cooldownSeconds: 60,
    };
  }

  /**
   * Atomically verifies the submitted OTP code, prevents brute-force race attacks,
   * performs privilege escalation prevention, and issues a tamper-evident HS256 JWT.
   */
  async verifyOtp(input: VerifyOtpInput, _clientIp?: string): Promise<VerifyOtpResult> {
    // 1. Atomically verify OTP with brute-force attempt lockout guard
    const verifyResult = await this.otpRedisService.verifyOtp(input.phone, input.code);

    if (verifyResult.status === 'LOCKED_OUT') {
      const waitMinutes = Math.max(1, Math.ceil(verifyResult.remainingSeconds / 60));
      this.logger.warn(`Locked out OTP verification attempt on normalized phone: ${maskPhone(input.phone)}`);
      throw new UnauthorizedException(
        `Maximum OTP verification attempts exceeded. Locked for ${waitMinutes} minutes.`,
      );
    }

    if (verifyResult.status === 'INVALID') {
      throw new UnauthorizedException(
        `Invalid OTP code. ${verifyResult.attemptsRemaining} attempts remaining.`,
      );
    }

    if (verifyResult.status === 'EXPIRED') {
      throw new UnauthorizedException('Invalid or expired OTP code');
    }

    // 2. Query persistent database by normalized 10-digit phone number
    let userRow = await this.userRepository.findByPhone(input.phone);

    if (userRow) {
      // Hard Invariant: Disabled accounts must never be reactivated via login
      if (userRow.status === 'disabled' || (userRow.status as string) === 'suspended') {
        throw new ForbiddenException('Your account has been disabled. Contact support.');
      }

      // Transition 'invited' users (from bulk institution/MSME wave import) to 'active' on first login
      if (userRow.status === 'invited') {
        userRow = (await this.userRepository.update(userRow.id, { status: 'active' })) || userRow;
      }
    } else {
      // 3. New User Registration: Generate opaque UUID to prevent phone number leakage (Invariant #1)
      const opaqueUserId = crypto.randomUUID();

      // Prevent privilege escalation: Self-signup strictly allows ONLY job_seeker or employer (Audit P0-5)
      const requestedRole = input.role as string;
      const safeRole: UserRow['role'] = (SELF_SIGNUP_ROLES as readonly string[]).includes(requestedRole)
        ? (requestedRole as 'job_seeker' | 'employer')
        : 'job_seeker';

      userRow =
        typeof this.userRepository.create === 'function'
          ? await this.userRepository.create({
              id: opaqueUserId,
              phone: input.phone,
              role: safeRole,
              status: 'active',
              source: 'direct_web',
            })
          : await this.userRepository.save({
              id: opaqueUserId,
              phone: input.phone,
              email: null,
              role: safeRole,
              status: 'active',
              source: 'direct_web',
              created_by: null,
              updated_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

      // Asynchronously grant 10 starter credits for job seekers (non-blocking)
      if (safeRole === 'job_seeker' && this.walletService) {
        this.walletService.ensureStarterCredits(userRow.id).catch((err: unknown) => {
          this.logger.warn(`Non-blocking wallet starter credits error for ${userRow?.id}: ${(err as Error).message}`);
        });
      }
    }

    // 4. Construct unified UserSession
    const session: UserSession = {
      id: userRow.id,
      phone: userRow.phone,
      email: userRow.email,
      emailVerified: false,
      role: userRow.role,
      status: userRow.status,
    };

    // 5. Store session in distributed Redis cluster and sync L1 local cache
    this.localSessionCache.set(session.id, session);
    await this.otpRedisService.setSession(session.id, session);

    // 6. Issue cryptographically signed HS256 JWT
    const accessToken = this.issueJwt(session.id, session.role, session.status);

    return {
      success: true,
      accessToken,
      user: {
        id: session.id,
        phone: session.phone,
        email: session.email,
        emailVerified: session.emailVerified,
        role: session.role as UserRole,
        status: session.status,
      },
    };
  }

  /**
   * Initiates secondary email verification using a secure CSPRNG 32-byte hex token.
   */
  async addEmail(userId: string, inputOrEmail: AddEmailInput | string): Promise<{ success: boolean; message: string }> {
    const email = typeof inputOrEmail === 'string' ? inputOrEmail : inputOrEmail.email;

    const userRow = await this.userRepository.findById(userId);
    if (!userRow) {
      throw new BadRequestException('User not found');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.userRepository.update(userId, { email });

    // Update in-memory and Redis caches
    let cached = this.localSessionCache.get(userId);
    if (!cached) {
      cached = (await this.otpRedisService.getSession(userId)) || undefined;
    }
    if (cached) {
      cached.email = email;
      cached.emailVerified = false;
      this.localSessionCache.set(userId, cached);
      await this.otpRedisService.setSession(userId, cached);
    }

    this.localTokenCache.set(verificationToken, { userId, email });
    await this.otpRedisService.saveEmailVerificationToken(userId, email, verificationToken, 86400);

    // Dispatch transactional email via Resend if email service is active
    if (this.emailService) {
      await this.emailService.sendVerificationEmail(email, verificationToken).catch((err: unknown) => {
        this.logger.warn(`Failed to dispatch verification email to ${email}: ${(err as Error).message}`);
      });
    }

    return {
      success: true,
      message: 'Verification email sent successfully',
    };
  }

  /**
   * Confirms secondary email ownership and burns the single-use token.
   */
  async verifyEmail(input: VerifyEmailInput | { token: string }): Promise<{ success: boolean; message: string }> {
    let record = this.localTokenCache.get(input.token);
    if (!record) {
      record = (await this.otpRedisService.getEmailVerificationToken(input.token)) || undefined;
    }

    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.userRepository.update(record.userId, { email: record.email });

    let cached = this.localSessionCache.get(record.userId);
    if (!cached) {
      cached = (await this.otpRedisService.getSession(record.userId)) || undefined;
    }
    if (cached) {
      cached.emailVerified = true;
      this.localSessionCache.set(record.userId, cached);
      await this.otpRedisService.setSession(record.userId, cached);
    }

    this.localTokenCache.delete(input.token);
    await this.otpRedisService.deleteEmailVerificationToken(input.token);

    return {
      success: true,
      message: 'Email address successfully verified',
    };
  }

  async verifyEmailToken(token: string): Promise<{ success: boolean; message: string }> {
    return this.verifyEmail({ token });
  }

  /**
   * Revokes all active user sessions across all devices and containers.
   * Records a revocation timestamp in Redis so JwtAuthGuard invalidates all existing JWTs.
   */
  async revokeAllUserSessions(userId: string): Promise<{ success: boolean; message: string }> {
    this.localSessionCache.delete(userId);
    await this.otpRedisService.deleteSession(userId);
    await this.otpRedisService.setRevokedTimestamp(userId, Date.now());

    this.logger.log(`[Auth] Revoked all active sessions for user ${userId}`);
    return {
      success: true,
      message: 'All active sessions have been revoked',
    };
  }

  /**
   * Backward-compatible alias for revokeAllUserSessions.
   */
  async signOutAll(userId: string): Promise<{ success: boolean; message: string }> {
    return this.revokeAllUserSessions(userId);
  }

  /**
   * Fast synchronous lookup from L1 ephemeral cache.
   */
  getUserById(id: string): UserSession | undefined {
    return this.localSessionCache.get(id);
  }

  /**
   * Multi-tier user session lookup: L1 Cache -> L2 Redis Session -> Persistent Repository.
   */
  async findUserById(id: string): Promise<UserSession | undefined> {
    const local = this.localSessionCache.get(id);
    if (local) return local;

    const fromRedis = await this.otpRedisService.getSession(id);
    if (fromRedis) {
      this.localSessionCache.set(id, fromRedis);
      return fromRedis;
    }

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

    this.localSessionCache.set(id, session);
    await this.otpRedisService.setSession(id, session);
    return session;
  }

  /**
   * Generates a tamper-evident HS256 JWT using SHA-256 HMAC and cryptographically secure entropy.
   */
  private issueJwt(userId: string, role: string, status: string): string {
    const secret = process.env['JWT_SECRET'] ?? '';

    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET is not properly configured: minimum 32 characters entropy required');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        role,
        status,
        jti: crypto.randomUUID(),
        iat: nowSec,
        exp: nowSec + 7 * 24 * 60 * 60, // 7 days TTL
        iss: 'jobsclick-api',
        aud: 'jobsclick-web',
      }),
    ).toString('base64url');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }
}
