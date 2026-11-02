import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, AUTH_COOKIE_NAME } from '@/lib/auth-session';

const PROTECTED_PATH_PREFIXES = ['/workspace', '/hi/workspace', '/company/bulk-onboard'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const siteUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'https://jobsclick.live';

  // 1. Strip spoofable identity headers from incoming client requests unconditionally
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-role');
  requestHeaders.delete('x-user-status');

  // 2. Enforce authentication gate on protected routes
  const isProtected = PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const sessionCookie =
    req.cookies.get(SESSION_COOKIE_NAME)?.value || req.cookies.get(AUTH_COOKIE_NAME)?.value;

  const hasValidFormat =
    Boolean(sessionCookie) &&
    !sessionCookie!.startsWith('jwt_session_') &&
    sessionCookie!.split('.').length === 3;

  if (isProtected && !hasValidFormat) {
    const loginRedirectUrl = new URL('/', req.url);
    loginRedirectUrl.searchParams.set('authRequired', '1');
    return NextResponse.redirect(loginRedirectUrl);
  }

  // Helper to generate SEO alternate Link header
  const getLinkHeader = (cleanPath: string) => {
    const canonicalPath = cleanPath === '/' ? '' : cleanPath;
    const enUrl = `${siteUrl}${canonicalPath || '/'}`;
    const hiUrl = `${siteUrl}/hi${canonicalPath}`;
    return `<${enUrl}>; rel="alternate"; hreflang="en", <${hiUrl}>; rel="alternate"; hreflang="hi", <${enUrl}>; rel="alternate"; hreflang="x-default"`;
  };

  // 3. Multilingual Hindi Routing: /hi and /hi/... (Ticket T-12 / Issue #35)
  const hiMatch = pathname.match(/^\/hi(?:\/(.*))?$/);
  if (hiMatch) {
    const rawSubPath = (hiMatch[1] || '').replace(/\/+$/, '');
    const cleanPath = rawSubPath ? `/${rawSubPath}` : '/';
    requestHeaders.set('x-locale', 'hi');
    requestHeaders.set('x-next-locale', 'hi');
    requestHeaders.set('x-clean-path', cleanPath);
    requestHeaders.set('x-original-pathname', pathname);

    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = cleanPath;

    const response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set('Link', getLinkHeader(cleanPath));
    response.cookies.set('NEXT_LOCALE', 'hi', { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return response;
  }

  // 4. /en or /en/... canonicalization redirect to non-prefixed English URLs
  const enMatch = pathname.match(/^\/en(?:\/(.*))?$/);
  if (enMatch) {
    const rawSubPath = (enMatch[1] || '').replace(/\/+$/, '');
    const cleanPath = rawSubPath ? `/${rawSubPath}` : '/';
    const redirectUrl = new URL(cleanPath, req.url);
    const response = NextResponse.redirect(redirectUrl, 308);
    response.cookies.set('NEXT_LOCALE', 'en', { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return response;
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
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|templates|api).*)'],
};
