import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { Controller, Post, Body, UseGuards, UseInterceptors, Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { QstashSignatureGuard } from '../src/qstash/qstash-signature.guard.js';
import { QstashIdempotencyInterceptor } from '../src/qstash/qstash-idempotency.interceptor.js';
import { PdfTaskService } from '../src/qstash/pdf-task.service.js';
import { QstashService } from '../src/qstash/qstash.service.js';
import { QueueService } from '../src/queue/queue.service.js';

const CURRENT_KEY = 'qstash-current-signing-key-32-chars!!';
const NEXT_KEY = 'qstash-next-signing-key-32-chars!!!!';

async function createQstashSignature(
  signingKey: string,
  body: string,
  options: { expiresIn?: number; url?: string } = {},
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + (options.expiresIn ?? 300);
  const bodyHash = crypto.createHash('sha256').update(body).digest('base64url');
  return new SignJWT({
    iss: 'Upstash',
    sub: options.url ?? 'https://api.jobsclick.live/webhooks/qstash/ping',
    body: bodyHash,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowSec)
    .setNotBefore(nowSec - 10)
    .setExpirationTime(exp)
    .sign(Buffer.from(signingKey, 'utf-8'));
}

@Injectable()
class SpyHandlerService {
  public calls = 0;
  public shouldFail = false;

  execute(payload: Record<string, unknown>) {
    this.calls += 1;
    if (this.shouldFail) {
      throw new Error('Transient handler error');
    }
    return { ok: true, count: this.calls, payload };
  }
}

@Controller('test-qstash')
class TestQstashController {
  constructor(@Inject(SpyHandlerService) private readonly spy: SpyHandlerService) {}

  @Post('webhook')
  @UseGuards(QstashSignatureGuard)
  @UseInterceptors(QstashIdempotencyInterceptor)
  handle(@Body() body: Record<string, unknown>) {
    return this.spy.execute(body);
  }
}

describe('QStash Cryptographic Signature, Replay & Production Delegation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function buildStrictApp(): Promise<{
    app: NestFastifyApplication;
    spy: SpyHandlerService;
  }> {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', CURRENT_KEY);
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', NEXT_KEY);

    const mockQueueService = {
      connection: new (await import('ioredis-mock')).default(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestQstashController],
      providers: [
        SpyHandlerService,
        QstashSignatureGuard,
        QstashIdempotencyInterceptor,
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    return {
      app,
      spy: moduleRef.get(SpyHandlerService),
    };
  }

  it('verifies a genuine QStash JWT signature with CURRENT key against exact rawBody bytes', async () => {
    const { app, spy } = await buildStrictApp();
    try {
      const rawBody = '{"event":"ping","unicode":"हिंदी"}';
      const sig = await createQstashSignature(CURRENT_KEY, rawBody);

      const res = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': sig,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(201);
      expect(spy.calls).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('accepts key rotation via NEXT_SIGNING_KEY when signature was signed by rotated key', async () => {
    const { app } = await buildStrictApp();
    try {
      const rawBody = '{"event":"rotated"}';
      const sig = await createQstashSignature(NEXT_KEY, rawBody);

      const res = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': sig,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it('rejects tampered whitespace/bytes, wrong key, expired JWT, and missing signature', async () => {
    const { app } = await buildStrictApp();
    try {
      const signedRawBody = '{"a":1,"b":2}';
      const validSig = await createQstashSignature(CURRENT_KEY, signedRawBody);

      // Whitespace-altered rawBody must fail cryptographic body digest check
      const tamperedRes = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': validSig,
        },
        payload: '{ "a": 1, "b": 2 }',
      });
      expect(tamperedRes.statusCode).toBe(401);

      const wrongKeySig = await createQstashSignature('attacker-signing-key-32-chars-long!', signedRawBody);
      const wrongKeyRes = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': wrongKeySig,
        },
        payload: signedRawBody,
      });
      expect(wrongKeyRes.statusCode).toBe(401);

      const expiredSig = await createQstashSignature(CURRENT_KEY, signedRawBody, { expiresIn: -60 });
      const expiredRes = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': expiredSig,
        },
        payload: signedRawBody,
      });
      expect(expiredRes.statusCode).toBe(401);

      const missingRes = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: { 'content-type': 'application/json' },
        payload: signedRawBody,
      });
      expect(missingRes.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('blocks duplicate completed QStash deliveries while allowing retry after handler failure', async () => {
    const { app, spy } = await buildStrictApp();
    try {
      const rawBody = '{"event":"idempotent"}';
      const sig = await createQstashSignature(CURRENT_KEY, rawBody);

      // Attempt 1 fails -> lock released -> attempt 2 allowed
      spy.shouldFail = true;
      const failRes = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': sig,
          'upstash-message-id': 'msg_retry_then_succeed',
        },
        payload: rawBody,
      });
      expect(failRes.statusCode).toBe(500);
      expect(spy.calls).toBe(1);

      // Attempt 2 succeeds -> cached completion prevents attempt 3 duplicate execution
      spy.shouldFail = false;
      const okRes = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': sig,
          'upstash-message-id': 'msg_retry_then_succeed',
        },
        payload: rawBody,
      });
      expect(okRes.statusCode).toBe(201);
      expect(spy.calls).toBe(2);

      const replayRes = await app.inject({
        method: 'POST',
        url: '/test-qstash/webhook',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': sig,
          'upstash-message-id': 'msg_retry_then_succeed',
        },
        payload: rawBody,
      });
      expect(replayRes.statusCode).toBe(201);
      expect(spy.calls).toBe(2); // handler did NOT re-run
      expect(JSON.parse(replayRes.payload).count).toBe(2);
    } finally {
      await app.close();
    }
  });

  it('delegates QStash PDF webhook in non-test environments to BullMQ instead of synthetic RAM cache', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');

    const publishPdfJob = vi.fn().mockResolvedValue({ id: 'bullmq-pdf-123' });
    const mockQueue = { publishPdfJob } as unknown as QueueService;
    const service = new PdfTaskService(new QstashService(), mockQueue);

    const res = await service.processPdfGenerationWebhook({
      seekerId: 'seeker-prod-1',
      fullName: 'Sunita Devi',
      seekerType: 'individual',
      city: 'Jaipur',
      skills: ['Sewing', 'Tailoring'],
    });

    expect(res).toEqual({
      seekerId: 'seeker-prod-1',
      queued: true,
      cached: false,
      jobId: 'bullmq-pdf-123',
    });
    expect(publishPdfJob).toHaveBeenCalledOnce();
    expect(service.getPdf('seeker-prod-1')).toBeUndefined();
  });
});
