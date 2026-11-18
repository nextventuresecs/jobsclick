import type Redis from 'ioredis';
import { SupabaseSmsHook, type SmsHookPolicy } from '../../src/auth/supabase-sms-hook.js';
import { SmsAdmission } from '../../src/auth/sms-admission.js';
import { SmsHookOutbox, type SmsHookDelivery } from '../../src/auth/sms-hook-outbox.js';
export function fixtureSmsHook(config: {
  secret: string;
  redis: Redis;
  namespace: string;
  policy: SmsHookPolicy;
  send: (delivery: SmsHookDelivery) => Promise<void>;
}) {
  const { redis, namespace, policy } = config;
  const outbox = new SmsHookOutbox(redis, policy.phoneHmacKey, namespace),
    admission = new SmsAdmission(redis, policy.phoneHmacKey, namespace);
  const hook = new SupabaseSmsHook({
    ...config,
    outbox,
    admission,
    knownNumber: async () => true,
    providerCaptchaEnforced: true,
  });
  return {
    async handle(...args: Parameters<SupabaseSmsHook['handle']>) {
      const result = await hook.handle(...args);
      await outbox.dispatchOne(config.send);
      return result;
    },
    outbox,
  };
}
