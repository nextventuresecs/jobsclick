import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('AdminController RBAC & Authentication (STF-02)', () => {
  let app: NestFastifyApplication;

  const secret =
    process.env['JWT_SECRET'] ||
    process.env['SUPABASE_SECRET_KEY'] ||
    'jobsclick-jwt-secret-key-32-chars-min';

  function createAuthToken(sub: string, role: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub,
        role,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `Bearer ${header}.${payload}.${signature}`;
  }

  const seekerToken = createAuthToken('usr_seeker_test', 'job_seeker');
  const employerToken = createAuthToken('usr_employer_test', 'employer');
  const msmeAdminToken = createAuthToken('usr_msme_test', 'msme_admin');
  const adminToken = createAuthToken('usr_admin_test', 'admin');

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

  // ---------------------------------------------------------------------------
  // 1. PUT /admin/users/:id/status (admin only)
  // ---------------------------------------------------------------------------
  describe('PUT /admin/users/:id/status', () => {
    const url = '/admin/users/usr_target_1/status';
    const payload = { status: 'disabled' };

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'PUT', url, payload });
      expect(res.statusCode).toBe(401);
    });

    it('rejects job_seeker role with 403', async () => {
      const res = await app.inject({
        method: 'PUT',
        url,
        headers: { authorization: seekerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects employer role with 403', async () => {
      const res = await app.inject({
        method: 'PUT',
        url,
        headers: { authorization: employerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects msme_admin role with 403', async () => {
      const res = await app.inject({
        method: 'PUT',
        url,
        headers: { authorization: msmeAdminToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows admin role with 200', async () => {
      const res = await app.inject({
        method: 'PUT',
        url,
        headers: { authorization: adminToken },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.status).toBe('disabled');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. GET /admin/audit-logs (admin only)
  // ---------------------------------------------------------------------------
  describe('GET /admin/audit-logs', () => {
    const url = '/admin/audit-logs';

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    });

    it('rejects job_seeker role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: seekerToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects employer role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: employerToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects msme_admin role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: msmeAdminToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows admin role with 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: adminToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. POST /admin/audit-logs (admin only)
  // ---------------------------------------------------------------------------
  describe('POST /admin/audit-logs', () => {
    const url = '/admin/audit-logs';
    const payload = { action: 'SECURITY_AUDIT_VERIFIED', meta: { finding: 'STF-02' } };

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(401);
    });

    it('rejects job_seeker role with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: seekerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects employer role with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: employerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects msme_admin role with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: msmeAdminToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows admin role with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: adminToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.action).toBe('SECURITY_AUDIT_VERIFIED');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. GET /admin/reports/analytics (admin only)
  // ---------------------------------------------------------------------------
  describe('GET /admin/reports/analytics', () => {
    const url = '/admin/reports/analytics';

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    });

    it('rejects job_seeker role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: seekerToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects employer role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: employerToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects msme_admin role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: msmeAdminToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows admin role with 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: adminToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.signups).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. POST /admin/broadcast/preview (admin and msme_admin)
  // ---------------------------------------------------------------------------
  describe('POST /admin/broadcast/preview', () => {
    const url = '/admin/broadcast/preview';
    const payload = {
      filters: { district: 'Bhopal' },
      templateId: 'DLT_MSME_NOTICE_EN',
      variables: { message: 'Preview test notice' },
    };

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(401);
    });

    it('rejects job_seeker role with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: seekerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects employer role with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: employerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows msme_admin role with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: msmeAdminToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.segmentCount).toBeDefined();
    });

    it('allows admin role with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: adminToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.segmentCount).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. POST /admin/broadcast/dispatch (admin and msme_admin)
  // ---------------------------------------------------------------------------
  describe('POST /admin/broadcast/dispatch', () => {
    const url = '/admin/broadcast/dispatch';
    const payload = {
      filters: { district: 'Bhopal' },
      templateId: 'DLT_MSME_NOTICE_EN',
      variables: { message: 'Dispatch test notice' },
      confirmationToken: 'CONFIRM_DISPATCH_RBAC_TOKEN',
    };

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(401);
    });

    it('rejects job_seeker role with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: seekerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects employer role with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: employerToken },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows msme_admin role with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: msmeAdminToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.campaignId).toBeDefined();
    });

    it('allows admin role with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: adminToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.campaignId).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. GET /admin/reports/district-employment (admin and msme_admin)
  // ---------------------------------------------------------------------------
  describe('GET /admin/reports/district-employment', () => {
    const url = '/admin/reports/district-employment';

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    });

    it('rejects job_seeker role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: seekerToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects employer role with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: employerToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows msme_admin role with 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: msmeAdminToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data)).toBe(true);
    });

    it('allows admin role with 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: adminToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. GET /notifications (authenticated user)
  // ---------------------------------------------------------------------------
  describe('GET /notifications', () => {
    const url = '/notifications';

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    });

    it('allows job_seeker with 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: seekerToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data)).toBe(true);
    });

    it('allows employer with 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: employerToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. PUT /notifications/:id/read (authenticated user)
  // ---------------------------------------------------------------------------
  describe('PUT /notifications/:id/read', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/notifications/notif_1/read',
      });
      expect(res.statusCode).toBe(401);
    });

    it('allows job_seeker to mark their notification as read with 200', async () => {
      // First fetch notifications to generate default welcome notification
      const getRes = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: { authorization: seekerToken },
      });
      const notifs = JSON.parse(getRes.payload);
      const notifId = notifs[0].id;

      const res = await app.inject({
        method: 'PUT',
        url: `/notifications/${notifId}/read`,
        headers: { authorization: seekerToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.isRead).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. POST /privacy/request-deletion (authenticated user)
  // ---------------------------------------------------------------------------
  describe('POST /privacy/request-deletion', () => {
    const url = '/privacy/request-deletion';
    const payload = { confirmDeletion: true, reason: 'DPDP deletion request' };

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(401);
    });

    it('allows job_seeker with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: seekerToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.status).toBe('pending_processing');
    });

    it('allows employer with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: employerToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.status).toBe('pending_processing');
    });
  });

  // ---------------------------------------------------------------------------
  // 11. POST /resume/generate (authenticated user)
  // ---------------------------------------------------------------------------
  describe('POST /resume/generate', () => {
    const url = '/resume/generate';
    const payload = { seekerId: 'usr_seeker_test', template: 'classic' };

    it('rejects unauthenticated request with 401', async () => {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(401);
    });

    it('allows job_seeker with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: seekerToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.resumeId).toBeDefined();
    });

    it('allows employer with 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: employerToken },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.resumeId).toBeDefined();
    });
  });
});
