import { z } from 'zod';
import fs from 'node:fs';

const PLACEHOLDER_REGEX = /change-?me|example|dummy|test|secret-key/i;

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_ALLOW_PLAINTEXT: z.string().optional(),
  DB_ALLOW_INSECURE_TLS: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  QSTASH_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  USE_MOCK_REDIS: z.string().optional(),
  VITEST: z.string().optional(),
  TEST_ALLOWED_HOSTS: z.string().optional(),
}).passthrough();

export type EnvConfig = z.infer<typeof envSchema>;

export function isStrictEnv(rawNodeEnv?: string): boolean {
  const env = rawNodeEnv !== undefined ? rawNodeEnv.trim().toLowerCase() : (process.env['NODE_ENV'] ?? '').trim().toLowerCase();
  return env !== 'development' && env !== 'test';
}

export function validateEnv(overrides?: Record<string, string | undefined>): EnvConfig {
  if (!overrides) {
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
  }

  const rawSource = overrides ?? process.env;
  const rawNodeEnv = (rawSource['NODE_ENV'] ?? '').trim().toLowerCase();
  const isDevOrTest = rawNodeEnv === 'development' || rawNodeEnv === 'test';

  // Strict Production / Staging guards evaluated on RAW source before Zod defaults
  if (!isDevOrTest) {
    const errors: string[] = [];

    // REDIS_URL: raw required, reject localhost/127.0.0.1, enforce rediss:// unless opt-out
    const redisUrlRaw = rawSource['REDIS_URL'];
    if (!redisUrlRaw || !redisUrlRaw.trim()) {
      errors.push('REDIS_URL must be set on raw environment in production/staging');
    } else {
      try {
        const parsedRedis = new URL(redisUrlRaw);
        const host = parsedRedis.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
          errors.push('REDIS_URL must not point to localhost or 127.0.0.1 in production/staging');
        }
      } catch {
        if (redisUrlRaw.includes('localhost') || redisUrlRaw.includes('127.0.0.1')) {
          errors.push('REDIS_URL must not point to localhost in production/staging');
        }
      }

      if (!redisUrlRaw.startsWith('rediss://')) {
        errors.push('REDIS_URL must start with rediss:// in production/staging');
      }
    }

    // Insecure TLS override flags are strictly forbidden in production/staging
    if (rawSource['REDIS_ALLOW_PLAINTEXT'] === '1' || rawSource['REDIS_ALLOW_PLAINTEXT'] === 'true') {
      errors.push('REDIS_ALLOW_PLAINTEXT is strictly forbidden in production/staging. Insecure TLS override flags are rejected.');
    }
    if (rawSource['DB_ALLOW_INSECURE_TLS'] === '1' || rawSource['DB_ALLOW_INSECURE_TLS'] === 'true') {
      errors.push('DB_ALLOW_INSECURE_TLS is strictly forbidden in production/staging. Insecure TLS override flags are rejected.');
    }

    // SUPABASE_URL: raw required
    const supabaseUrlRaw = rawSource['SUPABASE_URL'];
    if (!supabaseUrlRaw || !supabaseUrlRaw.trim()) {
      errors.push('SUPABASE_URL must be set on raw environment in production/staging');
    } else {
      try {
        const parsedSupabase = new URL(supabaseUrlRaw);
        const host = parsedSupabase.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
          errors.push('SUPABASE_URL must not point to localhost or 127.0.0.1 in production/staging');
        }
      } catch {
        if (supabaseUrlRaw.includes('localhost') || supabaseUrlRaw.includes('127.0.0.1')) {
          errors.push('SUPABASE_URL must not point to localhost in production/staging');
        }
      }
    }

    // SUPABASE_SERVICE_ROLE_KEY: required, no placeholders
    const sRole = rawSource['SUPABASE_SERVICE_ROLE_KEY'];
    if (!sRole || !sRole.trim() || PLACEHOLDER_REGEX.test(sRole)) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY must be set and not a placeholder/dummy value in production/staging');
    }

    // Dev/test-only flags must be unset in production/staging
    if (rawSource['USE_MOCK_REDIS']) {
      errors.push('USE_MOCK_REDIS must not be set in production/staging');
    }
    if (rawSource['VITEST']) {
      errors.push('VITEST must not be set in production/staging');
    }

    if (errors.length > 0) {
      throw new Error(
        `Unsafe Worker configuration for ${rawSource['NODE_ENV'] || 'production'}:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      );
    }
  }

  const result = envSchema.safeParse(rawSource);
  if (!result.success) {
    console.error('Invalid Worker Environment Variables:', result.error.format());
    throw new Error('Worker environment variable validation failed');
  }

  const env = result.data;

  // Test-mode safety gate: hostnames must parse with new URL() and reside in allowed local hosts
  if (rawNodeEnv === 'test') {
    const customAllowed = (rawSource['TEST_ALLOWED_HOSTS'] ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal', ...customAllowed]);

    const targetUrlVars = ['REDIS_URL', 'SUPABASE_URL'] as const;

    for (const varName of targetUrlVars) {
      const val = rawSource[varName];
      if (val && typeof val === 'string' && val.trim()) {
        try {
          const parsed = new URL(val);
          const hostname = parsed.hostname.toLowerCase();
          if (!allowedHosts.has(hostname)) {
            throw new Error(`${varName} must point to a local host in test mode (got: ${hostname})`);
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes('must point to a local host')) {
            throw err;
          }
          throw new Error(`${varName} is an invalid URL format in test mode`);
        }
      }
    }
  }

  return env;
}
