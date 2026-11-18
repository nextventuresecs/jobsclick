import { describe, expect, it } from 'vitest';
import { normalizeEmail, AddEmailSchema, normalizeIndianPhone, IndianPhoneSchema } from '../src/auth.js';

describe('AUTH-01 canonical email', () => {
  it('uses one canonical value for verification inputs and identity lookups', () => {
    expect(normalizeEmail('  Person+Jobs@Example.INVALID  ')).toBe('person+jobs@example.invalid');
    expect(AddEmailSchema.parse({ email: '  Person+Jobs@Example.INVALID  ' }).email).toBe('person+jobs@example.invalid');
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });

  it.each(['person@example.invalid\n', '\tperson@example.invalid', 'a\u0000b@example.invalid', 'invalid', 'a'.repeat(255) + '@example.invalid'])('rejects unsafe or invalid email input %#', raw => {
    expect(normalizeEmail(raw)).toBeNull();
    expect(AddEmailSchema.safeParse({ email: raw }).success).toBe(false);
  });

  it.each(['abc9876543210', '++919876543210', '98765\n43210', '9876543210\t'])('never extracts a phone identity from malformed input %#', raw => {
    expect(normalizeIndianPhone(raw)).toBeNull();
    expect(IndianPhoneSchema.safeParse(raw).success).toBe(false);
  });
});
