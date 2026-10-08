import { Controller, Get } from '@nestjs/common';
import { captureException } from '../config/sentry.js';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
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
