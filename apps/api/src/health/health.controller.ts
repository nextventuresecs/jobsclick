import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { captureException } from '../config/sentry.js';
import { Public } from '../auth/decorators/public.decorator.js';

@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
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

  @Get('uptime')
  uptimeCheck() {
    return {
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
  }

  @Get('test-error')
  triggerTestError() {
    const error = new Error('Observability Baseline Test Error');
    const sentryEventId = captureException(error);
    return {
      message: 'Test error triggered for Sentry verification',
      sentryEventId,
    };
  }
}
