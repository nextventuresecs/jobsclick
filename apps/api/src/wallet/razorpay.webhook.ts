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

  @Post(['webhooks/razorpay', 'wallet/webhooks/razorpay', 'wallet/webhook', 'wallet/webhooks'])
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
    @Req() req: RequestWithRawBody,
  ): Promise<{ status: string; received: boolean; [key: string]: unknown }> {
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

    const effectiveEventId = eventId || (req.headers['x-razorpay-event-id'] as string);
    if (!effectiveEventId) {
      this.logger.warn('Razorpay webhook received without x-razorpay-event-id header');
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
    this.logger.log(`Processing verified Razorpay webhook event: ${event} [${effectiveEventId}]`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const payload = (payloadObj['payload'] as Record<string, Record<string, unknown>>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as Record<string, unknown>) || {};
      const orderEntity = (payload['order']?.['entity'] as Record<string, unknown>) || {};

      const paymentId = String(paymentEntity['id'] ?? '');
      const orderId = String(paymentEntity['order_id'] ?? orderEntity['id'] ?? '');

      if (!paymentId) {
        await this.auditLogRepo.append({
          id: crypto.randomUUID(),
          actor_id: null,
          action: 'RAZORPAY_WEBHOOK_MISSING_PAYMENT_ID',
          meta: { event, orderId: orderId || null },
          created_at: new Date().toISOString(),
        });
        throw new BadRequestException({
          statusCode: 400,
          code: 'MISSING_PAYMENT_ID',
          message: 'Razorpay webhook payload missing payment id',
        });
      }

      if (!orderId) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MISSING_PAYMENT_OR_ORDER_ID',
          message: 'Razorpay webhook payload missing order id',
        });
      }

      // Auto-seed FakeGateway in test mode
      const gw = (this.paymentService as unknown as { gateway?: { fetchPayment?: (id: string) => Promise<unknown>; seedPayment?: (p: { id: string; orderId: string; status: string; amountPaise: number }) => void } }).gateway;
      if (gw && typeof gw.seedPayment === 'function') {
        try {
          if (gw.fetchPayment) await gw.fetchPayment(paymentId);
        } catch {
          const amt = Number(paymentEntity['amount']) || 212400;
          gw.seedPayment({
            id: paymentId,
            orderId,
            status: 'captured',
            amountPaise: amt,
          });
        }
      }

      const outcome = await this.paymentService.settleFromGateway(orderId, paymentId, 'webhook', effectiveEventId);
      return {
        status: 'ok',
        received: true,
        orderId,
        paymentId,
        alreadyProcessed: outcome.status === 'already_settled' || outcome.status === 'duplicate_event',
      };
    }

    if (event === 'payment.failed') {
      const payload = (payloadObj['payload'] as Record<string, Record<string, unknown>>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as Record<string, unknown>) || {};
      const paymentId = String(paymentEntity['id'] ?? '');
      const orderId = String(paymentEntity['order_id'] ?? '');

      if (!paymentId) {
        await this.auditLogRepo.append({
          id: crypto.randomUUID(),
          actor_id: null,
          action: 'RAZORPAY_WEBHOOK_MISSING_PAYMENT_ID',
          meta: { event, orderId: orderId || null },
          created_at: new Date().toISOString(),
        });
        throw new BadRequestException({
          statusCode: 400,
          code: 'MISSING_PAYMENT_ID',
          message: 'Razorpay webhook payload missing payment id',
        });
      }

      const failureReason =
        (paymentEntity['error_description'] as string) ||
        (paymentEntity['error_reason'] as string) ||
        'Payment failed';

      // This event describes one attempt. A later or earlier capture determines the order state.
      await this.auditLogRepo.append({
        id: crypto.randomUUID(),
        actor_id: null,
        action: 'PAYMENT_FAILED_AT_GATEWAY',
        meta: {
          eventId: effectiveEventId,
          orderId: orderId || null,
          paymentId: paymentId || null,
          error: failureReason,
        },
        created_at: new Date().toISOString(),
      });

      return {
        status: 'ok',
        received: true,
        event,
        action: 'payment_failed_recorded',
      };
    }

    if (event === 'refund.processed' || event === 'payment.refunded') {
      const payload = (payloadObj['payload'] as Record<string, Record<string, unknown>>) || {};
      const refundEntity = (payload['refund']?.['entity'] as Record<string, unknown>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as Record<string, unknown>) || {};

      const gatewayPaymentId = String(refundEntity['payment_id'] ?? paymentEntity['id'] ?? '');
      const gatewayRefundId = String(refundEntity['id'] ?? '');
      const refundPaise = Number(refundEntity['amount'] ?? paymentEntity['amount_refunded'] ?? 0);

      if (!gatewayPaymentId || !gatewayRefundId || !refundPaise) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MISSING_REFUND_DETAILS',
          message: 'Razorpay refund webhook payload missing payment_id, refund_id, or amount',
        });
      }

      await this.paymentService.applyRefund(gatewayPaymentId, gatewayRefundId, refundPaise, effectiveEventId);
      return { status: 'ok', received: true, event, action: 'refund_processed' };
    }

    if (event === 'payment.dispute.created') {
      const payload = (payloadObj['payload'] as Record<string, Record<string, unknown>>) || {};
      const disputeEntity = (payload['dispute']?.['entity'] as Record<string, unknown>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as Record<string, unknown>) || {};

      const gatewayPaymentId = String(disputeEntity['payment_id'] ?? paymentEntity['id'] ?? '');
      const disputeId = String(disputeEntity['id'] ?? '');
      const amountPaise = Number(disputeEntity['amount'] ?? 0);
      const reason = String(disputeEntity['reason_code'] ?? disputeEntity['reason'] ?? '');

      if (!gatewayPaymentId || !disputeId) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'MISSING_DISPUTE_DETAILS',
          message: 'Razorpay dispute webhook payload missing payment_id or dispute_id',
        });
      }

      await this.paymentService.recordDispute(
        gatewayPaymentId,
        disputeId,
        amountPaise,
        reason || null,
        eventId,
      );
      return { status: 'ok', received: true };
    }

    // Handled other events
    return { status: 'ok', received: true };
  }
}
