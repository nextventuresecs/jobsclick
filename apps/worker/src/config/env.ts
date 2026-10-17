import { z } from 'zod';
import fs from 'node:fs';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SENTRY_DSN: z.string().optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  QSTASH_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  USE_MOCK_REDIS: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

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

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid Worker Environment Variables:', result.error.format());
    throw new Error('Worker environment variable validation failed');
  }
  return result.data;
}
