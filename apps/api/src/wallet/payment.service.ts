import {
  Injectable,
  Inject,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import type { PaymentRow } from '@indian-job-portal/database';
import {
  CREDIT_PACKS,
  type CreatePaymentOrderInput,
  type InvoiceResponse,
} from '@indian-job-portal/validation';
import { PaymentRepository, type SettlePaymentResult } from '../database/repositories/payment.repository.js';
import { RAZORPAY_GATEWAY, type RazorpayGateway } from './razorpay.gateway.js';
import { verifyHmacHex, verifyCheckoutSignature } from './razorpay-signature.js';

export interface RazorpayOrderResult {
  orderId: string;
  amount: number; // in paise
  currency: string;
  keyId: string;
  packId: string;
  credits: number;
  baseAmountInr: number;
  gstAmountInr: number;
  totalAmountInr: number;
}

export type SettlementStatus =
  | 'settled'
  | 'already_settled'
  | 'duplicate_capture'
  | 'duplicate_event'
  | 'amount_mismatch'
  | 'unknown_order'
  | 'precondition_failed'
  | 'pending';

export interface SettlementOutcome {
  status: SettlementStatus;
  paymentId?: string;
  purpose?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(
    @Inject(RAZORPAY_GATEWAY)
    private readonly gateway: RazorpayGateway,
    @Inject(PaymentRepository)
    private readonly paymentRepository: PaymentRepository,
  ) {
    this.keySecret = process.env['RAZORPAY_KEY_SECRET'] || '';
    this.webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'] || '';
  }

  get keyId(): string {
    return this.gateway.keyId;
  }

  /**
   * Create Razorpay payment order for wallet recharge (WAL-03)
   * Price from CREDIT_PACKS only. Server snapshot sets exact paise and credits.
   */
  async createOrder(userId: string, input: CreatePaymentOrderInput): Promise<RazorpayOrderResult> {
    const pack = CREDIT_PACKS[input.packId];
    if (!pack) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_PACK',
        message: `Credit pack '${input.packId}' is not valid`,
      });
    }

    const amountInPaise = Math.round(pack.totalAmountInr * 100);
    const receipt = `rcpt_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

    let gatewayOrder: { id: string };
    try {
      gatewayOrder = await this.gateway.createOrder({
        amountPaise: amountInPaise,
        receipt,
        notes: {
          userId,
          packId: pack.id,
          credits: pack.credits.toString(),
          customerGstin: input.billingGstin || '',
        },
      });
    } catch (err) {
      this.logger.error(`Gateway order creation failed: ${(err as Error).message}`);
      throw new BadRequestException({
        statusCode: 400,
        code: 'ORDER_CREATION_FAILED',
        message: 'Failed to create payment order with payment gateway',
      });
    }

    const paymentRecordId = crypto.randomUUID();
    const now = new Date().toISOString();

    const snapshot = {
      packId: pack.id,
      packName: pack.name,
      credits: pack.credits,
      baseAmountInr: pack.priceInr,
      gstRate: pack.gstRate,
      gstAmountInr: pack.gstAmountInr,
      totalAmountInr: pack.totalAmountInr,
      billingName: input.billingName ?? '',
      billingEmail: input.billingEmail ?? '',
      billingPhone: input.billingPhone ?? '',
      billingAddress: input.billingAddress ?? '',
      billingGstin: input.billingGstin ?? null,
    };

    await this.paymentRepository.create({
      id: paymentRecordId,
      user_id: userId,
      gateway_order_id: gatewayOrder.id,
      gateway_payment_id: null,
      gateway_signature: null,
      pack_id: pack.id,
      credits_added: pack.credits,
      credits_to_grant: pack.credits,
      amount_paise: amountInPaise,
      amount_inr: pack.totalAmountInr,
      currency: 'INR',
      purpose: 'wallet',
      billing_state_code: input.billingStateCode ?? null,
      terms_version: input.termsVersion,
      status: 'created',
      order_snapshot: snapshot,
      metadata: snapshot,
      created_at: now,
      updated_at: now,
    });

    return {
      orderId: gatewayOrder.id,
      amount: amountInPaise,
      currency: 'INR',
      keyId: this.gateway.keyId,
      packId: pack.id,
      credits: pack.credits,
      baseAmountInr: pack.priceInr,
      gstAmountInr: pack.gstAmountInr,
      totalAmountInr: pack.totalAmountInr,
    };
  }

  /**
   * Settle payment with facts fetched authoritatively from Razorpay gateway.
   * Dispatches to database RPC public.rpc_settle_payment.
   */
  async settleFromGateway(
    orderId: string,
    paymentId: string,
    source: string,
    eventId?: string,
  ): Promise<SettlementOutcome> {
    const p = await this.gateway.fetchPayment(paymentId);

    if (p.orderId !== orderId) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'ORDER_MISMATCH',
        message: 'Gateway payment order_id does not match the requested order_id',
      });
    }

    if (p.status === 'authorized') {
      this.logger.warn(`Payment ${paymentId} is in authorized state; capture may be pending`);
      return { status: 'pending' };
    }

    if (p.status !== 'captured') {
      return { status: 'pending' };
    }

    const res: SettlePaymentResult = await this.paymentRepository.settlePayment({
      gatewayOrderId: orderId,
      gatewayPaymentId: paymentId,
      amountPaise: p.amountPaise,
      currency: p.currency,
      method: p.method,
      eventId: eventId ?? null,
      source,
    });

    switch (res.status) {
      case 'settled':
        return { status: 'settled', paymentId: res.payment_id, purpose: res.purpose };
      case 'already_settled':
        return { status: 'already_settled', paymentId: res.payment_id, purpose: res.purpose };
      case 'duplicate_capture':
        return { status: 'duplicate_capture', paymentId: res.payment_id };
      case 'duplicate_event':
        return { status: 'duplicate_event' };
      case 'amount_mismatch':
        return { status: 'amount_mismatch', paymentId: res.payment_id };
      case 'unknown_order':
        return { status: 'unknown_order' };
      case 'precondition_failed':
        return { status: 'precondition_failed', paymentId: res.payment_id };
      default:
        throw new InternalServerErrorException(
          `Unhandled settlement status: ${(res as { status: string }).status}`,
        );
    }
  }

  /**
   * Webhook Signature Verification (HMAC SHA256)
   */
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    return verifyHmacHex(rawBody, signature, this.webhookSecret);
  }

  /**
   * Direct client checkout signature verification (HMAC SHA256 of orderId|paymentId)
   */
  verifyClientPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    return verifyCheckoutSignature(orderId, paymentId, signature, this.keySecret);
  }

  /**
   * Format invoice for response
   */
  private formatInvoice(payment: PaymentRow): InvoiceResponse {
    const meta = (payment.order_snapshot || payment.metadata || {}) as Record<string, unknown>;
    const pack = payment.pack_id ? CREDIT_PACKS[payment.pack_id] : null;

    const baseAmount = Number(meta['baseAmountInr'] ?? (pack?.priceInr || payment.amount_inr / 1.18));
    const gstAmount = Number(meta['gstAmountInr'] ?? (pack?.gstAmountInr || payment.amount_inr - baseAmount));
    const cgst = Math.round((gstAmount / 2) * 100) / 100;
    const sgst = Math.round((gstAmount / 2) * 100) / 100;

    return {
      invoiceNumber: payment.invoice_number || `INV-${payment.id.slice(0, 8).toUpperCase()}`,
      paymentId: payment.id,
      orderId: payment.gateway_order_id,
      date: payment.created_at,
      hsnCode: '998311',
      packId: payment.pack_id ?? undefined,
      packName: (meta['packName'] as string) || pack?.name || 'Credit Pack',
      credits: payment.credits_added ?? 0,
      baseAmountInr: Math.round(baseAmount * 100) / 100,
      gstRate: 0.18,
      cgstInr: cgst,
      sgstInr: sgst,
      igstInr: 0,
      totalAmountInr: payment.amount_inr,
      customerName: (meta['billingName'] as string) || 'Customer',
      customerGstin: (meta['billingGstin'] as string) || null,
      status: payment.status,
    };
  }

  async getInvoice(paymentId: string, userId: string, isAdmin = false): Promise<InvoiceResponse> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }
    if (!isAdmin && payment.user_id !== userId) {
      throw new ForbiddenException('You are not authorized to access this invoice');
    }
    if (payment.status !== 'captured') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PAYMENT_NOT_CAPTURED',
        message: 'Invoice cannot be generated for uncaptured payment',
      });
    }
    return this.formatInvoice(payment);
  }

  async getInvoiceHtml(paymentId: string, userId: string, isAdmin = false): Promise<string> {
    const inv = await this.getInvoice(paymentId, userId, isAdmin);
    return `<!DOCTYPE html>
<html>
<head><title>Invoice ${inv.invoiceNumber}</title></head>
<body>
  <h1>Tax Invoice</h1>
  <p>Invoice No: ${inv.invoiceNumber}</p>
  <p>Amount: ₹${inv.totalAmountInr}</p>
</body>
</html>`;
  }
}
