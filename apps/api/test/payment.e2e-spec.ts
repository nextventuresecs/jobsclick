import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import crypto from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { PaymentService } from '../src/wallet/payment.service.js';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';
import { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import { CREDIT_PACKS } from '@indian-job-portal/validation';

describe('Ticket T-16: Razorpay Payment Gateway & Invoicing (WAL-03, Section 8.7.1)', () => {
  let app: NestFastifyApplication;
  let walletService: WalletService;
  let paymentService: PaymentService;
  let paymentRepo: PaymentRepository;
  let ledgerRepo: CreditLedgerRepository;

  const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'] || 'dummy_razorpay_webhook_secret';
  const employerUserId = `usr_emp_pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const strangerUserId = `usr_stranger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    walletService = app.get(WalletService);
    paymentService = app.get(PaymentService);
    paymentRepo = app.get(PaymentRepository);
    ledgerRepo = app.get(CreditLedgerRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC #1: Employer creates Razorpay recharge order for credit pack with 18% GST calculation', async () => {
    const pack = CREDIT_PACKS['pack_growth']; // 200 credits, ₹1800 base + 18% GST ₹324 = ₹2124
    expect(pack).toBeDefined();

    const orderResult = await paymentService.createOrder(employerUserId, {
      packId: 'pack_growth',
      billingName: 'Acme Enterprises Pvt Ltd',
      billingEmail: 'accounts@acme.example',
      billingPhone: '+919876543210',
      billingAddress: '42 Industrial Area, Pithampur, MP',
      billingGstin: '23AAAAA0000A1Z5',
    });

    expect(orderResult.orderId).toBeDefined();
    expect(orderResult.orderId).toMatch(/^order_/);
    expect(orderResult.amount).toBe(212400); // in paise (₹2,124.00)
    expect(orderResult.currency).toBe('INR');
    expect(orderResult.credits).toBe(200);
    expect(orderResult.baseAmountInr).toBe(1800);
    expect(orderResult.gstAmountInr).toBe(324);
    expect(orderResult.totalAmountInr).toBe(2124);

    // Verify payment record created in payments table with status 'created'
    const storedPayment = await paymentRepo.findByGatewayOrderId(orderResult.orderId);
    expect(storedPayment).not.toBeNull();
    expect(storedPayment?.user_id).toBe(employerUserId);
    expect(storedPayment?.pack_id).toBe('pack_growth');
    expect(storedPayment?.credits_added).toBe(200);
    expect(storedPayment?.amount_inr).toBe(2124);
    expect(storedPayment?.status).toBe('created');
    expect(storedPayment?.invoice_number).toBeNull();
  });

  it('AC #2: Razorpay webhook signature verification blocks forged or invalid signatures', async () => {
    const fakePayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_forged_123',
            order_id: 'order_nonexistent',
            amount: 212400,
            status: 'captured',
          },
        },
      },
    });

    // 1. Missing signature header
    const resNoSig = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: { 'content-type': 'application/json' },
      payload: fakePayload,
    });
    expect(resNoSig.statusCode).toBe(400);
    expect(resNoSig.json().code).toBe('MISSING_SIGNATURE');

    // 2. Tampered / invalid signature header
    const resBadSig = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      payload: fakePayload,
    });
    expect(resBadSig.statusCode).toBe(400);
    expect(resBadSig.json().code).toBe('INVALID_SIGNATURE');
  });

  it('AC #3: Valid Razorpay webhook (payment.captured) writes to credit_ledgers and payments, updates balance instantly, and generates GST invoice', async () => {
    // 1. Initial wallet balance is 0
    const initialBalance = await walletService.getBalance(employerUserId);
    expect(initialBalance.balance).toBe(0);

    // 2. Create order for Starter pack (50 credits, ₹500 base + 18% GST ₹90 = ₹590)
    const order = await paymentService.createOrder(employerUserId, {
      packId: 'pack_starter',
      billingName: 'Tech Innovators LLP',
      billingAddress: 'Indore, MP',
      billingGstin: '23ABCDE1234F1Z5',
    });

    const paymentId = `pay_${Date.now()}_razorpay_success`;
    const webhookPayloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: order.orderId,
            amount: 59000,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            vpa: 'user@okhdfcbank',
          },
        },
      },
    };

    const rawPayload = JSON.stringify(webhookPayloadObj);
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawPayload)
      .digest('hex');

    // 3. Dispatch webhook to /webhooks/razorpay
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': validSignature,
      },
      payload: rawPayload,
    });

    expect(response.statusCode).toBe(200);
    const webhookResponse = response.json();
    expect(webhookResponse.status).toBe('ok');
    expect(webhookResponse.orderId).toBe(order.orderId);
    expect(webhookResponse.paymentId).toBe(paymentId);
    expect(webhookResponse.alreadyProcessed).toBe(false);

    // 4. Verify payment status updated to 'captured' and invoice number generated
    const updatedPayment = await paymentRepo.findByGatewayOrderId(order.orderId);
    expect(updatedPayment).not.toBeNull();
    expect(updatedPayment?.status).toBe('captured');
    expect(updatedPayment?.gateway_payment_id).toBe(paymentId);
    expect(updatedPayment?.invoice_number).toMatch(/^INV-\d{4}-[A-Z0-9]+$/);

    // 5. Hard Invariant #7: Balance is updated via credit_ledgers only
    const updatedBalance = await walletService.getBalance(employerUserId);
    expect(updatedBalance.balance).toBe(50);
    expect(updatedBalance.creditsAdded).toBe(50);

    const ledgerEntries = await ledgerRepo.findByUserId(employerUserId);
    const rechargeEntry = ledgerEntries.find((e) => e.amount === 50);
    expect(rechargeEntry).toBeDefined();
    expect(rechargeEntry?.reason).toContain(`Ref: ${paymentId}`);

    // 6. GST Tax Invoice: Verify SAC code 998311 and 18% tax breakdown
    const invoice = await paymentService.getInvoice(updatedPayment!.id, employerUserId);
    expect(invoice.invoiceNumber).toBe(updatedPayment?.invoice_number);
    expect(invoice.hsnCode).toBe('998311');
    expect(invoice.credits).toBe(50);
    expect(invoice.baseAmountInr).toBe(500);
    expect(invoice.gstRate).toBe(0.18);
    expect(invoice.cgstInr).toBe(45); // 9% of ₹500
    expect(invoice.sgstInr).toBe(45); // 9% of ₹500
    expect(invoice.totalAmountInr).toBe(590);
    expect(invoice.customerName).toBe('Tech Innovators LLP');
    expect(invoice.customerGstin).toBe('23ABCDE1234F1Z5');

    // 7. Verify downloadable HTML invoice renders correctly
    const html = await paymentService.getInvoiceHtml(updatedPayment!.id, employerUserId);
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain(invoice.invoiceNumber);
    expect(html).toContain('SAC Code: 998311');
    expect(html).toContain('Tech Innovators LLP');
    expect(html).toContain('23ABCDE1234F1Z5');
    expect(html).toContain('₹590.00');
  });

  it('AC #4: Webhook Idempotency: repeated webhook does not double credit the wallet', async () => {
    // Create and process an order
    const order = await paymentService.createOrder(employerUserId, {
      packId: 'pack_starter',
    });

    const paymentId = `pay_${Date.now()}_idempotency_test`;
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: order.orderId,
            amount: 59000,
          },
        },
      },
    });

    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // First call
    const firstCall = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
      },
      payload,
    });
    expect(firstCall.statusCode).toBe(200);
    expect(firstCall.json().alreadyProcessed).toBe(false);

    const balanceAfterFirst = await walletService.getBalance(employerUserId);

    // Second call with identical payload (Razorpay webhook retry)
    const secondCall = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
      },
      payload,
    });
    expect(secondCall.statusCode).toBe(200);
    expect(secondCall.json().alreadyProcessed).toBe(true);

    // Balance must be unchanged
    const balanceAfterSecond = await walletService.getBalance(employerUserId);
    expect(balanceAfterSecond.balance).toBe(balanceAfterFirst.balance);
  });

  it('AC #5: Direct client verification endpoint captures payment and updates balance', async () => {
    const order = await paymentService.createOrder(employerUserId, {
      packId: 'pack_enterprise', // 500 credits, ₹4000 base + 18% GST ₹720 = ₹4720
    });

    const clientPaymentId = `pay_client_${Date.now()}`;
    const keySecret = process.env['RAZORPAY_KEY_SECRET'] || 'dummy_razorpay_key_secret';

    const clientSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${order.orderId}|${clientPaymentId}`)
      .digest('hex');

    const result = await paymentService.processPaymentSuccess(
      order.orderId,
      clientPaymentId,
      clientSignature,
      { verifiedBy: 'client_checkout' },
    );

    expect(result.alreadyProcessed).toBe(false);
    expect(result.payment.status).toBe('captured');
    expect(result.payment.credits_added).toBe(500);

    const invoice = await paymentService.getInvoice(order.orderId, employerUserId);
    expect(invoice.credits).toBe(500);
    expect(invoice.baseAmountInr).toBe(4000);
    expect(invoice.totalAmountInr).toBe(4720);
  });

  it('Hard Invariant #5: Unauthorized user cannot view or download invoice of another user', async () => {
    const order = await paymentService.createOrder(employerUserId, {
      packId: 'pack_starter',
    });

    await paymentService.processPaymentSuccess(order.orderId, `pay_${Date.now()}`);

    // Stranger tries to fetch invoice
    await expect(paymentService.getInvoice(order.orderId, strangerUserId, false)).rejects.toThrow();
    await expect(paymentService.getInvoiceHtml(order.orderId, strangerUserId, false)).rejects.toThrow();

    // Owner can fetch invoice
    const ownerInvoice = await paymentService.getInvoice(order.orderId, employerUserId, false);
    expect(ownerInvoice).toBeDefined();

    // Admin can fetch invoice
    const adminInvoice = await paymentService.getInvoice(order.orderId, 'admin_user', true);
    expect(adminInvoice).toBeDefined();
  });
});
