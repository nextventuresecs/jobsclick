import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '@/lib/auth-session';
import { authenticatedFetch, currentIdentity, privateError, privateHeaders, validOrigin } from '@/lib/server-api';
export async function GET() {
  try {
    const user = await currentIdentity();
    return NextResponse.json({ authenticated: Boolean(user), user }, { headers: privateHeaders });
  } catch { return privateError('AUTH_STATE_UNAVAILABLE', 503); }
}
export async function POST(_req: NextRequest) { return privateError('METHOD_NOT_ALLOWED', 405); }
export async function DELETE(req: NextRequest) {
  if (!validOrigin(req)) return privateError('AUTH_ORIGIN_INVALID', 403);
  try {
    const allDevices = req.nextUrl.searchParams.get('allDevices') === 'true';
    const response = await authenticatedFetch(allDevices ? 'auth/sign-out-all' : 'auth/sign-out', { method: 'POST' });
    if (response && !response.ok && response.status !== 401) return privateError('AUTH_SIGNOUT_FAILED', 503);
    const result = NextResponse.json({ authenticated: false }, { headers: privateHeaders });
    result.cookies.set(SESSION_COOKIE_NAME, '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0, expires: new Date(0) });
    return result;
  } catch { return privateError('AUTH_SIGNOUT_FAILED', 503); }
}
