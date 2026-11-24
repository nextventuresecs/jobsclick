import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isStrictEnv } from '@indian-job-portal/validation';

/**
 * Checks whether wallet recharge order creation is enabled.
 * Defaults to OFF (kill switch active) in production AND staging when unset (isStrictEnv).
 * Explicit true / 1 still enables.
 */
export function isWalletRechargeEnabled(): boolean {
  const flag = process.env['WALLET_ENABLED'];
  if (flag !== undefined) {
    const normalized = flag.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  // In production and staging (strict envs), default is OFF (kill-switch active)
  if (isStrictEnv()) {
    return false;
  }
  return true;
}

/**
 * Checks whether institution sponsorship order creation is enabled.
 * Defaults to OFF (kill switch active) in production AND staging when unset (isStrictEnv).
 * Explicit true / 1 still enables.
 */
export function isSponsorshipOrderEnabled(): boolean {
  const flag = process.env['SPONSORSHIP_ENABLED'];
  if (flag !== undefined) {
    const normalized = flag.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  // In production and staging (strict envs), default is OFF (kill-switch active)
  if (isStrictEnv()) {
    return false;
  }
  return true;
}

/**
 * Asserts that wallet recharge order creation is enabled.
 * When turned OFF, new order creation returns 503 Service Unavailable.
 * Note: Webhooks, /wallet/recharge/verify, refunds, and reconciliation remain live.
 */
export function assertWalletRechargeEnabled(): void {
  if (!isWalletRechargeEnabled()) {
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'WALLET_DISABLED',
      message: 'Recharge temporarily paused',
    });
  }
}

/**
 * Asserts that institution sponsorship order creation is enabled.
 * When turned OFF, new order creation returns 503 Service Unavailable.
 * Note: Quotes, existing sponsorships, webhooks, and reconciliation remain live.
 */
export function assertSponsorshipOrderEnabled(): void {
  if (!isSponsorshipOrderEnabled()) {
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'SPONSORSHIP_DISABLED',
      message: 'Sponsorship temporarily paused',
    });
  }
}

@Injectable()
export class WalletKillSwitchGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    assertWalletRechargeEnabled();
    return true;
  }
}

@Injectable()
export class SponsorshipKillSwitchGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    assertSponsorshipOrderEnabled();
    return true;
  }
}
