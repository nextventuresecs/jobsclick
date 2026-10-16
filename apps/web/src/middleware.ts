import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, verifyToken } from './lib/auth-session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Locale redirection: /en, /hi -> root path with NEXT_LOCALE cookie
  const match = pathname.match(/^\/(en|hi)(\/.*)?$/);
  if (match && match[1]) {
    const locale = match[1];
    const rest = match[2] || '/';
    const response = NextResponse.redirect(new URL(rest, request.url));
    response.cookies.set('NEXT_LOCALE', locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return response;
  }

  // 2. Server session resolution from secure HttpOnly cookie
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const requestHeaders = new Headers(request.headers);

  if (token) {
    const session = await verifyToken(token);
    if (session) {
      // Attach cryptographically verified session identity to request headers for downstream server components
      requestHeaders.set('x-user-id', session.user.id);
      requestHeaders.set('x-user-role', session.user.role);
      requestHeaders.set('x-client-role', session.clientRole);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }

    // Invalid or tampered token: strip bad cookie
    const response = NextResponse.next();
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
