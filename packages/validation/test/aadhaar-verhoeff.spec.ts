import { describe, it, expect } from 'vitest';
import {
  validateVerhoeff,
  generateVerhoeffCheckDigit,
  scanFreeTextForAadhaar,
  IndianPhoneSchema,
  normalizeIndianPhone,
} from '../src/index.js';

/**
 * Test utility: Generates a valid 12-digit Aadhaar number starting with [2-9].
 */
function generateValidAadhaar(prefix11?: string): string {
  let base: string;
  if (prefix11 && prefix11.length === 11 && /^[2-9]\d{10}$/.test(prefix11)) {
    base = prefix11;
  } else {
    const first = Math.floor(2 + Math.random() * 8); // 2-9
    const rest = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
    base = `${first}${rest}`;
  }
  const check = generateVerhoeffCheckDigit(base);
  return `${base}${check}`;
}

describe('Item 7 & 9: Aadhaar Verhoeff Test Vectors & 91-Prefix False-Positive Analysis', () => {
  it('validates test vectors generated with the Verhoeff algorithm', () => {
    // Generate 50 valid Aadhaar test vectors
    for (let i = 0; i < 50; i++) {
      const validAadhaar = generateValidAadhaar();
      expect(validAadhaar).toHaveLength(12);
      expect(Number(validAadhaar[0])).toBeGreaterThanOrEqual(2);
      expect(Number(validAadhaar[0])).toBeLessThanOrEqual(9);
      expect(validateVerhoeff(validAadhaar)).toBe(true);
    }
  });

  it('generates check digits accurately for 11-digit prefixes', () => {
    const base = '23456789012';
    const check = generateVerhoeffCheckDigit(base);
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThanOrEqual(9);
    expect(validateVerhoeff(`${base}${check}`)).toBe(true);
  });

  it('rejects invalid test vectors (corrupted check digit, first digit 0 or 1, wrong length)', () => {
    const valid = generateValidAadhaar('23456789012');
    const validCheck = Number(valid.slice(-1));
    const corruptCheck = (validCheck + 1) % 10;
    const corrupted = `${valid.slice(0, 11)}${corruptCheck}`;

    expect(validateVerhoeff(corrupted)).toBe(false);

    // First digit 0 or 1
    const startsWith0 = `0${valid.slice(1)}`;
    const startsWith1 = `1${valid.slice(1)}`;
    const scan0 = scanFreeTextForAadhaar(`Notes: ${startsWith0}`);
    const scan1 = scanFreeTextForAadhaar(`Notes: ${startsWith1}`);
    expect(scan0.found).toBe(false);
    expect(scan1.found).toBe(false);

    // Wrong length (10 or 11 digits)
    expect(scanFreeTextForAadhaar('Phone 9876543210').found).toBe(false);
    expect(scanFreeTextForAadhaar('Id 98765432101').found).toBe(false);
  });

  it('detects valid Aadhaar in free-text columns regardless of formatting', () => {
    const raw = generateValidAadhaar('34567890123');
    const formattedWithSpaces = `${raw.slice(0, 4)} ${raw.slice(4, 8)} ${raw.slice(8)}`;
    const formattedWithDashes = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;

    const text1 = `Candidate profile remarks: verified identity card ${formattedWithSpaces} on 12/04.`;
    const scan1 = scanFreeTextForAadhaar(text1);
    expect(scan1.found).toBe(true);
    expect(scan1.matches).toContain(raw);

    const text2 = `Bio: Previous experience in Bhopal, UID: ${formattedWithDashes}.`;
    const scan2 = scanFreeTextForAadhaar(text2);
    expect(scan2.found).toBe(true);
    expect(scan2.matches).toContain(raw);
  });

  it('measures the 91-prefix false-positive rate on Indian telephone numbers (empirically ~10%)', () => {
    // Generate 1,000 synthetic Indian mobile numbers prefixed with 91: 91[6-9]XXXXXXXX
    const sampleSize = 1000;
    let falsePositives = 0;

    for (let i = 0; i < sampleSize; i++) {
      const firstMobileDigit = Math.floor(6 + Math.random() * 4); // 6, 7, 8, 9
      const restMobile = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
      const phoneWith91 = `91${firstMobileDigit}${restMobile}`;

      // Test against free-text Aadhaar scanner
      if (scanFreeTextForAadhaar(`Contact phone: ${phoneWith91}`).found) {
        falsePositives++;
      }
    }

    const falsePositiveRate = falsePositives / sampleSize;
    // Mathematically, exactly 1 in 10 random 12-digit numbers will satisfy the base-10 Verhoeff check.
    // In a sample of 1,000, the false positive rate should be ~10% (between 6% and 15%).
    expect(falsePositiveRate).toBeGreaterThanOrEqual(0.06);
    expect(falsePositiveRate).toBeLessThanOrEqual(0.15);
  });

  it('ensures 91-prefixed 12-digit phones are not rejected in phone columns', () => {
    // Test diverse 91-prefixed 12-digit mobile formats
    const phones = [
      '919876543210',
      '+919876543210',
      '91 9876543210',
      '+91 9876543210',
      '91-9876543210',
      '+91-9876543210',
      '916234567890',
      '917012345678',
      '918901234567',
    ];

    for (const rawPhone of phones) {
      const normalized = normalizeIndianPhone(rawPhone);
      expect(normalized).not.toBeNull();
      expect(normalized).toHaveLength(10);
      expect(normalized).toMatch(/^[6-9]\d{9}$/);

      // Verify IndianPhoneSchema accepts and canonicalizes
      const parsed = IndianPhoneSchema.safeParse(rawPhone);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toBe(normalized);
      }
    }
  });
});
