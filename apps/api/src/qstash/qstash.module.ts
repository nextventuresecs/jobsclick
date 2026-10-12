import { Module } from '@nestjs/common';
import { QstashService } from './qstash.service.js';
import { QstashSignatureGuard } from './qstash-signature.guard.js';
import { QstashWebhookController } from './qstash-webhook.controller.js';
import { PdfTaskService } from './pdf-task.service.js';

@Module({
  controllers: [QstashWebhookController],
  providers: [QstashService, QstashSignatureGuard, PdfTaskService],
  exports: [QstashService, QstashSignatureGuard, PdfTaskService],
})
export class QstashModule {}
