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
 * GET /api/bulk/batches/[id]
 * Checks processing status of a bulk batch. Requires authentication.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionToken = getSessionToken(req);
  const session = verifyToken(sessionToken);

  if (!session || !sessionToken) {
    return NextResponse.json(
      { error: 'Unauthorized: Session authentication required' },
      { status: 401 }
    );
  }

  try {
    const { id } = params;
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const backendRes = await fetch(`${apiUrl}/bulk/batches/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const data = await backendRes.json().catch(() => null);

    if (!backendRes.ok) {
      return NextResponse.json(
        data || { error: 'Failed to retrieve batch status' },
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
