/**
 * Central runtime environment helper for Indian Job Portal.
 * Shared across apps/api, apps/worker, apps/web, and packages.
 *
 * Source evaluation order:
 * 1. APP_ENV (trimmed, lowercase)
 * 2. NODE_ENV (trimmed, lowercase)
 *
 * Unset or unknown values default to 'production' (fail-closed strict).
 */

export type AppEnv = 'production' | 'staging' | 'test' | 'development';

export function getAppEnv(source?: Record<string, string | undefined>): AppEnv {
  const envSource = source ?? (typeof process !== 'undefined' ? process.env : {});
  const rawAppEnv = envSource['APP_ENV'] || envSource['NEXT_PUBLIC_APP_ENV'];
  const rawNodeEnv = envSource['NODE_ENV'];

  const candidate =
    rawAppEnv !== undefined && rawAppEnv !== null && rawAppEnv.trim() !== ''
      ? rawAppEnv.trim().toLowerCase()
      : rawNodeEnv !== undefined && rawNodeEnv !== null && rawNodeEnv.trim() !== ''
        ? rawNodeEnv.trim().toLowerCase()
        : '';

  if (candidate === 'staging') return 'staging';
  if (candidate === 'test') return 'test';
  if (candidate === 'development' || candidate === 'dev') return 'development';
  // Unset or unknown values are treated as production (strict fail-closed)
  return 'production';
}

export function isProduction(source?: Record<string, string | undefined>): boolean {
  return getAppEnv(source) === 'production';
}

export function isStaging(source?: Record<string, string | undefined>): boolean {
  return getAppEnv(source) === 'staging';
}

export function isTestEnv(source?: Record<string, string | undefined>): boolean {
  return getAppEnv(source) === 'test';
}

export function isStrictEnv(source?: Record<string, string | undefined> | string): boolean {
  if (typeof source === 'string') {
    const trimmed = source.trim().toLowerCase();
    if (trimmed === 'development' || trimmed === 'dev' || trimmed === 'test') {
      return false;
    }
    return true;
  }
  const env = getAppEnv(source);
  return env === 'production' || env === 'staging';
}

/**
 * Single shared helper for session cookie name across middleware, auth-session, and API routes.
 * Uses strict __Host- prefix in production and staging (HTTPS required).
 */
export function getSessionCookieName(source?: Record<string, string | undefined>): string {
  return isStrictEnv(source) ? '__Host-jc_session' : 'jc_session';
}

/**
 * Single shared helper for session cookie secure attribute.
 * Mandatory true in production and staging.
 */
export function isSessionCookieSecure(source?: Record<string, string | undefined>): boolean {
  return isStrictEnv(source);
}

/**
 * Full cookie configuration object for session setting across route handlers.
 */
export function getSessionCookieConfig(source?: Record<string, string | undefined>) {
  return {
    name: getSessionCookieName(source),
    secure: isSessionCookieSecure(source),
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  };
}

