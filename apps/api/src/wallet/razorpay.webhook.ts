import {
  Controller,
  Post,
  Headers,
  Req,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PaymentService } from './payment.service.js';
import { captureException } from '../config/sentry.js';
import { RequireFeatureFlag } from '../auth/guards/feature-flag.guard.js';

interface RequestWithRawBody extends FastifyRequest {
  rawBody?: string;
}

@Controller()
@RequireFeatureFlag('ENABLE_P2_PAYMENTS')
export class RazorpayWebhookController {
  private readonly logger = new Logger(RazorpayWebhookController.name);

  constructor(@Inject(PaymentService) private readonly paymentService: PaymentService) {}

  // POST /webhooks/razorpay and POST /wallet/webhooks/razorpay
  @Post(['webhooks/razorpay', 'wallet/webhooks/razorpay'])
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
  ) {
    if (!signature) {
      this.logger.warn('Razorpay webhook received without x-razorpay-signature header');
      captureException(new Error('Razorpay webhook missing x-razorpay-signature header'));
      throw new BadRequestException({
        statusCode: 400,
        code: 'MISSING_SIGNATURE',
        message: 'Missing x-razorpay-signature header',
      });
    }

    // Fastify custom JSON parser attaches exact string on req.rawBody
    const rawPayload = req.rawBody || (typeof body === 'string' ? body : JSON.stringify(body));

    const isValid = this.paymentService.verifyWebhookSignature(rawPayload, signature);
    if (!isValid) {
      this.logger.warn('Razorpay webhook HMAC signature verification failed');
      captureException(new Error('Invalid Razorpay webhook signature detected'));
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid Razorpay webhook signature',
      });
    }

    const event = body['event'] as string;
    this.logger.log(`Received verified Razorpay webhook event: ${event}`);

    // Process payment.captured or order.paid events
    if (event === 'payment.captured' || event === 'order.paid') {
      const payload = (body['payload'] as Record<string, Record<string, string> | undefined>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as unknown as Record<string, string>) || {};
      const orderEntity = (payload['order']?.['entity'] as unknown as Record<string, string>) || {};

      const orderId = paymentEntity['order_id'] || orderEntity['id'];
      const paymentId = paymentEntity['id'] || `pay_${Date.now()}`;

      if (!orderId) {
        this.logger.warn('Payment captured webhook missing order_id in payload');
        return { status: 'ignored', reason: 'MISSING_ORDER_ID' };
      }

      const result = await this.paymentService.processPaymentSuccess(
        orderId,
        paymentId,
        signature,
        {
          webhookEvent: event,
          paymentMethod: paymentEntity['method'],
          bank: paymentEntity['bank'],
          vpa: paymentEntity['vpa'],
        },
      );

      return {
        status: 'ok',
        received: true,
        orderId,
        paymentId,
        alreadyProcessed: result.alreadyProcessed,
      };
    }

    // Process payment.failed event
    if (event === 'payment.failed') {
      const payload = (body['payload'] as Record<string, Record<string, unknown> | undefined>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as unknown as Record<string, unknown>) || {};
      const orderId = paymentEntity['order_id'] as string;
      const paymentId = (paymentEntity['id'] as string) || `pay_${Date.now()}`;
      const errorDesc = (paymentEntity['error_description'] as string) || (paymentEntity['error_reason'] as string);

      if (orderId) {
        await this.paymentService.handlePaymentFailure(orderId, paymentId, errorDesc);
      }

      return {
        status: 'ok',
        received: true,
        event,
        action: 'payment_failed_recorded',
      };
    }

    // Process payment.refunded event
    if (event === 'payment.refunded' || event === 'refund.processed') {
      const payload = (body['payload'] as Record<string, Record<string, unknown> | undefined>) || {};
      const paymentEntity = (payload['payment']?.['entity'] as unknown as Record<string, unknown>) || {};
      const refundEntity = (payload['refund']?.['entity'] as unknown as Record<string, unknown>) || {};
      const orderId = paymentEntity['order_id'] as string;
      const paymentId = (paymentEntity['id'] as string) || (refundEntity['payment_id'] as string);
      const refundAmount = Number(refundEntity['amount'] || paymentEntity['amount_refunded']);

      if (orderId && paymentId) {
        await this.paymentService.handlePaymentRefunded(orderId, paymentId, refundAmount);
      }

      return {
        status: 'ok',
        received: true,
        event,
        action: 'refund_processed',
      };
    }

    return {
      status: 'ok',
      received: true,
      event,
      action: 'ignored_event_type',
    };
  }
}
