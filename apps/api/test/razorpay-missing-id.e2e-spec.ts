import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import crypto from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';

describe('Razorpay Webhook: Reject Missing Payment ID & Audit Log (Ticket: No Composed IDs)', () => {
  let app: NestFastifyApplication;
  let auditLogRepo: AuditLogRepository;
  let paymentRepo: PaymentRepository;
  const webhookSecret = 'test_webhook_secret_key_12345';

  beforeAll(async () => {
    process.env['ENABLE_P2_PAYMENTS'] = 'true';
    process.env['RAZORPAY_WEBHOOK_SECRET'] = webhookSecret;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    auditLogRepo = app.get(AuditLogRepository);
    paymentRepo = app.get(PaymentRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects payment.captured webhook with HTTP 400 when payment id is missing, records audit log, and never invents pay_ ID', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            order_id: 'order_test_9999',
            // id is deliberately omitted
            amount: 50000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawPayload)
      .digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
      },
      payload: rawPayload,
    });

    // Must reject with 400 Bad Request
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('MISSING_PAYMENT_ID');

    // Must record an audit log entry
    const auditLogs = await auditLogRepo.findAll(50);
    const matchingLog = auditLogs.find((l) => l.action === 'RAZORPAY_WEBHOOK_MISSING_PAYMENT_ID');
    expect(matchingLog).toBeDefined();
    expect(matchingLog?.meta?.['event']).toBe('payment.captured');

    // Must NEVER create a payment record with pay_
    const allPayments = await paymentRepo.findByUserId('usr_test');
    expect(allPayments.some((p) => p.gateway_payment_id?.startsWith('pay_'))).toBe(false);
  });

  it('rejects payment.failed webhook with HTTP 400 when payment id is missing and records audit log', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            order_id: 'order_failed_test_9999',
            // id is deliberately omitted
            error_description: 'Payment authentication failed',
          },
        },
      },
    });

    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawPayload)
      .digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
      },
      payload: rawPayload,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('MISSING_PAYMENT_ID');

    const auditLogs = await auditLogRepo.findAll(50);
    const matchingLog = auditLogs.find(
      (l) => l.action === 'RAZORPAY_WEBHOOK_MISSING_PAYMENT_ID' && l.meta?.['event'] === 'payment.failed',
    );
    expect(matchingLog).toBeDefined();
  });
});
