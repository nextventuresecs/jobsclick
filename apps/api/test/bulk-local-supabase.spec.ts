import pg from 'pg';
import { randomUUID, randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { BulkService } from '../src/bulk/bulk.service.js';
import { AppModule } from '../src/app.module.js';
import { ImportProcessor } from '../../worker/src/processors/import.processor.js';
import type { BulkImportJobData } from '../../worker/src/processors/import.processor.js';
import type { Job } from 'bullmq';
import type { Database } from '@indian-job-portal/database';

// Opt-in: real local PostgREST/Storage. Identity comes from TestAuthModule;
// ownership, persistence, CSV processing, and storage use the real local services.
describe.runIf(process.env['RUN_LOCAL_SUPABASE'] === '1')('BULK-01–03 local Supabase isolation', () => {
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const phone = `9${randomInt(100000000, 999999999)}`;
  const prefix = `bulk-isolation-${randomUUID()}`;
  const headers = (id: string, role = 'intermediary') => ({ 'x-user-id': id, 'x-user-role': role });
  let app: NestFastifyApplication | undefined;
  let batchId: string;
  let waveId: string;
  let storagePath: string;
  const paths: string[] = [];
  const batchIds: string[] = [];
  const client = () => createClient<Database>('http://127.0.0.1:54321', process.env['SUPABASE_SERVICE_ROLE_KEY']!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  beforeAll(async () => {
    if (process.env['NODE_ENV'] !== 'test' || process.env['SUPABASE_URL'] !== 'http://127.0.0.1:54321') {
      throw new Error('Local Supabase test requires explicit localhost test configuration');
    }
    const db = client();
    const users = await db.from('users').insert([
      { id: ownerId, phone: `8${randomInt(100000000, 999999999)}`, role: 'intermediary', status: 'active', source: prefix },
      { id: otherId, phone: `8${randomInt(100000000, 999999999)}`, role: 'intermediary', status: 'active', source: prefix },
    ]);
    expect(users.error).toBeNull();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    Object.assign(app.get(BulkService), { supabase: db, isTestMode: false });
  });

  afterAll(async () => {
    const db = client();
    try {
      if (paths.length) expect((await db.storage.from('private').remove(paths)).error).toBeNull();
      if (batchIds.length) {
        expect((await db.from('invitations').delete().in('batch_id', batchIds)).error).toBeNull();
        expect((await db.from('invite_waves').delete().in('batch_id', batchIds)).error).toBeNull();
        expect((await db.from('bulk_import_batches').delete().in('id', batchIds)).error).toBeNull();
      }
    } finally {
      try { expect((await db.from('users').delete().eq('source', prefix)).error).toBeNull(); }
      finally { await app?.close(); }
    }
  });

  it('persists uploader ownership and imports invited users without SMS', async () => {
    const signed = await app!.inject({ method: 'POST', url: '/bulk/signed-url', headers: headers(ownerId), payload: { fileName: 'students.csv' } });
    expect(signed.statusCode).toBe(201);
    storagePath = signed.json().storagePath;
    paths.push(storagePath);
    const csv = `name,phone\nLocal Candidate,${phone}\nInvalid,12345`;
    expect((await client().storage.from('private').uploadToSignedUrl(storagePath, signed.json().token, csv, { contentType: 'text/csv' })).error).toBeNull();
    const created = await app!.inject({ method: 'POST', url: '/bulk/batches', headers: headers(ownerId), payload: {
      source: prefix, entityType: 'student', storagePath, created_by: otherId,
    } });
    expect(created.statusCode).toBe(201);
    batchId = created.json().id;
    batchIds.push(batchId);
    expect((await client().from('bulk_import_batches').select('created_by').eq('id', batchId).single()).data?.created_by).toBe(ownerId);
    paths.push(`bulk-imports/${batchId}-errors.csv`);
    const result = await new ImportProcessor(client()).process({
      data: { batchId, source: prefix, entityType: 'student', storagePath }, attemptsMade: 0,
    } as Job<BulkImportJobData>);
    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(1);
    const imported = await client().from('users').select('status,source').eq('phone', phone).single();
    expect(imported.error).toBeNull();
    expect(imported.data).toEqual({ status: 'invited', source: prefix });
    expect((await client().from('invitations').select('status').eq('batch_id', batchId).single()).data?.status).toBe('pending');
  });

  it('serves the owner CSV but denies another tenant through the API and direct Data API', async () => {
    for (const suffix of ['', '/error-report']) {
      expect((await app!.inject({ method: 'GET', url: `/bulk/batches/${batchId}${suffix}`, headers: headers(otherId) })).statusCode).toBe(404);
      expect((await app!.inject({ method: 'GET', url: `/bulk/batches/${batchId}${suffix}`, headers: headers(otherId, 'admin') })).statusCode).toBe(200);
    }
    const report = await app!.inject({ method: 'GET', url: `/bulk/batches/${batchId}/error-report`, headers: headers(ownerId) });
    expect(report.statusCode).toBe(200);
    expect(report.payload).toContain('Invalid Indian 10-digit');
    const anonymous = createClient('http://127.0.0.1:54321', process.env['SUPABASE_ANON_KEY']!);
    expect((await anonymous.from('bulk_import_batches').select('*').eq('id', batchId)).error?.code).toBe('42501');
    expect((await anonymous.from('invite_waves').select('*')).error?.code).toBe('42501');
  });

  it.each(['anon', 'authenticated'] as const)('blocks direct bulk-table access for database role %s with RLS enabled', async (role) => {
    const connection = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await connection.connect();
    try {
      const catalog = await connection.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid IN ('public.bulk_import_batches'::regclass, 'public.invite_waves'::regclass)");
      expect(catalog.rows).toHaveLength(2);
      expect(catalog.rows.every((row) => row.relrowsecurity)).toBe(true);
      for (const table of ['bulk_import_batches', 'invite_waves']) {
        await connection.query('BEGIN');
        try {
          await connection.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
          await connection.query(role === 'anon' ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
          await expect(connection.query(`SELECT id FROM public.${table} LIMIT 1`)).rejects.toMatchObject({ code: '42501' });
        } finally { await connection.query('ROLLBACK'); }
      }
    } finally { await connection.end(); }
  });
  it('denies another uploader storage references and invitation controls', async () => {
    expect((await app!.inject({ method: 'POST', url: '/bulk/batches', headers: headers(otherId), payload: {
      source: prefix, entityType: 'student', storagePath,
    } })).statusCode).toBe(403);
    for (const action of ['preview', 'schedule']) {
      expect((await app!.inject({ method: 'POST', url: `/bulk/invites/${action}`, headers: headers(otherId), payload: { batchId, waveSize: 1 } })).statusCode).toBe(404);
    }
    const scheduled = await app!.inject({ method: 'POST', url: '/bulk/invites/schedule', headers: headers(ownerId), payload: { batchId, waveSize: 1 } });
    expect(scheduled.statusCode, scheduled.payload).toBe(201);
    waveId = scheduled.json().id;
    for (const action of ['pause', 'resume', 'cancel']) {
      expect((await app!.inject({ method: 'PUT', url: `/bulk/invites/waves/${waveId}`, headers: headers(otherId), payload: { action } })).statusCode).toBe(404);
    }
    expect((await client().from('invite_waves').select('status,created_by').eq('id', waveId).single()).data).toEqual({ status: 'dispatched', created_by: ownerId });
  });
});
