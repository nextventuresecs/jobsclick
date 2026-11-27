import {
  BadRequestException,
  Injectable,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  generatePdfTaskPayloadSchema,
  isTestEnv,
  type GeneratePdfTaskPayload,
} from '@indian-job-portal/validation';
import { QstashService } from './qstash.service.js';
import { QueueService } from '../queue/queue.service.js';

export type GeneratePdfPayload = GeneratePdfTaskPayload;

@Injectable()
export class PdfTaskService {
  private pdfCache = new Map<string, { buffer: Buffer; generatedAt: number }>();

  constructor(
    @Inject(QstashService) private readonly qstashService: QstashService,
    @Optional() @Inject(QueueService) private readonly queueService?: QueueService,
  ) {}

  async dispatchPdfGeneration(payload: GeneratePdfPayload): Promise<{ taskId: string; dispatched: boolean }> {
    const parsed = generatePdfTaskPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'INVALID_PDF_TASK_PAYLOAD' });
    }

    const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
    const res = await this.qstashService.publishTask({
      url: `${apiUrl}/webhooks/qstash/generate-pdf`,
      body: parsed.data as unknown as Record<string, unknown>,
      deduplicationId: `pdf_${parsed.data.seekerId}`,
    });

    return {
      taskId: res.messageId,
      dispatched: true,
    };
  }

  async processPdfGenerationWebhook(
    payload: GeneratePdfPayload,
  ): Promise<{ seekerId: string; queued: boolean; cached: boolean; jobId?: string }> {
    const parsed = generatePdfTaskPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'INVALID_PDF_TASK_PAYLOAD' });
    }
    const valid = parsed.data;

    // Never store synthetic fake PDF bytes in process memory outside tests.
    // Production/staging delegates to the BullMQ pdf-generator worker (Supabase private storage + Devanagari font).
    if (!isTestEnv()) {
      if (!this.queueService) {
        throw new ServiceUnavailableException({ code: 'QUEUE_UNAVAILABLE' });
      }
      const job = await this.queueService.publishPdfJob({
        seekerId: valid.seekerId,
        fullName: valid.fullName,
        seekerType: valid.seekerType,
        city: valid.city,
        skills: valid.skills,
        updatedAt: valid.updatedAt,
      });
      return {
        seekerId: valid.seekerId,
        queued: true,
        cached: false,
        jobId: job.id,
      };
    }

    // Test-mode path preserves deterministic verification when no live worker runs.
    if (this.queueService && process.env['QSTASH_PDF_DELEGATE_TEST'] === 'true') {
      const job = await this.queueService.publishPdfJob({
        seekerId: valid.seekerId,
        fullName: valid.fullName,
        seekerType: valid.seekerType,
        city: valid.city,
        skills: valid.skills,
        updatedAt: valid.updatedAt,
      });
      return {
        seekerId: valid.seekerId,
        queued: true,
        cached: false,
        jobId: job.id,
      };
    }

    const pdfContent = `%PDF-1.4\n% Test PDF fixture for ${valid.seekerId}\n1 0 obj <</Type /Catalog>> endobj\ntrailer <</Root 1 0 R>> %%EOF`;
    const buffer = Buffer.from(pdfContent, 'utf-8');
    this.pdfCache.set(valid.seekerId, {
      buffer,
      generatedAt: Date.now(),
    });

    return {
      seekerId: valid.seekerId,
      queued: false,
      cached: true,
    };
  }

  getPdf(seekerId: string): Buffer | undefined {
    if (!isTestEnv()) {
      return undefined;
    }
    return this.pdfCache.get(seekerId)?.buffer;
  }
}
