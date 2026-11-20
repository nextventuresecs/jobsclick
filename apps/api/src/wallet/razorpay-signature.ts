import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Validates an HMAC-SHA256 hexadecimal signature using constant-time comparison.
 * Requires exactly 64 hex characters (256 bits).
 * Never throws regardless of malformed inputs.
 */
export function verifyHmacHex(message: string | Buffer, sigHex: string, secret: string): boolean {
  if (typeof sigHex !== 'string' || !/^[0-9a-f]{64}$/i.test(sigHex)) {
    return false;
  }
  try {
    const expected = createHmac('sha256', secret).update(message).digest();
    const given = Buffer.from(sigHex, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

/**
 * Validates direct client checkout signature from Razorpay.
 * Expected message: `${orderId}|${paymentId}`
 */
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  sig: string,
  keySecret: string,
): boolean {
  return verifyHmacHex(`${orderId}|${paymentId}`, sig, keySecret);
}
