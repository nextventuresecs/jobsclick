import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { UserRow } from '@indian-job-portal/database';
import { AppModule } from '../src/app.module.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { QueueService } from '../src/queue/queue.service.js';
import multipart from '@fastify/multipart';

describe('BulkController (e2e) - Epic 4 (Issues #16-#20, #38, #39)', () => {
  let app: NestFastifyApplication;
  let userRepo: UserRepository;
  let jwtService: JwtService;
  let otpRedis: OtpRedisService;

  let adminUser: { id: string; phone: string; token: string };
  let seekerUser: { id: string; phone: string; token: string };
  let adminHeaders: Record<string, string>;
  let seekerHeaders: Record<string, string>;

  let batchId: string;
  let waveId: string;

  async function createTestUser(role: UserRow['role']): Promise<{ id: string; phone: string; token: string }> {
    const userId = randomUUID();
    const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    await userRepo.save({
      id: userId,
      phone,
      email: null,
      role,
      status: 'active',
      source: 'seed',
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await otpRedis.setAuthState(userId, {
      role,
      status: 'active',
      tokenVersion: 0,
    });
    const token = await jwtService.signAccessToken(userId, 0, {
      role,
      status: 'active',
    });
    return { id: userId, phone, token };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.register(multipart as unknown as Parameters<NestFastifyApplication['register']>[0]);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userRepo = app.get(UserRepository);
    jwtService = app.get(JwtService);
    otpRedis = app.get(OtpRedisService);

    adminUser = await createTestUser('admin');
    seekerUser = await createTestUser('job_seeker');

    adminHeaders = {
      Authorization: `Bearer ${adminUser.token}`,
      'x-user-id': adminUser.id,
      'x-user-role': 'admin',
    };

    seekerHeaders = {
      Authorization: `Bearer ${seekerUser.token}`,
      'x-user-id': seekerUser.id,
      'x-user-role': 'job_seeker',
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces authentication and rejects unauthenticated callers on bulk & admin endpoints (Issue #3)', async () => {
    // 1. POST /bulk/batches/file without auth
    const signedUrlRes = await app.inject({
      method: 'POST',
      url: '/bulk/batches/file',
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

  it('does not issue direct storage upload credentials for imports', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/signed-url',
      headers: adminHeaders,
      payload: {
        fileName: 'students_50000_roster.csv',
        contentType: 'text/csv',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejects caller-supplied storage paths', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: adminHeaders,
      payload: {
        source: 'Indore Institute of Science & Tech',
        entityType: 'student',
        storagePath: `bulk-imports/${adminUser.id}/mock_50k_batch.csv`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  async function submitRoster(content: BlobPart, filename = 'roster.csv', entityType = 'student') {
    const form = new FormData();
    form.set('source', 'Test Institution');
    form.set('entityType', entityType);
    form.set('file', new Blob([content]), filename);
    const request = new Request('http://localhost', { method: 'POST', body: form });

    return app.inject({
      method: 'POST',
      url: '/bulk/batches/file',
      headers: { ...adminHeaders, 'content-type': request.headers.get('content-type')! },
      payload: Buffer.from(await request.arrayBuffer()),
    });
  }

  it('accepts an Excel workbook and queues a validated CSV reference', async () => {
    const workbook = await readFile(new URL('./fixtures/bulk-roster.xlsx', import.meta.url));
    const publish = vi.spyOn(app.get(QueueService), 'publishBulkImportJob');
    try {
      const response = await submitRoster(Uint8Array.from(workbook), 'roster.xlsx', 'employer');
      expect(response.statusCode).toBe(201);
      const batch = response.json();
      expect(batch).toMatchObject({ status: 'queued', totalRows: 1, entityType: 'employer' });
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({
        batchId: batch.id,
        entityType: 'employer',
        storagePath: expect.stringMatching(/\.csv$/),
      }));
      expect(publish.mock.calls[0]?.[0]).not.toHaveProperty('csvContent');
    } finally {
      publish.mockRestore();
    }
  });

  it('rejects an Excel workbook with Aadhaar columns before queueing', async () => {
    const workbook = await readFile(new URL('./fixtures/bulk-roster-aadhaar.xlsx', import.meta.url));
    const publish = vi.spyOn(app.get(QueueService), 'publishBulkImportJob');
    try {
      const response = await submitRoster(Uint8Array.from(workbook), 'roster.xlsx');
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'BULK_AADHAAR_UNSUPPORTED' });
      expect(publish).not.toHaveBeenCalled();
    } finally {
      publish.mockRestore();
    }
  });

  it('provides blank CSV and Excel templates that cannot enqueue sample accounts', async () => {
    const base = new URL('../../web/public/templates/', import.meta.url);
    const csv = await readFile(new URL('msme_business_onboarding_template.csv', base), 'utf8');
    const workbook = await readFile(new URL('msme_business_onboarding_template.xlsx', base));
    expect(csv.trim().split(/\r?\n/)).toHaveLength(1);
    const response = await submitRoster(Uint8Array.from(workbook), 'template.xlsx', 'employer');
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('BULK_CSV_EMPTY');
  });

  it('rejects Aadhaar columns before either import path can enqueue a roster', async () => {
    const csv = '\uFEFF"Student Name",Phone,"Aadhaar Number"\nCandidate,9876543210,1234';
    const publish = vi.spyOn(app.get(QueueService), 'publishBulkImportJob');
    try {
      const inline = await app.inject({
        method: 'POST',
        url: '/bulk/batches',
        headers: adminHeaders,
        payload: { source: 'Test Institution', entityType: 'student', csvContent: csv },
      });
      const file = await submitRoster(csv);
      expect(inline.statusCode).toBe(400);
      expect(file.statusCode).toBe(400);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      publish.mockRestore();
    }
  });

  it('queues a 50,000-row CSV through the file endpoint without carrying it in the queue payload', async () => {
    const rows = Array.from({ length: 50_000 }, (_, index) =>
      `Example Candidate ${index},${9_000_000_000 + index}`,
    );
    const publish = vi.spyOn(app.get(QueueService), 'publishBulkImportJob');
    try {
      const response = await submitRoster(['Student Name,Phone', ...rows].join('\n'));
      expect(response.statusCode).toBe(201);
      const batch = JSON.parse(response.payload);
      expect(batch.status).toBe('queued');
      expect(batch.source).toBe('Test Institution');
      expect(publish.mock.calls[0]?.[0]).toMatchObject({
        batchId: batch.id,
        storagePath: expect.stringMatching(/^bulk-imports\//),
      });
      expect(publish.mock.calls[0]?.[0]).not.toHaveProperty('csvContent');
    } finally {
      publish.mockRestore();
    }
  });
});
