import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { QstashService } from '../src/qstash/qstash.service.js';

describe('QStash Service & Webhook Signature Verification - Ticket 1', () => {
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
});
