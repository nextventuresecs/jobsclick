import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('Admin Data Export & Audit Logging (ADM-04, Hard Invariant #6)', () => {
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

  it('rejects unauthenticated requests to GET /admin/export with 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/export?entity=users',
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects non-admin roles (job_seeker, employer) with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/export?entity=users',
      headers: {
        'x-user-id': 'usr_seeker_test',
        'x-user-role': 'job_seeker',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('allows admin role to export users in JSON with phone masking (Hard Invariant #1)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/export?entity=users&format=json',
      headers: {
        'x-user-id': 'usr_superadmin',
        'x-user-role': 'admin',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.entity).toBe('users');
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const first = body.data[0];
      expect(first.phoneMasked).toMatch(/\d{2}\*{6}\d{2}/);
    }
  });

  it('allows admin role to export jobs in CSV format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/export?entity=jobs&format=csv',
      headers: {
        'x-user-id': 'usr_superadmin',
        'x-user-role': 'admin',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.entity).toBe('jobs');
    expect(typeof body.csv).toBe('string');
  });

  it('records an immutable audit log entry upon export (ADM-04 & Hard Invariant #6)', async () => {
    const exportRes = await app.inject({
      method: 'GET',
      url: '/admin/export?entity=audit_logs&format=json',
      headers: {
        'x-user-id': 'usr_superadmin',
        'x-user-role': 'admin',
      },
    });
    expect(exportRes.statusCode).toBe(200);

    const auditRes = await app.inject({
      method: 'GET',
      url: '/admin/audit-logs',
      headers: {
        'x-user-id': 'usr_superadmin',
        'x-user-role': 'admin',
      },
    });

    expect(auditRes.statusCode).toBe(200);
    const auditLogs = JSON.parse(auditRes.payload);
    const exportLog = auditLogs.find((l: { action: string }) => l.action === 'DATA_EXPORT_PERFORMED');
    expect(exportLog).toBeDefined();
    expect(exportLog.actorId).toBe('usr_superadmin');
    expect(exportLog.meta.entity).toBe('audit_logs');
  });
});
