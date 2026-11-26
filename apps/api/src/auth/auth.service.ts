import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import type { Database, UserRow } from '@indian-job-portal/database';
import {
  SendOtpInput,
  VerifyOtpInput,
  AddEmailInput,
  UserRole,
  SELF_SIGNUP_ROLES,
  SendEmailOtpInput,
  VerifyEmailOtpInput,
  OAuthExchangeInput,
  LinkPhoneInput,
  OTP_TURNSTILE_ACTIONS,
  VerifyLinkPhoneInput,
  isTestEnv,
} from '@indian-job-portal/validation';
export interface VerifyEmailInput {
  token: string;
}
import { UserRepository } from '../database/repositories/user.repository.js';
import { SmsGateway } from './sms.service.js';
import { TurnstileVerifier } from './turnstile.service.js';
import { OtpRedisService, AuthUserSession } from './otp-redis.service.js';
import { JwtService } from './jwt.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { EmailService } from '../email/email.service.js';
import { OtpGenerator } from './otp-generator.service.js';
import { EmailOtpService } from './email-otp.service.js';
import { SUPABASE_CLIENT } from '../database/supabase.provider.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { maskPhone } from '../common/mask.js';
import { RateLimitException } from '../common/rate-limit.exception.js';
export type UserSession = AuthUserSession;

