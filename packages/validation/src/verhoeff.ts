// Verhoeff algorithm tables (Dihedral group D5)
const d = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const p = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates a numeric string against the Verhoeff checksum.
 */
export function validateVerhoeff(numStr: string): boolean {
  let c = 0;
  const digits = numStr.replace(/\D/g, '').split('').map(Number).reverse();
  if (digits.length === 0) return false;
  for (let i = 0; i < digits.length; i++) {
    const digit = digits[i]!;
    const permRow = p[i % 8]!;
    c = d[c]![permRow[digit]!]!;
  }
  return c === 0;
}

/**
 * Generates the Verhoeff check digit for an 11-digit string.
 */
export function generateVerhoeffCheckDigit(num11Str: string): number {
  let c = 0;
  const digits = num11Str.replace(/\D/g, '').split('').map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    const digit = digits[i]!;
    const permRow = p[(i + 1) % 8]!;
    c = d[c]![permRow[digit]!]!;
  }
  return inv[c]!;
}

/**
 * Scans free-text columns for Aadhaar numbers:
 * 12 digits, first digit 2-9, valid Verhoeff checksum.
 */
export function scanFreeTextForAadhaar(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  // Match potential 12-digit sequences with optional spaces or hyphens
  const regex = /\b([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1]!;
    const normalized = raw.replace(/[\s-]/g, '');
    if (normalized.length === 12 && validateVerhoeff(normalized)) {
      matches.push(normalized);
    }
  }
  return { found: matches.length > 0, matches };
}
