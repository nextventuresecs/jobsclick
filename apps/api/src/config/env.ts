import { z } from 'zod';
import fs from 'node:fs';
import net from 'node:net';

/** Cloudflare always-pass / always-fail test keys that must never reach production. */
const TURNSTILE_TEST_KEYS = new Set([
  '1x0000000000000000000000000000000AA',  // always passes
  '2x0000000000000000000000000000000AA',  // always blocks
  '3x0000000000000000000000000000000AA',  // always challenges (managed)
]);

const TURNSTILE_KEY_REGEX = /^0x[A-Za-z0-9_-]{20,}$/;
const PLACEHOLDER_REGEX = /change-?me|example|dummy|test|secret-key/i;

function isValidCidrOrIp(entry: string): boolean {
  const parts = entry.split('/');
  if (parts.length > 2) return false;
  const ip = parts[0] ?? '';
  const prefixStr = parts[1];
  const ipType = net.isIP(ip);
  if (ipType === 0) return false;
  if (prefixStr !== undefined) {
    if (!/^\d+$/.test(prefixStr)) return false;
    const prefix = Number(prefixStr);
    if (ipType === 4 && (prefix < 0 || prefix > 32)) return false;
    if (ipType === 6 && (prefix < 0 || prefix > 128)) return false;
  }
  return true;
}

const baseSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
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
  // Authentication & Administrative Security
  JWT_SECRET: z.string().optional(),
  JWT_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().min(1).max(60).default(30),
  OTP_PEPPER: z.string().optional(),
  ADMIN_DASHBOARD_SECRET: z.string().optional(),
  // SMS gateway mode
  SMS_GATEWAY_MODE: z.enum(['mock', 'sandbox', 'live']).optional(),
  // Razorpay Payment Gateway (WAL-03)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  ALLOW_TEST_PAYMENTS: z.coerce.boolean().default(false),
  // Feature Flags (PRN-06: Scope Isolation for P2/P3 Modules)
  ENABLE_P2_PAYMENTS: z.coerce.boolean().default(true),
  ENABLE_P2_WALLET_RECHARGE: z.coerce.boolean().default(true),
  ENABLE_P2_PLACEMENT_PIPELINE: z.coerce.boolean().default(true),
  ENABLE_P2_FEATURED_PROMOTIONS: z.coerce.boolean().default(true),
  // Dev/test-only flags — must be unset in production / staging
  USE_MOCK_REDIS: z.string().optional(),
  USE_JSON_STORE: z.string().optional(),
  VITEST: z.string().optional(),
  // Redis TLS opt-out (production only, explicit)
  REDIS_ALLOW_PLAINTEXT: z.string().optional(),
  // Test-mode host gate options
  TEST_ALLOWED_HOSTS: z.string().optional(),
  // Reverse Proxy & Cloudflare network hardening (AUTH-03, PR #97 B4)
  TRUSTED_PROXY_CIDRS: z.string().optional(),
  CF_ORIGIN_LOCKED: z.coerce.boolean().default(false),
  // OTP rate limit thresholds (AUTH-03)
  // Bounded coerced ints: cooldown 30-600s, ip/hour 1-10000, ip_phone/day 1-100, phone/day 1-50
  OTP_COOLDOWN_SEC: z.coerce.number().int().min(30).max(600).default(60),
  OTP_IP_PER_HOUR: z.coerce.number().int().min(1).max(10000).default(200),
  OTP_IP_PHONE_PER_DAY: z.coerce.number().int().min(1).max(100).default(5),
  OTP_PHONE_PER_DAY: z.coerce.number().int().min(1).max(50).default(10),
  OTP_VERIFY_IP_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(30),
}).passthrough();

export type EnvConfig = z.infer<typeof baseSchema>;

/**
 * Strict environment check: unset NODE_ENV counts as strict.
 * Only 'development' and 'test' are non-strict.
 */
