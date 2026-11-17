import { validOrigin } from './origin-policy';
export { validOrigin } from './origin-policy';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { UserRoleSchema } from '@indian-job-portal/validation';
import { SESSION_COOKIE_NAME, verifyToken } from './auth-session';

export const privateHeaders = { 'Cache-Control': 'no-store, max-age=0', Vary: 'Cookie' };
export function privateError(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers: privateHeaders });
}
export function apiUrl(path: string): string {
  const base = process.env.API_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '');
  const parsed = new URL(base);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('API_CONFIG_INVALID');
  return `${parsed.origin}/${path}`;
}
export async function authenticatedFetch(path: string, init: RequestInit = {}, tokenOverride?: string) {
  const token = tokenOverride || cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!verifyToken(token)) return null;
  const headers = new Headers();
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
}
export async function currentIdentity(tokenOverride?: string) {
  const token = tokenOverride || cookies().get(SESSION_COOKIE_NAME)?.value;
  const expected = verifyToken(token);
  if (!expected) return null;
  const response = await authenticatedFetch('auth/me', {}, token);
  if (!response || response.status === 401) return null;
  if (!response.ok) throw new Error('AUTH_STATE_UNAVAILABLE');
  const body = await response.json();
  if (body.id !== expected.sub || !UserRoleSchema.safeParse(body.role).success || body.status !== 'active') throw new Error('AUTH_RESPONSE_INVALID');
  return { id: body.id as string, role: UserRoleSchema.parse(body.role), status: 'active' as const };
}
export async function readPrivateBody(req: NextRequest): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); throw new RangeError('PAYLOAD_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function forwardPrivate(req: NextRequest, path: string) {
  if (!['GET', 'HEAD'].includes(req.method) && !validOrigin(req)) return privateError('AUTH_ORIGIN_INVALID', 403);
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value || cookies().get(SESSION_COOKIE_NAME)?.value;
    if (!verifyToken(token)) return privateError('AUTH_REQUIRED', 401);
    const body = !['GET', 'HEAD'].includes(req.method) ? await readPrivateBody(req) : '';
    const upstream = await authenticatedFetch(path + req.nextUrl.search, {
      method: req.method,
      ...(body ? { body } : {}),
    }, req.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!upstream) return privateError('AUTH_REQUIRED', 401);
    const headers = new Headers(privateHeaders);
    const type = upstream.headers.get('content-type');
    if (type) headers.set('Content-Type', type);
    if (type?.includes('text/html')) headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; sandbox;");
    const retry = upstream.headers.get('retry-after');
    if (retry) headers.set('Retry-After', retry);
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return error instanceof RangeError ? privateError('PAYLOAD_TOO_LARGE', 413) : privateError('API_UNAVAILABLE', 503);
  }
}
