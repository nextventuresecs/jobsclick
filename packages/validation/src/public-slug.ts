import { z } from 'zod';

export const CROCKFORD_BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * 12-character Crockford base32 public slug schema (ID-02)
 * Crockford alphabet excludes letters I, L, O, U to avoid visual confusion.
 */
export const publicSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-km-np-tv-z]{12}$/, 'Must be a 12-character Crockford base32 slug');

/**
 * Generates an opaque, non-guessable 12-character Crockford base32 public slug
 * using cryptographic random bytes (ID-02).
 * Universal implementation using standard Web Crypto API (Node.js 18+, Edge runtime, browser).
 * Not derived from phone, email, timestamp, or any user data.
 */
export function generatePublicSlug(): string {
  const bytes = new Uint8Array(12);
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto as { getRandomValues: (arr: Uint8Array) => Uint8Array } | undefined) : undefined;
  if (!cryptoObj?.getRandomValues) {
    throw new Error('Cryptographically secure random number generator is not available in this environment');
  }
  cryptoObj.getRandomValues(bytes);

  let slug = '';
  for (let i = 0; i < 12; i++) {
    slug += CROCKFORD_BASE32_ALPHABET[bytes[i]! % 32];
  }
  return slug;
}

/**
 * Checks whether an input string is a valid UUID (v4/general).
 * Used to immediately reject UUIDs on public slug endpoints with 404 (no redirect).
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}
