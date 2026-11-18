import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import Redis from 'ioredis';
import fastify from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { SupabaseSmsHook } from '../src/auth/supabase-sms-hook.js';
import { SmsAdmission } from '../src/auth/sms-admission.js';
import { SmsHookOutbox } from '../src/auth/sms-hook-outbox.js';
import { createSmsKnownNumberLookup } from '../src/auth/sms-known-number.js';
import { OtpFallbackTickets } from '../src/auth/otp-fallback.js';
describe.runIf(process.env['JOBSCLICK_TEST_CAPTCHA_MODE'] === 'pass')(
  'AUTH-03 real provider cross-channel throttle offers',
  () => {
    const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    const redis = new Redis(process.env['REDIS_URL']!, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 1000,
    });
    const url = process.env['SUPABASE_URL']!,
      options = {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      };
    const backend = createClient(url, process.env['SUPABASE_SERVICE_ROLE_KEY']!, options),
      caller = createClient(url, process.env['SUPABASE_ANON_KEY']!, options);
    const key = randomBytes(32),
      namespace = 'native-fallback:' + randomUUID(),
      outbox = new SmsHookOutbox(redis, key, namespace),
      admission = new SmsAdmission(redis, key, namespace),
      tickets = new OtpFallbackTickets(redis, key, namespace);
    const context = { ip: '127.0.0.1', deviceId: randomUUID() },
      server = fastify({ logger: false, bodyLimit: 65536 }),
      deliveries: { phone: string; otp: string }[] = [];
    let hook: SupabaseSmsHook;
    beforeAll(async () => {
      await db.connect();
      await redis.connect();
      hook = new SupabaseSmsHook({
        secret: process.env['JOBSCLICK_TEST_SMS_HOOK_SECRET']!,
        redis,
        namespace,
        outbox,
        admission,
        knownNumber: createSmsKnownNumberLookup(backend),
        providerCaptchaEnforced: true,
        policy: {
          phoneHmacKey: key,
          phoneDailyLimit: 10,
          cooldownSeconds: 60,
          globalBudgetPaise: 100,
          sendCostPaise: 1,
          blockedPrefixes: [],
        },
      });
      server.removeContentTypeParser('application/json');
      server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) =>
        done(null, body),
      );
      server.post('/supabase-sms-hook', async (req, reply) => {
        try {
          const result = await hook.handle(req.body as Buffer, req.headers);
          await outbox.dispatchOne(async (d) => {
            deliveries.push(d);
          });
          return result;
        } catch (error) {
          const failure = error as { getStatus?: () => number };
          const status = failure.getStatus?.() ?? 503;
          return reply
            .code(status)
            .send({
              error: {
                http_code: status,
                message: status === 429 ? 'AUTH_HOOK_THROTTLED' : 'AUTH_HOOK_UNAVAILABLE',
              },
            });
        }
      });
      await server.listen({
        port: Number(process.env['JOBSCLICK_TEST_HOOK_PORT']),
        host: '0.0.0.0',
      });
    });
    afterAll(async () => {
      await server.close();
      await redis.quit();
      await db.end();
    });
    it('offers email after a hook phone cooldown, then phone after an email provider throttle; nothing is auto-sent', async () => {
      const phone = '8' + randomInt(100000000, 999999999),
        email = 'fallback-' + randomUUID() + '@example.invalid',
        id = randomUUID();
      const created = await backend.auth.admin.createUser({
        phone: '+91' + phone,
        phone_confirm: true,
        email,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
      expect(
        (
          await backend
            .from('users')
            .insert({
              id,
              phone,
              email,
              email_verified_at: new Date().toISOString(),
              role: 'job_seeker',
              status: 'active',
              source: 'native-fallback-fixture',
            })
        ).error,
      ).toBeNull();
      await db.query(
        "insert into private_auth.auth_user_links(auth_user_id,user_id,claim_method) values($1,$2,'phone')",
        [created.data.user!.id, id],
      );
      const captchaToken = 'XXXX.DUMMY.TOKEN.XXXX';
      expect(
        (
          await caller.auth.signInWithOtp({
            phone: '+91' + phone,
            options: { captchaToken, shouldCreateUser: false },
          })
        ).error,
      ).toBeNull();
      expect(deliveries).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const blocked = await caller.auth.signInWithOtp({
        phone: '+91' + phone,
        options: { captchaToken, shouldCreateUser: false },
      });
      expect(blocked.error).not.toBeNull();
      expect(blocked.error?.status).toBe(500);
      expect(blocked.error?.name).toBe('AuthRetryableFetchError');
      mkdirSync('docs/auth/evidence/followup/followup2', { recursive: true });
      writeFileSync(
        'docs/auth/evidence/followup/followup2/fallback-native-shape.json',
        JSON.stringify(
          {
            phone: {
              status: blocked.error?.status,
              errorClass: blocked.error?.name,
              code: blocked.error?.code,
            },
            realProvider: true,
            fakeSmsOnly: true,
          },
          null,
          2,
        ),
      );
      const emailOffer = await tickets.offer(blocked.error, 'phone', context, phone);
      expect(emailOffer).not.toBeNull();
      expect(tickets.publicResponse(emailOffer!)).toEqual({
        code: 'AUTH_OTP_THROTTLED',
        alternatives: ['email'],
      });
      expect(deliveries).toHaveLength(1);
      await tickets.consume(emailOffer!.handle, 'email', context);
      expect(
        (
          await caller.auth.signInWithOtp({
            email,
            options: { captchaToken, shouldCreateUser: false },
          })
        ).error,
      ).toBeNull();
      const emailBlocked = await caller.auth.signInWithOtp({
        email,
        options: { captchaToken, shouldCreateUser: false },
      });
      expect(emailBlocked.error).not.toBeNull();
      const phoneOffer = await tickets.offer(emailBlocked.error, 'email', context);
      expect(phoneOffer).not.toBeNull();
      expect(tickets.publicResponse(phoneOffer!)).toEqual({
        code: 'AUTH_OTP_THROTTLED',
        alternatives: ['phone'],
      });
      expect(deliveries).toHaveLength(1);
    });
  },
);
