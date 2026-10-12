import { Controller, Post, Body, UseGuards, Inject } from '@nestjs/common';
import { QstashSignatureGuard } from './qstash-signature.guard.js';
import { PdfTaskService, GeneratePdfPayload } from './pdf-task.service.js';

@Controller('webhooks/qstash')
export class QstashWebhookController {
  constructor(@Inject(PdfTaskService) private readonly pdfTaskService: PdfTaskService) {}

  @Post('ping')
  @UseGuards(QstashSignatureGuard)
  async ping(@Body() body: Record<string, unknown>) {
    return {
      pong: true,
      receivedPayload: body,
      timestamp: new Date().toISOString(),
    };
  }

  // Ticket 4: Async PDF Generation Webhook
  @Post('generate-pdf')
  @UseGuards(QstashSignatureGuard)
  async handleGeneratePdfWebhook(@Body() payload: GeneratePdfPayload) {
    return this.pdfTaskService.processPdfGenerationWebhook(payload);
  }
}
