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
  | 'ENABLE_P2_FEATURED_PROMOTIONS';

/**
 * Decorator to enforce a specific feature flag on a controller class or route handler.
 * If the configured environment variable is false, requests are rejected with 404 (Feature Disabled).
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

    // If no flag is associated with this route/controller, pass through
    if (!requiredFlag) {
      return true;
    }

    const flagVal = process.env[requiredFlag];
    // Flags are considered enabled unless explicitly set to 'false'
    const isEnabled = flagVal !== 'false';

    if (!isEnabled) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'FEATURE_DISABLED',
        message: `Endpoint disabled: Feature flag '${requiredFlag}' is inactive.`,
      });
    }

    return true;
  }
}
