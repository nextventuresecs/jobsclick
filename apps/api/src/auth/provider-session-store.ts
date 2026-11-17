import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type Redis from 'ioredis';
import { UserRoleSchema, type UserRole } from '@indian-job-portal/validation';
import { z } from 'zod';

const credentialsSchema = z.object({
  authUserId: z.string().uuid(), providerSessionId: z.string().uuid(),
  accessToken: z.string().min(1).max(16384), refreshToken: z.string().min(1).max(16384),
  accessExpiresAt: z.number().int().positive(),
});
export type ProviderCredentials = z.infer<typeof credentialsSchema>;
const storedSchema = credentialsSchema.extend({ createdAt: z.number().int(), expiresAt: z.number().int() });
const checkEpoch = `
if redis.call('HGET', KEYS[1], 'epoch') ~= (redis.call('GET', KEYS[2]) or '0') then
  redis.call('DEL', KEYS[1])
  return 0
end
`;
const createSession = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'body', ARGV[1], 'epoch', redis.call('GET', KEYS[2]) or '0')
redis.call('EXPIRE', KEYS[1], ARGV[2])
if redis.call('EXISTS', KEYS[2]) == 1 and redis.call('TTL', KEYS[2]) < tonumber(ARGV[2]) then redis.call('EXPIRE', KEYS[2], ARGV[2]) end
return 1`;
const validateSession = `
if redis.call('HGET', KEYS[1], 'body') ~= ARGV[1] then return 2 end
${checkEpoch}
return 1`;
const beginRefresh = `
if redis.call('HGET', KEYS[1], 'body') ~= ARGV[1] or redis.call('HEXISTS', KEYS[1], 'refresh_owner') == 1 then return 0 end
${checkEpoch}
redis.call('HSET', KEYS[1], 'refresh_owner', ARGV[2])
return 1`;
const finishRefresh = `
if redis.call('HGET', KEYS[1], 'body') ~= ARGV[1] or redis.call('HGET', KEYS[1], 'refresh_owner') ~= ARGV[2] then return 0 end
${checkEpoch}
redis.call('HSET', KEYS[1], 'body', ARGV[3])
redis.call('HDEL', KEYS[1], 'refresh_owner')
return 1`;
const abortRefresh = `
if redis.call('HGET', KEYS[1], 'body') == ARGV[1] and redis.call('HGET', KEYS[1], 'refresh_owner') == ARGV[2] then return redis.call('DEL', KEYS[1]) end
return 0`;

/** Internal server component; never serialize resolved credentials into an HTTP response. */
export class ProviderSessionStore {
  private readonly encryptionKey: Buffer;
  private readonly now: () => number;
  constructor(private readonly redis: Redis, private readonly config: { namespace: string; encryptionKey: Buffer; now?: () => number }) {
    if (config.encryptionKey.length !== 32 || !/^[A-Za-z0-9:_-]{1,160}$/.test(config.namespace)) throw new Error('AUTH_SESSION_CONFIG_INVALID');
    this.encryptionKey = Buffer.from(config.encryptionKey);
    this.now = config.now || (() => Math.floor(Date.now() / 1000));
  }
  private key(sessionId: string) {
    if (!/^s1_[A-Za-z0-9_-]{43}$/.test(sessionId)) throw new UnauthorizedException('AUTH_SESSION_INVALID');
    return `${this.config.namespace}:{provider-sessions}:${createHash('sha256').update(sessionId).digest('hex')}`;
  }
  private epochKey(authUserId: string) {
    return `${this.config.namespace}:{provider-sessions}:epoch:${z.string().uuid().parse(authUserId)}`;
  }
  private seal(key: string, value: z.infer<typeof storedSchema>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(key));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  private open(key: string, value: string) {
    try {
      const bytes = Buffer.from(value, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(key));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return storedSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')));
    } catch { throw new ServiceUnavailableException('AUTH_SESSION_UNAVAILABLE'); }
  }
  async create(input: ProviderCredentials, role: UserRole) {
    const credentials = credentialsSchema.parse(input);
    const currentRole = UserRoleSchema.parse(role);
    const createdAt = this.now();
    if (credentials.accessExpiresAt <= createdAt || credentials.accessExpiresAt > createdAt + 900) throw new UnauthorizedException('AUTH_PROVIDER_INVALID');
    const expiresAt = createdAt + (['admin', 'msme_admin'].includes(currentRole) ? 12 * 3600 : 7 * 86400);
    const sessionId = `s1_${randomBytes(32).toString('base64url')}`;
    const key = this.key(sessionId);
    const result = await this.evaluate(createSession, [key, this.epochKey(credentials.authUserId)],
      this.seal(key, { ...credentials, createdAt, expiresAt }), String(expiresAt - createdAt));
    if (result !== 1) throw new ServiceUnavailableException('AUTH_SESSION_UNAVAILABLE');
    return { sessionId, expiresAt };
  }
  private async evaluate(script: string, keys: string[], ...args: string[]) {
    try { return await this.redis.eval(script, keys.length, ...keys, ...args); }
    catch { throw new ServiceUnavailableException('AUTH_SESSION_UNAVAILABLE'); }
  }
  async revoke(sessionId: string) {
    const key = this.key(sessionId);
    try { await this.redis.del(key); }
    catch { throw new ServiceUnavailableException('AUTH_SESSION_UNAVAILABLE'); }
  }
  /** Denial barrier only. Caller must also revoke provider sessions through a durable retryable flow. */
  async revokeAll(authUserId: string) {
    const key = this.epochKey(authUserId);
    try { await this.redis.set(key, randomBytes(32).toString('base64url'), 'EX', 7 * 86400); }
    catch { throw new ServiceUnavailableException('AUTH_SESSION_UNAVAILABLE'); }
  }
  async resolve(sessionId: string, refresh?: (credentials: ProviderCredentials) => Promise<ProviderCredentials>): Promise<z.infer<typeof storedSchema>> {
    const key = this.key(sessionId);
    const waitUntil = Date.now() + 15000;
    while (true) {
      let encrypted: string | null;
      try { encrypted = await this.redis.hget(key, 'body'); }
      catch { throw new ServiceUnavailableException('AUTH_SESSION_UNAVAILABLE'); }
      if (!encrypted) throw new UnauthorizedException('AUTH_SESSION_INVALID');
      const stored = this.open(key, encrypted);
      const keys = [key, this.epochKey(stored.authUserId)];
      const valid = await this.evaluate(validateSession, keys, encrypted);
      if (valid === 2) continue;
      if (valid !== 1) throw new UnauthorizedException('AUTH_SESSION_INVALID');
      if (stored.expiresAt <= this.now()) throw new UnauthorizedException('AUTH_REAUTHENTICATION_REQUIRED');
      if (stored.accessExpiresAt > this.now()) return stored;
      if (!refresh) throw new UnauthorizedException('AUTH_REAUTHENTICATION_REQUIRED');
      const owner = randomBytes(32).toString('base64url');
      if (await this.evaluate(beginRefresh, keys, encrypted, owner) !== 1) {
        if (Date.now() >= waitUntil) throw new UnauthorizedException('AUTH_REAUTHENTICATION_REQUIRED');
        await new Promise(resolve => setTimeout(resolve, 20));
        continue;
      }
      // Durable lease: a crashed/ambiguous provider call is never retried with the same refresh token.
      // Logout/delete and ciphertext comparison fence stale responses; no SET can recreate a missing row.
      try {
        const replacement = credentialsSchema.parse(await refresh(stored));
        if (replacement.authUserId !== stored.authUserId || replacement.providerSessionId !== stored.providerSessionId
          || replacement.accessExpiresAt <= this.now() || replacement.accessExpiresAt > this.now() + 900
          || stored.expiresAt <= this.now()) throw new Error('Invalid refreshed identity');
        const updated = { ...stored, ...replacement };
        if (await this.evaluate(finishRefresh, keys, encrypted, owner, this.seal(key, updated)) !== 1) throw new UnauthorizedException('AUTH_SESSION_INVALID');
        return updated;
      } catch (error) {
        await this.evaluate(abortRefresh, keys, encrypted, owner);
        if (error instanceof ServiceUnavailableException) throw error;
        throw new UnauthorizedException('AUTH_REAUTHENTICATION_REQUIRED');
      }
    }
  }
}
