import { afterEach, describe, expect, it, vi } from 'vitest';
import IORedis from 'ioredis';
import { ServiceUnavailableException } from '@nestjs/common';
import { QueueService, DEFAULT_JOB_OPTIONS } from '../src/queue/queue.service.js';
import { OtpRedisService } from '../src/auth/otp-redis.service.js';
import { HealthController } from '../src/health/health.controller.js';
import { validateEnv } from '../src/config/env.js';

describe('Redis, BullMQ & Health Readiness Production Hardening', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('bounds QueueService.enqueue so hung Redis rejects with 503 QUEUE_UNAVAILABLE', async () => {
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('QUEUE_PUBLISH_TIMEOUT_MS', '60');
    const queueService = new QueueService();
    try {
      Object.defineProperty(queueService, 'isMock', { value: false });
      vi.spyOn(queueService.bulkImportQueue, 'add').mockImplementation(
        () => new Promise(() => {}) as never,
      );

      await expect(
        queueService.publishBulkImportJob({ batchId: 'batch-hang', source: 'fixture' }),
      ).rejects.toMatchObject({
        status: 503,
        response: { code: 'QUEUE_UNAVAILABLE' },
      });
    } finally {
      await queueService.onModuleDestroy();
    }
  });

  it('fast-fails BEFORE queue.add when Redis connection is not ready', async () => {
    vi.stubEnv('APP_ENV', 'test');
    const queueService = new QueueService();
    try {
      Object.defineProperty(queueService, 'isMock', { value: false });
      Object.defineProperty(queueService.connection, 'status', { value: 'end', configurable: true });
      const addSpy = vi.spyOn(queueService.pdfGeneratorQueue, 'add');

      await expect(
        queueService.publishPdfJob({
          seekerId: 's1',
          fullName: 'Test User',
          seekerType: 'student',
          city: 'Bhopal',
          skills: [],
        }),
      ).rejects.toMatchObject({
        status: 503,
        response: { code: 'QUEUE_UNAVAILABLE' },
      });
      expect(addSpy).not.toHaveBeenCalled();
    } finally {
      await queueService.onModuleDestroy();
    }
  });

  it('routes publishAlertsJob cleanly through mock counters in test and QueueService.enqueue in live mode', async () => {
    vi.stubEnv('APP_ENV', 'test');
    const queueService = new QueueService();
    try {
      const addSpy = vi.spyOn(queueService.alertsQueue, 'add');
      const mockJob = await queueService.publishAlertsJob({ timeframeHours: 24 });
      expect(mockJob.name).toContain('search-alerts-');
      expect(addSpy).not.toHaveBeenCalled();

      Object.defineProperty(queueService, 'isMock', { value: false });
      addSpy.mockRejectedValueOnce(new Error('Broker refused'));
      await expect(queueService.publishAlertsJob({ timeframeHours: 24 })).rejects.toMatchObject({
        status: 503,
        response: { code: 'QUEUE_UNAVAILABLE' },
      });
    } finally {
      await queueService.onModuleDestroy();
    }
  });

  it('reports honest unavailable status in getLiveQueueMetrics instead of mock zeros during Redis outage', async () => {
    vi.stubEnv('APP_ENV', 'test');
    const queueService = new QueueService();
    try {
      Object.defineProperty(queueService, 'isMock', { value: false });
      vi.spyOn(queueService.bulkImportQueue, 'getJobCounts').mockRejectedValue(new Error('ECONNREFUSED'));
      vi.spyOn(queueService.inviteWaveQueue, 'getJobCounts').mockRejectedValue(new Error('ECONNREFUSED'));
      vi.spyOn(queueService.pdfGeneratorQueue, 'getJobCounts').mockRejectedValue(new Error('ECONNREFUSED'));
      vi.spyOn(queueService.broadcastQueue, 'getJobCounts').mockRejectedValue(new Error('ECONNREFUSED'));
      vi.spyOn(queueService.alertsQueue, 'getJobCounts').mockRejectedValue(new Error('ECONNREFUSED'));

      const metrics = await queueService.getLiveQueueMetrics();
      expect(metrics.status).toBe('unavailable');
      expect(metrics.queues.every((q) => q.status === 'unavailable' && q.error === 'REDIS_UNAVAILABLE')).toBe(true);
    } finally {
      await queueService.onModuleDestroy();
    }
  });

  it('detects Redis Cluster CROSSSLOT topology in OtpRedisService.checkSinglePrimaryTopology()', async () => {
    const fakeClusterClient = {
      eval: vi.fn().mockRejectedValue(new Error("CROSSSLOT Keys in request don't hash to the same slot")),
      defineCommand: vi.fn(),
      status: 'ready',
      quit: vi.fn().mockResolvedValue('OK'),
    } as unknown as IORedis;

    vi.stubEnv('OTP_PEPPER', 'b8eLqRnYs3wGxMoZfUvJiKb8eLqRnYs3');
    const otpRedis = new OtpRedisService(fakeClusterClient);
    const result = await otpRedis.checkSinglePrimaryTopology();
    expect(result).toEqual({ ok: false, reason: 'REDIS_CLUSTER_UNSUPPORTED' });
    await otpRedis.onModuleDestroy();
  });

  it('/health/ready returns 200 when dependencies pass and 503 when Redis probe fails', async () => {
    const healthyController = new HealthController(
      { checkReadiness: vi.fn().mockResolvedValue({ ok: true, mode: 'redis' }) } as unknown as QueueService,
      { checkReadiness: vi.fn().mockResolvedValue({ ok: true }) } as unknown as OtpRedisService,
      undefined,
    );
    const okRes = await healthyController.readiness();
    expect(okRes.status).toBe('ready');

    const degradedController = new HealthController(
      { checkReadiness: vi.fn().mockResolvedValue({ ok: false, mode: 'redis', reason: 'REDIS_UNAVAILABLE' }) } as unknown as QueueService,
      { checkReadiness: vi.fn().mockResolvedValue({ ok: true }) } as unknown as OtpRedisService,
      undefined,
    );
    await expect(degradedController.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects partial QStash config in strict environments while allowing BullMQ-only config', () => {
    const baseProd: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: '3001',
      DATABASE_URL: 'postgresql://prod_app_user:Kx9#mP2$vL8!zQ4@db.example.com:5432/app',
      REDIS_URL: 'rediss://default:Ab3$zQ9*wL2!xP5@redis.example.com:6380',
      JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
      OTP_PEPPER: 'b8eLqRnYs3wGxMoZfUvJiKb8eLqRnYs3',
      ADMIN_DASHBOARD_SECRET: 'k4V9xQwL2mRpZ8sT6yN3bH7jK4v9XqWl',
      CF_ORIGIN_LOCKED: 'true',
      SMS_GATEWAY_MODE: 'live',
      MSG91_AUTH_KEY: 'msg91_live_auth_key_sec_99182746',
      TURNSTILE_SECRET_KEY: '0x4AAAAAAABBBCCCDDDEEEFFF12345',
      SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-service-role-payload-long-string',
      WEB_URL: 'https://jobsclick.live',
      APP_URL: 'https://jobsclick.live',
      EMAIL_FROM: 'JobsClick <notifications@jobsclick.live>',
      STORAGE_PUBLIC_URL: 'https://proj.supabase.co/storage/v1/object/public',
      RAZORPAY_KEY_ID: 'rzp_live_1234567890abcdef',
      RAZORPAY_KEY_SECRET: 'live_secret_key_16_chars_min',
      RAZORPAY_WEBHOOK_SECRET: 'live_webhook_secret_20_chars_min',
      TRUST_PROXY_HOPS: '1',
      TRUSTED_PROXY_CIDRS: '127.0.0.1/32,10.0.0.0/8',
    };

    // BullMQ-only (no QSTASH_* vars set) passes cleanly
    expect(() => validateEnv(baseProd)).not.toThrow();

    // Partial QStash (token set without signing key) fails boot
    expect(() =>
      validateEnv({ ...baseProd, QSTASH_TOKEN: 'qst_live_token_abc', API_URL: 'https://api.jobsclick.live' }),
    ).toThrow(/QSTASH_CURRENT_SIGNING_KEY/);

    // Complete QStash passes
    expect(() =>
      validateEnv({
        ...baseProd,
        QSTASH_TOKEN: 'qst_live_token_abc',
        QSTASH_CURRENT_SIGNING_KEY: 'sig_live_curr_abc',
        API_URL: 'https://api.jobsclick.live',
      }),
    ).not.toThrow();

    // #123: ADMIN_DASHBOARD_SECRET mandatory & distinct from JWT_SECRET
    expect(() =>
      validateEnv({ ...baseProd, ADMIN_DASHBOARD_SECRET: undefined }),
    ).toThrow(/ADMIN_DASHBOARD_SECRET/);
    expect(() =>
      validateEnv({ ...baseProd, ADMIN_DASHBOARD_SECRET: baseProd['JWT_SECRET'] }),
    ).toThrow(/ADMIN_DASHBOARD_SECRET/);

    // #133: TRUST_PROXY_HOPS must be explicitly configured in strict environments
    expect(() =>
      validateEnv({ ...baseProd, TRUST_PROXY_HOPS: undefined }),
    ).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('#124 enforces bounded removeOnComplete and removeOnFail retention on non-payment queues', () => {
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ age: 86400, count: 1000 });
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toEqual({ age: 604800, count: 5000 });
  });
});
