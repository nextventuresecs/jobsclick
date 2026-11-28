import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { privacyRequestSchema } from '@indian-job-portal/validation';
import { AdminService } from '../src/admin/admin.service.js';
import { AdminController } from '../src/admin/admin.controller.js';
import { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import { PrivacyErasureRepository } from '../src/database/repositories/privacy-erasure.repository.js';
import type { QueueService } from '../src/queue/queue.service.js';
import type { BroadcastService } from '../src/admin/broadcast.service.js';
import type { ReportsService } from '../src/admin/reports.service.js';

function makeService() {
  const supabase = {} as never;
  const audit = new AuditLogRepository(supabase, true);
  const appendSpy = vi.spyOn(audit, 'append');
  const repo = new PrivacyErasureRepository(supabase, true);
  const publish = vi.fn().mockResolvedValue({ id: 'job' });
  const queue = { publishPrivacyErasureJob: publish } as unknown as QueueService;
  const service = new AdminService(audit, undefined, undefined, undefined, undefined, repo, queue);
  return { service, publish, appendSpy };
}

describe('T1 DPDP erasure request', () => {
  it('is idempotent per user: same request, one audit entry', async () => {
    const { service, publish, appendSpy } = makeService();
    const userId = randomUUID();
    const first = await service.requestAccountDeletion(userId, 'moving');
    const second = await service.requestAccountDeletion(userId);
    expect(second.id).toBe(first.id);
    expect(first.status).toBe('pending');
    expect(appendSpy.mock.calls.filter(([r]) => r.action === 'PRIVACY_DELETION_REQUESTED')).toHaveLength(1);
    expect(publish).toHaveBeenCalledWith({ requestId: first.id, userId });
  });

  it('does not log the free-text reason (may contain PII)', async () => {
    const { service, appendSpy } = makeService();
    await service.requestAccountDeletion(randomUUID(), 'my phone is 9876543210');
    expect(JSON.stringify(appendSpy.mock.calls)).not.toContain('9876543210');
  });

  it('separate users get separate requests', async () => {
    const { service } = makeService();
    const a = await service.requestAccountDeletion(randomUUID());
    const b = await service.requestAccountDeletion(randomUUID());
    expect(a.id).not.toBe(b.id);
  });

  it('fails loudly (no fake success) when persistence is unavailable', async () => {
    const audit = new AuditLogRepository({} as never, true);
    const service = new AdminService(audit);
    await expect(service.requestAccountDeletion(randomUUID())).rejects.toMatchObject({ status: 503 });
  });

  it('cross-user: controller erases only the caller, ignoring any body userId', async () => {
    const requestAccountDeletion = vi.fn().mockResolvedValue({ id: 'r', status: 'pending', requestedAt: '' });
    const controller = new AdminController(
      { requestAccountDeletion } as unknown as AdminService,
      {} as BroadcastService,
      {} as ReportsService,
    );
    const body = privacyRequestSchema.parse({ confirmDeletion: true, userId: 'victim' });
    expect(body).not.toHaveProperty('userId');
    await controller.requestAccountDeletion({ id: 'caller' } as never, body as never);
    expect(requestAccountDeletion).toHaveBeenCalledWith('caller', undefined);
  });

  it('rejects oversize reason at the boundary', () => {
    expect(privacyRequestSchema.safeParse({ confirmDeletion: true, reason: 'x'.repeat(501) }).success).toBe(false);
  });
});
