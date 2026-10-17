import { z } from 'zod';
import fs from 'node:fs';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/indian_job_portal'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SENTRY_DSN: z.string().optional(),
  // QStash — optional in dev/test (mocked), required in production
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  QSTASH_URL: z.string().optional(),
  // API & Web URLs
  API_URL: z.string().optional(),
  WEB_URL: z.string().optional(),
  // Supabase — needed for storage (CSV uploads) and DB access
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_JWKS_URL: z.string().optional(),
  // Turnstile, SMS, Email
  TURNSTILE_SECRET_KEY: z.string().optional(),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Razorpay Payment Gateway (WAL-03)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
}).passthrough();

export type EnvConfig = z.infer<typeof baseSchema>;

export function validateEnv(): EnvConfig {
  if (typeof process.loadEnvFile === 'function') {
    const candidates = ['.env.local', '../../.env.local', '.env', '../../.env'];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          process.loadEnvFile(file);
          break;
        } catch {
          // Ignore formatting errors
        }
      }
    }
  }

  const result = baseSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid API Environment Variables:', result.error.format());
    throw new Error('Environment variable validation failed');
  }

  const env = result.data;

  // Production-only validations: crash at boot if critical vars are missing.
  // In dev/test these are optional (mocked).
  if (env.NODE_ENV === 'production') {
    const required: Array<[string, unknown, string]> = [
      ['QSTASH_TOKEN', env.QSTASH_TOKEN, 'QStash token is required in production for job dispatch'],
      ['QSTASH_CURRENT_SIGNING_KEY', env.QSTASH_CURRENT_SIGNING_KEY, 'QStash signing key is required in production for webhook verification'],
      ['API_URL', env.API_URL, 'API_URL is required in production — QStash sends webhooks to this URL'],
      ['SUPABASE_URL', env.SUPABASE_URL, 'SUPABASE_URL is required in production for storage'],
      ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required in production for storage'],
    ];

    const missing = required.filter(([, value]) => !value);
    if (missing.length > 0) {
      const msgs = missing.map(([name, , reason]) => `  - ${name}: ${reason}`);
      throw new Error(`Missing required production environment variables:\n${msgs.join('\n')}`);
    }

    // API_URL must be HTTPS in production (QStash refuses plain HTTP)
    if (env.API_URL && !env.API_URL.startsWith('https://')) {
      throw new Error(`API_URL must use HTTPS in production. Got: ${env.API_URL}`);
    }
  }

  return env;
}
