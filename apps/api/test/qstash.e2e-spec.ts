import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { QstashService } from '../src/qstash/qstash.service.js';

describe('QStash Service & Webhooks - Tickets 1 & 2', () => {
  let app: NestFastifyApplication;
  let qstashService: QstashService;

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
});
