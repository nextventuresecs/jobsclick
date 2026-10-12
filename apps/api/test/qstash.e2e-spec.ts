import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { QstashService } from '../src/qstash/qstash.service.js';
import { PdfTaskService } from '../src/qstash/pdf-task.service.js';

describe('QStash Service & Webhooks - Tickets 1, 2, 3, 4', () => {
  let app: NestFastifyApplication;
  let qstashService: QstashService;
  let pdfTaskService: PdfTaskService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    qstashService = app.get<QstashService>(QstashService);
    pdfTaskService = app.get<PdfTaskService>(PdfTaskService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('QstashService publishes task and returns messageId', async () => {
    const res = await qstashService.publishTask({
      url: 'http://localhost:3001/webhooks/qstash/ping',
      body: { event: 'ping.test', timestamp: Date.now() },
      delaySeconds: 5,
    });

    expect(res.messageId).toBeDefined();
    expect(res.scheduled).toBe(true);
    expect(res.url).toContain('/webhooks/qstash/ping');
  });

  it('POST /webhooks/qstash/ping succeeds with signature verification', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/qstash/ping',
      headers: {
        'upstash-signature': 'test_valid_signature_jwt',
      },
      payload: { hello: 'qstash' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.pong).toBe(true);
    expect(body.receivedPayload.hello).toBe('qstash');
  });

  it('POST /webhooks/qstash/ping rejects invalid signature with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/qstash/ping',
      headers: {
        'upstash-signature': 'test_invalid_signature',
      },
      payload: { hello: 'qstash' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /webhooks/qstash/import-batch processes CSV import via QStash webhook (Ticket 2)', async () => {
    const csvContent = `name,phone\nKaran Patel,9876543230\nRavi Sharma,9876543231`;
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/qstash/import-batch',
      headers: {
        'upstash-signature': 'test_valid_signature_jwt',
      },
      payload: {
        batchId: 'batch_qstash_test_1',
        source: 'MSME QStash Ingestion',
        entityType: 'student',
        csvContent,
      },
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.payload);
    expect(result.id).toBe('batch_qstash_test_1');
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.status).toBe('completed');
  });

  it('POST /webhooks/qstash/send-invite-wave processes delayed invite wave via QStash webhook (Ticket 3)', async () => {
    const scheduleRes = await app.inject({
      method: 'POST',
      url: '/bulk/invites/schedule',
      payload: { batchId: 'batch_qstash_test_1', waveSize: 100, costPerSmsInr: 0.2 },
    });
    expect(scheduleRes.statusCode).toBe(201);
    const wave = JSON.parse(scheduleRes.payload);

    const webhookRes = await app.inject({
      method: 'POST',
      url: '/webhooks/qstash/send-invite-wave',
      headers: {
        'upstash-signature': 'test_valid_signature_jwt',
      },
      payload: { waveId: wave.id },
    });

    expect(webhookRes.statusCode).toBe(201);
    const executedWave = JSON.parse(webhookRes.payload);
    expect(executedWave.id).toBe(wave.id);
    expect(executedWave.status).toBe('completed');
    expect(executedWave.sentCount).toBe(100);
  });

  it('POST /webhooks/qstash/generate-pdf renders and caches PDF asynchronously (Ticket 4)', async () => {
    const payload = {
      seekerId: 'seeker_async_99',
      fullName: 'Vikas Sharma',
      seekerType: 'individual',
      city: 'Indore',
      skills: ['Tally', 'Accounting'],
    };

    // 1. Dispatch task via service
    const dispatch = await pdfTaskService.dispatchPdfGeneration(payload);
    expect(dispatch.dispatched).toBe(true);
    expect(dispatch.taskId).toBeDefined();

    // 2. Process via QStash Webhook
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/qstash/generate-pdf',
      headers: {
        'upstash-signature': 'test_valid_signature_jwt',
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.cached).toBe(true);
    expect(body.seekerId).toBe('seeker_async_99');

    // 3. Verify cached PDF buffer exists
    const pdf = pdfTaskService.getPdf('seeker_async_99');
    expect(pdf).toBeDefined();
    expect(pdf!.length).toBeGreaterThan(0);
  });
});
