import { z } from 'zod';

/**
 * Validates and normalizes URLs to ensure only http and https protocols are permitted.
 * Strictly blocks dangerous schemes (javascript:, data:, vbscript:, file:, etc.)
 * and URL polyglot bypasses such as javascript://www.youtube.com/%0aalert(1).
 *
 * @param input Raw URL or domain string.
 * @returns Safe normalized URL string, or null if invalid or unsafe.
 */
export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || /[\x00-\x1F\x7F]/.test(trimmed)) return null;

  try {
    // If the input specifies an explicit URI scheme (e.g. scheme:...)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      if (!parsed.hostname || parsed.hostname.length === 0) {
        return null;
      }
      return parsed.href;
    }

    // Reject protocol-relative or leading slash/backslash patterns
    if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
      return null;
    }

    // Treat bare domain or host paths as https://
    const parsed = new URL(`https://${trimmed}`);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Zod schema that enforces safe http/https URLs and rejects javascript: or other unsafe schemes.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return false;
      return safeHttpUrl(val) !== null;
    },
    { message: 'Invalid URL: must use http or https protocol' }
  );

/**
 * Optional or empty safe http/https URL schema.
 */
export const optionalHttpUrlSchema = httpUrlSchema.optional().or(z.literal(''));
