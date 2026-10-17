import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  verifyToken,
} from '../../../../lib/auth-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ session: null });
  }

  const session = await verifyToken(token);
  if (!session) {
    cookieStore.delete(AUTH_COOKIE_NAME);
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accessToken } = body;

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'Valid accessToken string is required' },
        { status: 400 }
      );
    }

    const session = await verifyToken(accessToken);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired authentication token' },
        { status: 401 }
      );
    }

    const cookieStore = cookies();
    cookieStore.set(AUTH_COOKIE_NAME, accessToken, AUTH_COOKIE_OPTIONS);

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to set session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

    let body: { signOutAll?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    if (body.signOutAll && token) {
      const session = await verifyToken(token);
      if (session?.user.id) {
        const apiUrl = process.env['API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
        try {
          await fetch(`${apiUrl}/auth/sign-out-all`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': session.user.id,
            },
          });
        } catch {
          // Continue cookie deletion even if remote call fails
        }
      }
    }

    cookieStore.delete(AUTH_COOKIE_NAME);

    return NextResponse.json({
      success: true,
      message: body.signOutAll ? 'Signed out of all devices' : 'Session cleared',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to clear session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
