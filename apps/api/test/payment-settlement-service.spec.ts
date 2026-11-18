import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { describe, expect, it, vi } from 'vitest';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { SponsorshipService } from '../src/wallet/sponsorship.service.js';
import { PaymentService } from '../src/wallet/payment.service.js';

describe('WAL-03 verified payment settlement service', () => {
  it('rejects dummy production gateway credentials even with the legacy test-payment override', () => {
    const client = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
    const payments = new PaymentRepository(client), audits = new AuditLogRepository(client), ledger = new CreditLedgerRepository(client);
    const wallet = new WalletService(ledger, audits, new ProfileRepository(client));
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('ALLOW_TEST_PAYMENTS', 'true');
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_dummy_key_id'); vi.stubEnv('RAZORPAY_KEY_SECRET', 'dummy_razorpay_key_secret');
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'dummy_razorpay_webhook_secret');
    try { expect(() => new PaymentService(payments, audits, wallet, new SponsorshipService(new ProfileRepository(client), audits, payments))).toThrow('Production environment requires valid'); }
    finally { vi.unstubAllEnvs(); }
  });
  it('rolls back capture when ledger persistence fails and verified redelivery grants once', async () => {
    const client = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
    const payments = new PaymentRepository(client), audits = new AuditLogRepository(client), ledger = new CreditLedgerRepository(client);
    const wallet = new WalletService(ledger, audits, new ProfileRepository(client)), service = new PaymentService(payments, audits, wallet, new SponsorshipService(new ProfileRepository(client), audits, payments));
    const owner = randomUUID(), order = await service.createOrder(owner, { packId: 'pack_starter' });
    const fault = vi.spyOn(ledger, 'append').mockRejectedValueOnce(new Error('fixture ledger crash'));
    await expect(service.processPaymentSuccess(order.orderId, 'pay_' + owner)).rejects.toThrow('fixture ledger crash');
    expect((await payments.findByGatewayOrderId(order.orderId))?.status).toBe('created');
    expect((await wallet.getBalance(owner)).balance).toBe(0); fault.mockRestore();
    expect((await service.processPaymentSuccess(order.orderId, 'pay_' + owner)).alreadyProcessed).toBe(false);
    expect((await wallet.getBalance(owner)).balance).toBe(50);
    expect((await service.processPaymentSuccess(order.orderId, 'pay_' + owner)).alreadyProcessed).toBe(true);
    expect((await wallet.getBalance(owner)).balance).toBe(50);
  });
});
