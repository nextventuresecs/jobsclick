import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('AdminController (e2e) - Epic 5 (Issues #21, #22, #23, #24)', () => {
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

  it('PUT /admin/users/:id/status - updates user account status (Issue #21)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/users/usr_seeker_100/status',
      payload: { status: 'disabled' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('disabled');
  });

  it('POST & GET /admin/audit-logs - records audit log entry (Issue #22)', async () => {
    const postRes = await app.inject({
      method: 'POST',
      url: '/admin/audit-logs',
      headers: { 'x-user-id': 'admin_root' },
      payload: { action: 'BULK_IMPORT_APPROVED', meta: { batchId: 'b_123' } },
    });

    expect(postRes.statusCode).toBe(201);
    const postData = JSON.parse(postRes.payload);
    expect(postData.id).toBeDefined();

    const getRes = await app.inject({
      method: 'GET',
      url: '/admin/audit-logs',
    });

    expect(getRes.statusCode).toBe(200);
    const logs = JSON.parse(getRes.payload);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('GET /notifications & PUT /notifications/:id/read - handles in-app notifications (NOT-03 / Issue #23)', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { 'x-user-id': 'usr_seeker_88' },
    });

    expect(getRes.statusCode).toBe(200);
    const notifs = JSON.parse(getRes.payload);
    expect(notifs.length).toBeGreaterThan(0);
    const notifId = notifs[0].id;

    const readRes = await app.inject({
      method: 'PUT',
      url: `/notifications/${notifId}/read`,
      headers: { 'x-user-id': 'usr_seeker_88' },
    });

    expect(readRes.statusCode).toBe(200);
    const updatedNotif = JSON.parse(readRes.payload);
    expect(updatedNotif.isRead).toBe(true);
  });

  it('POST /privacy/request-deletion - logs DPDP account deletion request (Issue #24)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/privacy/request-deletion',
      headers: { 'x-user-id': 'usr_seeker_88' },
      payload: { confirmDeletion: true, reason: 'Moving to another city' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('pending_processing');
  });
});
