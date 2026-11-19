import { BulkService } from '../src/bulk/bulk.service.js';
import { QueueService } from '../src/queue/queue.service.js';
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
        await expect(service.getBatchErrorCsv(batchId, { id: 'institution-a', role: 'intermediary' } as any)).rejects.toMatchObject({ status: 404 });
        await expect(service.getBatchStatus(batchId, { id: 'platform-admin', role: 'admin' } as any)).resolves.toHaveProperty('id', batchId);
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
    const batch = { id: batchId, created_by: 'institution-a' };
    const client = {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
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
      return { id: 'test-job' } as any;
    });
    Object.assign(service, { supabase: client, isTestMode: false });
    try {
      const res = await service.scheduleInviteWave({ batchId, waveSize: 1, costPerSmsInr: 0.2 }, 0, { id: 'institution-a', role: 'intermediary' } as any);
      expect(res.id).toBe(persisted?.id);
      expect(publish).toHaveBeenCalled();
    } finally {
      publish.mockRestore();
      Object.assign(service, { supabase: originalClient, isTestMode: true });
    }
  });
});
