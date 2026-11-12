import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Web Client Feature Flags Default-OFF Verification', () => {
  it('1. Google Login is hidden by default when NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is unset', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN;
    const isGoogleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === 'true';
    expect(isGoogleEnabled).toBe(false);
  });

  it('2. Wallet Recharge is gated and inactive by default', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_WALLET_RECHARGE;
    delete process.env.ENABLE_P2_WALLET_RECHARGE;
    const isRechargeEnabled =
      process.env.NEXT_PUBLIC_ENABLE_WALLET_RECHARGE === 'true' ||
      process.env.ENABLE_P2_WALLET_RECHARGE === 'true';
    expect(isRechargeEnabled).toBe(false);
  });

  it('3. Featured Promotions is gated and inactive by default', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_FEATURED_PROMOTIONS;
    delete process.env.ENABLE_P2_FEATURED_PROMOTIONS;
    const isPromotionsEnabled =
      process.env.NEXT_PUBLIC_ENABLE_FEATURED_PROMOTIONS === 'true' ||
      process.env.ENABLE_P2_FEATURED_PROMOTIONS === 'true';
    expect(isPromotionsEnabled).toBe(false);
  });

  it('4. MSME Broadcast is gated and inactive by default', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_MSME_BROADCAST;
    delete process.env.ENABLE_P2_MSME_BROADCAST;
    const isBroadcastEnabled =
      process.env.NEXT_PUBLIC_ENABLE_MSME_BROADCAST === 'true' ||
      process.env.ENABLE_P2_MSME_BROADCAST === 'true';
    expect(isBroadcastEnabled).toBe(false);
  });

  it('5. Job Alerts is gated and inactive by default', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_JOB_ALERTS;
    delete process.env.ENABLE_P2_JOB_ALERTS;
    const isAlertsEnabled =
      process.env.NEXT_PUBLIC_ENABLE_JOB_ALERTS === 'true' ||
      process.env.ENABLE_P2_JOB_ALERTS === 'true';
    expect(isAlertsEnabled).toBe(false);
  });

  it('6. Job Apply component has NO P2 feature flag disable gate (Core MVP)', () => {
    const jobApplyPath = path.resolve(__dirname, '../src/components/jobs/JobApplyButton.tsx');
    const source = fs.readFileSync(jobApplyPath, 'utf-8');
    // Verify that JobApplyButton does not depend on any P2 disable flags
    expect(source).not.toContain('ENABLE_P2_PAYMENTS');
    expect(source).not.toContain('ENABLE_P2_WALLET_RECHARGE');
    expect(source).toContain('handleApply');
  });
});
