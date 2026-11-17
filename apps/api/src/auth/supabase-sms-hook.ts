import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type Redis from 'ioredis';
import { Webhook } from 'standardwebhooks';
import { z } from 'zod';

const phone = z.string().regex(/^\+?91[6-9][0-9]{9}$/);
const payload = z.object({
  user: z.object({ id: z.string().uuid(), phone, phone_change: z.string().optional(), is_anonymous: z.literal(false).optional() }),
  sms: z.object({ otp: z.string().regex(/^[0-9]{6}$/), phone: phone.optional() }),
});
interface Delivery { phone: string; otp: string; language: 'en' | 'hi' }

/** Unregistered server draft. Never log raw requests, signatures or OTPs. */
export class SupabaseSmsHook {
  private readonly verifier: Webhook;
  constructor(private readonly config: { secret: string; redis: Redis; namespace: string; send: (delivery: Delivery) => Promise<void> }) {
    const secret = config.secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(secret) || Buffer.from(secret, 'base64').length !== 32
      || !/^[A-Za-z0-9:_-]{1,80}$/.test(config.namespace)) throw new Error('AUTH_HOOK_CONFIG_INVALID');
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
    // Cover the signature's past/future tolerance. Reserve before delivery and keep
    // the marker on ambiguous provider failure; retries must never duplicate SMS.
    const key = `${this.config.namespace}:{sms-hook}:event:${createHash('sha256').update(headers['webhook-id'] as string).digest('hex')}`;
    let reserved: string | null;
    try { reserved = await this.config.redis.set(key, 'reserved', 'EX', 660, 'NX'); }
    catch { throw new ServiceUnavailableException('AUTH_HOOK_STATE_UNAVAILABLE'); }
    if (reserved !== 'OK') throw new ConflictException('AUTH_HOOK_REPLAY');
    try {
      await this.config.send({ phone: parsed.data.user.phone.slice(-10), otp: parsed.data.sms.otp, language: 'en' });
    } catch { throw new ServiceUnavailableException('AUTH_HOOK_DELIVERY_UNAVAILABLE'); }
    return {};
  }
}
