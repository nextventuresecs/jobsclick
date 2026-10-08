import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SENTRY_DSN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid Worker Environment Variables:', result.error.format());
    throw new Error('Worker environment variable validation failed');
  }
  return result.data;
}
