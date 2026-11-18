import { validOrigin } from './lib/origin-policy';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-jc_session' : 'jc_session';

const PROTECTED_PATH_PREFIXES = ['/workspace', '/hi/workspace', '/company/bulk-onboard'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Strip spoofable identity headers from incoming client requests unconditionally
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-role');
  requestHeaders.delete('x-user-status');
  requestHeaders.delete('x-next-locale');
  requestHeaders.delete('x-locale');
  // Cookie-authenticated mutations always require the configured web origin.
  if (pathname.startsWith('/api/') && pathname !== '/api/sentry-test' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !validOrigin(req)) {
    return NextResponse.json({ code: 'AUTH_ORIGIN_INVALID' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const otpPaths: Record<string, string> = {
    '/api/auth/otp/send': 'auth/otp/send',
    '/api/auth/otp/verify': 'auth/browser/otp/verify',
  };
  const otpTarget = otpPaths[pathname];
  if (otpTarget) {
    if (req.method !== 'POST') return NextResponse.json({ code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
    const base = process.env.API_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '');
    try {
      const upstream = new URL(base);
      if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) throw new Error('API_CONFIG_INVALID');
      requestHeaders.delete('authorization');
      requestHeaders.delete('cookie');
      return NextResponse.rewrite(new URL(otpTarget, upstream), { request: { headers: requestHeaders } });
    } catch { return NextResponse.json({ code: 'API_UNAVAILABLE' }, { status: 503 }); }
  }

  const pagePath = pathname.replace(/^\/(?:hi|en)(?=\/|$)/, '') || '/';
  const localized = pagePath !== pathname;
  if (pagePath.startsWith('//')) return NextResponse.json({ code: 'INVALID_PATH' }, { status: 400 });
  // Locale rewrites apply to pages only; never create alternate API entry points.
  if (localized && (pagePath === '/api' || pagePath.startsWith('/api/'))) {
    return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  }

  // 2. Enforce authentication gate on protected routes
  const isProtected = PROTECTED_PATH_PREFIXES.some(
    (prefix) => pagePath === prefix || pagePath.startsWith(`${prefix}/`)
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
    return NextResponse.redirect(loginRedirectUrl);
  }

  if (pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname === '/monitoring') {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const target = req.nextUrl.clone();
  target.pathname = pagePath;
  if (pathname === '/en' || pathname.startsWith('/en/')) return NextResponse.redirect(target, 308);

  const locale = pathname === '/hi' || pathname.startsWith('/hi/') ? 'hi' : 'en';
  requestHeaders.set('x-next-locale', locale);
  const response = localized
    ? NextResponse.rewrite(target, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set('NEXT_LOCALE', locale, { path: '/', sameSite: 'lax', maxAge: 31536000, secure: process.env.NODE_ENV === 'production' });
  const english = new URL(req.url);
  english.pathname = pagePath;
  english.search = '';
  english.hash = '';
  const hindi = new URL(english);
  hindi.pathname = pagePath === '/' ? '/hi' : '/hi' + pagePath;
  response.headers.set('Link', [
    '<' + english.href + '>; rel="alternate"; hreflang="en"',
    '<' + hindi.href + '>; rel="alternate"; hreflang="hi"',
  ].join(', '));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|templates).*)'],
};