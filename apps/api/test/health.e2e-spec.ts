import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import * as sentry from '../src/config/sentry.js';

describe('HealthController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('/health (GET)', async () => {
    vi.stubEnv('RAILWAY_DEPLOYMENT_ID', 'fixture-api-deployment');
    vi.stubEnv('RAILWAY_DEPLOYMENT_ID', 'fixture-api-deployment');
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('ok');
    expect(payload.timestamp).toBeDefined();
    expect(payload.deploymentId).toBe('fixture-api-deployment');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(payload.deploymentId).toBe('fixture-api-deployment');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('/health/uptime (GET)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/uptime',
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('healthy');
    expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('keeps the public probes working and rejects the former diagnostic GET', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    const capture = vi.spyOn(sentry, 'captureException').mockReturnValue('fixture-event');
    for (const url of ['/health', '/health/uptime']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'GET', url: '/health/test-error' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/health/test-error' })).statusCode).toBe(401);
    expect(capture).not.toHaveBeenCalled();
  });

  it('requires an active admin session in staging and disables the action in production', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('SENTRY_DSN', 'https://example.test/1');
    const capture = vi.spyOn(sentry, 'captureException').mockReturnValue('fixture-event');
    const state = vi.spyOn(app.get(OtpRedisService), 'getAuthState')
      .mockResolvedValue({ role: 'job_seeker', status: 'active', tokenVersion: 0 });
    const jwt = await app.get(JwtService).signAccessToken('diagnostics-fixture', 0, { role: 'admin' });
    const request = {
      method: 'POST' as const,
      url: '/health/test-error',
      remoteAddress: '192.0.2.42',
      headers: { authorization: `Bearer ${jwt}` },
    };
    expect((await app.inject(request)).statusCode).toBe(403);
    expect(capture).not.toHaveBeenCalled();

    state.mockResolvedValue({ role: 'admin', status: 'active', tokenVersion: 0 });
    const response = await app.inject(request);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sentryEventId: 'fixture-event' });
    expect(capture).toHaveBeenCalledTimes(1);

    vi.stubEnv('SENTRY_DSN', '');
    const unconfigured = await app.inject(request);
    expect(unconfigured.statusCode).toBe(503);
    expect(unconfigured.json()).toMatchObject({ code: 'SENTRY_UNAVAILABLE' });

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    expect((await app.inject({ ...request, remoteAddress: '192.0.2.43' })).statusCode).toBe(404);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('throttles the diagnostic while leaving health probes available', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('SENTRY_DSN', 'https://example.test/1');
    const capture = vi.spyOn(sentry, 'captureException').mockReturnValue('fixture-event');
    vi.spyOn(app.get(OtpRedisService), 'getAuthState')
      .mockResolvedValue({ role: 'admin', status: 'active', tokenVersion: 0 });
    const jwt = await app.get(JwtService).signAccessToken('diagnostics-fixture', 0);
    const remoteAddress = '192.0.2.44';
    const request = {
      method: 'POST' as const,
      url: '/health/test-error',
      remoteAddress,
      headers: { authorization: `Bearer ${jwt}` },
    };

    for (const expectedStatus of [200, 200, 200, 429]) {
      expect((await app.inject(request)).statusCode).toBe(expectedStatus);
    }
    expect(capture).toHaveBeenCalledTimes(3);
    expect((await app.inject({ method: 'GET', url: '/health', remoteAddress })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health/uptime', remoteAddress })).statusCode).toBe(200);
  });
});
