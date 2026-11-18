import { normalizeIp } from '../common/ip-normalizer.js';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type Redis from 'ioredis';
import { ServiceUnavailableException, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { normalizeIndianPhone } from '@indian-job-portal/validation';
const proof = z
  .object({
    purpose: z.literal('sms-signup'),
    nonce: z.string().uuid(),
    phone: z.string().regex(/^[a-f0-9]{64}$/),
    ip: z.string().length(64),
    device: z.string().length(64),
    iat: z.number().int(),
    exp: z.number().int(),
  })
  .strict();
const admit = `local a=tonumber(redis.call('GET',KEYS[1]) or '0');local b=tonumber(redis.call('GET',KEYS[2]) or '0')
if not a or not b then return -1 end
if a>=30 or b>=6 then return 0 end
redis.call('INCR',KEYS[1]);if a==0 then redis.call('EXPIRE',KEYS[1],600) end
redis.call('INCR',KEYS[2]);if b==0 then redis.call('EXPIRE',KEYS[2],600) end
redis.call('SET',KEYS[3],ARGV[1],'EX',120,'NX');return 1`;
/** Internal BFF admission only. IP comes from trusted server ingress, never body/X-Forwarded-For. */
export class SmsAdmission {
  private readonly key: Buffer;
  readonly prefix: string;
  constructor(
    private readonly redis: Redis,
    key: Buffer,
    namespace: string,
    private readonly now = () => Math.floor(Date.now() / 1000),
  ) {
    if (key.length !== 32 || !/^[A-Za-z0-9:_-]{1,80}$/.test(namespace))
      throw Error('AUTH_ADMISSION_CONFIG_INVALID');
    this.key = createHmac('sha256', key).update('jobsclick:sms-admission:v1').digest();
    this.prefix = namespace + ':{sms-hook}:';
  }
  private hash(value: string) {
    return createHmac('sha256', this.key).update(value).digest('hex');
  }
  private nonceKey(nonce: string) {
    return this.prefix + 'admission:' + this.hash(nonce);
  }
  async mint(input: { phone: string; ip: string; deviceId: string }) {
    const number = normalizeIndianPhone(input.phone);
    const subnet = input.ip.endsWith('/64') ? input.ip.slice(0, -3) : null;
    const ip = isIP(input.ip)
      ? normalizeIp(input.ip)
      : subnet && isIP(subnet) === 6 && normalizeIp(subnet) === input.ip
        ? input.ip
        : null;
    if (
      !number ||
      !ip ||
      ip === '0.0.0.0' ||
      ip === '::/64' ||
      !z.string().uuid().safeParse(input.deviceId).success
    )
      throw new ServiceUnavailableException('AUTH_ADMISSION_INVALID');
    const iat = this.now(),
      nonce = randomUUID(),
      phone = this.hash(number);
    const claims = {
      purpose: 'sms-signup' as const,
      nonce,
      phone,
      ip: this.hash(ip),
      device: this.hash(input.deviceId),
      iat,
      exp: iat + 120,
    };
    let result: unknown;
    try {
      result = await this.redis.eval(
        admit,
        3,
        this.prefix + 'ip:' + claims.ip,
        this.prefix + 'device:' + claims.device,
        this.nonceKey(nonce),
        phone,
      );
    } catch {
      throw new ServiceUnavailableException('AUTH_ADMISSION_UNAVAILABLE');
    }
    if (result === 0)
      throw new HttpException({ code: 'AUTH_ADMISSION_THROTTLED', alternatives: ['email'] }, 429);
    if (result !== 1) throw new ServiceUnavailableException('AUTH_ADMISSION_UNAVAILABLE');
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return 'a1_' + body + '.' + this.hash(body);
  }
  verify(token: unknown, number: string): { key: string; value: string } | null {
    try {
      if (
        typeof token !== 'string' ||
        token.length > 1200 ||
        !/^a1_[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)
      )
        return null;
      const [body, mac] = token.slice(3).split('.');
      if (
        !body ||
        !mac ||
        !timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(this.hash(body), 'hex'))
      )
        return null;
      const value = proof.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))),
        now = this.now();
      if (
        value.iat > now ||
        value.exp <= now ||
        value.exp - value.iat !== 120 ||
        value.phone !== this.hash(number)
      )
        return null;
      return { key: this.nonceKey(value.nonce), value: value.phone };
    } catch {
      return null;
    }
  }
}
