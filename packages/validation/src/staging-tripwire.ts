import { isStaging } from './runtime-env';

export const FORBIDDEN_PRODUCTION_PROJECT_REF = 'aspahsnclunutwiqliau';
export const DEFAULT_STAGING_PROJECT_REF = 'afxgvtfaofpnlhdsexnp';

export interface StagingTripwireOptions {
  /**
   * Whether DATABASE_URL is required to be set.
   * True for API, false for worker (where direct database connection may not be used).
   * Default: true.
   */
  requireDatabaseUrl?: boolean;
}

/**
 * Validates staging environment configurations against dangerous production-copy leaks.
 *
 * In staging, fails if:
 * 1. DATABASE_URL, DIRECT_URL, or SUPABASE_URL contains forbidden prod ref or does not contain staging ref.
 * 2. WEB_URL, APP_URL, API_URL host equals jobsclick.live or a subdomain not starting with staging./api-staging.
 * 3. RAZORPAY_KEY_ID starts with rzp_live_.
 * 4. SENTRY_DSN is empty.
 * 5. GOOGLE_CALLBACK_URL does not match https://<STAGING_PROJECT_REF>.supabase.co/auth/v1/callback,
 *    or contains forbidden prod ref, different ref, or api host.
 * 6. NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is enabled but GOOGLE_CALLBACK_URL is unset.
 *
 * NOTE: Never log the offending value; log only the variable name.
 */
export function validateStagingTripwire(
  rawSource: Record<string, string | undefined>,
  options?: StagingTripwireOptions,
): string[] {
  if (!isStaging(rawSource)) {
    return [];
  }

  const errors: string[] = [];
  const stagingRef = (rawSource['STAGING_PROJECT_REF'] ?? '').trim() || DEFAULT_STAGING_PROJECT_REF;
  const requireDatabaseUrl = options?.requireDatabaseUrl ?? true;

  // 1. DATABASE_URL
  const dbUrl = rawSource['DATABASE_URL'];
  if (requireDatabaseUrl && (!dbUrl || !dbUrl.trim())) {
    errors.push('DATABASE_URL must be set in staging');
  } else if (dbUrl && dbUrl.trim()) {
    if (dbUrl.includes(FORBIDDEN_PRODUCTION_PROJECT_REF)) {
      errors.push('DATABASE_URL contains forbidden production project ref in staging');
    }
    if (!dbUrl.includes(stagingRef)) {
      errors.push('DATABASE_URL must contain staging project ref in staging');
    }
  }

  // DIRECT_URL (optional connection string, but checked if present)
  const directUrl = rawSource['DIRECT_URL'];
  if (directUrl && directUrl.trim()) {
    if (directUrl.includes(FORBIDDEN_PRODUCTION_PROJECT_REF)) {
      errors.push('DIRECT_URL contains forbidden production project ref in staging');
    }
    if (!directUrl.includes(stagingRef)) {
      errors.push('DIRECT_URL must contain staging project ref in staging');
    }
  }

  // SUPABASE_URL
  const supabaseUrl = rawSource['SUPABASE_URL'];
  if (!supabaseUrl || !supabaseUrl.trim()) {
    errors.push('SUPABASE_URL must be set in staging');
  } else {
    if (supabaseUrl.includes(FORBIDDEN_PRODUCTION_PROJECT_REF)) {
      errors.push('SUPABASE_URL contains forbidden production project ref in staging');
    }
    if (!supabaseUrl.includes(stagingRef)) {
      errors.push('SUPABASE_URL must contain staging project ref in staging');
    }
  }

  // 2. Domain checks: WEB_URL, APP_URL, API_URL
  const domainVars = ['WEB_URL', 'APP_URL', 'API_URL'] as const;
  for (const varName of domainVars) {
    const val = rawSource[varName];
    if (val && val.trim()) {
      try {
        const parsed = new URL(val);
        const host = parsed.hostname.toLowerCase();
        const isJobsclickHost =
          host === 'jobsclick.live' ||
          host === 'jobsclick.in' ||
          host === 'jobsclick.com' ||
          host.endsWith('.jobsclick.live') ||
          host.endsWith('.jobsclick.in') ||
          host.endsWith('.jobsclick.com');

        if (isJobsclickHost) {
          if (host === 'jobsclick.live' || host === 'jobsclick.in' || host === 'jobsclick.com') {
            errors.push(`${varName} host must not be production domain in staging`);
          } else if (!host.startsWith('staging.') && !host.startsWith('api-staging.')) {
            errors.push(`${varName} host must not be a non-staging subdomain in staging`);
          }
        }
      } catch {
        errors.push(`${varName} is an invalid URL format in staging`);
      }
    }
  }

  // 3. RAZORPAY_KEY_ID
  const rzpKey = rawSource['RAZORPAY_KEY_ID'];
  if (rzpKey && rzpKey.startsWith('rzp_live_')) {
    errors.push('RAZORPAY_KEY_ID cannot use live key (rzp_live_*) in staging');
  }

  // 4. SENTRY_DSN
  const sentryDsn = rawSource['SENTRY_DSN'];
  if (!sentryDsn || !sentryDsn.trim()) {
    errors.push('SENTRY_DSN must be set in staging');
  }

  // 5. GOOGLE_CALLBACK_URL and NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN
  const enableGoogleRaw = rawSource['NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN'];
  const isGoogleLoginEnabled = enableGoogleRaw === 'true' || enableGoogleRaw === '1';
  const googleCallback = rawSource['GOOGLE_CALLBACK_URL'];

  if (isGoogleLoginEnabled && (!googleCallback || !googleCallback.trim())) {
    errors.push('GOOGLE_CALLBACK_URL must be set when NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is enabled in staging');
  } else if (googleCallback && googleCallback.trim()) {
    const expectedCallback = `https://${stagingRef}.supabase.co/auth/v1/callback`;
    if (googleCallback.includes(FORBIDDEN_PRODUCTION_PROJECT_REF)) {
      errors.push('GOOGLE_CALLBACK_URL contains forbidden production project ref in staging');
    } else if (googleCallback.includes('api-staging') || googleCallback.includes('api.')) {
      errors.push('GOOGLE_CALLBACK_URL must not point to api host in staging');
    } else if (!googleCallback.includes(stagingRef)) {
      errors.push('GOOGLE_CALLBACK_URL must contain staging project ref in staging');
    } else if (googleCallback !== expectedCallback) {
      errors.push('GOOGLE_CALLBACK_URL must equal https://<STAGING_PROJECT_REF>.supabase.co/auth/v1/callback in staging');
    }
  }

  return errors;
}

export function assertStagingTripwire(
  rawSource: Record<string, string | undefined>,
  options?: StagingTripwireOptions,
): void {
  const errors = validateStagingTripwire(rawSource, options);
  if (errors.length > 0) {
    throw new Error(`Staging configuration tripwire triggered:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}
