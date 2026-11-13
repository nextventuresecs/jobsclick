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
 * GET /api/bulk/batches/[id]/error-report
 * Downloads error CSV report for a bulk batch. Requires authentication.
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

    const backendRes = await fetch(`${apiUrl}/bulk/batches/${encodeURIComponent(id)}/error-report`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!backendRes.ok) {
      const err = await backendRes.text();
      return NextResponse.json(
        { error: err || 'Failed to download error CSV report' },
        { status: backendRes.status }
      );
    }

    const csvContent = await backendRes.text();
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="bulk-batch-${id}-errors.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Internal server error: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
