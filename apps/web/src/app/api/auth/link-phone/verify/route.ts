import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isStrictEnv } from '@indian-job-portal/validation';
import { SESSION_COOKIE_NAME, verifyToken, signSessionToken } from '@/lib/auth-session';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBaseUrl) {
    return NextResponse.json({ error: 'Service configuration error: API URL missing' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const res = await fetch(`${apiBaseUrl}/auth/link-phone/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const currentSession = verifyToken(token);
    if (currentSession) {
      const newToken = signSessionToken({
        sub: currentSession.sub,
        role: currentSession.role,
        status: currentSession.status,
        requiresPhoneLink: false,
        jti: currentSession.jti,
      });

      const response = NextResponse.json(data, { status: res.status });
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: newToken,
        httpOnly: true,
        secure: isStrictEnv(),
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
      return response;
    }

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to contact authentication service' }, { status: 500 });
  }
}
