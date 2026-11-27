import { NextRequest, NextResponse } from 'next/server';
import { isProduction, isStrictEnv, getSessionCookieName } from '@indian-job-portal/validation';

const SESSION_COOKIE_NAME = getSessionCookieName();

const PROTECTED_PATH_PREFIXES = ['/workspace', '/hi/workspace', '/company/bulk-onboard'];

function configuredOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || /[;']/.test(url.origin)) return undefined;
    if (url.protocol === 'https:' || (url.protocol === 'http:' && !isStrictEnv())) {
      return url.origin;
    }
  } catch {
    // Malformed configuration must not add sources to the browser policy.
  }
  return undefined;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const siteUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'https://jobsclick.live';

  // 1. Strip spoofable identity headers from incoming client requests unconditionally
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-role');
  requestHeaders.delete('x-user-status');

  const nonce = btoa(crypto.randomUUID());
  const connectSources = [
    "'self'",
    'https://lumberjack.razorpay.com',
    'https://api.razorpay.com',
    'https://*.supabase.co',
    'https://*.sentry.io',
    configuredOrigin(process.env.NEXT_PUBLIC_API_URL),
    configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL),
  ].filter(Boolean).join(' ');
  const developmentScripts = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://checkout.razorpay.com https://challenges.cloudflare.com${developmentScripts}`,
    "worker-src 'self' blob:",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com",
    `connect-src ${connectSources}`,
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  // Next.js reads the request policy when inserting nonces on framework scripts.
  requestHeaders.set('Content-Security-Policy', csp);

  function applySecurityHeaders(response: NextResponse): NextResponse {
    response.headers.set('Content-Security-Policy', csp);
    if (!isProduction()) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return response;
  }

  // 2. Enforce authentication gate on protected routes
  const isProtected = PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Reject missing cookie or legacy unsigned token format at the edge
  const hasValidFormat =
    Boolean(sessionCookie) &&
    !sessionCookie!.startsWith('jwt_session_') &&
    sessionCookie!.split('.').length === 3;

  if (isProtected && !hasValidFormat) {
    const loginRedirectUrl = new URL('/', req.url);
    loginRedirectUrl.searchParams.set('authRequired', '1');
    return applySecurityHeaders(NextResponse.redirect(loginRedirectUrl));
  }

  // Bypass multilingual header generation for internal API and Next.js asset routes
  if (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/_next' ||
    pathname.startsWith('/_next/') ||
    /^\/(?:hi|en)\/(?:api|_next)(?:\/|$)/.test(pathname)
  ) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return applySecurityHeaders(response);
  }

  // Helper to generate SEO alternate Link header
  const getLinkHeader = (cleanPath: string) => {
    const canonicalPath = cleanPath === '/' ? '' : cleanPath;
    const enUrl = `${siteUrl}${canonicalPath || '/'}`;
    const hiUrl = `${siteUrl}/hi${canonicalPath}`;
    return `<${enUrl}>; rel="alternate"; hreflang="en", <${hiUrl}>; rel="alternate"; hreflang="hi", <${enUrl}>; rel="alternate"; hreflang="x-default"`;
  };

  // 3. Multilingual Hindi Routing: /hi and /hi/... (Ticket T-12 / Issue #35)
  // The path-only rewrite in next.config.js runs after these locale headers are set.
  const hiMatch = pathname.match(/^\/hi(?:\/(.*))?$/);
  if (hiMatch) {
    const rawSubPath = (hiMatch[1] || '').replace(/\/+$/, '');
    const cleanPath = rawSubPath ? `/${rawSubPath}` : '/';
    requestHeaders.set('x-locale', 'hi');
    requestHeaders.set('x-next-locale', 'hi');
    requestHeaders.set('x-clean-path', cleanPath);
    requestHeaders.set('x-original-pathname', pathname);

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set('Link', getLinkHeader(cleanPath));
    response.cookies.set('NEXT_LOCALE', 'hi', { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return applySecurityHeaders(response);
  }

  // 4. /en or /en/... canonicalization redirect to non-prefixed English URLs
  const enMatch = pathname.match(/^\/en(?:\/(.*))?$/);
  if (enMatch) {
    const rawSubPath = (enMatch[1] || '').replace(/\/+$/, '');
    const cleanPath = rawSubPath ? `/${rawSubPath}` : '/';
    const redirectUrl = new URL(cleanPath, req.url);
    const response = NextResponse.redirect(redirectUrl, 308);
    response.cookies.set('NEXT_LOCALE', 'en', { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return applySecurityHeaders(response);
  }

  // 5. Default English / Non-prefixed routes
  const localeCookie = req.cookies.get('NEXT_LOCALE')?.value || 'en';
  requestHeaders.set('x-clean-path', pathname);
  requestHeaders.set('x-original-pathname', pathname);
  requestHeaders.set('x-locale', localeCookie);
  requestHeaders.set('x-next-locale', localeCookie);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('Link', getLinkHeader(pathname));
  return applySecurityHeaders(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|templates).*)'],
};
