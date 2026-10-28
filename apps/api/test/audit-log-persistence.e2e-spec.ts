import { describe, it, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { AdminService } from '../src/admin/admin.service.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';

describe('T-03: Persistent Immutable Audit Log Engine (E2E & Invariant #6)', () => {
  const createTestApp = async (): Promise<NestFastifyApplication> => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  };

  it('records sensitive actions (admin logins, bulk imports, data exports, status updates)', async () => {
    const app = await createTestApp();
    try {
      const adminService = app.get(AdminService);

      // 1. Log admin login
      const loginLog = await adminService.recordAuditLog('usr_admin_t03', 'ADMIN_LOGIN', {
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0 TestSuite',
      });
      expect(loginLog.id).toBeDefined();
      expect(loginLog.action).toBe('ADMIN_LOGIN');

      // 2. Log bulk import
      const importLog = await adminService.recordAuditLog('usr_admin_t03', 'BULK_IMPORT_INITIATED', {
        batchId: 'batch_t03_101',
        totalRows: 500,
        source: 'polytechnic_roster_2026.csv',
      });
      expect(importLog.action).toBe('BULK_IMPORT_INITIATED');

      // 3. Log data export (ADM-04)
      const exportLog = await adminService.recordAuditLog('usr_admin_t03', 'DATA_EXPORT_PERFORMED', {
        exportType: 'employer_compliance_report',
        format: 'csv',
        rowCount: 120,
      });
      expect(exportLog.action).toBe('DATA_EXPORT_PERFORMED');

      // 4. Status update
      const userRepo = app.get(UserRepository);
      await userRepo.save({
        id: 'usr_candidate_t03',
        phone: '9876543211',
        email: 'candidate_t03@example.com',
        role: 'job_seeker',
        status: 'active',
        source: 'web',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const statusRes = await app.inject({
        method: 'PUT',
        url: '/admin/users/usr_candidate_t03/status',
        headers: { 'x-user-id': 'usr_admin_t03' },
        payload: { status: 'disabled' },
      });
      expect(statusRes.statusCode).toBe(200);

      // Fetch all logs and verify presence
      const logs = await adminService.getAuditLogs();
      const actions = logs.map((l) => l.action);
      expect(actions).toContain('ADMIN_LOGIN');
      expect(actions).toContain('BULK_IMPORT_INITIATED');
      expect(actions).toContain('DATA_EXPORT_PERFORMED');
      expect(actions).toContain('USER_STATUS_UPDATED');
    } finally {
      await app.close();
    }
  });

  it('strictly prohibits UPDATE and DELETE on audit logs (Hard Invariant #6)', async () => {
    const app = await createTestApp();
    try {
      const adminService = app.get(AdminService);

      // Attempting to modify or delete audit log entries must fail
      await expect(adminService.modifyAuditLogProhibited()).rejects.toThrow(
        /Audit log entries are (immutable|append-only) and cannot be (updated|modified) or deleted/
      );
    } finally {
      await app.close();
    }
  });

  it('persists audit logs across container restart', async () => {
    // -------------------------------------------------------------------------
    // INSTANCE 1: Boot up container instance 1 and append sensitive audit log
    // -------------------------------------------------------------------------
    const app1 = await createTestApp();

    const auditEntryId = `audit_t03_reboot_${Date.now()}`;
    const adminService1 = app1.get(AdminService);

    await adminService1.recordAuditLog('usr_admin_t03_reboot', 'CRITICAL_SECURITY_EVENT', {
      eventId: auditEntryId,
      severity: 'high',
      description: 'Privileged role escalation reviewed and approved',
    });

    // Verify written on instance 1
    const logs1 = await adminService1.getAuditLogs();
    const found1 = logs1.find((l) => (l.meta as Record<string, unknown>)?.['eventId'] === auditEntryId);
    expect(found1).toBeDefined();

    // -------------------------------------------------------------------------
    // SIMULATE CONTAINER REBOOT: Completely tear down instance 1
    // -------------------------------------------------------------------------
    await app1.close();

    // -------------------------------------------------------------------------
    // INSTANCE 2: Boot up fresh container instance 2
    // -------------------------------------------------------------------------
    const app2 = await createTestApp();

    try {
      const adminService2 = app2.get(AdminService);

      // Fetch logs on instance 2 after restart
      const logs2 = await adminService2.getAuditLogs();
      const found2 = logs2.find((l) => (l.meta as Record<string, unknown>)?.['eventId'] === auditEntryId);

      expect(found2).toBeDefined();
      expect(found2?.action).toBe('CRITICAL_SECURITY_EVENT');
      expect((found2?.meta as Record<string, unknown>)?.['severity']).toBe('high');
      expect(found2?.actorId).toBe('usr_admin_t03_reboot');
    } finally {
      await app2.close();
    }
  });
});
