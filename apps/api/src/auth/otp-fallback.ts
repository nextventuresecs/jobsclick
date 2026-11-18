import { normalizeIndianPhone } from '@indian-job-portal/validation';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type Redis from 'ioredis';
import { z } from 'zod';
import { normalizeIp } from '../common/ip-normalizer.js';
type Channel = 'phone' | 'email';
interface Context {
  ip: string;
  deviceId: string;
}
interface Offer {
  handle: string;
  alternatives: [Channel];
}
const issue = `local ip=tonumber(redis.call('GET',KEYS[2]) or '0');local device=tonumber(redis.call('GET',KEYS[3]) or '0')
if not ip or not device or ip<0 or device<0 then return -1 end
if ip>=30 or device>=6 then return 0 end
redis.call('INCR',KEYS[2]);if ip==0 then redis.call('EXPIRE',KEYS[2],600) end
redis.call('INCR',KEYS[3]);if device==0 then redis.call('EXPIRE',KEYS[3],600) end
redis.call('HSET',KEYS[1],'channel',ARGV[1],'context',ARGV[2],'expires',ARGV[3]);redis.call('EXPIRE',KEYS[1],120);return 1`;
const consume = `local expires=tonumber(redis.call('HGET',KEYS[1],'expires') or '0')
if not expires or expires<=tonumber(ARGV[3]) then redis.call('DEL',KEYS[1]);return 0 end
if redis.call('HGET',KEYS[1],'channel')~=ARGV[1] or redis.call('HGET',KEYS[1],'context')~=ARGV[2] then return 0 end
redis.call('DEL',KEYS[1]);return 1`;
/** Internal BFF offer. Keep handle in an HttpOnly flow cookie; it grants no session or contact proof. */
export class OtpFallbackTickets {
  private readonly key: Buffer;
  private readonly prefix: string;
  private readonly phoneKey: Buffer;
  private readonly hookPrefix: string;
  constructor(
    private readonly redis: Redis,
    key: Buffer,
    namespace: string,
    private readonly now = () => Math.floor(Date.now() / 1000),
  ) {
    if (key.length !== 32 || !/^[A-Za-z0-9:_-]{1,80}$/.test(namespace))
      throw Error('AUTH_FALLBACK_CONFIG_INVALID');
    this.phoneKey = Buffer.from(key);
    this.hookPrefix = namespace + ':{sms-hook}:';
    this.key = createHmac('sha256', key).update('jobsclick:otp-fallback:v1').digest();
    this.prefix = namespace + ':{otp-fallback}:';
  }
  private hash(value: string) {
    return createHmac('sha256', this.key).update(value).digest('hex');
  }
  private context(input: Context) {
    const subnet = input.ip.endsWith('/64') ? input.ip.slice(0, -3) : null;
    const ip = isIP(input.ip)
      ? normalizeIp(input.ip)
      : subnet && isIP(subnet) === 6 && normalizeIp(subnet) === input.ip
        ? input.ip
        : null;
    if (
      !ip ||
      ip === '0.0.0.0' ||
      ip === '::/64' ||
      !z.string().uuid().safeParse(input.deviceId).success
    )
      throw new ServiceUnavailableException('AUTH_FALLBACK_CONTEXT_UNAVAILABLE');
    return {
      binding: this.hash(ip + '\0' + input.deviceId),
      ip: this.hash(ip),
      device: this.hash(input.deviceId),
    };
  }
  private record(handle: string) {
    if (!/^f1_[A-Za-z0-9_-]{43}$/.test(handle))
      throw new UnauthorizedException('AUTH_FALLBACK_INVALID');
    return this.prefix + 'flow:' + createHash('sha256').update(handle).digest('hex');
  }
  async offer(
    error: unknown,
    from: Channel,
    context: Context,
    throttledPhone?: string,
  ): Promise<Offer | null> {
    const codes =
      from === 'phone'
        ? ['over_sms_send_rate_limit', 'over_request_rate_limit']
        : ['over_email_send_rate_limit', 'over_request_rate_limit'];
    if (
      !(error instanceof AuthApiError || error instanceof AuthRetryableFetchError) ||
      error.code === 'captcha_failed'
    )
      return null;
    let throttled = error.status === 429 && Boolean(error.code && codes.includes(error.code));
    // GoTrue wraps a hook's 429 as 500. Use server-held state, never parse upstream prose.
    const phone = throttledPhone ? normalizeIndianPhone(throttledPhone) : null;
    if (!throttled && from === 'phone' && phone && error.status >= 400 && error.status <= 599) {
      const hash = createHmac('sha256', this.phoneKey).update(phone).digest('hex');
      let state: [Error | null, unknown][] | null;
      try {
        state = await this.redis
          .pipeline()
          .ttl(this.hookPrefix + 'cooldown:' + hash)
          .exists(this.hookPrefix + 'breaker:' + Math.floor(this.now() / 86400))
          .exec();
      } catch {
        throw new ServiceUnavailableException('AUTH_FALLBACK_UNAVAILABLE');
      }
      if (!state || state.some(([failure]) => failure !== null))
        throw new ServiceUnavailableException('AUTH_FALLBACK_UNAVAILABLE');
      throttled = Number(state[0]?.[1]) > 0 || state[1]?.[1] === 1;
    }
    if (!throttled) return null;
    const target: Channel = from === 'phone' ? 'email' : 'phone',
      binding = this.context(context),
      handle = 'f1_' + randomBytes(32).toString('base64url');
    let result: unknown;
    try {
      result = await this.redis.eval(
        issue,
        3,
        this.record(handle),
        this.prefix + 'ip:' + binding.ip,
        this.prefix + 'device:' + binding.device,
        target,
        binding.binding,
        String(this.now() + 120),
      );
    } catch {
      throw new ServiceUnavailableException('AUTH_FALLBACK_UNAVAILABLE');
    }
    if (result === 0) throw new HttpException('AUTH_CLIENT_COOLDOWN', 429);
    if (result !== 1) throw new ServiceUnavailableException('AUTH_FALLBACK_UNAVAILABLE');
    return { handle, alternatives: [target] };
  }
  publicResponse(offer: Offer) {
    return { code: 'AUTH_OTP_THROTTLED', alternatives: offer.alternatives };
  }
  async consume(handle: string, target: Channel, context: Context): Promise<void> {
    const key = this.record(handle),
      binding = this.context(context);
    let result: unknown;
    try {
      result = await this.redis.eval(consume, 1, key, target, binding.binding, String(this.now()));
    } catch {
      throw new ServiceUnavailableException('AUTH_FALLBACK_UNAVAILABLE');
    }
    if (result !== 1) throw new UnauthorizedException('AUTH_FALLBACK_INVALID');
  }
}
