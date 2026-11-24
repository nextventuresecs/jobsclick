import {
  Controller, Get, Header, HttpCode, HttpStatus, NotFoundException, Post, ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { isStaging } from '@indian-job-portal/validation';
import { captureException } from '../config/sentry.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/guards/roles.guard.js';

@Controller('health')
export class HealthController {
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
  @Get('uptime')
  uptimeCheck() {
    return {
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
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
