import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PipelineModule, id, jwt, role, status, apply, changeState } from './fixtures/browser-pipeline.module.js';

describe('AUTH-01/05/06 browser pipeline with real JWT and role guards', () => {
  let app: NestFastifyApplication;
  let token: string;
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(PipelineModule, new FastifyAdapter(), { logger: false });
    await app.init(); await app.getHttpAdapter().getInstance().ready();
    token = await jwt.signAccessToken(id, 0, { role, status });
  });
  afterAll(async () => { await app.close(); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it('issues browser login via HttpOnly cookie with no token in JSON, rejecting foreign origin', async () => {
    const payload = { phone: '9876543210', code: '123456', role: 'job_seeker' };
    const good = await app.inject({ method: 'POST', url: '/auth/browser/otp/verify', headers: { origin: 'https://jobsclick.live' }, payload });
    expect(good.statusCode).toBe(200);
    expect(good.headers['set-cookie']).toContain('HttpOnly');
    expect(good.json()).not.toHaveProperty('accessToken');
    expect((await app.inject({ method: 'POST', url: '/auth/browser/otp/verify', headers: { origin: 'https://attacker.test' }, payload })).statusCode).toBe(403);
  });
  it('uses server roles and current status for metadata, workspace reads and applications', async () => {
    const headers = { authorization: `Bearer ${token}`, 'x-user-id': 'attacker', 'x-user-role': 'admin' };
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers })).json()).toEqual({ id, role, status });
    expect((await app.inject({ method: 'GET', url: '/profiles/seeker/me', headers })).json().userId).toBe(id);
    expect((await app.inject({ method: 'POST', url: '/jobs/example/apply', headers })).statusCode).toBe(201);
    expect(apply).toHaveBeenLastCalledWith(id, 'example');
    changeState({ role: 'employer' });
    expect((await app.inject({ method: 'POST', url: '/jobs/example/apply', headers })).statusCode).toBe(403);
    changeState({ status: 'disabled' });
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers })).statusCode).toBe(401);
    changeState({ role: 'job_seeker', status: 'active' });
  });
  it('sets a short-lived production __Host cookie without a Domain attribute', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = await app.inject({ method: 'POST', url: '/auth/browser/otp/verify', headers: { origin: 'https://jobsclick.live' },
      payload: { phone: '9876543210', code: '123456', role: 'job_seeker' } });
    expect(result.statusCode).toBe(200);
    const cookie = String(result.headers['set-cookie']);
    expect(cookie).toContain('__Host-jc_session='); expect(cookie).toContain('; Secure');
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
    expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeLessThanOrEqual(1800);
  });
  it('revokes the current session on logout and rejects replay without revoking another device', async () => {
    const other = await jwt.signAccessToken(id, 0, { role, status });
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: 'POST', url: '/auth/sign-out', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/profiles/seeker/me', headers })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${other}` } })).statusCode).toBe(200);
  });
});
