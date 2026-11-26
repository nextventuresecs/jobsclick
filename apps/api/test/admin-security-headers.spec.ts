import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerAdminQueueGuard } from '../src/queue/admin-queue-guard.js';
import { registerApiSecurityHeaders } from '../src/config/security-headers.js';

describe('#123 & #125 Admin Queue Dashboard Secret & API Security Headers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects JWT_SECRET fallback and unauthorized requests on /admin/queues*, accepting only ADMIN_DASHBOARD_SECRET', async () => {
    const jwtSecret = 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1';
    const dashboardSecret = 'k4V9xQwL2mRpZ8sT6yN3bH7jK4v9XqWl';
    vi.stubEnv('JWT_SECRET', jwtSecret);
    vi.stubEnv('ADMIN_DASHBOARD_SECRET', dashboardSecret);

    const app = Fastify();
    registerAdminQueueGuard(app);
    app.get('/admin/queues/ui', async () => ({ ui: true }));
    app.get('/admin/queues', async () => ({ queues: [] }));
    await app.ready();

    try {
      expect((await app.inject({ method: 'GET', url: '/admin/queues/ui' })).statusCode).toBe(401);
      expect(
        (await app.inject({
          method: 'GET',
          url: '/admin/queues/ui',
          headers: { authorization: `Bearer ${jwtSecret}` },
        })).statusCode,
      ).toBe(403);
      expect(
        (await app.inject({
          method: 'GET',
          url: '/admin/queues/ui',
          headers: { authorization: `Bearer ${dashboardSecret}` },
        })).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({
          method: 'GET',
          url: '/admin/queues',
          headers: { authorization: `Bearer ${dashboardSecret}` },
        })).statusCode,
      ).toBe(200);

      // Removing ADMIN_DASHBOARD_SECRET denies even JWT_SECRET
      vi.stubEnv('ADMIN_DASHBOARD_SECRET', '');
      expect(
        (await app.inject({
          method: 'GET',
          url: '/admin/queues',
          headers: { authorization: `Bearer ${jwtSecret}` },
        })).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('sets HSTS (production), Permissions-Policy, and API security headers without clobbering Bull-Board UI', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');

    const app = Fastify();
    registerApiSecurityHeaders(app);
    app.get('/health', async () => ({ status: 'ok' }));
    app.get('/admin/queues/ui', async () => '<html>Bull Board</html>');
    await app.ready();

    try {
      const apiRes = await app.inject({ method: 'GET', url: '/health' });
      expect(apiRes.statusCode).toBe(200);
      expect(apiRes.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
      expect(apiRes.headers['permissions-policy']).toContain('camera=()');
      expect(apiRes.headers['x-frame-options']).toBe('DENY');
      expect(apiRes.headers['x-content-type-options']).toBe('nosniff');
      expect(apiRes.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(apiRes.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");

      const uiRes = await app.inject({ method: 'GET', url: '/admin/queues/ui' });
      expect(uiRes.headers['x-content-type-options']).toBe('nosniff');
      expect(uiRes.headers['content-security-policy']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
