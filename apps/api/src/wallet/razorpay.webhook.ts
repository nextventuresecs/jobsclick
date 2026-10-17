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

interface RequestWithRawBody extends FastifyRequest {
  rawBody?: string;
}

@Controller()
export class RazorpayWebhookController {
  private readonly logger = new Logger(RazorpayWebhookController.name);

  constructor(@Inject(PaymentService) private readonly paymentService: PaymentService) {}

  // POST /webhooks/razorpay and POST /wallet/webhooks/razorpay
  @Post(['webhooks/razorpay', 'wallet/webhooks/razorpay'])
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, any>,
  ) {
    if (!signature) {
      this.logger.warn('Razorpay webhook received without x-razorpay-signature header');
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
      const payload = body['payload'] || {};
      const paymentEntity = payload['payment']?.['entity'] || {};
      const orderEntity = payload['order']?.['entity'] || {};

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

    return {
      status: 'ok',
      received: true,
      event,
      action: 'ignored_event_type',
    };
  }
}
