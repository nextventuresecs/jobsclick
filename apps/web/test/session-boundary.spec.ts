import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth-session';
import * as sessionRoute from '../src/app/api/auth/session/route';
import RootLayout from '../src/app/layout';
import { middleware } from '../src/middleware';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) }));
vi.mock('next/font/google', () => ({ Inter: () => ({ variable: 'inter' }), Noto_Sans_Devanagari: () => ({ variable: 'devanagari' }) }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en', getMessages: async () => ({}) }));
const user = { id: '12345678-1234-4234-8234-123456789012', role: 'job_seeker', status: 'active' as const };
const request = (path: string, method = 'GET', origin = 'https://jobsclick.live') => new NextRequest(`https://jobsclick.live${path}`, {
  method, headers: { origin, cookie: `${SESSION_COOKIE_NAME}=${jar.get(SESSION_COOKIE_NAME) || ''}`, authorization: 'Bearer attacker', 'x-user-id': 'attacker' },
});

describe('AUTH-05/06 server-side browser session boundary', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://api.test');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://jobsclick.live');
    jar.set(SESSION_COOKIE_NAME, createSessionToken(user));
  });
  afterEach(() => { jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('revalidates metadata against the API and never returns a token', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...user, role: 'employer' }));
    vi.stubGlobal('fetch', fetcher);
    const response = await sessionRoute.GET();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ authenticated: true, user: { ...user, role: 'employer' } });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects installation of a browser-supplied bearer token', async () => {
    const response = await sessionRoute.POST(new NextRequest('https://jobsclick.live/api/auth/session', {
      method: 'POST', headers: { origin: 'https://jobsclick.live', 'content-type': 'application/json' },
      body: JSON.stringify({ token: jar.get(SESSION_COOKIE_NAME) }),
    }));
    expect(response.status).toBe(405);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('forwards a cookie-only workspace request with server credentials and strips spoofed identity', async () => {
    const proxy = await import('../src/app/api/backend/[...path]/route.js');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ fullName: 'Candidate' }));
    vi.stubGlobal('fetch', fetcher);
    const response = await proxy.GET(request('/api/backend/profiles/seeker/me'), { params: { path: ['profiles', 'seeker', 'me'] } });
    expect(response.status).toBe(200);
    const options = fetcher.mock.calls[0]![1];
    const headers = new Headers(options.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${jar.get(SESSION_COOKIE_NAME)}`);
    expect(headers.has('x-user-id')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
    expect(options.cache).toBe('no-store');
  });
  it('allows authenticated same-origin applications and rejects cross-origin writes before dispatch', async () => {
    const proxy = await import('../src/app/api/backend/[...path]/route.js');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 'applied' }, { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    const context = { params: { path: ['jobs', 'job-id', 'apply'] } };
    expect((await proxy.POST(request('/api/backend/jobs/job-id/apply', 'POST'), context)).status).toBe(201);
    fetcher.mockClear();
    expect((await proxy.POST(request('/api/backend/jobs/job-id/apply', 'POST', 'https://attacker.test'), context)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects missing sessions, traversal and authentication endpoints on the generic proxy', async () => {
    const proxy = await import('../src/app/api/backend/[...path]/route.js');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const path of [['auth', 'otp', 'verify'], ['jobs', '..', 'auth'], ['https:', 'attacker.test']]) {
      expect((await proxy.GET(request('/api/backend/blocked'), { params: { path } })).status).toBe(404);
    }
    jar.clear();
    expect((await proxy.GET(request('/api/backend/profiles/seeker/me'), { params: { path: ['profiles', 'seeker', 'me'] } })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not report a revoked session as authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'REVOKED' }, { status: 401 })));
    expect(await (await sessionRoute.GET()).json()).toEqual({ authenticated: false, user: null });
  });
  it('bounds proxy request bodies before dispatching to the API', async () => {
    const proxy = await import('../src/app/api/backend/[...path]/route.js');
    const fetcher = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', fetcher);
    const large = new NextRequest('https://jobsclick.live/api/backend/jobs', { method: 'POST',
      headers: { origin: 'https://jobsclick.live' }, body: 'x'.repeat(1024 * 1024 + 1) });
    expect((await proxy.POST(large, { params: { path: ['jobs'] } })).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails closed when the identity endpoint returns a different user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...user, id: 'another-user' })));
    expect((await sessionRoute.GET()).status).toBe(503);
  });
  it('serializes only sanitized identity into the server-to-client layout boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...user, accessToken: 'must-not-be-forwarded' })));
    const tree = await RootLayout({ children: null });
    const serialized = JSON.stringify(tree);
    expect(serialized).toContain('initialUser');
    expect(serialized).not.toContain('accessToken');
    expect(serialized).not.toContain(jar.get(SESSION_COOKIE_NAME));
    expect(serialized).not.toContain('must-not-be-forwarded');
  });
  it('rewrites only the two exact browser OTP endpoints at runtime and rejects cross-origin requests', () => {
    for (const [path, upstream] of [['send', '/auth/otp/send'], ['verify', '/auth/browser/otp/verify']]) {
      const response = middleware(request(`/api/auth/otp/${path}`, 'POST'));
      expect(response.headers.get('x-middleware-rewrite')).toBe(`http://api.test${upstream}`);
      expect(response.headers.get('x-middleware-request-authorization')).toBeNull();
      expect(middleware(request(`/api/auth/otp/${path}`, 'POST', 'https://attacker.test')).status).toBe(403);
    }
  });
  it('forwards all-device logout and retains the cookie on an upstream outage', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetcher);
    const response = await sessionRoute.DELETE(request('/api/auth/session?allDevices=true', 'DELETE'));
    expect(fetcher.mock.calls[0]![0]).toBe('http://api.test/auth/sign-out-all');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    fetcher.mockRejectedValueOnce(new Error('network unavailable'));
    const failed = await sessionRoute.DELETE(request('/api/auth/session', 'DELETE'));
    expect(failed.status).toBe(503);
    expect(failed.headers.get('set-cookie')).toBeNull();
  });
});
