import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Wallet & Sponsorship i18n Parity (Hard Invariant #8a)', () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const hiPath = path.resolve(__dirname, '../messages/hi.json');

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));

  const namespaces = ['wallet', 'sponsorship'] as const;

  for (const ns of namespaces) {
    describe(`Namespace: ${ns}`, () => {
      it(`has exact key parity between en and hi for ${ns}`, () => {
        expect(en[ns]).toBeDefined();
        expect(hi[ns]).toBeDefined();

        const enKeys = Object.keys(en[ns]).sort();
        const hiKeys = Object.keys(hi[ns]).sort();

        const missingInHi = enKeys.filter((k) => !hiKeys.includes(k));
        const missingInEn = hiKeys.filter((k) => !enKeys.includes(k));

        expect(missingInHi, `Keys in en.${ns} missing from hi.${ns}`).toEqual([]);
        expect(missingInEn, `Keys in hi.${ns} missing from en.${ns}`).toEqual([]);
      });

      it(`ensures all Hindi strings in ${ns} are non-empty and not identical to English`, () => {
        const enKeys = Object.keys(en[ns]);

        for (const key of enKeys) {
          const enVal = en[ns][key];
          const hiVal = hi[ns][key];

          expect(typeof hiVal).toBe('string');
          expect(hiVal.trim().length).toBeGreaterThan(0);

          // Ensure Hindi is translated, not copied English prose
          expect(
            hiVal,
            `Hindi value for ${ns}.${key} should not be identical to English ("${enVal}")`
          ).not.toBe(enVal);
        }
      });
    });
  }

  it('ensures RechargeModal and SponsorshipCard do not contain legacy fallback simulation markers', () => {
    const rechargeModalPath = path.resolve(__dirname, '../src/components/wallet/RechargeModal.tsx');
    const sponsorshipCardPath = path.resolve(
      __dirname,
      '../src/components/workspaces/institution/SponsorshipCard.tsx'
    );

    const rechargeContent = fs.readFileSync(rechargeModalPath, 'utf8');
    const sponsorshipContent = fs.readFileSync(sponsorshipCardPath, 'utf8');

    expect(rechargeContent).not.toContain('NEXT_PUBLIC_RAZORPAY_KEY_ID');
    expect(rechargeContent).not.toContain('Fallback simulation');
    expect(rechargeContent).not.toContain('DIRECT_WEB_');

    expect(sponsorshipContent).not.toContain('Fallback simulation');
    expect(sponsorshipContent).not.toContain('DIRECT_WEB_');
    expect(sponsorshipContent).not.toContain('localStorage');
  });
});
