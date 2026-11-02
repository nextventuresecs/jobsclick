import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifyToken } from '@/lib/auth-session';

function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * GET /api/auth/session
 * Returns ONLY sanitized user identity metadata. NEVER exposes the raw JWT accessToken to client JS.
 */
export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifyToken(token);

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: session.sub,
        role: session.role,
        status: session.status,
      },
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}

/**
 * POST /api/auth/session
 * Verifies a server-signed JWT and stores it in a strict __Host- HttpOnly cookie.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : null;
    const verified = verifyToken(token);

    if (!verified || !token) {
      return NextResponse.json({ error: 'Invalid or expired session token' }, { status: 401 });
    }

    const ttlSeconds = Math.max(0, verified.exp - Math.floor(Date.now() / 1000));
    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: verified.sub,
        role: verified.role,
        status: verified.status,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ttlSeconds,
    });

    return response;
  } catch {
    // Never echo raw err.message to client
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

/**
 * DELETE /api/auth/session
 * Clears the HttpOnly session cookie.
 */
export async function DELETE(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}