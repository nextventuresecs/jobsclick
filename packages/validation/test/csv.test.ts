import { describe, it, expect } from 'vitest';
import { parseSharedCsv, normalizeIndianPhone, normalizeEmail } from '../src/index.js';

describe('Shared RFC-4180 CSV & Contact Normalizer', () => {
  it('parses CSV with BOM, quotes, and commas cleanly', () => {
    const csv = '\uFEFF"email","phone"\n"candidate@example.com","+91 98765 43210"\n"student2@test.in",';
    const parsed = parseSharedCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.['email']).toBe('candidate@example.com');
    expect(normalizeIndianPhone(parsed[0]?.['phone'])).toBe('9876543210');
    expect(normalizeEmail(parsed[1]?.['email'])).toBe('student2@test.in');
  });

  it('normalizes Indian mobile numbers to 10 digits and rejects invalid formats', () => {
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('91-9876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('+919876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('12345')).toBeNull();
    expect(normalizeIndianPhone('5876543210')).toBeNull();
  });

  it('normalizes emails to lowercase and rejects malformed values', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    expect(normalizeEmail('invalid-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});