export interface SendOtpResult {
  success: boolean;
  message: string;
  expiresInSeconds: number;
  cooldownSeconds: number;
  codeForTest?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  accessToken: string;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    emailVerified: boolean;
    role: UserRole;
    status: 'invited' | 'active' | 'disabled';
    requiresPhoneLink?: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(SmsGateway) private readonly smsGateway: SmsGateway,
    @Inject(TurnstileVerifier) private readonly turnstileVerifier: TurnstileVerifier,
    @Inject(OtpRedisService) private readonly otpRedisService: OtpRedisService,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(OtpGenerator) private readonly otpGenerator: OtpGenerator,
    @Inject(EmailOtpService) private readonly emailOtpService: EmailOtpService,
    @Optional() @Inject(EmailService) private readonly emailService?: EmailService,
    @Optional() @Inject(SUPABASE_CLIENT) private readonly supabaseClient?: SupabaseClient<Database>,
  ) {}

  /**
   * Dispatches a one-time password with bot challenge verification and multi-tier rate limiting.
   * Hard Invariant #4: Turnstile before send, per-number/device/IP limits, cool-down, daily cap.
   */
  async sendOtp(input: SendOtpInput, clientIp?: string): Promise<SendOtpResult> {
    // 1. Verify Cloudflare Turnstile bot challenge via injected TurnstileVerifier
    if (!input.turnstileToken || !input.turnstileToken.trim()) {
      throw new BadRequestException('Cloudflare Turnstile token is required');
    }
    const isValid = await this.turnstileVerifier.verify(input.turnstileToken, clientIp);
    if (!isValid) {
      throw new BadRequestException('Bot challenge verification failed. Please try again.');
    }

    // 2. Enforce normalized phone & IP rate limits (sliding window IP, 60s cooldown, 10/day cap)
    const limitResult = await this.rateLimitService.checkAndIncrementOtpLimits(input.phone, clientIp);
    const uniqueMember = limitResult.uniqueMember;

    // 3. Generate cryptographically secure 6-digit OTP code (Zero predictable backdoors in production)
    const otpCode = this.otpGenerator.generate();

    // 4. Store salted HMAC hash in Redis cluster with 5-minute (300s) TTL
    await this.otpRedisService.storeOtp(input.phone, otpCode, 300);

    // 5. Dispatch SMS via approved MSG91 DLT template (language-aware: EN or HI)
    let smsResult: { success: boolean; message: string; messageId?: string };
    try {
      smsResult = await this.smsGateway.sendOtp({
        phone: input.phone,
        otp: otpCode,
        language: input.language || 'en',
      });
    } catch {
      await this.otpRedisService.releaseOtpLimits(input.phone, clientIp || '127.0.0.1', uniqueMember);
      await this.otpRedisService.deleteOtp(input.phone);
      throw new ServiceUnavailableException('Failed to deliver SMS. Please try again later.');
    }

    if (!smsResult.success) {
      await this.otpRedisService.releaseOtpLimits(input.phone, clientIp || '127.0.0.1', uniqueMember);
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
  async verifyOtp(input: VerifyOtpInput, clientIp?: string): Promise<VerifyOtpResult> {
    // 0. Enforce sliding window per-IP rate limit on verification attempts (default 30/hour)
    await this.rateLimitService.checkVerifyIpRateLimit(clientIp);

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
        await this.userRepository.updateStatus(userRow.id, 'active', 'invited');
        // Re-read user to guard against disable-vs-login race (Item 7)
        const fresh = await this.userRepository.findById(userRow.id);
        if (!fresh || fresh.status !== 'active') {
          throw new ForbiddenException('Your account has been disabled. Contact support.');
        }
        userRow = fresh;
      }
    } else {
      // 3. New User Registration: Database-assigned UUID, idempotent on phone conflict
      const requestedRole = input.role as string;
      const safeRole: UserRow['role'] = (SELF_SIGNUP_ROLES as readonly string[]).includes(requestedRole)
        ? (requestedRole as 'job_seeker' | 'employer')
        : 'job_seeker';

      userRow = await this.userRepository.create({
        phone: input.phone,
        role: safeRole,
        status: 'active',
        source: 'direct_web',
      });
    }

    // Touch last login timestamp safely
    if (typeof this.userRepository.touchLastLogin === 'function') {
      const res = this.userRepository.touchLastLogin(userRow.id);
      if (res && typeof res.catch === 'function') {
        await res.catch(() => {});
      }
    }

    // 4. Construct unified UserSession with authentic emailVerified flag from DB
    const isEmailVerified = Boolean((userRow as Record<string, unknown>)['email_verified_at']);
    const session: UserSession = {
      id: userRow.id,
      phone: userRow.phone,
      email: userRow.email,
      emailVerified: isEmailVerified,
      role: userRow.role,
      status: userRow.status,
    };

    // 5. Store session in distributed Redis cluster and sync L1 local cache
    await this.otpRedisService.setSession(session.id, session);
    const tokenVersion = userRow.token_version ?? 0;
    await this.otpRedisService.setAuthState(session.id, {
      role: session.role,
      status: session.status,
      tokenVersion,
    });

    // 6. Issue cryptographically signed HS256 JWT via JwtService with required claims
    const accessToken = await this.jwtService.signAccessToken(session.id, tokenVersion, {
      role: session.role,
      status: session.status,
      requiresPhoneLink: !session.phone,
    });

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
        requiresPhoneLink: !session.phone,
      },
    };
  }

  /**
   * Initiates secondary email verification using a secure CSPRNG 32-byte hex token.
   * Limits: 3/hour per user, 3/day per target email.
   * Deletes any prior active token for this user so only one active token exists.
   */
  async addEmail(userId: string, inputOrEmail: AddEmailInput | string): Promise<{ success: boolean; message: string }> {
    const rawEmail = typeof inputOrEmail === 'string' ? inputOrEmail : inputOrEmail.email;
    const email = rawEmail.trim().toLowerCase();

    // Check rate limit: max 3/hour per user, max 3/day per target email
    const limitCheck = await this.otpRedisService.checkAddEmailRateLimit(userId, email);
    if (!limitCheck.allowed) {
      throw new RateLimitException(
        'Too many verification email requests. Please try again later.',
        limitCheck.retryAfter || 3600,
      );
    }

    const userRow = await this.userRepository.findById(userId);
    if (!userRow) {
      throw new NotFoundException('User not found');
    }

    // Check cross-user collision across confirmed email and pending email
    const existingConfirmed = await this.userRepository.findByEmail(email);
    if (existingConfirmed && existingConfirmed.id !== userId) {
      throw new ConflictException('Email address is already in use or pending verification');
    }
    const existingPending = await this.userRepository.findByPendingEmail(email);
    if (existingPending && existingPending.id !== userId) {
      throw new ConflictException('Email address is already in use or pending verification');
    }

    if (!this.emailService) {
      throw new ServiceUnavailableException({ code: 'EMAIL_VERIFICATION_DELIVERY_FAILED' });
    }

    // Update DB with pending email (email remains untouched)
    await this.userRepository.setPendingEmail(userId, email);

    // Delete any previous active verification token for this user
    const previousTokenHash = await this.otpRedisService.getUserActiveEmailToken(userId);
    if (previousTokenHash) {
      await this.otpRedisService.deleteEmailVerificationToken(previousTokenHash);
    }

    // Generate 32-byte CSPRNG token and SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Store in Redis (24-hour TTL)
    await this.otpRedisService.saveEmailVerificationToken(userId, email, tokenHash, 86400);
    await this.otpRedisService.setUserActiveEmailToken(userId, tokenHash, 86400);

    const delivery = await this.emailService.sendVerificationEmail(email, rawToken).catch(() => null);
    if (!delivery?.success) {
      await this.otpRedisService.deleteEmailVerificationToken(tokenHash);
      throw new ServiceUnavailableException({ code: 'EMAIL_VERIFICATION_DELIVERY_FAILED' });
    }

    return {
      success: true,
      message: 'Verification email sent successfully',
    };
  }

  /**
   * Confirms secondary email ownership and burns the single-use token.
   * Requires pending_email === record.email.
   * Deletes token from Redis only AFTER successful database update.
   */
  async verifyEmail(input: VerifyEmailInput | { token: string }): Promise<{ success: boolean; message: string }> {
    if (!input.token || !input.token.trim()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const tokenHash = crypto.createHash('sha256').update(input.token.trim()).digest('hex');
    const record = await this.otpRedisService.getEmailVerificationToken(tokenHash);

    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // Verify requires pending_email === record.email
    const user = await this.userRepository.findById(record.userId);
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    const currentPending = (user as Record<string, unknown>)['pending_email']?.toString().toLowerCase();
    if (currentPending !== record.email.toLowerCase()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // Conditional update: WHERE id AND pending_email
    const updated = await this.userRepository.confirmEmail(record.userId, record.email);
    if (!updated) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // DB update succeeded: Now delete token from Redis so token replay fails (Item 5)
    await this.otpRedisService.deleteEmailVerificationToken(tokenHash);
    await this.otpRedisService.deleteUserActiveEmailToken(record.userId);

    const cached = await this.otpRedisService.getSession(record.userId);
    if (cached) {
      cached.email = record.email;
      cached.emailVerified = true;
      await this.otpRedisService.setSession(record.userId, cached);
    }

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
    // 1. Atomically increment token_version in persistent database
    const updatedUser = await this.userRepository.incrementTokenVersion(userId);

    // 2. Refresh Redis auth state and delete session in that order
    await this.otpRedisService.deleteSession(userId);
    await this.otpRedisService.setAuthState(userId, {
      role: updatedUser.role,
      status: updatedUser.status,
      tokenVersion: updatedUser.token_version,
    });
    await this.otpRedisService.setRevokedTimestamp(userId, Date.now());

    this.logger.log(`[Auth] Revoked all active sessions for user ${userId} (new token_version: ${updatedUser.token_version})`);
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
  getUserById(_id: string): UserSession | undefined {
    return undefined;
  }

  /**
   * Multi-tier user session lookup: Redis Session -> Persistent Repository.
   */
  async findUserById(id: string): Promise<UserSession | undefined> {
    const fromRedis = await this.otpRedisService.getSession(id);
    if (fromRedis) {
      return fromRedis;
    }

    const row = await this.userRepository.findById(id);
    if (!row) return undefined;

    const isEmailVerified = Boolean((row as Record<string, unknown>)['email_verified_at']);
    const session: UserSession = {
      id: row.id,
      phone: row.phone,
      email: row.email,
      emailVerified: isEmailVerified,
      role: row.role,
      status: row.status,
    };

    await this.otpRedisService.setSession(id, session);
    return session;
  }

  /**
   * Issues JWT via JwtService with server state tokenVersion.
   */
  async issueJwt(userId: string, role: string, status: string, tokenVersion = 0): Promise<string> {
    return this.jwtService.signAccessToken(userId, tokenVersion, { role, status });
  }

  /**
   * Dispatches a 6-digit OTP code to the provided email address.
   */
  async sendEmailOtp(
    input: SendEmailOtpInput,
    clientIp?: string,
  ): Promise<{ success: boolean; message: string; expiresInSeconds: number; cooldownSeconds: number; codeForTest?: string }> {
    await this.requireOtpChallenge(input.turnstileToken, OTP_TURNSTILE_ACTIONS.emailOtp, clientIp);

    const language = (input as { language?: 'en' | 'hi' }).language || 'en';
    const result = await this.emailOtpService.sendOtp(input.email, language);

    return {
      success: true,
      message: 'OTP sent to email address successfully',
      expiresInSeconds: result.ttlSeconds,
      cooldownSeconds: 60,
      codeForTest: result.codeForTest,
    };
  }

  /**
   * Verifies the email OTP, activates/creates user, issues JWT session.
   */
  async verifyEmailOtp(input: VerifyEmailOtpInput, clientIp?: string): Promise<VerifyOtpResult> {
    await this.rateLimitService.checkVerifyIpRateLimit(clientIp);

    await this.emailOtpService.verifyOtp(input.email, input.code);

    const normalizedEmail = input.email.trim().toLowerCase();
    let userRow = await this.userRepository.findByEmail(normalizedEmail);

    if (userRow) {
      this.assertVerifiedEmailAccount(userRow, normalizedEmail);
      if (userRow.status === 'disabled' || (userRow.status as string) === 'suspended') {
        throw new ForbiddenException('Your account has been disabled. Contact support.');
      }

      if (userRow.status === 'invited') {
        await this.userRepository.updateStatus(userRow.id, 'active', 'invited');
        const fresh = await this.userRepository.findById(userRow.id);
        if (!fresh || fresh.status !== 'active') {
          throw new ForbiddenException('Your account has been disabled. Contact support.');
        }
        userRow = fresh;
      }
    } else {
      const requestedRole = input.role as string;
      const safeRole: UserRow['role'] = (SELF_SIGNUP_ROLES as readonly string[]).includes(requestedRole)
        ? (requestedRole as 'job_seeker' | 'employer')
        : 'job_seeker';

      userRow = await this.userRepository.create({
        email: normalizedEmail,
        role: safeRole,
        status: 'active',
        source: 'direct_web_email',
      });
    }

    this.assertVerifiedEmailAccount(userRow, normalizedEmail);
    if (typeof this.userRepository.touchLastLogin === 'function') {
      const res = this.userRepository.touchLastLogin(userRow.id);
      if (res && typeof res.catch === 'function') {
        await res.catch(() => {});
      }
    }

    const isEmailVerified = Boolean((userRow as Record<string, unknown>)['email_verified_at']) || true;
    const session: UserSession = {
      id: userRow.id,
      phone: userRow.phone,
      email: userRow.email,
      emailVerified: isEmailVerified,
      role: userRow.role,
      status: userRow.status,
    };

    await this.otpRedisService.setSession(session.id, session);
    const tokenVersion = userRow.token_version ?? 0;
    await this.otpRedisService.setAuthState(session.id, {
      role: session.role,
      status: session.status,
      tokenVersion,
    });

    const accessToken = await this.jwtService.signAccessToken(session.id, tokenVersion, {
      role: session.role,
      status: session.status,
      requiresPhoneLink: !session.phone,
    });

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
        requiresPhoneLink: !session.phone,
      },
    };
  }

  private assertVerifiedEmailAccount(user: UserRow, verifiedEmail: string): void {
    if (user.email?.trim().toLowerCase() !== verifiedEmail) {
      throw new UnauthorizedException('Verified email does not match the account');
    }
  }

  /**
   * Exchanges an OAuth provider token for an authenticated user session.
   */
  async oauthExchange(input: OAuthExchangeInput, clientIp?: string): Promise<VerifyOtpResult> {
    await this.rateLimitService.checkVerifyIpRateLimit(clientIp);

    let email: string | undefined;
    try {
      const result = await this.supabaseClient?.auth.getUser(input.providerToken);
      if (result && !result.error && result.data.user?.email_confirmed_at) {
        email = result.data.user.email?.trim().toLowerCase();
      }
    } catch {
      this.logger.warn('Failed to verify OAuth token with Supabase Auth');
    }

    if (!email) {
      throw new UnauthorizedException('Invalid or unverified OAuth provider token');
    }

    let userRow = await this.userRepository.findByEmail(email);

    if (userRow) {
      this.assertVerifiedEmailAccount(userRow, email);
      if (userRow.status === 'disabled' || (userRow.status as string) === 'suspended') {
        throw new ForbiddenException('Your account has been disabled. Contact support.');
      }

      if (userRow.status === 'invited') {
        await this.userRepository.updateStatus(userRow.id, 'active', 'invited');
        const fresh = await this.userRepository.findById(userRow.id);
        if (!fresh || fresh.status !== 'active') {
          throw new ForbiddenException('Your account has been disabled. Contact support.');
        }
        userRow = fresh;
      }
    } else {
      const requestedRole = input.role as string;
      const safeRole: UserRow['role'] = (SELF_SIGNUP_ROLES as readonly string[]).includes(requestedRole)
        ? (requestedRole as 'job_seeker' | 'employer')
        : 'job_seeker';

      userRow = await this.userRepository.create({
        email,
        role: safeRole,
        status: 'active',
        source: 'oauth_google',
      });
    }

    this.assertVerifiedEmailAccount(userRow, email);
    if (typeof this.userRepository.touchLastLogin === 'function') {
      const res = this.userRepository.touchLastLogin(userRow.id);
      if (res && typeof res.catch === 'function') {
        await res.catch(() => {});
      }
    }

    const session: UserSession = {
      id: userRow.id,
      phone: userRow.phone,
      email: userRow.email,
      emailVerified: true,
      role: userRow.role,
      status: userRow.status,
    };

    await this.otpRedisService.setSession(session.id, session);
    const tokenVersion = userRow.token_version ?? 0;
    await this.otpRedisService.setAuthState(session.id, {
      role: session.role,
      status: session.status,
      tokenVersion,
    });

    const accessToken = await this.jwtService.signAccessToken(session.id, tokenVersion, {
      role: session.role,
      status: session.status,
      requiresPhoneLink: !session.phone,
    });

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
        requiresPhoneLink: !session.phone,
      },
    };
  }

  /**
   * Dispatches OTP to link a mobile phone to an existing user account.
   */
  async linkPhoneSendOtp(
    userId: string,
    input: LinkPhoneInput,
    clientIp?: string,
  ): Promise<{ success: boolean; message: string; expiresInSeconds: number; cooldownSeconds: number; codeForTest?: string }> {
    await this.requireOtpChallenge(input.turnstileToken, OTP_TURNSTILE_ACTIONS.linkPhone, clientIp);

    const existing = await this.userRepository.findByPhone(input.phone);
    if (existing && existing.id !== userId) {
      throw new ConflictException('This mobile number is already linked to another account.');
    }

    const limitResult = await this.rateLimitService.checkAndIncrementOtpLimits(input.phone, clientIp);
    const uniqueMember = limitResult.uniqueMember;

    const otpCode = this.otpGenerator.generate();
    await this.otpRedisService.storeOtp(`link:${input.phone}`, otpCode, 300);

    let smsResult: { success: boolean; message: string; messageId?: string };
    try {
      smsResult = await this.smsGateway.sendOtp({
        phone: input.phone,
        otp: otpCode,
        language: 'en',
      });
    } catch {
      await this.otpRedisService.releaseOtpLimits(input.phone, clientIp || '127.0.0.1', uniqueMember);
      await this.otpRedisService.deleteOtp(`link:${input.phone}`);
      throw new ServiceUnavailableException('Failed to deliver SMS. Please try again later.');
    }

    if (!smsResult.success) {
      await this.otpRedisService.releaseOtpLimits(input.phone, clientIp || '127.0.0.1', uniqueMember);
      await this.otpRedisService.deleteOtp(`link:${input.phone}`);
      throw new ServiceUnavailableException('Failed to deliver SMS. Please try again later.');
    }

    const isTest = isTestEnv();
    return {
      success: true,
      message: 'OTP sent to mobile number',
      expiresInSeconds: 300,
      cooldownSeconds: 60,
      codeForTest: isTest ? otpCode : undefined,
    };
  }

  private async requireOtpChallenge(token: string, action: string, clientIp?: string): Promise<void> {
    if (!token?.trim() || !(await this.turnstileVerifier.verify(token, clientIp, action))) {
      throw new BadRequestException({ code: 'OTP_CHALLENGE_FAILED' });
    }
  }

  /**
   * Verifies the phone OTP and links the phone number to the user account.
   */
  async linkPhoneVerifyOtp(
    userId: string,
    input: VerifyLinkPhoneInput,
    clientIp?: string,
  ): Promise<{ success: boolean; message: string; user: { id: string; phone: string; requiresPhoneLink: boolean } }> {
    await this.rateLimitService.checkVerifyIpRateLimit(clientIp);

    const verifyResult = await this.otpRedisService.verifyOtp(`link:${input.phone}`, input.code);
    if (verifyResult.status === 'LOCKED_OUT') {
      const waitMinutes = Math.max(1, Math.ceil(verifyResult.remainingSeconds / 60));
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

    const existing = await this.userRepository.findByPhone(input.phone);
    if (existing && existing.id !== userId) {
      throw new ConflictException('This mobile number is already linked to another account.');
    }

    const updatedUser = await this.userRepository.updatePhone(userId, input.phone);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    const currentSession = await this.otpRedisService.getSession(userId);
    if (currentSession) {
      currentSession.phone = input.phone;
      await this.otpRedisService.setSession(userId, currentSession);
    }

    return {
      success: true,
      message: 'Mobile number linked successfully',
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone!,
        requiresPhoneLink: false,
      },
    };
  }
}
