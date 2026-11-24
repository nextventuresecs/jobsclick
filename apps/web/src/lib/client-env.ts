import {
  getAppEnv,
  isProduction as isValProduction,
  isStaging as isValStaging,
  isTestEnv as isValTestEnv,
  isStrictEnv as isValStrictEnv,
  type AppEnv,
} from '@indian-job-portal/validation';

/**
 * Web client environment helper.
 *
 * In browser code, Next.js / webpack only inlines environment variables when accessed
 * through LITERAL `process.env.NEXT_PUBLIC_*` or `process.env.NODE_ENV`.
 * Dynamic indexing (`process.env[key]`) does NOT get replaced during compilation.
 *
 * This helper statically references the literal properties and supplies them to the
 * validation package's runtime-env functions.
 */
export function getClientEnvSource(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
}

export function getClientAppEnv(): AppEnv {
  return getAppEnv(getClientEnvSource());
}

export function isClientProduction(): boolean {
  return isValProduction(getClientEnvSource());
}

export function isClientStaging(): boolean {
  return isValStaging(getClientEnvSource());
}

export function isClientTestEnv(): boolean {
  return isValTestEnv(getClientEnvSource());
}

export function isClientStrictEnv(): boolean {
  return isValStrictEnv(getClientEnvSource());
}

// Ergonomic aliased exports for client components
export {
  getClientAppEnv as getAppEnv,
  isClientProduction as isProduction,
  isClientStaging as isStaging,
  isClientTestEnv as isTestEnv,
  isClientStrictEnv as isStrictEnv,
};
