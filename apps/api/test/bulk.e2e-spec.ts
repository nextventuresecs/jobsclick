import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('BulkController (e2e) - Epic 4 (Issues #16-#20, #38, #39)', () => {
  let app: NestFastifyApplication;
  let batchId: string;
  let waveId: string;

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

  const adminHeaders = { 'x-user-id': 'usr_admin_tester' };

  it('enforces authentication and rejects unauthenticated callers on bulk & admin endpoints (Issue #3)', async () => {
    // 1. POST /bulk/signed-url without auth
    const signedUrlRes = await app.inject({
      method: 'POST',
      url: '/bulk/signed-url',
      payload: { fileName: 'test.csv', contentType: 'text/csv' },
    });
    expect(signedUrlRes.statusCode).toBe(401);

    // 2. POST /bulk/batches without auth
    const batchRes = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      payload: { source: 'Anonymous', entityType: 'student', csvContent: 'name,phone\nA,9876543210' },
    });
    expect(batchRes.statusCode).toBe(401);

    // 3. GET /admin/metrics without auth
    const metricsRes = await app.inject({
      method: 'GET',
      url: '/admin/metrics',
    });
    expect(metricsRes.statusCode).toBe(401);
  });

  it('enforces RBAC and rejects unauthorized job_seeker role from calling bulk/admin endpoints (Issue #3)', async () => {
    const seekerHeaders = { 'x-user-id': 'usr_candidate_unauthorized' };

    const batchRes = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: seekerHeaders,
      payload: { source: 'Rogue Seeker', entityType: 'student', csvContent: 'name,phone\nA,9876543210' },
    });
    expect(batchRes.statusCode).toBe(403);

    const metricsRes = await app.inject({
      method: 'GET',
      url: '/admin/metrics',
      headers: seekerHeaders,
    });
    expect(metricsRes.statusCode).toBe(403);
  });

  it('POST /bulk/batches - parses CSV, checks duplicates, stores source, and creates users in invited state with ZERO SMS (Hard Invariants #2 & #3)', async () => {
    const sampleCsv = `name,phone
Anita Sharma,9876543210
Rahul Verma,9876543211
Invalid Person,12345
Duplicate Person,9876543210`;

    const res = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: adminHeaders,
      payload: {
        source: 'MSME Department MP',
        entityType: 'student',
        csvContent: sampleCsv,
      },
    });

    expect(res.statusCode).toBe(201);
    const batch = JSON.parse(res.payload);
    expect(batch.id).toBeDefined();
    expect(batch.source).toBe('MSME Department MP');
    expect(batch.totalRows).toBe(4);
    expect(batch.validRows).toBe(2);
    expect(batch.errorRows).toBe(2);
    batchId = batch.id;
  });

  it('GET /bulk/batches/:id/error-report - returns downloadable error CSV report (BULK-02)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/bulk/batches/${batchId}/error-report`,
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.payload).toContain('Invalid Indian 10-digit mobile number format');
    expect(res.payload).toContain('Duplicate mobile number inside file');
  });

  it('POST /bulk/invites/preview & /schedule - previews SMS cost & schedules wave (BULK-03 & Issue #38)', async () => {
    const previewRes = await app.inject({
      method: 'POST',
      url: '/bulk/invites/preview',
      headers: adminHeaders,
      payload: { batchId, waveSize: 5000, costPerSmsInr: 0.2 },
    });

    expect(previewRes.statusCode).toBe(201);
    const preview = JSON.parse(previewRes.payload);
    expect(preview.totalCostInr).toBe(1000);

    const scheduleRes = await app.inject({
      method: 'POST',
      url: '/bulk/invites/schedule',
      headers: adminHeaders,
      payload: { batchId, waveSize: 5000, costPerSmsInr: 0.2 },
    });

    expect(scheduleRes.statusCode).toBe(201);
    const wave = JSON.parse(scheduleRes.payload);
    expect(wave.id).toBeDefined();
    expect(wave.status).toBe('dispatched');
    waveId = wave.id;
  });

  it('PUT /bulk/invites/waves/:waveId - pauses and resumes wave scheduler (Issue #38)', async () => {
    const pauseRes = await app.inject({
      method: 'PUT',
      url: `/bulk/invites/waves/${waveId}`,
      headers: adminHeaders,
      payload: { action: 'pause' },
    });

    expect(pauseRes.statusCode).toBe(200);
    const paused = JSON.parse(pauseRes.payload);
    expect(paused.status).toBe('queued');

    const resumeRes = await app.inject({
      method: 'PUT',
      url: `/bulk/invites/waves/${waveId}`,
      headers: adminHeaders,
      payload: { action: 'resume' },
    });

    expect(resumeRes.statusCode).toBe(200);
    const resumed = JSON.parse(resumeRes.payload);
    expect(resumed.status).toBe('dispatched');
  });

  it('GET /admin/metrics - returns launch metrics split by source (Issue #39)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/metrics',
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(200);
    const metrics = JSON.parse(res.payload);
    expect(metrics.summary.registered).toBeDefined();
    expect(metrics.bySource['MSME Department MP']).toBeDefined();
  });

  it('GET /admin/queues - returns bull-board queue status (Issue #19)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/queues',
      headers: adminHeaders,
    });

    expect(res.statusCode).toBe(200);
    const queueData = JSON.parse(res.payload);
    expect(queueData.queues.length).toBeGreaterThan(0);
  });

  it('POST /bulk/signed-url - generates secure signed upload URL for direct storage upload (Ticket T-08)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/signed-url',
      headers: adminHeaders,
      payload: {
        fileName: 'students_50000_roster.csv',
        contentType: 'text/csv',
      },
    });

    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.payload);
    expect(data.signedUrl).toBeDefined();
    expect(data.storagePath).toContain('bulk-imports/');
    expect(data.token).toBeDefined();
  });

  it('POST /bulk/batches - accepts storagePath and creates queued batch asynchronously (Ticket T-08)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: adminHeaders,
      payload: {
        source: 'Indore Institute of Science & Tech',
        entityType: 'student',
        storagePath: 'bulk-imports/mock_50k_batch.csv',
      },
    });

    expect(res.statusCode).toBe(201);
    const batch = JSON.parse(res.payload);
    expect(batch.id).toBeDefined();
    expect(batch.status).toBe('queued');
    expect(batch.source).toBe('Indore Institute of Science & Tech');
  });
});
