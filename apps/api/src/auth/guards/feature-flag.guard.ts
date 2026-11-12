import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  SetMetadata,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const FEATURE_FLAG_KEY = 'feature_flag';

export type FeatureFlagName =
  | 'ENABLE_P2_PAYMENTS'
  | 'ENABLE_P2_WALLET_RECHARGE'
  | 'ENABLE_P2_PLACEMENT_PIPELINE'
  | 'ENABLE_P2_FEATURED_PROMOTIONS'
  | 'ENABLE_P2_JOB_ALERTS'
  | 'ENABLE_P2_MSME_BROADCAST';

/**
 * Decorator to enforce a specific feature flag on a controller class or route handler.
 * If the configured environment variable is false or unset, requests are rejected with 404 (Feature Disabled).
 */
export const RequireFeatureFlag = (flag: FeatureFlagName) =>
  SetMetadata(FEATURE_FLAG_KEY, flag);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFlag = this.reflector.getAllAndOverride<FeatureFlagName>(
      FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Dynamic inspection for routes without explicit decorator
    let flagToCheck = requiredFlag;
    if (!flagToCheck) {
      const http = context.switchToHttp();
      const req = http.getRequest<{ url?: string; raw?: { url?: string } }>();
      const url = req?.url || req?.raw?.url || '';
      if (url.startsWith('/jobs/alerts')) {
        flagToCheck = 'ENABLE_P2_JOB_ALERTS';
      } else if (url.startsWith('/admin/broadcast')) {
        flagToCheck = 'ENABLE_P2_MSME_BROADCAST';
      }
    }

    // If no flag is associated with this route/controller, pass through
    if (!flagToCheck) {
      return true;
    }

    const flagVal = process.env[flagToCheck];
    // Security Baseline / Default-OFF: Flags are disabled by default unless explicitly set to 'true'
    const isEnabled = flagVal === 'true';

    if (!isEnabled) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'FEATURE_DISABLED',
        message: `Endpoint disabled: Feature flag '${flagToCheck}' is inactive.`,
      });
    }

    return true;
  }
}
