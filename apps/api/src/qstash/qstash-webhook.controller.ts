import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { QstashSignatureGuard } from './qstash-signature.guard.js';

@Controller('webhooks/qstash')
export class QstashWebhookController {
  @Post('ping')
  @UseGuards(QstashSignatureGuard)
  async ping(@Body() body: Record<string, unknown>) {
    return {
      pong: true,
      receivedPayload: body,
      timestamp: new Date().toISOString(),
    };
  }
}
