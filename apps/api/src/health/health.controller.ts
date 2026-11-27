import {
  Controller, Get, Header, HttpCode, HttpStatus, Inject, NotFoundException, Optional, Post, ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isStaging, isTestEnv } from '@indian-job-portal/validation';
import { captureException } from '../config/sentry.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/guards/roles.guard.js';
import { QueueService } from '../queue/queue.service.js';
import { OtpRedisService } from '../auth/otp-redis.service.js';
import { SUPABASE_CLIENT } from '../database/supabase.provider.js';

interface DependencyCheckResult {
  ok: boolean;
  mode?: string;
  reason?: string;
}

@Controller('health')
export class HealthController {
  constructor(
    @Optional() @Inject(QueueService) private readonly queueService?: QueueService,
    @Optional() @Inject(OtpRedisService) private readonly otpRedisService?: OtpRedisService,
    @Optional() @Inject(SUPABASE_CLIENT) private readonly supabase?: SupabaseClient,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @Header('Cache-Control', 'no-store')
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      deploymentId: process.env['RAILWAY_DEPLOYMENT_ID'],
    };
  }

  @Public()
  @SkipThrottle()
  @Get('live')
  @Header('Cache-Control', 'no-store')
  liveness() {
    return this.check();
  }

  @Public()
  @SkipThrottle()
  @Get('uptime')
  uptimeCheck() {
    return {
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
  }

  @Public()
  @SkipThrottle()
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async readiness() {
    const queueCheck = await this.checkQueueRedis();
    const otpCheck = await this.checkOtpRedis();
    const dbCheck = await this.checkDatabase();
    const qstashCheck = this.checkQstashConfig();

    const checks = {
      queueRedis: queueCheck,
      otpRedis: otpCheck,
      database: dbCheck,
      qstash: qstashCheck,
    };

    const allOk = Object.values(checks).every((c) => c.ok);
    const payload = {
      status: allOk ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      deploymentId: process.env['RAILWAY_DEPLOYMENT_ID'],
      checks,
    };

    if (!allOk) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  private async checkQueueRedis(): Promise<DependencyCheckResult> {
    if (!this.queueService) {
      return { ok: false, reason: 'QUEUE_SERVICE_UNAVAILABLE' };
    }
    return this.queueService.checkReadiness();
  }

  private async checkOtpRedis(): Promise<DependencyCheckResult> {
    if (!this.otpRedisService) {
      return { ok: false, reason: 'OTP_REDIS_SERVICE_UNAVAILABLE' };
    }
    if (isTestEnv()) {
      return { ok: true, mode: 'test' };
    }
    return this.otpRedisService.checkReadiness();
  }

  private async checkDatabase(): Promise<DependencyCheckResult> {
    if (isTestEnv() || !this.supabase) {
      return { ok: true, mode: isTestEnv() ? 'test' : 'skipped' };
    }
    try {
      const result = await Promise.race([
        this.supabase.from('jobs').select('id', { count: 'exact', head: true }).limit(1),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DB_HEALTH_TIMEOUT')), 2500),
        ),
      ]);
      if (result.error) {
        return { ok: false, reason: 'DB_QUERY_FAILED' };
      }
      return { ok: true, mode: 'supabase' };
    } catch {
      return { ok: false, reason: 'DB_UNAVAILABLE' };
    }
  }

  private checkQstashConfig(): DependencyCheckResult {
    const token = process.env['QSTASH_TOKEN']?.trim();
    const currentKey = process.env['QSTASH_CURRENT_SIGNING_KEY']?.trim();
    const enabled = process.env['ENABLE_QSTASH'] === 'true' || Boolean(token);
    if (!enabled || isTestEnv()) {
      return { ok: true, mode: enabled ? 'test' : 'disabled' };
    }
    if (!token || !currentKey || token === 'qstash_dummy_token' || currentKey === 'sig_dummy_current_key') {
      return { ok: false, reason: 'QSTASH_MISCONFIGURED' };
    }
    return { ok: true, mode: 'configured' };
  }

  @Post('test-error')
  @Roles('admin')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  triggerTestError() {
    if (!isStaging()) throw new NotFoundException();
    if (!process.env['SENTRY_DSN']?.trim()) {
      throw new ServiceUnavailableException({ code: 'SENTRY_UNAVAILABLE' });
    }
    return { sentryEventId: captureException(new Error('Observability Baseline Test Error')) };
  }
}
