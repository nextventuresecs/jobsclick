import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { z } from 'zod';
import { ServiceUnavailableException } from '@nestjs/common';
export interface SmsHookDelivery {
  phone: string;
  otp: string;
  language: 'en' | 'hi';
}
const packet = z.object({
  delivery: z
    .object({
      phone: z.string().regex(/^[6-9][0-9]{9}$/),
      otp: z.string().regex(/^[0-9]{6}$/),
      language: z.enum(['en', 'hi']),
    })
    .nullable(),
  expiresAt: z.number().int(),
});
const take = `local k=redis.call('LPOP',KEYS[1]);if not k then return nil end
if redis.call('HGET',k,'state')~='pending' then return nil end
local body=redis.call('HGET',k,'body');redis.call('HSET',k,'state','unknown');return {k,body}`;
/** Durable fake-transport draft: consuming a record is irreversible before dispatch. Never retry unknown. */
export class SmsHookOutbox {
  private readonly key: Buffer;
  readonly prefix: string;
  constructor(
    private readonly redis: Redis,
    key: Buffer,
    namespace: string,
  ) {
    if (key.length !== 32 || !/^[A-Za-z0-9:_-]{1,80}$/.test(namespace))
      throw Error('AUTH_OUTBOX_CONFIG_INVALID');
    this.key = createHmac('sha256', key).update('jobsclick:sms-outbox:v1').digest();
    this.prefix = namespace + ':{sms-hook}:';
  }
  get queueKey() {
    return this.prefix + 'outbox:pending';
  }
  recordKey(event: string) {
    return this.prefix + 'outbox:' + event;
  }
  seal(key: string, delivery: SmsHookDelivery | null) {
    const plain = randomBytes(256),
      json = Buffer.from(
        JSON.stringify({ delivery, expiresAt: Math.floor(Date.now() / 1000) + 120 }),
      );
    if (json.length > 254) throw Error('AUTH_OUTBOX_INVALID');
    plain.writeUInt16BE(json.length);
    json.copy(plain, 2);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(key));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  async dispatchOne(
    send: (delivery: SmsHookDelivery) => Promise<void>,
  ): Promise<'empty' | 'sent' | 'suppressed' | 'unknown'> {
    let value: unknown;
    try {
      value = await this.redis.eval(take, 1, this.queueKey);
    } catch {
      throw new ServiceUnavailableException('AUTH_OUTBOX_UNAVAILABLE');
    }
    if (value === null) return 'empty';
    const entry = z.tuple([z.string().max(200), z.string().max(512)]).safeParse(value);
    if (!entry.success) throw new ServiceUnavailableException('AUTH_OUTBOX_UNAVAILABLE');
    const [key, body] = entry.data;
    let state: 'sent' | 'suppressed' | 'unknown' = 'unknown';
    try {
      if (!key.startsWith(this.prefix + 'outbox:')) throw Error();
      const bytes = Buffer.from(body, 'base64url'),
        decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(key));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
      const parsed = packet.parse(
        JSON.parse(plain.subarray(2, 2 + plain.readUInt16BE()).toString('utf8')),
      );
      if (parsed.delivery === null) state = 'suppressed';
      else if (parsed.expiresAt > Math.floor(Date.now() / 1000)) {
        await send(parsed.delivery);
        state = 'sent';
      }
    } catch {
      state = 'unknown';
    }
    try {
      const result = await this.redis
        .multi()
        .hset(key, 'state', state)
        .hdel(key, 'body')
        .xadd(this.prefix + 'alerts', 'MAXLEN', '~', 1000, '*', 'kind', 'delivery-' + state)
        .exec();
      if (!result || result.some(([error]) => error !== null)) throw Error();
    } catch {
      throw new ServiceUnavailableException('AUTH_OUTBOX_UNAVAILABLE');
    }
    return state;
  }
}
