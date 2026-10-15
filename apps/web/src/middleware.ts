import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If someone visits /en, /hi, or /en/... /hi/..., redirect cleanly to the root path and record their locale preference
  const match = pathname.match(/^\/(en|hi)(\/.*)?$/);
  if (match) {
    const locale = match[1];
    const rest = match[2] || '/';
    const response = NextResponse.redirect(new URL(rest, request.url));
    response.cookies.set('NEXT_LOCALE', locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
