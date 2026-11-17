import { randomBytes, randomUUID } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseSmsHook } from '../src/auth/supabase-sms-hook.js';

const secret = randomBytes(32).toString('base64');
const signer = new Webhook(secret);
let namespace = 'sms-hook-test:' + randomUUID();
const policy = { phoneHmacKey: randomBytes(32), phoneDailyLimit: 10, cooldownSeconds: 60, globalBudgetPaise: 100, sendCostPaise: 1, blockedPrefixes: [] };
beforeEach(() => { namespace = 'sms-hook-test:' + randomUUID(); });
const redis = new Redis(process.env['REDIS_URL']!, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, commandTimeout: 1000 });
beforeAll(async () => { await redis.connect(); });
afterAll(async () => { await redis.quit(); });
function request(body: unknown = { user: { id: randomUUID(), phone: '919876543210' }, sms: { otp: '654321' } }, timestamp = new Date()) {
  const raw = Buffer.from(JSON.stringify(body));
  const id = randomUUID();
  return { raw, headers: { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)), 'webhook-signature': signer.sign(id, timestamp, raw) } };
}
describe('AUTH-01/03 authenticated Supabase SMS hook', () => {
  it('denies an unsigned request before any delivery', async () => {
    const send = vi.fn();
    const hook = new SupabaseSmsHook({ policy, redis, namespace, secret, send });
    await expect(hook.handle(request().raw, {})).rejects.toMatchObject({ status: 401, message: 'AUTH_HOOK_SIGNATURE_INVALID' });
    expect(send).not.toHaveBeenCalled();
  });
  it('delivers a correctly signed Indian destination with no credential in the response', async () => {
    const send = vi.fn(); const hook = new SupabaseSmsHook({ policy, redis, namespace, secret: 'v1,whsec_' + secret, send });
    const req = request({ user: { id: randomUUID(), phone: '+919876543210', user_metadata: { role: 'admin', language: 'hi' } }, sms: { otp: '654321' } });
    expect(await hook.handle(req.raw, req.headers)).toEqual({});
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ phone: '9876543210', otp: '654321', language: 'en' });
  });
  it.each([-601, 601])('rejects an authentic timestamp %s seconds from now', async offset => {
    const send = vi.fn(); const req = request(undefined, new Date(Date.now() + offset * 1000));
    await expect(new SupabaseSmsHook({ policy, redis, namespace, secret, send }).handle(req.raw, req.headers)).rejects.toMatchObject({ status: 401 });
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects changed bytes, missing raw body and duplicated signature headers', async () => {
    const send = vi.fn(); const hook = new SupabaseSmsHook({ policy, redis, namespace, secret, send }); const req = request();
    for (const [raw, headers] of [[Buffer.from(req.raw.toString() + ' '), req.headers], [undefined, req.headers], [req.raw, { ...req.headers, 'webhook-signature': [req.headers['webhook-signature']] }]] as const) {
      await expect(hook.handle(raw, headers)).rejects.toMatchObject({ status: 401 });
    }
    expect(send).not.toHaveBeenCalled();
  });
  it.each(['+14155552671', '9876543210', '915123456789'])('denies destination %s despite a valid signature', async phone => {
    const send = vi.fn(); const req = request({ user: { id: randomUUID(), phone }, sms: { otp: '654321' } });
    await expect(new SupabaseSmsHook({ policy, redis, namespace, secret, send }).handle(req.raw, req.headers)).rejects.toMatchObject({ status: 400 });
    expect(send).not.toHaveBeenCalled();
  });
  it('denies phone-change ambiguity and malformed OTPs', async () => {
    const send = vi.fn(); const hook = new SupabaseSmsHook({ policy, redis, namespace, secret, send });
    for (const body of [{ user: { id: randomUUID(), phone: '919876543210', phone_change: '919123456789' }, sms: { otp: '654321' } }, { user: { id: randomUUID(), phone: '919876543210' }, sms: { otp: 'malformed' } }]) {
      const req = request(body); await expect(hook.handle(req.raw, req.headers)).rejects.toMatchObject({ status: 400 });
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('returns a safe delivery error without upstream diagnostics', async () => {
    const req = request(); const send = vi.fn().mockRejectedValue(new Error('upstream-secret-654321'));
    await expect(new SupabaseSmsHook({ policy, redis, namespace, secret, send }).handle(req.raw, req.headers)).rejects.toMatchObject({ status: 503, message: 'AUTH_HOOK_DELIVERY_UNAVAILABLE' });
  });
  it('rejects a replay across server instances before a second dispatch', async () => {
    const req = request(); const send = vi.fn(); const config = { secret, send, redis, namespace, policy };
    await new SupabaseSmsHook(config).handle(req.raw, req.headers);
    vi.resetModules();
    const { SupabaseSmsHook: OtherServerHook } = await import('../src/auth/supabase-sms-hook.js');
    await expect(new OtherServerHook(config).handle(req.raw, req.headers)).rejects.toMatchObject({ status: 409, message: 'AUTH_HOOK_REPLAY' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('allows one concurrent dispatch and never retries an ambiguous failure', async () => {
    const req = request(); const send = vi.fn().mockRejectedValue(new Error('provider timeout'));
    const config = { secret, send, redis, namespace, policy }; const hook = new SupabaseSmsHook(config);
    const results = await Promise.allSettled([hook.handle(req.raw, req.headers), new SupabaseSmsHook(config).handle(req.raw, req.headers)]);
    expect(results.map(result => result.status === 'rejected' ? result.reason.status : 200).sort()).toEqual([409, 503]);
    await expect(hook.handle(req.raw, req.headers)).rejects.toMatchObject({ status: 409 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('fails closed on Redis outage before sending', async () => {
    const unavailable = new Redis(process.env['REDIS_URL']!, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
    unavailable.disconnect();
    const send = vi.fn(); const req = request();
    await expect(new SupabaseSmsHook({ policy, secret, send, redis: unavailable, namespace }).handle(req.raw, req.headers)).rejects.toMatchObject({ status: 503, message: 'AUTH_HOOK_STATE_UNAVAILABLE' });
    expect(send).not.toHaveBeenCalled();
  });

});
