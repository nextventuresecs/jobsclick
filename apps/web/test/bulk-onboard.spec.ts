import { describe, it, expect } from 'vitest';
import { parseCsvContent } from '../src/components/workspaces/institution/csvParser';

describe('Web CSV Parser (Contact-Only Support)', () => {
  it('accepts rows with email only or phone only', () => {
    const csv = 'student_name,email,phone\nAlice,alice@college.edu,\nBob,,9876543210';
    const { rows, error } = parseCsvContent(csv);
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.errors).toHaveLength(0);
    expect(rows[1]?.errors).toHaveLength(0);
  });

  it('flags rows with neither valid email nor valid phone', () => {
    const csv = 'student_name,email,phone\nCharlie,invalid-email,12345';
    const { rows } = parseCsvContent(csv);
    expect(rows[0]?.errors.length).toBeGreaterThan(0);
  });
});
