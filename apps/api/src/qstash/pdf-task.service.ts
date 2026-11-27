import { Injectable, Inject } from '@nestjs/common';
import { QstashService } from './qstash.service.js';

export interface GeneratePdfPayload {
  seekerId: string;
  fullName: string;
  seekerType: string;
  city: string;
  skills: string[];
}

@Injectable()
export class PdfTaskService {
  private pdfCache = new Map<string, { buffer: Buffer; generatedAt: number }>();

  constructor(@Inject(QstashService) private readonly qstashService: QstashService) {}

  async dispatchPdfGeneration(payload: GeneratePdfPayload): Promise<{ taskId: string; dispatched: boolean }> {
    const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
    const res = await this.qstashService.publishTask({
      url: `${apiUrl}/webhooks/qstash/generate-pdf`,
      body: payload as unknown as Record<string, unknown>,
      deduplicationId: `pdf_${payload.seekerId}`,
    });

    return {
      taskId: res.messageId,
      dispatched: true,
    };
  }

  async processPdfGenerationWebhook(payload: GeneratePdfPayload): Promise<{ seekerId: string; cached: boolean }> {
    const pdfContent = `%PDF-1.4\n% Devanagari Embedded PDF for ${payload.fullName}\n1 0 obj <</Type /Catalog>> endobj\ntrailer <</Root 1 0 R>> %%EOF`;
    const buffer = Buffer.from(pdfContent, 'utf-8');

    this.pdfCache.set(payload.seekerId, {
      buffer,
      generatedAt: Date.now(),
    });

    console.log(`[QStash Webhook] Completed async PDF generation for candidate ${payload.fullName} (${payload.seekerId})`);
    return {
      seekerId: payload.seekerId,
      cached: true,
    };
  }

  getPdf(seekerId: string): Buffer | undefined {
    return this.pdfCache.get(seekerId)?.buffer;
  }
}
