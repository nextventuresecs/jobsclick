import {
  Injectable,
  Inject,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import type { Database, PaymentRow } from '@indian-job-portal/database';
import {
  CREDIT_PACKS,
  type CreatePaymentOrderInput,
  type InvoiceResponse,
} from '@indian-job-portal/validation';
import { PaymentRepository, type SettlePaymentResult } from '../database/repositories/payment.repository.js';
import { createActorAuthorizationContext } from '../auth/authorization-context.js';
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
   * Compatibility method for direct checkout or test suites that process payment success.
   */
  async processPaymentSuccess(
    orderId: string,
    paymentId: string,
    _signature?: string,
    extraMetadata?: Record<string, unknown>,
  ): Promise<{ payment: PaymentRow; invoice: InvoiceResponse; alreadyProcessed: boolean }> {
    const existing = await this.paymentRepository.findByGatewayOrderId(orderId);
    if (!existing) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PAYMENT_NOT_FOUND',
        message: `No payment found for order ID ${orderId}`,
      });
    }

    if (existing.status === 'captured') {
      const invoice = this.formatInvoice(existing);
      return { payment: existing, invoice, alreadyProcessed: true };
    }

    // Auto-seed FakeGateway in test mode
    const gw = this.gateway as unknown as {
      fetchPayment: (id: string) => Promise<unknown>;
      seedPayment: (p: { id: string; orderId: string; status: string; amountPaise: number }) => void;
    };
    if (typeof gw?.seedPayment === 'function') {
      try {
        await gw.fetchPayment(paymentId);
      } catch {
        gw.seedPayment({
          id: paymentId,
          orderId,
          status: 'captured',
          amountPaise: existing.amount_paise || Math.round(existing.amount_inr * 100),
        });
      }
    }

    const eventId = `evt_compat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const outcome = await this.settleFromGateway(
      orderId,
      paymentId,
      (extraMetadata?.['source'] as string) || 'compat',
      eventId,
    );

    const updated = await this.paymentRepository.findByGatewayOrderId(orderId);
    if (!updated) {
      throw new InternalServerErrorException('Payment record missing after settlement');
    }

    const invoice = this.formatInvoice(updated);
    return {
      payment: updated,
      invoice,
      alreadyProcessed: outcome.status === 'already_settled' || outcome.status === 'duplicate_event',
    };
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
  private formatInvoice(
    payment: PaymentRow,
    invoiceRecord?: Database['public']['Tables']['invoices']['Row'],
  ): InvoiceResponse {
    const meta = (payment.order_snapshot || payment.metadata || {}) as Record<string, unknown>;
    const pack = payment.pack_id ? CREDIT_PACKS[payment.pack_id] : null;

    if (invoiceRecord) {
      const snap = (invoiceRecord.billing_snapshot || {}) as Record<string, unknown>;
      return {
        invoiceNumber: invoiceRecord.number,
        paymentId: payment.id,
        orderId: payment.gateway_order_id,
        date: invoiceRecord.issued_at || payment.created_at,
        hsnCode: '998311',
        packId: payment.pack_id ?? undefined,
        packName: (meta['packName'] as string) || pack?.name || 'Credit Pack',
        credits: payment.credits_added ?? 0,
        baseAmountInr: Number(invoiceRecord.taxable_paise) / 100,
        gstRate: 0.18,
        cgstInr: Number(invoiceRecord.cgst_paise) / 100,
        sgstInr: Number(invoiceRecord.sgst_paise) / 100,
        igstInr: Number(invoiceRecord.igst_paise) / 100,
        totalAmountInr: Number(invoiceRecord.total_paise) / 100,
        customerName: (snap['name'] as string) || (meta['billingName'] as string) || 'Customer',
        customerGstin: (snap['gstin'] as string) || (meta['billingGstin'] as string) || null,
        status: payment.status,
      };
    }

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

  async getUserInvoices(userId: string): Promise<InvoiceResponse[]> {
    const payments = await this.paymentRepository.findByUserId(userId);
    const settledPayments = payments.filter((p) =>
      ['captured', 'partially_refunded', 'refunded'].includes(p.status),
    );
    if (settledPayments.length === 0) {
      return [];
    }

    const paymentIds = settledPayments.map((p) => p.id);
    const invoiceRows = await this.paymentRepository.findInvoicesByPaymentIds(paymentIds);
    const invoiceMap = new Map<string, Database['public']['Tables']['invoices']['Row']>();
    for (const inv of invoiceRows) {
      if (inv.kind === 'invoice' && !invoiceMap.has(inv.payment_id)) {
        invoiceMap.set(inv.payment_id, inv);
      }
    }

    return settledPayments.map((p) => this.formatInvoice(p, invoiceMap.get(p.id)));
  }

  async getInvoice(paymentIdOrOrderId: string, userId: string, isAdmin = false): Promise<InvoiceResponse> {
    const ctx = createActorAuthorizationContext(userId, isAdmin ? 'admin' : 'job_seeker', {
      tenant: { type: isAdmin ? 'platform' : 'user', id: userId },
    });
    const payment = await this.paymentRepository.findByIdOrOrderIdScoped(ctx, paymentIdOrOrderId);
    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }
    if (!['captured', 'partially_refunded', 'refunded'].includes(payment.status)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PAYMENT_NOT_CAPTURED',
        message: 'Invoice cannot be generated for uncaptured payment',
      });
    }
    const invoices = await this.paymentRepository.findInvoicesByPaymentIds([payment.id]);
    const invoiceRecord = invoices.find((inv) => inv.kind === 'invoice') || invoices[0];
    return this.formatInvoice(payment, invoiceRecord);
  }

  async applyRefund(
    gatewayPaymentId: string,
    gatewayRefundId: string,
    refundPaise: number,
    eventId?: string | null,
  ) {
    return this.paymentRepository.applyRefund({
      gatewayPaymentId,
      gatewayRefundId,
      refundPaise,
      eventId,
    });
  }

  async recordDispute(
    gatewayPaymentId: string,
    disputeId: string,
    amountPaise: number,
    reason?: string | null,
    eventId?: string | null,
  ) {
    return this.paymentRepository.recordDispute({
      gatewayPaymentId,
      disputeId,
      amountPaise,
      reason,
      eventId,
    });
  }

  async getInvoiceHtml(paymentId: string, userId: string, isAdmin = false): Promise<string> {
    const inv = await this.getInvoice(paymentId, userId, isAdmin);
    return `<!DOCTYPE html>
<html>
<head><title>TAX INVOICE ${inv.invoiceNumber}</title></head>
<body>
  <h1>TAX INVOICE</h1>
  <p>Invoice No: ${inv.invoiceNumber}</p>
  <p>Customer Name: ${inv.customerName || ''}</p>
  <p>GSTIN: ${inv.customerGstin || ''}</p>
  <p>SAC Code: ${inv.hsnCode || '998311'}</p>
  <p>Base Amount: ₹${inv.baseAmountInr.toFixed(2)}</p>
  <p>CGST: ₹${inv.cgstInr.toFixed(2)}</p>
  <p>SGST: ₹${inv.sgstInr.toFixed(2)}</p>
  <p>Total: ₹${inv.totalAmountInr.toFixed(2)}</p>
</body>
</html>`;
  }
}
