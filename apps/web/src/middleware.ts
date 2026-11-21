import { NextRequest, NextResponse } from 'next/server';
import { isStrictEnv, isProduction } from '@indian-job-portal/validation';

const SESSION_COOKIE_NAME =
  isStrictEnv() ? '__Host-jc_session' : 'jc_session';

const PROTECTED_PATH_PREFIXES = ['/workspace', '/hi/workspace', '/company/bulk-onboard'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Strip spoofable identity headers from incoming client requests unconditionally
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-role');
  requestHeaders.delete('x-user-status');

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
    const redirectRes = NextResponse.redirect(loginRedirectUrl);
    if (!isProduction()) {
      redirectRes.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return redirectRes;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Prevent indexing on non-production (staging/dev/test) environments
  if (!isProduction()) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|templates).*)'],
};