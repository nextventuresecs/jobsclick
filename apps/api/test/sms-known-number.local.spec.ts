import { SmsAdmission } from '../src/auth/sms-admission.js';
import { SmsHookOutbox } from '../src/auth/sms-hook-outbox.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SupabaseSmsHook } from '../src/auth/supabase-sms-hook.js';
const redis = new Redis(process.env['REDIS_URL']!, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  commandTimeout: 1000,
});
beforeAll(async () => {
  await redis.connect();
});
afterAll(async () => {
  await redis.quit();
});
const secret = randomBytes(32).toString('base64'),
  signer = new Webhook(secret);
function event(metadata: Record<string, unknown> = {}) {
  const raw = Buffer.from(
    JSON.stringify({
      user: { id: randomUUID(), phone: '918765432109', user_metadata: metadata },
      sms: { otp: '654321' },
    }),
  );
  const id = randomUUID(),
    now = new Date();
  return {
    raw,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(now.getTime() / 1000)),
      'webhook-signature': signer.sign(id, now, raw),
    },
  };
}
function fixture(known: boolean) {
  const send = vi.fn(),
    namespace = 'known-hook:' + randomUUID();
  const config = {
    secret,
    redis,
    namespace,
    send,
    policy: {
      phoneHmacKey: randomBytes(32),
      phoneDailyLimit: 2,
      cooldownSeconds: 1,
      globalBudgetPaise: 100,
      sendCostPaise: 1,
      blockedPrefixes: [],
    },
  };
  const outbox = new SmsHookOutbox(redis, config.policy.phoneHmacKey, namespace),
    admission = new SmsAdmission(redis, config.policy.phoneHmacKey, namespace);
  const instance = new SupabaseSmsHook({
    ...config,
    outbox,
    admission,
    knownNumber: async () => known,
    providerCaptchaEnforced: true,
  });
  return {
    send,
    namespace,
    hook: {
      async handle(...args: Parameters<SupabaseSmsHook['handle']>) {
        const result = await instance.handle(...args);
        await outbox.dispatchOne(send);
        return result;
      },
    },
  };
}
describe('AUTH-01/03 known-number SMS admission', () => {
  it('suppresses an unknown number with the identical successful provider response', async () => {
    const unknown = fixture(false),
      known = fixture(true),
      a = event(),
      b = event();
    const unknownResult = await unknown.hook.handle(a.raw, a.headers),
      knownResult = await known.hook.handle(b.raw, b.headers);
    expect(unknownResult).toEqual(knownResult);
    expect(unknownResult).toEqual({});
    expect(unknown.send).not.toHaveBeenCalled();
  });
  it('does not treat editable role/verified/admission metadata as signup permission', async () => {
    const f = fixture(false),
      request = event({ role: 'admin', phone_verified: true, admission_token: 'forged' });
    expect(await f.hook.handle(request.raw, request.headers)).toEqual({});
    expect(f.send).not.toHaveBeenCalled();
  });
  it('counts suppressed attempts toward number controls and records a safe alert', async () => {
    const f = fixture(false),
      request = event();
    await f.hook.handle(request.raw, request.headers);
    const keys = await redis.keys(f.namespace + ':*');
    const alerts = keys.find((k) => k.endsWith(':alerts'));
    expect(alerts).toBeDefined();
    const events = await redis.xrange(alerts!, '-', '+');
    expect(JSON.stringify(events)).toContain('suppressed');
    expect(JSON.stringify(events)).not.toContain('8765432109');
    expect(keys.some((k) => k.includes(':phone:'))).toBe(true);
    expect(f.send).not.toHaveBeenCalled();
  });
  it('keeps slow transport outside known/unknown hook response timing', async () => {
    const samples: { known: number[]; unknown: number[] } = { known: [], unknown: [] };
    const slow = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    for (let i = 0; i < 6; i++)
      for (const known of [true, false]) {
        const namespace = 'timing:' + randomUUID(),
          key = randomBytes(32),
          outbox = new SmsHookOutbox(redis, key, namespace),
          admission = new SmsAdmission(redis, key, namespace);
        const hook = new SupabaseSmsHook({
          secret,
          redis,
          namespace,
          outbox,
          admission,
          knownNumber: async () => known,
          providerCaptchaEnforced: true,
          policy: {
            phoneHmacKey: key,
            phoneDailyLimit: 10,
            cooldownSeconds: 1,
            globalBudgetPaise: 10,
            sendCostPaise: 1,
            blockedPrefixes: [],
          },
        });
        const req = event(),
          start = performance.now();
        expect(await hook.handle(req.raw, req.headers)).toEqual({});
        samples[known ? 'known' : 'unknown'].push(performance.now() - start);
        const delivered = slow.mock.calls.length;
        expect(delivered).toBe(i + (known ? 0 : 1));
        expect(await outbox.dispatchOne(slow)).toBe(known ? 'sent' : 'suppressed');
      }
    const median = (a: number[]) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)]!;
    expect(Math.abs(median(samples.known) - median(samples.unknown))).toBeLessThan(75);
    expect(slow).toHaveBeenCalledTimes(6);
  });
  it('admits a phone-bound signed signup once; replay and forged metadata never cause another delivery', async () => {
    const namespace = 'admission:' + randomUUID(),
      key = randomBytes(32),
      outbox = new SmsHookOutbox(redis, key, namespace),
      admission = new SmsAdmission(redis, key, namespace),
      send = vi.fn();
    const hook = new SupabaseSmsHook({
      secret,
      redis,
      namespace,
      outbox,
      admission,
      knownNumber: async () => false,
      providerCaptchaEnforced: true,
      policy: {
        phoneHmacKey: key,
        phoneDailyLimit: 1,
        cooldownSeconds: 1,
        globalBudgetPaise: 20,
        sendCostPaise: 1,
        blockedPrefixes: [],
      },
    });
    const token = await admission.mint({
      phone: '8765432109',
      ip: '127.0.0.1',
      deviceId: randomUUID(),
    });
    const first = event({ admission_token: token });
    expect(await hook.handle(first.raw, first.headers)).toEqual({});
    expect(await outbox.dispatchOne(send)).toBe('sent');
    const cooldown = (await redis.keys(namespace + ':*:cooldown:*'))[0]!;
    await redis.del(cooldown);
    const replay = event({ admission_token: token });
    expect(await hook.handle(replay.raw, replay.headers)).toEqual({});
    expect(await outbox.dispatchOne(send)).toBe('suppressed');
    expect(send).toHaveBeenCalledTimes(1);
    expect(admission.verify(token, '9876543210')).toBeNull();
    expect(admission.verify(token + 'x', '8765432109')).toBeNull();
  });
  it('uses bounded escalating cooldowns without a daily hard lockout; blocked attempts do not extend the cooldown', async () => {
    const namespace = 'cooldown:' + randomUUID(),
      key = randomBytes(32),
      outbox = new SmsHookOutbox(redis, key, namespace),
      admission = new SmsAdmission(redis, key, namespace);
    const hook = new SupabaseSmsHook({
      secret,
      redis,
      namespace,
      outbox,
      admission,
      knownNumber: async () => true,
      providerCaptchaEnforced: true,
      policy: {
        phoneHmacKey: key,
        phoneDailyLimit: 1,
        cooldownSeconds: 1,
        globalBudgetPaise: 20,
        sendCostPaise: 1,
        blockedPrefixes: [],
      },
    });
    for (let i = 0; i < 3; i++) {
      const req = event();
      expect(await hook.handle(req.raw, req.headers)).toEqual({});
      const cooldown = (await redis.keys(namespace + ':*:cooldown:*'))[0]!;
      expect(await redis.ttl(cooldown)).toBe(2 ** i);
      const before = await redis.pttl(cooldown),
        blocked = event();
      await expect(hook.handle(blocked.raw, blocked.headers)).rejects.toMatchObject({
        status: 429,
      });
      expect(await redis.pttl(cooldown)).toBeLessThanOrEqual(before);
      await redis.del(cooldown);
    }
  });
  it('records ambiguous delivery once, retains budget and never retries the transport', async () => {
    const namespace = 'unknown:' + randomUUID(),
      key = randomBytes(32),
      outbox = new SmsHookOutbox(redis, key, namespace),
      admission = new SmsAdmission(redis, key, namespace),
      send = vi.fn().mockRejectedValue(new Error('private-gateway-detail'));
    const hook = new SupabaseSmsHook({
      secret,
      redis,
      namespace,
      outbox,
      admission,
      knownNumber: async () => true,
      providerCaptchaEnforced: true,
      policy: {
        phoneHmacKey: key,
        phoneDailyLimit: 10,
        cooldownSeconds: 1,
        globalBudgetPaise: 20,
        sendCostPaise: 1,
        blockedPrefixes: [],
      },
    });
    const req = event();
    expect(await hook.handle(req.raw, req.headers)).toEqual({});
    expect(await outbox.dispatchOne(send)).toBe('unknown');
    expect(await outbox.dispatchOne(send)).toBe('empty');
    expect(send).toHaveBeenCalledTimes(1);
    const spent = (await redis.keys(namespace + ':*:spend:*'))[0]!;
    expect(await redis.get(spent)).toBe('1');
    const record = (await redis.keys(namespace + ':*:outbox:*')).find(
      (k) => k !== outbox.queueKey,
    )!;
    expect(await redis.hget(record, 'state')).toBe('unknown');
    expect(await redis.hget(record, 'body')).toBeNull();
  });

  it('accepts a trusted canonical IPv6 /64 and rejects absent ingress addresses', async () => {
    const admission = new SmsAdmission(redis, randomBytes(32), 'ipv6:' + randomUUID());
    expect(
      await admission.mint({
        phone: '8765432109',
        ip: '2001:db8:abcd:12::/64',
        deviceId: randomUUID(),
      }),
    ).toMatch(/^a1_/);
    await expect(
      admission.mint({ phone: '8765432109', ip: '0.0.0.0', deviceId: randomUUID() }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
