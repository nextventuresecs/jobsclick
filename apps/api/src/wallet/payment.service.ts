import { ServiceUnavailableException } from '@nestjs/common';
import { verifiedCaptureSchema, sponsorshipActivationResultSchema, type SponsorshipActivationResult } from '@indian-job-portal/validation';
import { SponsorshipService } from './sponsorship.service.js';
import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import type { PaymentRow } from '@indian-job-portal/database';
import {
  CREDIT_PACKS,
  type CreatePaymentOrderInput,
  type InvoiceResponse,
} from '@indian-job-portal/validation';
import { PaymentRepository } from '../database/repositories/payment.repository.js';
import { AuditLogRepository } from '../database/repositories/audit-log.repository.js';
import { WalletService } from './wallet.service.js';

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

export interface BillingDetails {
  billingName?: string;
  billingEmail?: string;
  billingPhone?: string;
  billingAddress?: string;
  billingGstin?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private razorpayClient: Razorpay | null = null;
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly isTestMode: boolean;

  constructor(
    @Inject(PaymentRepository)
    private readonly paymentRepository: PaymentRepository,
    @Inject(AuditLogRepository)
    private readonly auditLogRepository: AuditLogRepository,
    @Inject(WalletService)
    private readonly walletService: WalletService,
    @Inject(SponsorshipService) private readonly sponsorshipService: SponsorshipService,
  ) {
    this.keyId = process.env['RAZORPAY_KEY_ID'] || 'rzp_test_dummy_key_id';
    this.keySecret = process.env['RAZORPAY_KEY_SECRET'] || 'dummy_razorpay_key_secret';
    this.webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'] || 'dummy_razorpay_webhook_secret';

    if (['production','staging'].includes(process.env['NODE_ENV'] || '')) {
      if (
        !process.env['RAZORPAY_KEY_ID'] ||
        !process.env['RAZORPAY_KEY_SECRET'] ||
        !process.env['RAZORPAY_WEBHOOK_SECRET'] ||
        process.env['RAZORPAY_KEY_ID'] === 'rzp_test_dummy_key_id' ||
        process.env['RAZORPAY_KEY_SECRET'] === 'dummy_razorpay_key_secret' ||
        process.env['RAZORPAY_WEBHOOK_SECRET'] === 'dummy_razorpay_webhook_secret'
      ) {
        throw new Error(
          'Production environment requires valid RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET. Dummy/test keys are strictly rejected.',
        );
      }
    }

    this.isTestMode = process.env['NODE_ENV'] === 'test' && Boolean(process.env['JOBSCLICK_TEST_MANIFEST']);

    if (!this.isTestMode && this.keyId !== 'rzp_test_dummy_key_id' && this.keySecret !== 'dummy_razorpay_key_secret') {
      try {
        this.razorpayClient = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret,
        });
      } catch (err) {
        this.logger.warn(`Could not initialize live Razorpay client: ${(err as Error).message}`);
      }
    }
  }

  // Create Razorpay payment order (WAL-03)
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
    const receipt = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let orderId: string;

    if (this.razorpayClient && !this.isTestMode) {
      try {
        const order = await this.razorpayClient.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: {
            userId,
            packId: pack.id,
            credits: pack.credits.toString(),
            customerGstin: input.billingGstin || '',
          },
        });
        orderId = order.id;
      } catch (err) {
        this.logger.error(`Razorpay order creation failed: ${(err as Error).message}`);
        throw new BadRequestException({
          statusCode: 400,
          code: 'ORDER_CREATION_FAILED',
          message: 'Failed to create payment order with payment gateway',
        });
      }
    } else {
      // Mock order generation for test / dev environment
      orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    const paymentRecordId = crypto.randomUUID();
    const now = new Date().toISOString();

    const paymentRecord: PaymentRow = {
      id: paymentRecordId,
      user_id: userId,
      gateway_order_id: orderId,
      gateway_payment_id: null,
      gateway_signature: null,
      pack_id: pack.id,
      credits_added: pack.credits,
      amount_inr: pack.totalAmountInr,
      tax_amount_inr: pack.gstAmountInr,
      currency: 'INR',
      invoice_number: null,
      status: 'created',
      metadata: {
        purpose: 'wallet',
        packName: pack.name,
        baseAmountInr: pack.priceInr,
        gstRate: pack.gstRate,
        billingName: input.billingName ?? '',
        billingEmail: input.billingEmail ?? '',
        billingPhone: input.billingPhone ?? '',
        billingAddress: input.billingAddress ?? '',
        billingGstin: input.billingGstin ?? null,
      },
      created_at: now,
      updated_at: now,
    };

    await this.paymentRepository.create(paymentRecord);

    return {
      orderId,
      amount: amountInPaise,
      currency: 'INR',
      keyId: this.keyId,
      packId: pack.id,
      credits: pack.credits,
      baseAmountInr: pack.priceInr,
      gstAmountInr: pack.gstAmountInr,
      totalAmountInr: pack.totalAmountInr,
    };
  }

  // Webhook Signature Verification (HMAC SHA256)
  verifyWebhookSignature(rawBody: string, signature: string, secretOverride?: string): boolean {
    if (!signature || !rawBody) {
      return false;
    }

    const secret = secretOverride || this.webhookSecret;
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
      const signatureBuffer = Buffer.from(signature, 'utf-8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

  // Direct client checkout signature verification
  verifyClientPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    try {
      const text = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(text)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
      const signatureBuffer = Buffer.from(signature, 'utf-8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

  // Server-side REST Verification (Defensive Second Check)
  async serverVerifyGatewayPayment(
    gatewayPaymentId: string,
    expectedOrderId: string,
    expectedAmountInr: number,
  ): Promise<Record<string, unknown>> {
    // In test or local dummy mode without live Razorpay keys, validate mock/test payments defensively
    if (this.isTestMode) {
      // Basic sanity checks for mock/test runs
      if (!gatewayPaymentId || !expectedOrderId) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Invalid gateway payment parameters',
        });
      }
      return {
        id: gatewayPaymentId,
        order_id: expectedOrderId,
        status: 'captured',
        amount: Math.round(expectedAmountInr * 100),
        currency: 'INR',
      };
    }

    if (!this.razorpayClient) throw new ServiceUnavailableException('PAYMENT_PROVIDER_UNAVAILABLE');

    try {
      const basicAuth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
      const res = await fetch(`https://api.razorpay.com/v1/payments/${gatewayPaymentId}`, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`Razorpay payment fetch failed (${res.status}): ${errorText}`);
        throw new BadRequestException({
          statusCode: 400,
          code: 'GATEWAY_FETCH_FAILED',
          message: 'Failed to verify payment status with payment gateway',
        });
      }

      const payment = (await res.json()) as Record<string, unknown>;

      if (payment['status'] !== 'captured') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PAYMENT_NOT_CAPTURED',
          message: `Gateway payment status is ${payment['status']}, expected 'captured'`,
        });
      }

      if (payment['order_id'] !== expectedOrderId) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'ORDER_MISMATCH',
          message: 'Gateway payment order_id does not match the requested order_id',
        });
      }

      const expectedPaise = Math.round(expectedAmountInr * 100);
      if (Number(payment['amount']) !== expectedPaise) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'AMOUNT_MISMATCH',
          message: `Gateway payment amount (${payment['amount']}) does not match expected (${expectedPaise})`,
        });
      }

      if (payment['currency'] !== 'INR') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CURRENCY_MISMATCH',
          message: `Gateway payment currency is ${payment['currency']}, expected INR`,
        });
      }

      return payment;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Gateway verification exception: ${(err as Error).message}`);
      throw new BadRequestException({
        statusCode: 400,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message: 'Could not verify payment with gateway',
      });
    }
  }

  // Gateway verification is read-only. All local capture/grant/audit mutations use one RPC.
  async processPaymentSuccess(orderId: string, paymentId: string, signature?: string, extraMetadata?: Record<string, unknown>): Promise<{
    payment: PaymentRow; invoice: InvoiceResponse; alreadyProcessed: boolean; sponsorship?: SponsorshipActivationResult | null;
  }> {
    const initial = await this.paymentRepository.findByGatewayOrderId(orderId);
    if (!initial) throw new BadRequestException('PAYMENT_NOT_FOUND');
    const capture = verifiedCaptureSchema.parse(await this.serverVerifyGatewayPayment(paymentId, orderId, initial.amount_inr));
    if (capture.id !== paymentId || capture.order_id !== orderId) throw new BadRequestException('PAYMENT_VERIFIED_FACTS_MISMATCH');
    const by = extraMetadata?.['verifiedBy'];
    const processedBy = by === 'client_checkout' || by === 'admin' ? by : 'razorpay_webhook';
    const invoice = 'INV-' + new Date().getFullYear() + '-' + initial.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
    const settled = await this.paymentRepository.settleCapturedPayment({ ...capture, invoice, signature, processedBy }, async () => {
      // Disposable JSON adapter only; this callback is never invoked by production persistence.
      const payment = await this.paymentRepository.findByGatewayOrderId(orderId);
      if (!payment) throw new BadRequestException('PAYMENT_NOT_FOUND');
      const receipt = this.paymentRepository.findTestPaymentGrant(payment.id);
      if (payment.status === 'captured') {
        if (payment.gateway_payment_id !== paymentId) throw new BadRequestException('DUPLICATE_PAYMENT_CLAIM');
        if (!receipt) throw new BadRequestException('PAYMENT_LEGACY_RECONCILIATION_REQUIRED');
        return { payment: { id: payment.id }, alreadyProcessed: true,
          sponsorship: receipt.purpose === 'sponsorship' ? { ...sponsorshipActivationResultSchema.parse(receipt.result), alreadyActive: true } : null };
      }
      const duplicate = await this.paymentRepository.findByGatewayPaymentId(paymentId);
      if (duplicate && duplicate.id !== payment.id) throw new BadRequestException('DUPLICATE_PAYMENT_CLAIM');
      if (!['created','authorized'].includes(payment.status)) throw new BadRequestException('PAYMENT_STATE_INVALID');
      const transition = await this.paymentRepository.transitionToCaptured(payment.id, { gateway_payment_id: paymentId,
        gateway_signature: signature, invoice_number: invoice, processed_at: new Date().toISOString(), processed_by: processedBy,
        metadata: { ...payment.metadata, capturedAt: new Date().toISOString(), verifiedBy: processedBy } });
      if (!transition.updated) throw new ServiceUnavailableException('PAYMENT_TRANSACTION_UNAVAILABLE');
      let sponsorship: SponsorshipActivationResult | null = null;
      if (payment.metadata?.['purpose'] === 'sponsorship' && typeof payment.metadata['institutionId'] === 'string') {
        sponsorship = await this.sponsorshipService.activateSponsorship(payment.metadata['institutionId'], {
          paymentReference: payment.id, idempotencyKey: typeof payment.metadata['activationKey'] === 'string' ? payment.metadata['activationKey'] : 'capture:' + paymentId,
        }, { id: payment.user_id, role: 'intermediary' });
      } else if (payment.metadata?.['purpose'] === 'wallet' && payment.pack_id && (payment.credits_added ?? 0)>0) {
        const row = await this.walletService.recordTransaction({ userId: payment.user_id, amount: payment.credits_added!,
          reason: 'Wallet recharge: Credit pack ' + payment.pack_id + ' (Ref: ' + paymentId + ')', actorId: payment.user_id, requireAudit: true });
        this.paymentRepository.saveTestPaymentGrant({ payment_id: payment.id, purpose: 'wallet', target_id: payment.user_id,
          request_key: 'capture:' + paymentId, fingerprint: { gatewayPaymentId: paymentId, amountPaise: capture.amount, currency: capture.currency },
          result: { ledgerId: row.id }, created_at: new Date().toISOString() });
      } else throw new BadRequestException('PAYMENT_PURPOSE_INVALID');
      await this.auditLogRepository.append({ id: crypto.randomUUID(), actor_id: payment.user_id, action: 'PAYMENT_CAPTURED',
        meta: { paymentId: payment.id, creditsAdded: payment.credits_added ?? 0, amountInr: payment.amount_inr }, created_at: new Date().toISOString() });
      return { payment: { id: payment.id }, alreadyProcessed: false, sponsorship };
    });
    const payment = await this.paymentRepository.findById(settled.payment.id);
    if (!payment) throw new ServiceUnavailableException('PAYMENT_TRANSACTION_UNAVAILABLE');
    return { payment, invoice: this.formatInvoice(payment), alreadyProcessed: settled.alreadyProcessed, sponsorship: settled.sponsorship };
  }

  // Handle payment.failed event from Razorpay (Industry grade failure reconciliation)
  async handlePaymentFailure(
    orderId: string,
    paymentId: string,
    errorReason?: string,
  ): Promise<PaymentRow | null> {
    const store = (this.paymentRepository as unknown as { persistentStore: { withLock: (id: string, fn: () => Promise<unknown>) => Promise<unknown> } }).persistentStore;

    return (await store.withLock(orderId, async () => {
      const payment = await this.paymentRepository.findByGatewayOrderId(orderId);
      if (!payment) return null;

      // Do not overwrite an already captured payment
      if (payment.status === 'captured') return payment;

      const now = new Date();
      const updated = await this.paymentRepository.update(payment.id, {
        gateway_payment_id: paymentId,
        status: 'failed',
        processed_at: now.toISOString(),
        processed_by: 'razorpay_webhook',
        metadata: {
          ...(payment.metadata ?? {}),
          failureReason: errorReason || 'Payment failed at gateway',
          failedAt: now.toISOString(),
        },
      });

      try {
        await this.auditLogRepository.append({
          id: crypto.randomUUID(),
          actor_id: payment.user_id,
          action: 'PAYMENT_FAILED',
          meta: {
            paymentId: payment.id,
            orderId,
            gatewayPaymentId: paymentId,
            errorReason,
          },
          created_at: now.toISOString(),
        });
      } catch {
        // Non-blocking audit log
      }

      return updated;
    })) as PaymentRow | null;
  }

  // Handle payment.refunded event from Razorpay (Industry grade refund reconciliation)
  async handlePaymentRefunded(
    orderId: string,
    paymentId: string,
    refundAmountPaise?: number,
  ): Promise<PaymentRow | null> {
    const store = (this.paymentRepository as unknown as { persistentStore: { withLock: (id: string, fn: () => Promise<unknown>) => Promise<unknown> } }).persistentStore;

    return (await store.withLock(orderId, async () => {
      const payment = await this.paymentRepository.findByGatewayOrderId(orderId);
      if (!payment) return null;

      const now = new Date();
      const updated = await this.paymentRepository.update(payment.id, {
        status: 'refunded',
        processed_at: now.toISOString(),
        processed_by: 'razorpay_webhook',
        metadata: {
          ...(payment.metadata ?? {}),
          refundAmountPaise: refundAmountPaise ?? Math.round(payment.amount_inr * 100),
          refundedAt: now.toISOString(),
        },
      });

      // Deduct corresponding credits from ledger if they were granted
      const creditsToDeduct = payment.credits_added || 0;
      if (creditsToDeduct > 0 && payment.status === 'captured') {
        await this.walletService.recordTransaction({
          userId: payment.user_id,
          amount: -creditsToDeduct,
          reason: `Reversal: Refund for payment ${paymentId}`,
          actorId: 'system',
        });
      }

      try {
        await this.auditLogRepository.append({
          id: crypto.randomUUID(),
          actor_id: payment.user_id,
          action: 'PAYMENT_REFUNDED',
          meta: {
            paymentId: payment.id,
            orderId,
            gatewayPaymentId: paymentId,
            refundAmountPaise,
            creditsReversed: creditsToDeduct,
          },
          created_at: now.toISOString(),
        });
      } catch {
        // Non-blocking audit log
      }

      return updated;
    })) as PaymentRow | null;
  }

  // Retrieve GST Tax Invoice details
  async getInvoice(
    paymentIdOrOrderId: string,
    userId: string,
    isAdmin = false,
  ): Promise<InvoiceResponse> {
    let payment = await this.paymentRepository.findById(paymentIdOrOrderId);
    if (!payment) {
      payment = await this.paymentRepository.findByGatewayOrderId(paymentIdOrOrderId);
    }

    if (!payment) {
      throw new BadRequestException({
        statusCode: 404,
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment record not found',
      });
    }

    // Authz: User sees only own payment records (Hard Invariant #5)
    if (payment.user_id !== userId && !isAdmin) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to view this invoice',
      });
    }

    if (payment.status !== 'captured') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PAYMENT_NOT_CAPTURED',
        message: 'Invoice is available only for captured/successful payments',
      });
    }

    return this.formatInvoice(payment);
  }

  // Format GST tax invoice structure
  formatInvoice(payment: PaymentRow): InvoiceResponse {
    const meta = (payment.metadata ?? {}) as Record<string, unknown>;
    const pack = payment.pack_id ? CREDIT_PACKS[payment.pack_id] : null;
    const baseAmount = Number(meta['baseAmountInr'] ?? (pack?.priceInr || (payment.amount_inr / 1.18)));
    const totalAmount = Number(payment.amount_inr);
    const taxAmount = Number(payment.tax_amount_inr || (totalAmount - baseAmount));
    const halfTax = Math.round((taxAmount / 2) * 100) / 100;

    return {
      invoiceNumber: payment.invoice_number || `INV-${new Date(payment.created_at).getFullYear()}-${payment.id.slice(0, 8).toUpperCase()}`,
      paymentId: payment.gateway_payment_id || payment.id,
      orderId: payment.gateway_order_id,
      date: payment.updated_at || payment.created_at,
      hsnCode: '998311', // SAC: Other Information Technology Services
      packId: payment.pack_id ?? undefined,
      packName: (meta['packName'] as string) || pack?.name || 'Wallet Credit Pack',
      credits: payment.credits_added || pack?.credits || 0,
      baseAmountInr: Math.round(baseAmount * 100) / 100,
      gstRate: 0.18,
      cgstInr: halfTax,
      sgstInr: halfTax,
      igstInr: 0,
      totalAmountInr: totalAmount,
      customerName: (meta['billingName'] as string) || 'Customer',
      customerGstin: (meta['billingGstin'] as string) || null,
      status: payment.status,
    };
  }

  // Generate downloadable HTML tax invoice with 18% GST breakdown
  async getInvoiceHtml(paymentId: string, userId: string, isAdmin = false): Promise<string> {
    const invoice = await this.getInvoice(paymentId, userId, isAdmin);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${invoice.invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 40px; }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 20px; display: flex; justify-content: space-between; }
    .title { font-size: 24px; font-weight: bold; color: #0284c7; }
    .subtitle { font-size: 14px; color: #6b7280; }
    .details { display: flex; justify-content: space-between; margin-top: 30px; }
    .box { width: 48%; }
    .box h4 { margin-bottom: 8px; color: #374151; font-size: 14px; text-transform: uppercase; }
    .table { width: 100%; border-collapse: collapse; margin-top: 30px; }
    .table th, .table td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
    .table th { background: #f3f4f6; color: #374151; }
    .table .amount { text-align: right; }
    .totals { margin-top: 20px; width: 40%; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e5e7eb; }
    .totals-total { font-size: 18px; font-weight: bold; border-top: 2px solid #0284c7; border-bottom: 2px solid #0284c7; padding: 10px 0; }
    .footer { margin-top: 50px; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">TAX INVOICE</div>
      <div class="subtitle">Indian Job Portal Platform</div>
      <div class="subtitle">SAC Code: ${invoice.hsnCode} (Other Information Technology Services)</div>
    </div>
    <div style="text-align: right;">
      <div><strong>Invoice #:</strong> ${invoice.invoiceNumber}</div>
      <div><strong>Date:</strong> ${new Date(invoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      <div><strong>Order ID:</strong> ${invoice.orderId}</div>
      <div><strong>Payment ID:</strong> ${invoice.paymentId}</div>
    </div>
  </div>

  <div class="details">
    <div class="box">
      <h4>Billed By (Supplier)</h4>
      <div><strong>Indian Job Portal Platform</strong></div>
      <div>GSTIN: 23AAAAA0000A1Z5</div>
      <div>Madhya Pradesh, India</div>
      <div>Support: support@indianjobs.portal</div>
    </div>
    <div class="box">
      <h4>Billed To (Customer)</h4>
      <div><strong>${invoice.customerName}</strong></div>
      <div>User ID: ${userId}</div>
      ${invoice.customerGstin ? `<div>GSTIN: ${invoice.customerGstin}</div>` : '<div>Unregistered Consumer</div>'}
    </div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th>Description</th>
        <th>SAC Code</th>
        <th>Credits</th>
        <th class="amount">Taxable Value (₹)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${invoice.packName}</td>
        <td>${invoice.hsnCode}</td>
        <td>${invoice.credits} Credits</td>
        <td class="amount">₹${invoice.baseAmountInr.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Subtotal (Taxable):</span>
      <span>₹${invoice.baseAmountInr.toFixed(2)}</span>
    </div>
    <div class="totals-row">
      <span>CGST (9%):</span>
      <span>₹${invoice.cgstInr.toFixed(2)}</span>
    </div>
    <div class="totals-row">
      <span>SGST (9%):</span>
      <span>₹${invoice.sgstInr.toFixed(2)}</span>
    </div>
    <div class="totals-row totals-total">
      <span>Total Paid:</span>
      <span>₹${invoice.totalAmountInr.toFixed(2)}</span>
    </div>
  </div>

  <div class="footer">
    <p>This is a computer-generated tax invoice and requires no physical signature.</p>
    <p>Hard Invariant #7: Credits are maintained in an append-only cryptographic ledger.</p>
  </div>
</body>
</html>`;
  }
}
