import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OtpFallbackTickets } from '../src/auth/otp-fallback.js';
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
const context = { ip: '127.0.0.1', deviceId: randomUUID() };
function fixture(now = () => Math.floor(Date.now() / 1000)) {
  return new OtpFallbackTickets(redis, randomBytes(32), 'fallback:' + randomUUID(), now);
}
describe('AUTH-03 bounded explicit cross-channel fallback', () => {
  it.each([
    ['phone', 'email', 'over_sms_send_rate_limit'],
    ['email', 'phone', 'over_email_send_rate_limit'],
  ] as const)('offers %s -> %s only after a provider throttle', async (from, to, code) => {
    const tickets = fixture(),
      result = await tickets.offer(
        new AuthApiError('private-contact-and-token', 429, code),
        from,
        context,
      );
    expect(result?.alternatives).toEqual([to]);
    expect(result?.handle).toMatch(/^f1_[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(tickets.publicResponse(result!))).toBe(
      JSON.stringify({ code: 'AUTH_OTP_THROTTLED', alternatives: [to] }),
    );
    expect(JSON.stringify(tickets.publicResponse(result!))).not.toContain(result!.handle);
    await tickets.consume(result!.handle, to, context);
    await expect(tickets.consume(result!.handle, to, context)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('does not issue fallback permission for failed CAPTCHA, generic outages or forged client error objects', async () => {
    const tickets = fixture();
    for (const error of [
      new AuthApiError('private', 400, 'captcha_failed'),
      new AuthApiError('private', 503, 'unexpected_failure'),
      { status: 429, code: 'over_sms_send_rate_limit' },
    ])
      expect(await tickets.offer(error, 'phone', context)).toBeNull();
  });
  it('binds an offer to channel, trusted IP/device and a short expiry', async () => {
    let now = Math.floor(Date.now() / 1000);
    const tickets = fixture(() => now),
      result = await tickets.offer(
        new AuthApiError('private', 429, 'over_sms_send_rate_limit'),
        'phone',
        context,
      );
    await expect(tickets.consume(result!.handle, 'phone', context)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      tickets.consume(result!.handle, 'email', { ...context, deviceId: randomUUID() }),
    ).rejects.toMatchObject({ status: 401 });
    now += 120;
    await expect(tickets.consume(result!.handle, 'email', context)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('requires a real server-held offer, so general email OTP is not opened by a body flag', async () => {
    await expect(fixture().consume('fallbackFromPhone', 'email', context)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('accepts the installed SDK 5xx class only with server-proved phone cooldown, and never for failed CAPTCHA', async () => {
    const key = randomBytes(32),
      namespace = 'fallback-sdk:' + randomUUID(),
      tickets = new OtpFallbackTickets(redis, key, namespace),
      error = new AuthRetryableFetchError('private-upstream', 500),
      phone = '8765432109';
    expect(await tickets.offer(error, 'phone', context, phone)).toBeNull();
    const hash = createHmac('sha256', key).update(phone).digest('hex');
    await redis.set(namespace + ':{sms-hook}:cooldown:' + hash, 'cooldown', 'EX', 60);
    expect(await tickets.offer(error, 'phone', context, phone)).not.toBeNull();
    expect(
      await tickets.offer(
        new AuthApiError('private', 400, 'captcha_failed'),
        'phone',
        context,
        phone,
      ),
    ).toBeNull();
  });
});
