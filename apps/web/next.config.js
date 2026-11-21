const createNextIntlPlugin = require('next-intl/plugin');
const { withSentryConfig } = require('@sentry/nextjs');

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required in Next.js 14 to enable instrumentation.ts lifecycle hooks
    instrumentationHook: true,
  },
  images: {
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  env: {
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV ||
      process.env.APP_ENV ||
      '',
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      '',
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      '',
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV !== 'production' ? process.env.API_URL || 'http://localhost:3001' : ''),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
      '',
    NEXT_PUBLIC_RAZORPAY_KEY_ID:
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID ||
      '',
    NEXT_PUBLIC_SENTRY_DSN:
      process.env.NEXT_PUBLIC_SENTRY_DSN ||
      process.env.SENTRY_DSN ||
      '',
    NEXT_PUBLIC_SENTRY_ENVIRONMENT:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.SENTRY_ENVIRONMENT ||
      '',
    NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN:
      process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN ||
      '',
  },
  async headers() {
    const isProd =
      (process.env.APP_ENV || process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

    const defaultHeaders = [
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' https://checkout.razorpay.com https://challenges.cloudflare.com",
          "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com",
          "connect-src 'self' https://lumberjack.razorpay.com https://api.razorpay.com https://*.supabase.co https://*.sentry.io",
          "img-src 'self' data: blob: https:",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join('; '),
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
    ];

    if (!isProd) {
      defaultHeaders.push({
        key: 'X-Robots-Tag',
        value: 'noindex, nofollow',
      });
    }

    return [
      {
        source: '/(.*)',
        headers: defaultHeaders,
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG || 'jobsclicklives-org',
  project: process.env.SENTRY_PROJECT || 'jobclick',
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Release tagging tied to Vercel git commit SHA, local git SHA, or fallback
  release: {
    name:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.SENTRY_RELEASE ||
      process.env.npm_package_version ||
      'production',
  },

  // Suppress verbose output in local builds
  silent: !process.env.CI,

  // Upload wider set of client source files for better stack trace resolution
  widenClientFileUpload: true,

  // Hide source maps from client bundles so proprietary source code isn't exposed publicly
  hideSourceMaps: true,

  // Automatically delete source maps after upload to prevent public exposure
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Tunnel through Next.js server to bypass client-side ad-blockers and maintain privacy
  tunnelRoute: '/monitoring',

  // Automatically tree-shake Sentry logger statements to minimize client bundle size
  disableLogger: true,
};

module.exports = withSentryConfig(withNextIntl(nextConfig), sentryWebpackPluginOptions);
