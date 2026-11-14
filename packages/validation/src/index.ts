import { z } from 'zod';
export { z } from 'zod';

export const safeBoolean = z
  .preprocess((val) => {
    if (val === undefined || val === null || val === '') return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') {
      if (val === 1) return true;
      if (val === 0) return false;
      return val;
    }
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
      return val;
    }
    return val;
  }, z.boolean({ invalid_type_error: "Invalid boolean value: must be 'true', 'false', '1', '0', or empty" }))
  .default(false);

export * from './auth';
export * from './jobs';
export * from './profiles';
export * from './bulk';
export * from './admin';
export * from './resume';
export * from './wallet';
export * from './placement';
export * from './placement-fsm';
export * from './admin/broadcast';
export * from './institution-cms';
export * from './scrubber';
export * from './safe-url';

export const PLACEHOLDER_SECRET_REGEX = /change-?me|example|dummy|test|secret-key|jwt-secret|password|default|placeholder|12345678|abcdef/i;

/**
 * Validates production/staging JWT secret key format and decoded length.
 *
 * Requirements:
 * 1. Key Format: Exactly 64 hexadecimal characters (/^[0-9a-fA-F]{64}$/).
 * 2. Decoded Length: Decodes to exactly 32 bytes (256-bit key material for HS256 HMAC-SHA256).
 * 3. Weak Pattern Defense: Rejects known placeholder names and obvious repeating patterns.
 * 4. Operational Requirement: Operators must generate production keys using a CSPRNG (e.g. 'openssl rand -hex 32').
 *    Static string validation checks format and rejects known weak patterns, but cannot mathematically prove CSPRNG origin.
 * 5. Secret Safety: The key value is NEVER logged or echoed in error messages.
 */
export function validateProductionJwtKey(keyName: string, key?: string): string | null {
  if (!key || key.trim().length === 0) {
    return keyName + ' must be set in production/staging';
  }
  const trimmed = key.trim();
  // Check for placeholder/test substrings first for clear diagnostic
  if (PLACEHOLDER_SECRET_REGEX.test(trimmed)) {
    return keyName + ' must not contain placeholder, default, or test values in production/staging';
  }
  if (trimmed.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return keyName + " must be a 64-character hexadecimal string decoding to 32 bytes in production/staging (operational requirement: generate via CSPRNG e.g. 'openssl rand -hex 32')";
  }
  const byteLength = Buffer.from(trimmed, 'hex').length;
  if (byteLength !== 32) {
    return keyName + ' must decode to exactly 32 bytes (got ' + byteLength + ' bytes)';
  }
  if (/(.)\1{15,}/.test(trimmed)) {
    return keyName + ' contains an obvious weak repeating pattern';
  }
  return null;
}

/**
 * Validates general cryptographic secrets (e.g. OTP_PEPPER, ADMIN_DASHBOARD_SECRET)
 * against minimum length and placeholder requirements without imposing JWT-specific
 * 64-character hexadecimal formatting.
 */
export function validateSecretKey(keyName: string, key?: string, minLength = 32): string | null {
  if (!key || key.trim().length === 0) {
    return keyName + ' must be set in production/staging';
  }
  const trimmed = key.trim();
  if (trimmed.length < minLength) {
    return keyName + ' must be at least ' + minLength + ' characters in production/staging';
  }
  if (PLACEHOLDER_SECRET_REGEX.test(trimmed)) {
    return keyName + ' must not contain placeholder, default, or test values in production/staging';
  }
  return null;
}
