import { describe, it, expect } from 'vitest';
import {
  SPONSORSHIP_TIERS,
  computeSponsorshipQuote,
  sponsorshipOrderSnapshotSchema,
} from '../src/wallet';

describe('Sponsorship Pricing & Quote Computation (Single source, integer paise)', () => {
  const instId = '11111111-1111-1111-1111-111111111111';

  it('exports valid tier configuration constants', () => {
    expect(SPONSORSHIP_TIERS.Small.ratePaise).toBe(15000);
    expect(SPONSORSHIP_TIERS.Medium.ratePaise).toBe(10000);
    expect(SPONSORSHIP_TIERS.Large.ratePaise).toBe(7000);
  });

  it('selects Small tier for <= 2000 students (Rs 150/student/year)', () => {
    const q1 = computeSponsorshipQuote(instId, 1);
    expect(q1.tier).toBe('Small');
    expect(q1.ratePaise).toBe(15000);
    expect(q1.subtotalPaise).toBe(15000);
    expect(q1.gstPaise).toBe(2700); // 150 * 18% = 27
    expect(q1.totalPaise).toBe(17700);

    const q2000 = computeSponsorshipQuote(instId, 2000);
    expect(q2000.tier).toBe('Small');
    expect(q2000.ratePaise).toBe(15000);
    expect(q2000.subtotalPaise).toBe(30000000); // 2000 * 15000
    expect(q2000.gstPaise).toBe(5400000); // 18% of 30,000,000
    expect(q2000.totalPaise).toBe(35400000);
  });

  it('selects Medium tier for 2001 - 10000 students (Rs 100/student/year)', () => {
    const q2001 = computeSponsorshipQuote(instId, 2001);
    expect(q2001.tier).toBe('Medium');
    expect(q2001.ratePaise).toBe(10000);
    expect(q2001.subtotalPaise).toBe(20010000);
    expect(q2001.gstPaise).toBe(3601800);
    expect(q2001.totalPaise).toBe(23611800);

    const q10000 = computeSponsorshipQuote(instId, 10000);
    expect(q10000.tier).toBe('Medium');
    expect(q10000.ratePaise).toBe(10000);
    expect(q10000.subtotalPaise).toBe(100000000);
    expect(q10000.gstPaise).toBe(18000000);
    expect(q10000.totalPaise).toBe(118000000);
  });

  it('selects Large tier for 10001+ students (Rs 70/student/year)', () => {
    const q10001 = computeSponsorshipQuote(instId, 10001);
    expect(q10001.tier).toBe('Large');
    expect(q10001.ratePaise).toBe(7000);
    expect(q10001.subtotalPaise).toBe(70007000);
    expect(q10001.gstPaise).toBe(12601260);
    expect(q10001.totalPaise).toBe(82608260);
  });

  it('validates against sponsorshipOrderSnapshotSchema', () => {
    const q = computeSponsorshipQuote(instId, 500);
    const parsed = sponsorshipOrderSnapshotSchema.parse(q);
    expect(parsed.institutionId).toBe(instId);
    expect(parsed.studentCap).toBe(500);
    expect(parsed.termDays).toBe(365);
    expect(parsed.pricingVersion).toBe('2026.1');
  });

  it('rejects invalid student count', () => {
    expect(() => computeSponsorshipQuote(instId, 0)).toThrow();
    expect(() => computeSponsorshipQuote(instId, -5)).toThrow();
    expect(() => computeSponsorshipQuote(instId, 1.5)).toThrow();
  });
});
