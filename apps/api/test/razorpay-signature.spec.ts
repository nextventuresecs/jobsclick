import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyHmacHex, verifyCheckoutSignature } from '../src/wallet/razorpay-signature.js';

const secret = 'whsec_' + 'a'.repeat(32);
const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
const good = createHmac('sha256', secret).update(body).digest('hex');

describe('Razorpay Signature Verification', () => {
  it('accepts the exact bytes + correct secret', () =>
    expect(verifyHmacHex(body, good, secret)).toBe(true));

  it('rejects altered bytes', () =>
    expect(verifyHmacHex(Buffer.concat([body, Buffer.from(' ')]), good, secret)).toBe(false));

  it('rejects wrong secret', () =>
    expect(verifyHmacHex(body, good, secret + 'x')).toBe(false));

  it.each([
    '',
    'wrong_hex_sig',
    good.slice(0, 62),
    good + '00',
    good.toUpperCase().replace(/[0-9A-F]/g, 'G'),
  ])('returns false (never throws) for malformed signature %#', (sig) =>
    expect(verifyHmacHex(body, sig, secret)).toBe(false),
  );

  it('checkout signature = HMAC(order|payment, keySecret)', () => {
    const s = createHmac('sha256', 'k'.repeat(20)).update('order_1|pay_1').digest('hex');
    expect(verifyCheckoutSignature('order_1', 'pay_1', s, 'k'.repeat(20))).toBe(true);
    expect(verifyCheckoutSignature('order_1', 'pay_2', s, 'k'.repeat(20))).toBe(false);
  });
});
