/**
 * Redacts phone numbers down to the last 4 digits (e.g. +91******1234).
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) {
    return `+91******${digits}`;
  }
  const last4 = digits.slice(-4);
  return `+91******${last4}`;
}

/**
 * Redacts email addresses for privacy compliance (e.g. j***e@example.com).
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : `${local[0]}***`;
  return `${visible}@${domain}`;
}

/**
 * Scrubs potential phone numbers, OTP codes, and auth secrets from arbitrary error strings
 * before logging or passing to telemetry.
 */
export function scrubSensitiveData(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // Redact 10+ digit mobile numbers
    .replace(/(?:\+?91)?[6-9]\d{9}/g, '+91******XXXX')
    // Redact query parameter credentials & OTP codes
    .replace(/(?:authkey|secret|token|otp)=([^&\s]+)/gi, '$1=[REDACTED]')
    // Redact JSON object fields for sensitive credentials & OTP
    .replace(/"(?:authkey|secret|token|otp)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"');
}
