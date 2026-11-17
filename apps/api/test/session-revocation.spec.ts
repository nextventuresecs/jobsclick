import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';

describe('AUTH-06 per-device revocation on shared Redis', () => {
  let first: OtpRedisService;
  let second: OtpRedisService;
  let jti: string;
  beforeEach(async () => {
    first = new OtpRedisService(); second = new OtpRedisService(); jti = randomUUID();
    await Promise.all([first.waitForReady(), second.waitForReady()]);
  });
  afterEach(async () => {
    await first.client.del('auth:revoked-token:' + jti);
    await Promise.all([first.onModuleDestroy(), second.onModuleDestroy()]);
  });
  it('shares revocation across API instances and expires the marker with the access token', async () => {
    expect(await second.isAccessTokenRevoked(jti)).toBe(false);
    await first.revokeAccessToken(jti, Math.floor(Date.now() / 1000) + 120);
    expect(await second.isAccessTokenRevoked(jti)).toBe(true);
    expect(await second.isAccessTokenRevoked(randomUUID())).toBe(false);
    const ttl = await second.client.ttl('auth:revoked-token:' + jti);
    expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(120);
  });
  it('propagates Redis read/write failures rather than accepting an unverified session', async () => {
    vi.spyOn(first.client, 'get').mockRejectedValueOnce(new Error('offline'));
    await expect(first.isAccessTokenRevoked(jti)).rejects.toThrow('offline');
    vi.spyOn(first.client, 'set').mockRejectedValueOnce(new Error('offline'));
    await expect(first.revokeAccessToken(jti, Date.now() / 1000 + 30)).rejects.toThrow('offline');
  });
});
