import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

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

  it('/health (GET) identifies the deployment and disables caching', async () => {
    vi.stubEnv('RAILWAY_DEPLOYMENT_ID', 'api-deploy-fixture');
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    }).finally(() => vi.unstubAllEnvs());
    expect(response.headers['cache-control']).toBe('no-store');

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('ok');
    expect(payload.deploymentId).toBe('api-deploy-fixture');
    expect(payload.timestamp).toBeDefined();
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

  it('/health/test-error (GET) - triggers test error for Sentry observability', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/test-error',
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.message).toContain('Sentry verification');
    expect(payload.sentryEventId).toBeDefined();
  });
});
