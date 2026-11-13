import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifyToken } from '@/lib/auth-session';

function getSessionToken(req: NextRequest): string | undefined {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) return token;
  try {
    return cookies().get(SESSION_COOKIE_NAME)?.value;
  } catch {
    return undefined;
  }
}

/**
 * POST /api/bulk/signed-url
 * Obtains a signed upload URL for bulk CSV upload. Requires authentication.
 */
export async function POST(req: NextRequest) {
  const sessionToken = getSessionToken(req);
  const session = verifyToken(sessionToken);

  if (!session || !sessionToken) {
    return NextResponse.json(
      { error: 'Unauthorized: Session authentication required for signed upload URL' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const backendRes = await fetch(`${apiUrl}/bulk/signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json().catch(() => null);

    if (!backendRes.ok) {
      return NextResponse.json(
        data || { error: 'Failed to generate signed upload URL' },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    return NextResponse.json(
      { error: `Internal server error: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