export function isStrictEnv(rawNodeEnv?: string): boolean {
  const env = rawNodeEnv !== undefined ? rawNodeEnv.trim().toLowerCase() : (process.env['NODE_ENV'] ?? '').trim().toLowerCase();
  return env !== 'development' && env !== 'test';
}

/**
 * Validates and returns the parsed environment.
 * Accepts an optional `overrides` map so callers and tests can validate in isolation.
 */
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

  // ── Production / Staging guards (Evaluated on RAW source before Zod defaults) ──
  if (!isDevOrTest) {
    const errors: string[] = [];

    // DATABASE_URL: raw required, reject localhost/127.0.0.1, reject postgres:postgres
    const dbUrlRaw = rawSource['DATABASE_URL'];
    if (!dbUrlRaw || !dbUrlRaw.trim()) {
      errors.push('DATABASE_URL must be set on raw environment');
    } else {
      try {
        const parsedDb = new URL(dbUrlRaw);
        const host = parsedDb.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
          errors.push('DATABASE_URL must not point to localhost or 127.0.0.1 in production/staging');
        }
        if (parsedDb.username === 'postgres' && parsedDb.password === 'postgres') {
          errors.push('DATABASE_URL must not use default postgres:postgres credentials in production/staging');
        }
      } catch {
        if (dbUrlRaw.includes('localhost') || dbUrlRaw.includes('127.0.0.1')) {
          errors.push('DATABASE_URL must not point to localhost in production/staging');
        }
        if (dbUrlRaw.includes('postgres:postgres')) {
          errors.push('DATABASE_URL must not use default postgres:postgres credentials in production/staging');
        }
      }
      if (dbUrlRaw === 'dummy-service-role-key' || dbUrlRaw.toLowerCase().includes('dummy')) {
        errors.push('DATABASE_URL must not contain dummy or placeholder values');
      }
    }

    // REDIS_URL: raw required, reject localhost/127.0.0.1, enforce rediss:// unless opt-out
    const redisUrlRaw = rawSource['REDIS_URL'];
    if (!redisUrlRaw || !redisUrlRaw.trim()) {
      errors.push('REDIS_URL must be set on raw environment');
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

      if (rawSource['REDIS_ALLOW_PLAINTEXT'] !== '1' && !redisUrlRaw.startsWith('rediss://')) {
        errors.push('REDIS_URL must start with rediss:// in production/staging (set REDIS_ALLOW_PLAINTEXT=1 to override)');
      }
    }

    // SUPABASE_URL: raw required
    const supabaseUrlRaw = rawSource['SUPABASE_URL'];
    if (!supabaseUrlRaw || !supabaseUrlRaw.trim()) {
      errors.push('SUPABASE_URL must be set on raw environment');
    }

    // JWT_SECRET: required, minimum 32 characters, no placeholders
    const jwt = rawSource['JWT_SECRET'];
    if (!jwt || jwt.length < 32) {
      errors.push('JWT_SECRET must be set and at least 32 characters in production/staging');
    } else if (PLACEHOLDER_REGEX.test(jwt)) {
      errors.push('JWT_SECRET must not contain placeholder or test values in production/staging');
    }

    // OTP_PEPPER: required, minimum 32 characters, no placeholders
    const pepper = rawSource['OTP_PEPPER'];
    if (!pepper || pepper.length < 32) {
      errors.push('OTP_PEPPER must be set and at least 32 characters in production/staging');
    } else if (PLACEHOLDER_REGEX.test(pepper)) {
      errors.push('OTP_PEPPER must not contain placeholder or test values in production/staging');
    }

    // JWT_SECRET !== OTP_PEPPER
    if (jwt && pepper && jwt === pepper) {
      errors.push('JWT_SECRET and OTP_PEPPER must not be identical');
    }

    // SMS_GATEWAY_MODE must be 'live'
    if (rawSource['SMS_GATEWAY_MODE'] !== 'live') {
      errors.push("SMS_GATEWAY_MODE must be 'live' in production/staging");
    }

    // MSG91_AUTH_KEY: required, non-dummy
    const msg91 = rawSource['MSG91_AUTH_KEY'];
    if (!msg91 || !msg91.trim() || PLACEHOLDER_REGEX.test(msg91)) {
      errors.push('MSG91_AUTH_KEY must be set and not a placeholder/dummy value in production/staging');
    }

    // TURNSTILE_SECRET_KEY: must be set, match /^0x[A-Za-z0-9_-]{20,}$/, and not Cloudflare test key
    const turnstile = rawSource['TURNSTILE_SECRET_KEY'];
    if (!turnstile || !turnstile.trim()) {
      errors.push('TURNSTILE_SECRET_KEY must be set in production/staging');
    } else if (TURNSTILE_TEST_KEYS.has(turnstile) || !TURNSTILE_KEY_REGEX.test(turnstile)) {
      errors.push('TURNSTILE_SECRET_KEY must match /^0x[A-Za-z0-9_-]{20,}$/ and not be a Cloudflare test key');
    }

    // SUPABASE_SERVICE_ROLE_KEY: required, no placeholders
    const sRole = rawSource['SUPABASE_SERVICE_ROLE_KEY'];
    if (!sRole || !sRole.trim() || PLACEHOLDER_REGEX.test(sRole)) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY must be set and not a placeholder/dummy value in production/staging');
    }

    // Dev/test-only flags must be unset
    if (rawSource['USE_MOCK_REDIS']) {
      errors.push('USE_MOCK_REDIS must not be set in production/staging');
    }
    if (rawSource['VITEST']) {
      errors.push('VITEST must not be set in production/staging');
    }
    if (rawSource['USE_JSON_STORE']) {
      errors.push('USE_JSON_STORE must not be set in production/staging');
    }

    // API_URL HTTPS check in production
    const apiUrl = rawSource['API_URL'];
    if (apiUrl && !apiUrl.startsWith('https://')) {
      errors.push(`API_URL must use HTTPS in production. Got: ${apiUrl}`);
    }

    // TRUSTED_PROXY_CIDRS: required in production/staging; must be valid CIDRs and reject 0.0.0.0/0 & ::/0
    const trustedProxiesRaw = rawSource['TRUSTED_PROXY_CIDRS'];
    if (!trustedProxiesRaw || !trustedProxiesRaw.trim()) {
      errors.push('TRUSTED_PROXY_CIDRS must be set in production/staging');
    } else {
      const cidrEntries = trustedProxiesRaw.split(',').map((s) => s.trim()).filter(Boolean);
      if (cidrEntries.length === 0) {
        errors.push('TRUSTED_PROXY_CIDRS must contain at least one valid CIDR or IP in production/staging');
      }
      for (const entry of cidrEntries) {
        if (entry === '0.0.0.0/0' || entry === '::/0') {
          errors.push(`TRUSTED_PROXY_CIDRS must not allow all addresses (${entry}) in production/staging`);
        } else if (!isValidCidrOrIp(entry)) {
          errors.push(`TRUSTED_PROXY_CIDRS contains invalid CIDR or IP: "${entry}" in production/staging`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Unsafe configuration for ${rawSource['NODE_ENV'] || 'production'}:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      );
    }
  }

  // Parse environment with Zod Schema
  const result = baseSchema.safeParse(rawSource);
  if (!result.success) {
    console.error('Invalid API Environment Variables:', result.error.format());
    throw new Error('Environment variable validation failed');
  }

  const env = result.data;

  // ── Test-mode safety gate: hostnames must parse with new URL() and reside in allowed local hosts ──
  if (rawNodeEnv === 'test') {
    const customAllowed = (rawSource['TEST_ALLOWED_HOSTS'] ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal', ...customAllowed]);

    const targetUrlVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'SUPABASE_URL',

    ] as const;

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
