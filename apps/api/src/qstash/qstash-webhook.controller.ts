import { Controller, Post, Body, UseGuards, UseInterceptors, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { QstashSignatureGuard } from './qstash-signature.guard.js';
import { QstashIdempotencyInterceptor } from './qstash-idempotency.interceptor.js';
import { PdfTaskService, GeneratePdfPayload } from './pdf-task.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@SkipThrottle()
@Public()
@Controller('webhooks/qstash')
export class QstashWebhookController {
  constructor(@Inject(PdfTaskService) private readonly pdfTaskService: PdfTaskService) {}

  @Post('ping')
  @UseGuards(QstashSignatureGuard)
  @UseInterceptors(QstashIdempotencyInterceptor)
  async ping(@Body() body: Record<string, unknown>) {
    return {
      pong: true,
      receivedPayload: body,
      timestamp: new Date().toISOString(),
    };
  }

  // Ticket 4: Async PDF Generation Webhook (delegates to BullMQ worker in production)
  @Post('generate-pdf')
  @UseGuards(QstashSignatureGuard)
  @UseInterceptors(QstashIdempotencyInterceptor)
  async handleGeneratePdfWebhook(@Body() payload: GeneratePdfPayload) {
    return this.pdfTaskService.processPdfGenerationWebhook(payload);
  }
}
