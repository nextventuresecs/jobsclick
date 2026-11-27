import { Module } from '@nestjs/common';
import { QstashService } from './qstash.service.js';
import { QstashSignatureGuard } from './qstash-signature.guard.js';
import { QstashIdempotencyInterceptor } from './qstash-idempotency.interceptor.js';
import { QstashWebhookController } from './qstash-webhook.controller.js';
import { PdfTaskService } from './pdf-task.service.js';

@Module({
  controllers: [QstashWebhookController],
  providers: [QstashService, QstashSignatureGuard, QstashIdempotencyInterceptor, PdfTaskService],
  exports: [QstashService, QstashSignatureGuard, QstashIdempotencyInterceptor, PdfTaskService],
})
export class QstashModule {}
