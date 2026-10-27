import * as Sentry from '@sentry/nextjs';

/**
 * Next.js native instrumentation registration hook
 * Dynamically loads server or edge configuration based on runtime.
 * Guarantees zero execution overhead during static build phases (SSG).
 */
export async function register() {
  // Prevent execution during build/static evaluation phases
  if (process.env['NEXT_PHASE'] === 'phase-production-build') {
    return;
  }

  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    // @ts-expect-error Next.js resolves TS file at build time
    await import('../sentry.server.config');
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    // @ts-expect-error Next.js resolves TS file at build time
    await import('../sentry.edge.config');
  }
}

/**
 * Native Next.js server error capture hook (Next.js 15+ and @sentry/nextjs >= 8.28.0)
 * Automatically captures unhandled exceptions in Server Components and Route Handlers.
 */
export const onRequestError = Sentry.captureRequestError;
