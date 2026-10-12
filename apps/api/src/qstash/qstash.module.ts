import { Module } from '@nestjs/common';
import { QstashService } from './qstash.service.js';
import { QstashSignatureGuard } from './qstash-signature.guard.js';
import { QstashWebhookController } from './qstash-webhook.controller.js';

@Module({
  controllers: [QstashWebhookController],
  providers: [QstashService, QstashSignatureGuard],
  exports: [QstashService, QstashSignatureGuard],
})
export class QstashModule {}
