import {
  Controller,
  Post,
  Headers,
  Req,
  BadRequestException,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { PaymentService } from './payment.service.js';
import { AuditLogRepository } from '../database/repositories/audit-log.repository.js';
import { captureException } from '../config/sentry.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { RequireFeatureFlag } from '../auth/guards/feature-flag.guard.js';

interface RequestWithRawBody extends FastifyRequest {
  rawBody?: Buffer | string;
}

@SkipThrottle()
@Public()
@Controller()
@RequireFeatureFlag('ENABLE_P2_PAYMENTS')
export class RazorpayWebhookController {
  private readonly logger = new Logger(RazorpayWebhookController.name);

  constructor(
    @Inject(PaymentService) private readonly paymentService: PaymentService,
    @Inject(AuditLogRepository) private readonly auditLogRepo: AuditLogRepository,
  ) {}

  @Post(['webhooks/razorpay', 'wallet/webhooks/razorpay'])
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
    @Req() req: RequestWithRawBody,
  ): Promise<{ status: string; received: boolean }> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('Fastify rawBody is missing in webhook handler');
      throw new InternalServerErrorException('Fastify rawBody is missing or unconfigured');
    }

    if (!signature) {
      this.logger.warn('Razorpay webhook received without x-razorpay-signature header');
      captureException(new Error('Razorpay webhook missing x-razorpay-signature header'));
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SIGNATURE',
        message: 'Missing or invalid x-razorpay-signature header',
      });
    }

    const isValid = this.paymentService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn('Razorpay webhook HMAC signature verification failed');
      captureException(new Error('Invalid Razorpay webhook signature detected'));
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid Razorpay webhook signature',
      });
    }

    if (!eventId) {
      this.logger.warn('Razorpay webhook missing x-razorpay-event-id header');
      throw new BadRequestException({
        statusCode: 400,
        code: 'MISSING_EVENT_ID',
        message: 'Missing x-razorpay-event-id header',
      });
    }

    let payloadObj: Record<string, unknown>;
    try {
      const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : String(rawBody);
      payloadObj = JSON.parse(rawString);
    } catch {
      throw new BadRequestException({
        statusCode: 400,
        code: 'MALFORMED_JSON',
        message: 'Malformed JSON webhook payload',
      });
    }

    const event = String(payloadObj['event'] ?? '');
    this.logger.log(`Processing verified Razorpay webhook event: ${event} [${eventId}]`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const payload = (payloadObj['payload'] as Record<string, Record<string, unknown>>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as Record<string, unknown>) || {};
      const orderEntity = (payload['order']?.['entity'] as Record<string, unknown>) || {};

      const paymentId = String(paymentEntity['id'] ?? '');
      const orderId = String(paymentEntity['order_id'] ?? orderEntity['id'] ?? '');

      if (!paymentId || !orderId) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MISSING_PAYMENT_OR_ORDER_ID',
          message: 'Razorpay webhook payload missing payment or order id',
        });
      }

      await this.paymentService.settleFromGateway(orderId, paymentId, 'webhook', eventId);
      return { status: 'ok', received: true };
    }

    if (event === 'payment.failed') {
      const payload = (payloadObj['payload'] as Record<string, Record<string, unknown>>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as Record<string, unknown>) || {};
      const paymentId = String(paymentEntity['id'] ?? '');
      const orderId = String(paymentEntity['order_id'] ?? '');

      await this.auditLogRepo.append({
        id: crypto.randomUUID(),
        actor_id: null,
        action: 'PAYMENT_FAILED_AT_GATEWAY',
        meta: {
          eventId,
          orderId: orderId || null,
          paymentId: paymentId || null,
          error: paymentEntity['error_description'] || paymentEntity['error_reason'] || null,
        },
        created_at: new Date().toISOString(),
      });

      return { status: 'ok', received: true };
    }

    // Handled other events (refund.processed, payment.refunded, etc.)
    return { status: 'ok', received: true };
  }
}
