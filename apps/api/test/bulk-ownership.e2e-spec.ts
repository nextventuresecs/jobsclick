import { BulkService } from '../src/bulk/bulk.service.js';
import { QueueService } from '../src/queue/queue.service.js';
import type { AuthenticatedUser } from '../src/auth/decorators/current-user.decorator.js';
import { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('BULK-01–03 Tenant Isolation & Single BullMQ Queue', () => {
  let app: NestFastifyApplication;
  let batchId: string;
  let waveId: string;
  const owner = { 'x-user-id': 'institution-a', 'x-user-role': 'intermediary' };
  const other = { 'x-user-id': 'institution-b', 'x-user-role': 'intermediary' };
  const admin = { 'x-user-id': 'platform-admin', 'x-user-role': 'admin' };
  const msme = { 'x-user-id': 'msme-a', 'x-user-role': 'msme_admin' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const res = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: owner,
      payload: { source: 'College A', entityType: 'student', csvContent: 'email,phone\nstud@test.in,9876543210' },
    });
    expect(res.statusCode).toBe(201);
    batchId = res.json().id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows owner and platform admin to read, denying another uploader and MSME admin', async () => {
    for (const suffix of ['', '/error-report']) {
      for (const headers of [owner, admin]) {
        expect((await app.inject({ method: 'GET', url: `/bulk/batches/${batchId}${suffix}`, headers })).statusCode).toBe(200);
      }
      for (const headers of [other, msme]) {
        expect((await app.inject({ method: 'GET', url: `/bulk/batches/${batchId}${suffix}`, headers })).statusCode).toBe(404);
      }
    }
  });

  it('denies cross-owner previews and schedules before queueing', async () => {
    for (const action of ['preview', 'schedule']) {
      expect((await app.inject({
        method: 'POST',
        url: `/bulk/invites/${action}`,
        headers: other,
        payload: { batchId, waveSize: 1 },
      })).statusCode).toBe(404);
    }
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/invites/schedule',
      headers: owner,
      payload: { batchId, waveSize: 1 },
    });
    expect(res.statusCode).toBe(201);
    waveId = res.json().id;
  });

  it('denies cross-owner wave changes and allows the owner', async () => {
    for (const action of ['pause', 'resume', 'cancel']) {
      expect((await app.inject({
        method: 'PUT',
        url: `/bulk/invites/waves/${waveId}`,
        headers: other,
        payload: { action },
      })).statusCode).toBe(404);
    }
    expect((await app.inject({
      method: 'PUT',
      url: `/bulk/invites/waves/${waveId}`,
      headers: owner,
      payload: { action: 'pause' },
    })).statusCode).toBe(200);
  });

  it('denies employer import for institutions and restricts msme_admin to employers', async () => {
    const payload = { source: 'Untrusted', entityType: 'employer', csvContent: 'email,phone\na@test.in,9876543210' };
    for (const headers of [owner, { 'x-user-id': 'employer-a', 'x-user-role': 'employer' }]) {
      expect((await app.inject({ method: 'POST', url: '/bulk/batches', headers, payload })).statusCode).toBe(403);
    }
    const res = await app.inject({ method: 'POST', url: '/bulk/batches', headers: msme, payload });
    expect(res.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: `/bulk/batches/${res.json().id}`, headers: msme })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'POST',
      url: '/bulk/invites/preview',
      headers: msme,
      payload: { batchId: res.json().id, waveSize: 1 },
    })).statusCode).toBe(403);
  });

  it('checks persisted ownership before storage access, including ownerless legacy batches', async () => {
    const service = app.get(BulkService);
    const originalClient: unknown = Reflect.get(service, 'supabase');
    const download = vi.fn();
    for (const createdBy of ['institution-b', null]) {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: { id: batchId, created_by: createdBy }, error: null }),
      };
      Object.assign(service, {
        isTestMode: false,
        supabase: { from: () => query, storage: { from: () => ({ download }) } },
      });
      try {
        await expect(service.getBatchErrorCsv(batchId, { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)).rejects.toMatchObject({ status: 404 });
        await expect(service.getBatchStatus(batchId, { id: 'platform-admin', role: 'admin' } as AuthenticatedUser)).resolves.toHaveProperty('id', batchId);
        expect(download).not.toHaveBeenCalled();
      } finally {
        Object.assign(service, { supabase: originalClient, isTestMode: true });
      }
    }
  });

  it('persists the wave before publishing to BullMQ queue, without calling QStash', async () => {
    const service = app.get(BulkService);
    const originalClient: unknown = Reflect.get(service, 'supabase');
    let persisted: Record<string, unknown> | undefined;
    const batch = { id: batchId, created_by: 'institution-a', status: 'completed' };
    const client = {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          not: async () => ({ count: 10, error: null }),
          update: () => query,
          insert: (row: Record<string, unknown>) => {
            if (table === 'invite_waves') persisted = row;
            return query;
          },
          single: async () => ({ data: table === 'bulk_import_batches' ? batch : persisted, error: null }),
        };
        return query;
      },
    };
    const publish = vi.spyOn(app.get(QueueService), 'publishInviteWaveJob').mockImplementation(async (data) => {
      expect(persisted?.id).toBe(data.waveId);
      expect(persisted?.created_by).toBe('institution-a');
      return { id: 'test-job', name: 'invite-wave', data: {} } as unknown as Job;
    });
    Object.assign(service, { supabase: client, isTestMode: false });
    try {
      const res = await service.scheduleInviteWave({ batchId, waveSize: 1, costPerSmsInr: 0.2 }, 0, { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser);
      expect(res.id).toBe(persisted?.id);
      expect(publish).toHaveBeenCalled();
    } finally {
      publish.mockRestore();
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });

  it('rejects non-owner on a processing batch with BULK_NOT_FOUND without leaking existence', async () => {
    const service = app.get(BulkService);
    const originalClient: unknown = Reflect.get(service, 'supabase');
    const batch = { id: batchId, created_by: 'institution-a', status: 'processing' };
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: batch, error: null }),
    };
    Object.assign(service, { supabase: { from: () => query }, isTestMode: false });
    try {
      await expect(
        service.previewInviteWave({ batchId, waveSize: 1, costPerSmsInr: 0.2 }, { id: 'institution-b', role: 'intermediary' } as AuthenticatedUser)
      ).rejects.toMatchObject({ status: 404, message: 'BULK_NOT_FOUND' });
    } finally {
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });

  it('rejects owner on a processing batch with BULK_NOT_READY (code BULK_BATCH_NOT_READY)', async () => {
    const service = app.get(BulkService);
    const originalClient: unknown = Reflect.get(service, 'supabase');
    const batch = { id: batchId, created_by: 'institution-a', status: 'processing' };
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: batch, error: null }),
    };
    Object.assign(service, { supabase: { from: () => query }, isTestMode: false });
    try {
      await expect(
        service.previewInviteWave({ batchId, waveSize: 1, costPerSmsInr: 0.2 }, { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'BULK_BATCH_NOT_READY' },
      });
    } finally {
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });

  it('rejects owner when waveSize exceeds available valid candidates (code WAVE_SIZE_EXCEEDS_AVAILABLE)', async () => {
    const service = app.get(BulkService);
    const originalClient: unknown = Reflect.get(service, 'supabase');
    const batch = { id: batchId, created_by: 'institution-a', status: 'completed', valid_rows: 50 };
    const fromMock = (table: string) => {
      if (table === 'bulk_import_batches') {
        const query = {
          select: () => query,
          eq: () => query,
          single: async () => ({ data: batch, error: null }),
        };
        return query;
      }
      if (table === 'invitations') {
        const iQuery = {
          select: () => iQuery,
          eq: () => iQuery,
          not: async () => ({ count: 50, error: null }),
        };
        return iQuery;
      }
      return {};
    };
    Object.assign(service, { supabase: { from: fromMock }, isTestMode: false });
    try {
      await expect(
        service.previewInviteWave({ batchId, waveSize: 100, costPerSmsInr: 0.2 }, { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'WAVE_SIZE_EXCEEDS_AVAILABLE' },
      });
    } finally {
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });

  it('previewInviteWave bounds waveSize by pending invitations: 50 of 50 already sent, new wave of 50 rejected', async () => {
    const service = app.get(BulkService);
    const originalClient: unknown = Reflect.get(service, 'supabase');
    const batch = { id: batchId, created_by: 'institution-a', status: 'completed', valid_rows: 50 };

    const fromMock = (table: string) => {
      if (table === 'bulk_import_batches') {
        const bQuery = {
          select: () => bQuery,
          eq: () => bQuery,
          single: async () => ({ data: batch, error: null }),
        };
        return bQuery;
      }
      if (table === 'invitations') {
        const iQuery = {
          select: () => iQuery,
          eq: () => iQuery,
          // 50 of 50 already sent -> 0 pending invitations remaining with phone!
          not: async () => ({ count: 0, error: null }),
        };
        return iQuery;
      }
      return {};
    };

    Object.assign(service, { supabase: { from: fromMock }, isTestMode: false });

    try {
      await expect(
        service.previewInviteWave({ batchId, waveSize: 50, costPerSmsInr: 0.2 }, { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)
      ).rejects.toMatchObject({
        status: 400,
        response: {
          code: 'WAVE_SIZE_EXCEEDS_AVAILABLE',
          message: expect.stringContaining('exceeds available pending candidates (0)'),
        },
      });
    } finally {
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });

  it('fails closed with ServiceUnavailableException when audit log write fails in getBatchErrorCsv', async () => {
    const service = app.get(BulkService);
    const originalAuditRepo: unknown = Reflect.get(service, 'auditLogRepo');
    const mockAuditRepo = {
      append: vi.fn().mockRejectedValue(new Error('Audit DB down')),
    };
    Object.assign(service, { auditLogRepo: mockAuditRepo });
    try {
      await expect(
        service.getBatchErrorCsv(batchId, { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)
      ).rejects.toThrow('Audit logging unavailable for PII export');
    } finally {
      Object.assign(service, { auditLogRepo: originalAuditRepo });
    }
  });

  it('scheduleInviteWave marks wave as failed in DB and throws ServiceUnavailableException when publishInviteWaveJob fails', async () => {
    const service = app.get(BulkService);
    const queueService = app.get(QueueService);
    const originalClient: unknown = Reflect.get(service, 'supabase');
    const originalPublish = queueService.publishInviteWaveJob;
    queueService.publishInviteWaveJob = vi.fn().mockRejectedValue(new Error('BullMQ connection failure'));

    let updatedWaveStatus: string | null = null;
    const batchData = { id: batchId, created_by: 'institution-a', status: 'completed', valid_rows: 10 };
    const waveMock = { id: 'wave_fail_test', created_by: 'institution-a', batch_id: batchId, wave_size: 1, cost_per_sms_inr: 0.2, total_cost_inr: 0.2, status: 'dispatched' };

    const fromMock = (table: string) => {
      if (table === 'bulk_import_batches') {
        const bQuery = {
          select: () => bQuery,
          eq: () => bQuery,
          single: async () => ({ data: batchData, error: null }),
        };
        return bQuery;
      }
      if (table === 'invitations') {
        const iQuery = {
          select: () => iQuery,
          eq: () => iQuery,
          not: async () => ({ count: 10, error: null }),
        };
        return iQuery;
      }
      const wQuery = {
        insert: () => wQuery,
        select: () => wQuery,
        single: async () => ({ data: waveMock, error: null }),
        update: (fields: { status: string }) => {
          updatedWaveStatus = fields.status;
          return wQuery;
        },
        eq: () => wQuery,
      };
      return wQuery;
    };

    Object.assign(service, { supabase: { from: fromMock }, isTestMode: false });

    try {
      await expect(
        service.scheduleInviteWave({ batchId, waveSize: 1, costPerSmsInr: 0.2 }, 0, { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)
      ).rejects.toThrow('Failed to schedule invite wave in queue');
      // Verify wave row was marked failed in DB
      expect(updatedWaveStatus).toBe('failed');
    } finally {
      queueService.publishInviteWaveJob = originalPublish;
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });

  it('executeInviteWaveJob acts only on dispatched waves and never moves failed, queued, or completed waves to dispatched', async () => {
    const service = app.get(BulkService);
    const queueService = app.get(QueueService);
    const publishSpy = vi.spyOn(queueService, 'publishInviteWaveJob');
    const originalClient: unknown = Reflect.get(service, 'supabase');

    interface MockQuery {
      select: () => MockQuery;
      eq: () => MockQuery;
      single: () => Promise<{ data: unknown; error: unknown }>;
      update?: ReturnType<typeof vi.fn>;
    }

    const statuses = ['failed', 'queued', 'completed'] as const;
    for (const st of statuses) {
      publishSpy.mockClear();
      const waveMock = { id: `wave_${st}`, batch_id: batchId, wave_size: 10, cost_per_sms_inr: 0.2, status: st };
      const updateFn = vi.fn();
      const query: MockQuery = {
        select: () => query,
        eq: () => query,
        single: async () => ({ data: waveMock, error: null }),
        update: updateFn,
      };
      updateFn.mockReturnValue(query);
      Object.assign(service, { supabase: { from: () => query }, isTestMode: false });
      const result = await service.executeInviteWaveJob(`wave_${st}`);
      expect(result.status).toBe(st);
      expect(publishSpy).not.toHaveBeenCalled();
      expect(updateFn).not.toHaveBeenCalled();
    }

    // Now verify it acts when status === 'dispatched'
    publishSpy.mockClear();
    const dispatchedMock = { id: 'wave_disp', batch_id: batchId, wave_size: 10, cost_per_sms_inr: 0.2, status: 'dispatched' };
    const queryDisp: MockQuery = {
      select: () => queryDisp,
      eq: () => queryDisp,
      single: async () => ({ data: dispatchedMock, error: null }),
    };
    Object.assign(service, { supabase: { from: () => queryDisp }, isTestMode: false });
    const resDisp = await service.executeInviteWaveJob('wave_disp');
    expect(resDisp.status).toBe('dispatched');
    expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({ waveId: 'wave_disp' }));

    Object.assign(service, { supabase: originalClient, isTestMode: true });
  });

  it('updateWaveStatus on resume executes atomic update where status=queued returning, and double resume fails', async () => {
    const service = app.get(BulkService);
    const queueService = app.get(QueueService);
    const publishSpy = vi.spyOn(queueService, 'publishInviteWaveJob');
    const originalClient: unknown = Reflect.get(service, 'supabase');

    const batchData = { id: batchId, created_by: 'institution-a', status: 'completed', valid_rows: 50 };

    let currentWaveState: { id: string; batch_id: string; wave_size: number; cost_per_sms_inr: number; status: string } = {
      id: 'w_atomic',
      batch_id: batchId,
      wave_size: 10,
      cost_per_sms_inr: 0.2,
      status: 'queued',
    };

    const fromMock = (table: string) => {
      if (table === 'bulk_import_batches') {
        const bQuery = {
          select: () => bQuery,
          eq: () => bQuery,
          single: async () => ({ data: batchData, error: null }),
        };
        return bQuery;
      }

      const eqFilters: Record<string, string> = {};
      let updateFields: Record<string, unknown> | null = null;

      const wQuery = {
        select: () => wQuery,
        update: (fields: Record<string, unknown>) => {
          updateFields = fields;
          return wQuery;
        },
        eq: (col: string, val: string) => {
          eqFilters[col] = val;
          return wQuery;
        },
        single: async () => ({ data: { ...currentWaveState }, error: null }),
        maybeSingle: async () => {
          if (updateFields) {
            if (eqFilters['status'] && currentWaveState.status !== eqFilters['status']) {
              return { data: null, error: null };
            }
            Object.assign(currentWaveState, updateFields);
            return { data: { ...currentWaveState }, error: null };
          }
          return { data: { ...currentWaveState }, error: null };
        },
      };
      return wQuery;
    };

    Object.assign(service, { supabase: { from: fromMock }, isTestMode: false });

    // First resume: succeeds and publishes
    publishSpy.mockClear();
    const firstResume = await service.updateWaveStatus('w_atomic', 'resume', { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser);
    expect(firstResume.status).toBe('dispatched');
    expect(currentWaveState.status).toBe('dispatched');
    expect(publishSpy).toHaveBeenCalledTimes(1);

    // Second resume (double resume): wave is no longer queued -> rejected with WAVE_NOT_QUEUED and does NOT publish
    publishSpy.mockClear();
    await expect(
      service.updateWaveStatus('w_atomic', 'resume', { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'WAVE_NOT_QUEUED' },
    });
    expect(publishSpy).not.toHaveBeenCalled();

    Object.assign(service, { supabase: originalClient, isTestMode: true });
  });

  it('publishInviteWaveJob builds a unique BullMQ jobId per publish to avoid retained job deduplication', async () => {
    const queueService = app.get(QueueService);
    const waveId = 'wave_unique_job_id_test';

    const job1 = await queueService.publishInviteWaveJob({
      waveId,
      batchId,
      waveSize: 10,
    });

    const job2 = await queueService.publishInviteWaveJob({
      waveId,
      batchId,
      waveSize: 10,
    });

    expect(job1.id).toBeDefined();
    expect(job2.id).toBeDefined();
    expect(job1.id).not.toBe(job2.id);
    expect(job1.id).toMatch(new RegExp(`^wave-${waveId}-`));
    expect(job2.id).toMatch(new RegExp(`^wave-${waveId}-`));
    expect(job1.id).not.toContain(':');
    expect(job2.id).not.toContain(':');
  });

  it('real BullMQ Job validation accepts hyphenated jobId without colon', () => {
    const testWaveId = 'wave-abc-123';
    const uniqueJobId = `wave-${testWaveId}-${randomUUID()}`;
    const dummyQueue = { toKey: (str: string) => `bull:${str}`, opts: { prefix: 'bull' } };
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const job = new Job(dummyQueue as any, 'invite-wave', {}, { jobId: uniqueJobId });
    expect(() => job.validateOptions({ data: '{}' })).not.toThrow();

    // Verify colon-containing ID is rejected by real BullMQ validateOptions
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const badJob = new Job(dummyQueue as any, 'invite-wave', {}, { jobId: `wave:${testWaveId}:123:456` });
    expect(() => badJob.validateOptions({ data: '{}' })).toThrow('Custom Id cannot contain :');
  });

  it('updateWaveStatus on resume reverts wave status to queued in DB and throws ServiceUnavailableException when publishInviteWaveJob fails', async () => {
    const service = app.get(BulkService);
    const queueService = app.get(QueueService);
    const originalPublish = queueService.publishInviteWaveJob;
    queueService.publishInviteWaveJob = vi.fn().mockRejectedValue(new Error('BullMQ failure on resume'));

    const originalClient: unknown = Reflect.get(service, 'supabase');
    const batchData = { id: batchId, created_by: 'institution-a', status: 'completed', valid_rows: 50 };

    const currentWaveState = {
      id: 'w_revert_test',
      batch_id: batchId,
      wave_size: 10,
      cost_per_sms_inr: 0.2,
      status: 'queued',
    };

    let statusAfterRevert: string | null = null;

    const fromMock = (table: string) => {
      if (table === 'bulk_import_batches') {
        const bQuery = {
          select: () => bQuery,
          eq: () => bQuery,
          single: async () => ({ data: batchData, error: null }),
        };
        return bQuery;
      }

      let updatePayload: Record<string, unknown> | null = null;
      const wQuery = {
        select: () => wQuery,
        update: (fields: Record<string, unknown>) => {
          updatePayload = fields;
          return wQuery;
        },
        eq: (col: string, val: string) => {
          if (col === 'status' && updatePayload && currentWaveState.status !== val) {
            return {
              ...wQuery,
              maybeSingle: async () => ({ data: null, error: null }),
            };
          }
          return wQuery;
        },
        single: async () => ({ data: { ...currentWaveState }, error: null }),
        maybeSingle: async () => {
          if (updatePayload) {
            Object.assign(currentWaveState, updatePayload);
            statusAfterRevert = currentWaveState.status;
            return { data: { ...currentWaveState }, error: null };
          }
          return { data: { ...currentWaveState }, error: null };
        },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        then: (onfulfilled?: (value: any) => any, onrejected?: (value: any) => any) => {
          if (updatePayload) {
            Object.assign(currentWaveState, updatePayload);
            statusAfterRevert = currentWaveState.status;
          }
          return Promise.resolve({ data: { ...currentWaveState }, error: null }).then(onfulfilled, onrejected);
        },
      };
      return wQuery;
    };

    Object.assign(service, { supabase: { from: fromMock }, isTestMode: false });

    try {
      await expect(
        service.updateWaveStatus('w_revert_test', 'resume', { id: 'institution-a', role: 'intermediary' } as AuthenticatedUser)
      ).rejects.toMatchObject({
        status: 503,
      });
      // Verify wave was reverted back to 'queued'
      expect(currentWaveState.status).toBe('queued');
      expect(statusAfterRevert).toBe('queued');
    } finally {
      queueService.publishInviteWaveJob = originalPublish;
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });
});
