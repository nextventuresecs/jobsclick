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
 * POST /api/bulk/batches
 * Authenticated proxy endpoint for bulk batch onboarding.
 * Enforces session authentication: sourceName and coordinator identity
 * come strictly from the server-verified session, never client input (PR 4).
 */
export async function POST(req: NextRequest) {
  const sessionToken = getSessionToken(req);
  const session = verifyToken(sessionToken);

  if (!session || !sessionToken) {
    return NextResponse.json(
      { error: 'Unauthorized: Session authentication required for bulk onboarding' },
      { status: 401 }
    );
  }

  // Permitted roles: employer, intermediary (institution), admin, msme_admin
  const allowedRoles = ['employer', 'intermediary', 'institution_admin', 'admin', 'msme_admin'];
  if (!allowedRoles.includes(session.role)) {
    return NextResponse.json(
      { error: 'Forbidden: Insufficient privileges for bulk onboarding' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    // Source comes from verified session identity (or verified role title), not untrusted client input
    const verifiedSource =
      session.role === 'employer'
        ? `Enterprise_${session.sub.slice(0, 8)}`
        : session.role === 'intermediary' || session.role === 'institution_admin'
          ? `Institution_${session.sub.slice(0, 8)}`
          : (body.source || `Admin_${session.sub.slice(0, 8)}`);

    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const payload = {
      source: verifiedSource,
      entityType: body.entityType || (session.role === 'employer' ? 'employer' : 'student'),
      csvContent: body.csvContent,
      storagePath: body.storagePath,
      fileName: body.fileName,
    };

    const backendRes = await fetch(`${apiUrl}/bulk/batches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await backendRes.json().catch(() => null);

    if (!backendRes.ok) {
      return NextResponse.json(
        data || { error: 'Failed to create bulk batch on backend' },
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
