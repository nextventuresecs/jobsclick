import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { STARTER_CREDIT_AMOUNT } from '@indian-job-portal/database';
import { AppModule } from '../src/app.module.js';
import { USER_REPOSITORY, IUserRepository } from '../src/database/repositories/user.repository.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { EmailService } from '../src/email/email.service.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';

const SUPABASE_LOCAL_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

function createPostgrestJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

describe('User Mutations, Concurrency & Security Hardening (Real PostgreSQL & Redis)', () => {
  let app: NestFastifyApplication;
  let serviceClient: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;
  let userRepo: IUserRepository;
  let otpRedis: OtpRedisService;
  let emailService: EmailService;

  let phoneCounter = 1000;
  const generatePhone = (): string => {
    phoneCounter++;
    return `97${Date.now().toString().slice(-6)}${String(phoneCounter).slice(-2)}`;
  };

  beforeAll(async () => {
    // 1. Verify real Supabase connection (fail, never skip)
    serviceClient = createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    anonClient = createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error: pingError } = await serviceClient.from('users').select('id').limit(1);
    if (pingError) {
      throw new Error(`Real Supabase is unreachable at ${SUPABASE_LOCAL_URL}: ${pingError.message}`);
    }

    // 2. Initialize Nest application
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userRepo = app.get<IUserRepository>(USER_REPOSITORY);
    otpRedis = app.get<OtpRedisService>(OtpRedisService);
    emailService = app.get<EmailService>(EmailService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. grant_starter_credits RPC & Permissions', () => {
    it('grants 10 credits idempotently when called by service_role, and rejects anon/authenticated calls with permission denied', async () => {
      const phone = generatePhone();
      const user = await userRepo.create({ phone, role: 'job_seeker' });

      // Call directly via service_role client
      const { data: grantResult, error: grantError } = await serviceClient.rpc(
        'grant_starter_credits',
        { p_user_id: user.id },
      );

      expect(grantError).toBeNull();
      // Should return true or false (trigger already granted credits on creation, so manual call returns false)
      expect(typeof grantResult).toBe('boolean');

      // Verify starter credits in credit_ledgers
      const { data: ledgers } = await serviceClient
        .from('credit_ledgers')
        .select('*')
        .eq('user_id', user.id);

      expect(ledgers?.length).toBe(1);
      expect(ledgers?.[0].amount).toBe(STARTER_CREDIT_AMOUNT);
      expect(ledgers?.[0].reason).toBe('starter');

      // Attempt to call RPC as anon role -> must be denied (code 42501)
      const { error: anonRpcError } = await anonClient.rpc('grant_starter_credits', {
        p_user_id: user.id,
      });
      expect(anonRpcError).not.toBeNull();
      expect(anonRpcError?.code).toBe('42501');

      // Attempt to call RPC as authenticated role -> must be denied (code 42501)
      const authJwt = createPostgrestJwt(
        {
          sub: user.id,
          role: 'authenticated',
          aud: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        SUPABASE_JWT_SECRET,
      );
      const authClient = createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${authJwt}` } },
      });

      const { error: authRpcError } = await authClient.rpc('grant_starter_credits', {
        p_user_id: user.id,
      });
      expect(authRpcError).not.toBeNull();
      expect(authRpcError?.code).toBe('42501');
    });

    it('aborts user creation when an insert trigger fails (atomic rollback)', async () => {
      const { Client } = await import('pg');
      const pgClient = new Client({
        connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      });
      await pgClient.connect();

      try {
        await pgClient.query(`
          CREATE OR REPLACE FUNCTION trigger_simulated_abort()
          RETURNS TRIGGER AS $$
          BEGIN
            RAISE EXCEPTION 'Simulated trigger abort';
          END;
          $$ LANGUAGE plpgsql;

          CREATE TRIGGER trg_test_abort
          BEFORE INSERT ON users
          FOR EACH ROW
          EXECUTE FUNCTION trigger_simulated_abort();
        `);

        const phone = generatePhone();
        await expect(userRepo.create({ phone, role: 'job_seeker' })).rejects.toThrow();

        // Verify that user row was NOT created
        const { data: userRows } = await serviceClient.from('users').select('*').eq('phone', phone);
        expect(userRows?.length).toBe(0);
      } finally {
        await pgClient.query(`
          DROP TRIGGER IF EXISTS trg_test_abort ON users;
          DROP FUNCTION IF EXISTS trigger_simulated_abort();
        `);
        await pgClient.end();
      }
    });
  });

  describe('2. Column Privileges on users Table', () => {
    it('revokes UPDATE on sensitive columns (email, pending_email, email_verified_at, status, role) from authenticated users', async () => {
      const phone = generatePhone();
      const user = await userRepo.create({ phone, role: 'job_seeker' });

      const authJwt = createPostgrestJwt(
        {
          sub: user.id,
          role: 'authenticated',
          aud: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        SUPABASE_JWT_SECRET,
      );
      const authClient = createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${authJwt}` } },
      });

      // 1. Attempt to update status -> denied
      const { error: statusError } = await authClient
        .from('users')
        .update({ status: 'disabled' })
        .eq('id', user.id);
      expect(statusError).not.toBeNull();
      expect(statusError?.code).toBe('42501');

      // 2. Attempt to update role -> denied
      const { error: roleError } = await authClient
        .from('users')
        .update({ role: 'admin' })
        .eq('id', user.id);
      expect(roleError).not.toBeNull();
      expect(roleError?.code).toBe('42501');

      // 3. Attempt to update email -> denied
      const { error: emailError } = await authClient
        .from('users')
        .update({ email: 'hacker@example.com' })
        .eq('id', user.id);
      expect(emailError).not.toBeNull();
      expect(emailError?.code).toBe('42501');

      // 4. Attempt to update pending_email -> denied
      const { error: pendingError } = await authClient
        .from('users')
        .update({ pending_email: 'hacker@example.com' })
        .eq('id', user.id);
      expect(pendingError).not.toBeNull();
      expect(pendingError?.code).toBe('42501');
    });
  });

  describe('3. Concurrency & Race Condition Lockdown', () => {
    it('repo-level: 20 parallel create() calls for same phone yield exactly 1 row and return identical user id', async () => {
      const phone = generatePhone();

      const promises = Array.from({ length: 20 }, () =>
        userRepo.create({ phone, role: 'job_seeker' }),
      );

      const results = await Promise.all(promises);

      // All 20 returned successfully
      expect(results.length).toBe(20);
      const firstId = results[0].id;
      for (const res of results) {
        expect(res.id).toBe(firstId);
        expect(res.phone).toBe(phone);
      }

      // Check DB directly
      const { data: dbRows } = await serviceClient.from('users').select('*').eq('phone', phone);
      expect(dbRows?.length).toBe(1);
      expect(dbRows?.[0].id).toBe(firstId);
    });

    it('api-level: 20 parallel verifyOtp submissions with valid OTP result in exactly 1 success and 19 rejections (atomic OTP burn)', async () => {
      const phone = generatePhone();
      const code = '765432';

      // Store OTP atomically in Redis
      await otpRedis.storeOtp(phone, code);

      // Fire 20 parallel verify requests from distinct client IPs
      const promises = Array.from({ length: 20 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/auth/verify-otp',
          remoteAddress: `10.0.1.${i + 1}`,
          payload: {
            phone,
            otp: code,
          },
        }),
      );

      const responses = await Promise.all(promises);
      const successes = responses.filter((r) => r.statusCode === 200);
      const rejections = responses.filter((r) => r.statusCode === 401);

      expect(successes.length).toBe(1);
      expect(rejections.length).toBe(19);

      // Verify that user exists and has exactly 1 starter credit ledger entry
      const body = JSON.parse(successes[0].payload);
      expect(body.user.phone).toBe(phone);

      const { data: ledgers } = await serviceClient
        .from('credit_ledgers')
        .select('*')
        .eq('user_id', body.user.id);

      expect(ledgers?.length).toBe(1);
      expect(ledgers?.[0].amount).toBe(STARTER_CREDIT_AMOUNT);
    });
  });

  describe('4. Invited User Promotion & Disable-vs-Login Guard', () => {
    it('promotes invited user to active upon login and grants starter credits only once', async () => {
      const phone = generatePhone();
      const invitedUser = await userRepo.create({
        phone,
        role: 'job_seeker',
        status: 'invited',
      });
      expect(invitedUser.status).toBe('invited');

      // Verify OTP
      const code = '123456';
      await otpRedis.storeOtp(phone, code);

      const res1 = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        remoteAddress: '10.0.2.1',
        payload: { phone, otp: code },
      });

      expect(res1.statusCode).toBe(200);
      const data1 = JSON.parse(res1.payload);
      expect(data1.user.status).toBe('active');

      // Second verify OTP should not duplicate starter credits
      const code2 = '654321';
      await otpRedis.storeOtp(phone, code2);

      const res2 = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        remoteAddress: '10.0.2.2',
        payload: { phone, otp: code2 },
      });
      expect(res2.statusCode).toBe(200);

      const { data: ledgers } = await serviceClient
        .from('credit_ledgers')
        .select('*')
        .eq('user_id', invitedUser.id);

      expect(ledgers?.length).toBe(1);
    });

    it('rejects login with 403 if user is disabled concurrently', async () => {
      const phone = generatePhone();
      await userRepo.create({
        phone,
        role: 'job_seeker',
        status: 'disabled',
      });

      const code = '112233';
      await otpRedis.storeOtp(phone, code);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        remoteAddress: '10.0.3.1',
        payload: { phone, otp: code },
      });

      expect(res.statusCode).toBe(403);
      const data = JSON.parse(res.payload);
      expect(data.message.toLowerCase()).toContain('account has been disabled');
    });
  });

  describe('5. Email Verification Flow & Security Controls', () => {
    it('handles addEmail: normal flow, lowercase+trim, Resend stub, and no token in response', async () => {
      const phone = generatePhone();
      const user = await userRepo.create({ phone, role: 'job_seeker' });
      const targetEmail = `candidate_${Date.now()}@example.com`;

      const emailSpy = vi.spyOn(emailService, 'sendEmail');

      const res = await app.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { 'x-user-id': user.id },
        payload: {
          email: `  ${targetEmail.toUpperCase()}  `,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('Verification email sent');
      expect(body.token).toBeUndefined(); // Token MUST NEVER be returned in response

      // Check DB pending_email is trimmed and lowercased
      const updatedUser = await userRepo.findById(user.id);
      expect(updatedUser?.pending_email).toBe(targetEmail.toLowerCase());

      // Check emailService was called
      expect(emailSpy).toHaveBeenCalled();
      const callArg = emailSpy.mock.calls[emailSpy.mock.calls.length - 1][0];
      expect(callArg.to).toBe(targetEmail.toLowerCase());
      expect(callArg.html).toContain('/auth/verify-email?token=');
      emailSpy.mockRestore();
    });

    it('rejects addEmail when email is already taken by another user (cross-user collision => 409)', async () => {
      const phone1 = generatePhone();
      const phone2 = generatePhone();
      const user1 = await userRepo.create({ phone: phone1, role: 'job_seeker' });
      const user2 = await userRepo.create({ phone: phone2, role: 'job_seeker' });
      const sharedEmail = `shared_${Date.now()}@example.com`;

      // user1 sets pending email
      await userRepo.setPendingEmail(user1.id, sharedEmail);

      // user2 tries to add the same email -> 409 Conflict
      const res = await app.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { 'x-user-id': user2.id },
        payload: {
          email: sharedEmail,
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('enforces addEmail rate limits (3/hour per user)', async () => {
      const phone = generatePhone();
      const user = await userRepo.create({ phone, role: 'job_seeker' });

      // 3 successful requests
      for (let i = 1; i <= 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/email/add',
          headers: { 'x-user-id': user.id },
          payload: { email: `candidate${i}_${phone}@example.com` },
        });
        expect(res.statusCode).toBe(200);
      }

      // 4th request must be rejected with 429
      const rateLimitedRes = await app.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { 'x-user-id': user.id },
        payload: { email: `candidate4_${phone}@example.com` },
      });

      expect(rateLimitedRes.statusCode).toBe(429);
      expect(rateLimitedRes.headers['retry-after']).toBeDefined();
    });

    it('handles verifyEmail: atomic confirmation, single active token, and token deletion', async () => {
      const phone = generatePhone();
      const user = await userRepo.create({ phone, role: 'job_seeker' });
      const targetEmail = `verified_${phone}@example.com`;

      let capturedToken = '';
      const emailSpy = vi.spyOn(emailService, 'sendEmail').mockImplementation(async (options) => {
        const match = options.html?.match(/token=([a-f0-9]+)/);
        if (match) {
          capturedToken = match[1];
        }
        return { success: true, messageId: 'mock_msg_1' };
      });

      await app.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { 'x-user-id': user.id },
        payload: { email: targetEmail },
      });

      expect(capturedToken).toBeTruthy();

      // 1. Verify email with valid token
      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/email/verify',
        payload: { token: capturedToken },
      });

      expect(verifyRes.statusCode).toBe(200);
      const verifyBody = JSON.parse(verifyRes.payload);
      expect(verifyBody.success).toBe(true);

      // Verify in DB that email is confirmed, pending_email is null, email_verified_at is set
      const confirmedUser = await userRepo.findById(user.id);
      expect(confirmedUser?.email).toBe(targetEmail);
      expect(confirmedUser?.pending_email).toBeNull();
      expect(confirmedUser?.email_verified_at).toBeTruthy();

      // 2. Replay token -> must fail with 400 (token already deleted)
      const replayRes = await app.inject({
        method: 'POST',
        url: '/auth/email/verify',
        payload: { token: capturedToken },
      });
      expect(replayRes.statusCode).toBe(400);

      emailSpy.mockRestore();
    });

    it('handles verifyEmail: parallel replay of same token succeeds exactly once (one 200, second 400)', async () => {
      const phone = generatePhone();
      const user = await userRepo.create({ phone, role: 'job_seeker' });
      const targetEmail = `parallel_verify_${phone}@example.com`;

      let token = '';
      const emailSpy = vi.spyOn(emailService, 'sendEmail').mockImplementation(async (options) => {
        const match = options.html?.match(/token=([a-f0-9]+)/);
        if (match) {
          token = match[1];
        }
        return { success: true, messageId: 'mock_msg_2' };
      });

      await app.inject({
        method: 'POST',
        url: '/auth/email/add',
        headers: { 'x-user-id': user.id },
        payload: { email: targetEmail },
      });

      emailSpy.mockRestore();

      // Fire two parallel verify requests
      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/auth/email/verify',
          payload: { token },
        }),
        app.inject({
          method: 'POST',
          url: '/auth/email/verify',
          payload: { token },
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);
    });
  });
});
