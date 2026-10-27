import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, verifyToken } from './lib/auth-session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const siteUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'https://jobsclick.in';

  // 1. Session resolution from secure HttpOnly cookie
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const requestHeaders = new Headers(request.headers);
  let hasInvalidToken = false;

  if (token) {
    const session = await verifyToken(token);
    if (session) {
      requestHeaders.set('x-user-id', session.user.id);
      requestHeaders.set('x-user-role', session.user.role);
      requestHeaders.set('x-client-role', session.clientRole);
    } else {
      hasInvalidToken = true;
    }
  }

  // Helper to generate SEO alternate Link header
  const getLinkHeader = (cleanPath: string) => {
    const canonicalPath = cleanPath === '/' ? '' : cleanPath;
    const enUrl = `${siteUrl}${canonicalPath || '/'}`;
    const hiUrl = `${siteUrl}/hi${canonicalPath}`;
    return `<${enUrl}>; rel="alternate"; hreflang="en", <${hiUrl}>; rel="alternate"; hreflang="hi", <${enUrl}>; rel="alternate"; hreflang="x-default"`;
  };

  // 2. Multilingual Hindi Routing: /hi and /hi/... (Ticket T-12 / Issue #35)
  // Rewrite without redirecting so search engine bots can crawl /hi and /hi/jobs with URL intact.
  const hiMatch = pathname.match(/^\/hi(?:\/(.*))?$/);
  if (hiMatch) {
    const rawSubPath = (hiMatch[1] || '').replace(/\/+$/, '');
    const cleanPath = rawSubPath ? `/${rawSubPath}` : '/';
    requestHeaders.set('x-locale', 'hi');
    requestHeaders.set('x-next-locale', 'hi');
    requestHeaders.set('x-clean-path', cleanPath);
    requestHeaders.set('x-original-pathname', pathname);

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = cleanPath;

    const response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set('Link', getLinkHeader(cleanPath));
    response.cookies.set('NEXT_LOCALE', 'hi', { path: '/', maxAge: 31536000, sameSite: 'lax' });
    if (hasInvalidToken) {
      response.cookies.delete(AUTH_COOKIE_NAME);
    }
    return response;
  }

  // 3. /en or /en/... canonicalization redirect to non-prefixed English URLs
  const enMatch = pathname.match(/^\/en(?:\/(.*))?$/);
  if (enMatch) {
    const rawSubPath = (enMatch[1] || '').replace(/\/+$/, '');
    const cleanPath = rawSubPath ? `/${rawSubPath}` : '/';
    const redirectUrl = new URL(cleanPath, request.url);
    const response = NextResponse.redirect(redirectUrl, 308);
    response.cookies.set('NEXT_LOCALE', 'en', { path: '/', maxAge: 31536000, sameSite: 'lax' });
    if (hasInvalidToken) {
      response.cookies.delete(AUTH_COOKIE_NAME);
    }
    return response;
  }

  // 4. Default English / Non-prefixed routes
  const localeCookie = request.cookies.get('NEXT_LOCALE')?.value || 'en';
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
  if (hasInvalidToken) {
    response.cookies.delete(AUTH_COOKIE_NAME);
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|monitoring|_next|_vercel|.*\\..*).*)'],
};
