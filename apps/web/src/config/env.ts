import {
  z,
  safeBoolean,
  validateProductionJwtKey,
  getAppEnv,
  isStrictEnv as checkStrictEnv,
  validateStagingTripwire,
  isStaging,
} from '@indian-job-portal/validation';

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:3001'),
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: safeBoolean,
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
});

export const serverEnvSchema = clientEnvSchema.extend({
  NODE_ENV: z.string().default('development'),
  APP_ENV: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function isStrictEnv(rawNodeEnv?: string): boolean {
  if (rawNodeEnv !== undefined) {
    return checkStrictEnv(rawNodeEnv);
  }
  return checkStrictEnv(process.env);
}

export function validateWebEnv(overrides?: Record<string, string | undefined>): ServerEnv {
  const raw = overrides ?? process.env;
  const appEnv = getAppEnv(raw);
  const isDevOrTest = appEnv === 'development' || appEnv === 'test';

  if (!isDevOrTest) {
    const errors: string[] = [];

    if (isStaging(raw)) {
      const tripwireErrors = validateStagingTripwire(
        {
          ...raw,
          WEB_URL: raw['NEXT_PUBLIC_APP_URL'] || raw['WEB_URL'],
          API_URL: raw['NEXT_PUBLIC_API_URL'] || raw['API_URL'],
          SUPABASE_URL: raw['NEXT_PUBLIC_SUPABASE_URL'] || raw['SUPABASE_URL'],
          SENTRY_DSN: raw['NEXT_PUBLIC_SENTRY_DSN'] || raw['SENTRY_DSN'],
          RAZORPAY_KEY_ID: raw['NEXT_PUBLIC_RAZORPAY_KEY_ID'] || raw['RAZORPAY_KEY_ID'],
        },
        { requireDatabaseUrl: false }
      );
      errors.push(...tripwireErrors);
    }

    const jwtErr = validateProductionJwtKey('JWT_SECRET', raw['JWT_SECRET']);
    if (jwtErr) {
      errors.push(jwtErr);
    }

    const apiUrl = raw['NEXT_PUBLIC_API_URL'];
    if (apiUrl && !apiUrl.startsWith('https://')) {
      errors.push(`NEXT_PUBLIC_API_URL must use HTTPS in production. Got: ${apiUrl}`);
    }

    const appUrl = raw['NEXT_PUBLIC_APP_URL'];
    if (!appUrl || !appUrl.trim()) {
      errors.push('NEXT_PUBLIC_APP_URL must be set on raw environment in production/staging');
    } else if (!appUrl.startsWith('https://')) {
      errors.push(`NEXT_PUBLIC_APP_URL must use HTTPS in production/staging. Got: ${appUrl}`);
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
