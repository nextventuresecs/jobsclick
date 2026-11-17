import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NextRequest } from '../../web/node_modules/next/server.js';
import { PipelineModule, id, apply, changeState } from './fixtures/browser-pipeline.module.js';
import { SESSION_COOKIE_NAME } from '../../web/src/lib/auth-session';
import * as session from '../../web/src/app/api/auth/session/route';
import * as proxy from '../../web/src/app/api/backend/[...path]/route';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('../../web/node_modules/next/headers.js', () => ({ cookies: () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) }));
const request = (path: string, method = 'GET') => new NextRequest(`https://jobsclick.live${path}`, {
  method, headers: { origin: 'https://jobsclick.live', 'x-user-id': 'attacker' },
});

describe('AUTH-05/06 + JOB-03 cookie-to-API authenticated flows', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(PipelineModule, new FastifyAdapter(), { logger: false });
    await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => {
    changeState({ role: 'job_seeker', status: 'active', tokenVersion: 0 });
    vi.stubEnv('API_URL', 'http://api.test'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://jobsclick.live');
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const upstream = await app.inject({ method: init.method as 'GET' | 'POST' || 'GET', url: new URL(url).pathname,
        headers: Object.fromEntries(new Headers(init.headers)), ...(init.body ? { payload: String(init.body) } : {}),
      });
      return new Response(upstream.body, { status: upstream.statusCode, headers: { 'content-type': 'application/json' } });
    });
    const login = await app.inject({ method: 'POST', url: '/auth/browser/otp/verify', headers: { origin: 'https://jobsclick.live' },
      payload: { phone: '9876543210', code: '123456', role: 'job_seeker' } });
    expect(login.statusCode).toBe(200);
    expect(login.json()).not.toHaveProperty('accessToken');
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    jar.set(SESSION_COOKIE_NAME, cookie.slice(cookie.indexOf('=') + 1));
  });
  afterEach(() => { jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('logs in, hydrates metadata, reads a workspace and applies using the server-authenticated user', async () => {
    expect(await (await session.GET()).json()).toEqual({ authenticated: true, user: { id, role: 'job_seeker', status: 'active' } });
    const profile = await proxy.GET(request('/api/backend/profiles/seeker/me'), { params: { path: ['profiles', 'seeker', 'me'] } });
    expect((await profile.json()).userId).toBe(id);
    const application = await proxy.POST(request('/api/backend/jobs/example/apply', 'POST'), { params: { path: ['jobs', 'example', 'apply'] } });
    expect(application.status).toBe(201);
    expect(apply).toHaveBeenLastCalledWith(id, 'example');
    expect(await application.text()).not.toContain(jar.get(SESSION_COOKIE_NAME));
  });
  it('enforces current API roles, disabled status and token-version revocation through the proxy', async () => {
    const context = { params: { path: ['jobs', 'example', 'apply'] } };
    changeState({ role: 'employer' });
    expect((await proxy.POST(request('/api/backend/jobs/example/apply', 'POST'), context)).status).toBe(403);
    changeState({ status: 'disabled' });
    expect((await proxy.POST(request('/api/backend/jobs/example/apply', 'POST'), context)).status).toBe(401);
    changeState({ status: 'active', role: 'job_seeker', tokenVersion: 1 });
    expect(await (await session.GET()).json()).toEqual({ authenticated: false, user: null });
  });
  it('revokes cookie credentials at logout and rejects a replay against the API', async () => {
    const token = jar.get(SESSION_COOKIE_NAME);
    expect((await session.DELETE(request('/api/auth/session', 'DELETE'))).status).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/profiles/seeker/me', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });
});
