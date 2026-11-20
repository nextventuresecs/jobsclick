import { z } from 'zod';

export const DUMMY = /dummy|changeme|example|placeholder|test_key|x{6,}/i;

export const paymentEnv = z
  .object({
    RAZORPAY_KEY_ID: z.string().regex(/^rzp_(live|test)_[A-Za-z0-9]{10,}$/),
    RAZORPAY_KEY_SECRET: z.string().min(16),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(20),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const prod =
      e.NODE_ENV?.toLowerCase() === 'production' ||
      process.env['NODE_ENV'] === 'production';
    for (const [k, v] of Object.entries(e)) {
      if (k === 'NODE_ENV') continue;
      if (DUMMY.test(String(v))) {
        ctx.addIssue({ code: 'custom', path: [k], message: 'dummy value' });
      }
    }
    if (prod && !e.RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'live key required in production',
      });
    }
  });

export type PaymentEnvConfig = z.infer<typeof paymentEnv>;

export function validatePaymentEnv(
  overrides?: Record<string, string | number | undefined>,
): PaymentEnvConfig {
  const source = overrides ?? process.env;
  return paymentEnv.parse(source);
}
