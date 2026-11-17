import { createHash, randomBytes, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

describe('AUTH-05/06 server-only provider session persistence', () => {
  const namespace = `auth-test:${randomUUID()}`;
  const encryptionKey = randomBytes(32);
  const redis = new Redis(process.env['REDIS_URL']!, { lazyConnect: true, maxRetriesPerRequest: 1 });
  const authUserId = randomUUID();
  let now = Math.floor(Date.now() / 1000);
  const credentials = () => ({ authUserId, providerSessionId: randomUUID(), accessToken: `synthetic-access-${randomUUID()}`,
    refreshToken: `synthetic-refresh-${randomUUID()}`, accessExpiresAt: now + 900 });
  beforeAll(async () => { await redis.connect(); });
  afterEach(async () => { const keys = await redis.keys(`${namespace}:*`); if (keys.length) await redis.del(...keys); });
  afterAll(async () => { await redis.quit(); });

  it('returns only an opaque handle and stores encrypted provider credentials', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const input = credentials();
    const browser = await store.create(input, 'job_seeker');
    expect(browser).toEqual({ sessionId: expect.stringMatching(/^s1_[A-Za-z0-9_-]{43}$/), expiresAt: now + 7 * 86400 });
    expect(JSON.stringify(browser)).not.toContain(input.accessToken);
    expect(JSON.stringify(browser)).not.toContain(input.refreshToken);
    const keys = await redis.keys(`${namespace}:*`);
    expect(keys.join()).not.toContain(browser.sessionId);
    const values = await Promise.all(keys.map(key => redis.hgetall(key)));
    expect(JSON.stringify(values)).not.toContain(input.accessToken);
    expect(JSON.stringify(values)).not.toContain(input.refreshToken);
    expect(await store.resolve(browser.sessionId)).toMatchObject(input);
  });

  it('serializes refresh across two instances and preserves the absolute deadline', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const config = { namespace, encryptionKey, now: () => now };
    const first = new ProviderSessionStore(redis, config);
    const second = new ProviderSessionStore(redis, config);
    const original = credentials();
    const browser = await first.create(original, 'job_seeker');
    now += 901;
    const replacement = { ...original, accessToken: `synthetic-rotated-${randomUUID()}`, refreshToken: `synthetic-rotated-refresh-${randomUUID()}`, accessExpiresAt: now + 900 };
    let calls = 0;
    const refresh = async (input: typeof original) => {
      expect(input.refreshToken).toBe(original.refreshToken);
      calls++;
      await new Promise(resolve => setTimeout(resolve, 40));
      return replacement;
    };
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? first : second).resolve(browser.sessionId, refresh)));
    expect(calls).toBe(1);
    for (const result of results) expect(result).toMatchObject({ ...replacement, expiresAt: browser.expiresAt });
  });

  it('prevents an in-flight refresh from resurrecting a locally logged-out session', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const original = credentials();
    const browser = await store.create(original, 'job_seeker');
    now += 901;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending = store.resolve(browser.sessionId, async () => {
      entered(); await gate;
      return { ...original, accessToken: 'synthetic-stale-response', accessExpiresAt: now + 900 };
    });
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    await started;
    try { await store.revoke(browser.sessionId); } finally { release(); }
    await rejected;
    await expect(store.resolve(browser.sessionId)).rejects.toMatchObject({ status: 401 });
    expect(await redis.keys(`${namespace}:*`)).toEqual([]);
  });

  it('revokes every existing session for one subject while preserving others and fresh logins', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const first = await store.create(credentials(), 'job_seeker');
    const second = await store.create(credentials(), 'job_seeker');
    const unrelated = { ...credentials(), authUserId: randomUUID() };
    const other = await store.create(unrelated, 'job_seeker');
    await store.revokeAll(authUserId);
    await expect(store.resolve(first.sessionId)).rejects.toMatchObject({ status: 401 });
    await expect(store.resolve(second.sessionId)).rejects.toMatchObject({ status: 401 });
    expect(await store.resolve(other.sessionId)).toMatchObject(unrelated);
    const fresh = await store.create(credentials(), 'job_seeker');
    expect(await store.resolve(fresh.sessionId)).toMatchObject({ authUserId });
  });

  it('rejects a refresh response that arrives after the absolute deadline', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const original = credentials();
    const browser = await store.create(original, 'admin');
    now += 901;
    await expect(store.resolve(browser.sessionId, async () => {
      now = browser.expiresAt;
      return { ...original, accessExpiresAt: now + 900 };
    })).rejects.toMatchObject({ status: 401, message: 'AUTH_REAUTHENTICATION_REQUIRED' });
    await expect(store.resolve(browser.sessionId)).rejects.toMatchObject({ status: 401 });
  });

  it('accepts a fifteen-minute token with verified issue time one second ahead without extending the session deadline', async () => {
      const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
      const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
      const browser = await store.create({ ...credentials(), accessIssuedAt: now + 1, accessExpiresAt: now + 901 }, 'admin');
      expect(browser.expiresAt).toBe(now + 12 * 3600);
      expect((await store.resolve(browser.sessionId)).accessExpiresAt).toBe(now + 901);
  });

  it.each([0, 901])('refuses provider credentials with an unapproved access lifetime of %s seconds', async seconds => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    await expect(store.create({ ...credentials(), accessExpiresAt: now + seconds }, 'job_seeker'))
      .rejects.toMatchObject({ status: 401, message: 'AUTH_PROVIDER_INVALID' });
    expect(await redis.keys(`${namespace}:*`)).toEqual([]);
  });

  it.each(['admin', 'msme_admin', 'employer', 'intermediary', 'job_seeker'] as const)('enforces the absolute policy for %s without refreshing at expiry', async role => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const original = credentials();
    const browser = await store.create(original, role);
    expect(browser.expiresAt - now).toBe(['admin', 'msme_admin'].includes(role) ? 12 * 3600 : 7 * 86400);
    now = browser.expiresAt;
    let refreshes = 0;
    await expect(store.resolve(browser.sessionId, async () => { refreshes++; return { ...original, accessExpiresAt: now + 900 }; }))
      .rejects.toMatchObject({ status: 401, message: 'AUTH_REAUTHENTICATION_REQUIRED' });
    expect(refreshes).toBe(0);
  });

  it('rejects ciphertext moved to another session or decrypted with another key', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const first = await store.create(credentials(), 'job_seeker');
    const second = await store.create(credentials(), 'job_seeker');
    const key = (id: string) => `${namespace}:{provider-sessions}:${createHash('sha256').update(id).digest('hex')}`;
    await redis.hset(key(second.sessionId), 'body', (await redis.hget(key(first.sessionId), 'body'))!);
    await expect(store.resolve(second.sessionId)).rejects.toMatchObject({ status: 503, message: 'AUTH_SESSION_UNAVAILABLE' });
    const wrongKey = new ProviderSessionStore(redis, { namespace, encryptionKey: randomBytes(32), now: () => now });
    await expect(wrongKey.resolve(first.sessionId)).rejects.toMatchObject({ status: 503, message: 'AUTH_SESSION_UNAVAILABLE' });
  });

  it('fails closed on Redis outage for reads and revocation', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const offline = redis.duplicate({ lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
    await offline.connect(); await offline.quit();
    const store = new ProviderSessionStore(offline, { namespace, encryptionKey, now: () => now });
    const id = `s1_${randomBytes(32).toString('base64url')}`;
    for (const operation of [() => store.resolve(id), () => store.revoke(id), () => store.revokeAll(authUserId), () => store.create(credentials(), 'job_seeker')]) {
      await expect(operation()).rejects.toMatchObject({ status: 503, message: 'AUTH_SESSION_UNAVAILABLE' });
    }
  });

  it.each(['provider-outage', 'different-subject', 'different-session', 'excessive-lifetime'])('invalidates ambiguous %s refresh and never retries its token', async failure => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const original = credentials();
    const browser = await store.create(original, 'job_seeker');
    now += 901;
    let calls = 0;
    const refresh = async () => {
      calls++;
      if (failure === 'provider-outage') throw new Error('synthetic-private-provider-detail');
      return { ...original, accessExpiresAt: now + (failure === 'excessive-lifetime' ? 901 : 900),
        ...(failure === 'different-subject' ? { authUserId: randomUUID() } : {}),
        ...(failure === 'different-session' ? { providerSessionId: randomUUID() } : {}) };
    };
    await expect(store.resolve(browser.sessionId, refresh)).rejects.toMatchObject({ status: 401, message: 'AUTH_REAUTHENTICATION_REQUIRED' });
    await expect(store.resolve(browser.sessionId, refresh)).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(1);
  });

  it('fences a late refresh after subject-wide logout', async () => {
    const { ProviderSessionStore } = await import('../src/auth/provider-session-store.js');
    const store = new ProviderSessionStore(redis, { namespace, encryptionKey, now: () => now });
    const original = credentials();
    const browser = await store.create(original, 'job_seeker');
    now += 901;
    await expect(store.resolve(browser.sessionId, async () => {
      await store.revokeAll(authUserId);
      return { ...original, accessExpiresAt: now + 900 };
    })).rejects.toMatchObject({ status: 401 });
    await expect(store.resolve(browser.sessionId)).rejects.toMatchObject({ status: 401 });
  });
});
