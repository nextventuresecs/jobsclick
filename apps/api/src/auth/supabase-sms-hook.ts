import { createHash, createHmac } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type Redis from 'ioredis';
import { Webhook } from 'standardwebhooks';
import { z } from 'zod';

const phone = z.string().regex(/^\+?91[6-9][0-9]{9}$/);
const payload = z.object({
  user: z.object({ id: z.string().uuid(), phone, phone_change: z.string().optional(), is_anonymous: z.literal(false).optional() }),
  sms: z.object({ otp: z.string().regex(/^[0-9]{6}$/), phone: phone.optional() }),
});

const smsHookPolicy = z.object({
  phoneHmacKey: z.instanceof(Buffer).refine(key => key.length === 32),
  phoneDailyLimit: z.number().int().min(1).max(10),
  cooldownSeconds: z.number().int().min(1).max(3600),
  globalBudgetPaise: z.number().int().min(0).max(1_000_000_000),
  sendCostPaise: z.number().int().min(1).max(100_000),
  blockedPrefixes: z.array(z.string().regex(/^[0-9]{1,10}$/)).max(1000),
});
export type SmsHookPolicy = z.infer<typeof smsHookPolicy>;
const reserveDelivery = `
if redis.call('EXISTS',KEYS[1]) == 1 then return -1 end
if redis.call('EXISTS',KEYS[5]) == 1 then return -4 end
local count = tonumber(redis.call('GET',KEYS[2]) or '0')
local spent = tonumber(redis.call('GET',KEYS[4]) or '0')
if not count or not spent or count < 0 or spent < 0 or count ~= math.floor(count) or spent ~= math.floor(spent) then return -5 end
if count >= tonumber(ARGV[1]) then return -2 end
if redis.call('EXISTS',KEYS[3]) == 1 then return -3 end
local cost, budget, ttl = tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
if spent + cost > budget then
  redis.call('SET',KEYS[5],'open','EX',ttl)
  redis.call('XADD',KEYS[6],'MAXLEN','~',1000,'*','kind','circuit-open','used_paise',tostring(spent),'limit_paise',ARGV[4])
  return -4
end
redis.call('SET',KEYS[1],'reserved','EX',660)
redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],ttl)
redis.call('SET',KEYS[3],'cooldown','EX',ARGV[2])
redis.call('INCRBY',KEYS[4],cost); redis.call('EXPIRE',KEYS[4],ttl)
if (spent + cost) * 5 >= budget * 4 and redis.call('SET',KEYS[7],'queued','EX',ttl,'NX') then
  redis.call('XADD',KEYS[6],'MAXLEN','~',1000,'*','kind','spend-threshold','used_paise',tostring(spent + cost),'limit_paise',ARGV[4])
end
return 1
`;

interface Delivery { phone: string; otp: string; language: 'en' | 'hi' }

/** Unregistered server draft. Never log raw requests, signatures or OTPs. */
export class SupabaseSmsHook {
  private readonly verifier: Webhook;
  private readonly policy: SmsHookPolicy;
  constructor(private readonly config: { secret: string; redis: Redis; namespace: string; policy: SmsHookPolicy; send: (delivery: Delivery) => Promise<void> }) {
    const secret = config.secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(secret) || Buffer.from(secret, 'base64').length !== 32
      || !/^[A-Za-z0-9:_-]{1,80}$/.test(config.namespace)) throw new Error('AUTH_HOOK_CONFIG_INVALID');
    const policy = smsHookPolicy.safeParse(config.policy);
    if (!policy.success) throw new Error('AUTH_HOOK_CONFIG_INVALID');
    this.policy = { ...policy.data, phoneHmacKey: Buffer.from(policy.data.phoneHmacKey) };
    this.verifier = new Webhook(secret);
  }
  async handle(rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>) {
    let authenticated: unknown;
    try {
      if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length > 65536
        || !Buffer.from(rawBody.toString('utf8'), 'utf8').equals(rawBody)) throw Error();
      const verifiedHeaders: Record<string, string> = {};
      for (const key of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
        const value = headers[key];
        if (typeof value !== 'string' || value.length > 1024) throw Error();
        verifiedHeaders[key] = value;
      }
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(verifiedHeaders['webhook-id']!)
        || !/^[0-9]{10}$/.test(verifiedHeaders['webhook-timestamp']!)) throw Error();
      authenticated = this.verifier.verify(rawBody, verifiedHeaders);
    } catch { throw new UnauthorizedException('AUTH_HOOK_SIGNATURE_INVALID'); }
    const parsed = payload.safeParse(authenticated);
    if (!parsed.success || parsed.data.user.phone_change
      || (parsed.data.sms.phone && parsed.data.sms.phone.replace(/^\+/, '') !== parsed.data.user.phone.replace(/^\+/, ''))) {
      throw new BadRequestException('AUTH_HOOK_PAYLOAD_INVALID');
    }
    const destination = parsed.data.user.phone.slice(-10);
    if (this.policy.blockedPrefixes.some(prefix => destination.startsWith(prefix))) throw new BadRequestException('AUTH_HOOK_DESTINATION_DENIED');
    const numberHash = createHmac('sha256', this.policy.phoneHmacKey).update(destination).digest('hex');
    const prefix = this.config.namespace + ':{sms-hook}:';
    const day = Math.floor(Date.now() / 86_400_000);
    const ttl = (day + 1) * 86400 - Math.floor(Date.now() / 1000) + 600;
    const keys = [prefix + 'event:' + createHash('sha256').update(headers['webhook-id'] as string).digest('hex'),
      prefix + 'phone:' + day + ':' + numberHash, prefix + 'cooldown:' + numberHash,
      prefix + 'spend:' + day, prefix + 'breaker:' + day, prefix + 'alerts', prefix + 'alerted:' + day];
    let reserved: unknown;
    try {
      reserved = await this.config.redis.eval(reserveDelivery, keys.length, ...keys,
        String(this.policy.phoneDailyLimit), String(this.policy.cooldownSeconds), String(this.policy.sendCostPaise),
        String(this.policy.globalBudgetPaise), String(ttl));
    } catch { throw new ServiceUnavailableException('AUTH_HOOK_STATE_UNAVAILABLE'); }
    if (reserved === -1) throw new ConflictException('AUTH_HOOK_REPLAY');
    if (reserved === -2) throw new HttpException('AUTH_HOOK_PHONE_DAILY_CAP', 429);
    if (reserved === -3) throw new HttpException('AUTH_HOOK_COOLDOWN', 429);
    if (reserved === -4) throw new HttpException('AUTH_HOOK_BUDGET_EXHAUSTED', 429);
    if (reserved !== 1) throw new ServiceUnavailableException('AUTH_HOOK_STATE_UNAVAILABLE');
    try {
      await this.config.send({ phone: parsed.data.user.phone.slice(-10), otp: parsed.data.sms.otp, language: 'en' });
    } catch { throw new ServiceUnavailableException('AUTH_HOOK_DELIVERY_UNAVAILABLE'); }
    return {};
  }
}
