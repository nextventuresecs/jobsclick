import { z, safeBoolean, validateProductionJwtKey } from '@indian-job-portal/validation';

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:3001'),
  NEXT_PUBLIC_APP_URL: z.string().default('https://jobsclick.live'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: safeBoolean,
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export const serverEnvSchema = clientEnvSchema.extend({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function isStrictEnv(rawNodeEnv?: string): boolean {
  const env =
    rawNodeEnv !== undefined
      ? rawNodeEnv.trim().toLowerCase()
      : (process.env['NODE_ENV'] ?? '').trim().toLowerCase();
  return env !== 'development' && env !== 'test';
}

export function validateWebEnv(overrides?: Record<string, string | undefined>): ServerEnv {
  const raw = overrides ?? process.env;
  const rawNodeEnv = (raw['NODE_ENV'] ?? '').trim().toLowerCase();
  const isDevOrTest = rawNodeEnv === 'development' || rawNodeEnv === 'test';

  if (!isDevOrTest) {
    const errors: string[] = [];

    const jwtErr = validateProductionJwtKey('JWT_SECRET', raw['JWT_SECRET']);
    if (jwtErr) {
      errors.push(jwtErr);
    }

    const apiUrl = raw['NEXT_PUBLIC_API_URL'];
    if (apiUrl && !apiUrl.startsWith('https://')) {
      errors.push(`NEXT_PUBLIC_API_URL must use HTTPS in production. Got: ${apiUrl}`);
    }

    if (errors.length > 0) {
      throw new Error(
        `Unsafe Web configuration for ${raw['NODE_ENV'] || 'production'}:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      );
    }
  } else {
    // Non-production (development / test) JWT_SECRET check
    const jwt = raw['JWT_SECRET'];
    if (!jwt || jwt.trim().length === 0) {
      throw new Error('JWT_SECRET must be set in all environments');
    }
    if (jwt.trim().length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in all environments');
    }
  }

  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    console.error('Invalid Web Environment Variables:', result.error.format());
    throw new Error('Web environment variable validation failed');
  }

  return result.data;
}
