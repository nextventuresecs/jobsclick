import { randomInt, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import type { Database } from '@indian-job-portal/database';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';
import { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';
import { SponsorshipService } from '../src/wallet/sponsorship.service.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { PaymentService } from '../src/wallet/payment.service.js';

describe('WAL-03/05 actual API services through native PostgREST transactions', () => {
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  beforeAll(async () => { await db.connect(); }); afterAll(async () => { await db.end(); }); afterEach(() => vi.restoreAllMocks());
  function services() {
    const client = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
    // Select the actual production persistence branch; gateway simulation stays in disposable test mode.
    const previous = process.env['NODE_ENV']; process.env['NODE_ENV'] = 'production';
    let profiles: ProfileRepository, payments: PaymentRepository, audits: AuditLogRepository, ledger: CreditLedgerRepository;
    try { profiles = new ProfileRepository(client); payments = new PaymentRepository(client); audits = new AuditLogRepository(client); ledger = new CreditLedgerRepository(client); }
    finally { process.env['NODE_ENV'] = previous; }
    const sponsor = new SponsorshipService(profiles, audits, payments), wallet = new WalletService(ledger, audits, profiles);
    const payment = new PaymentService(payments, audits, wallet, sponsor);
    return { sponsor, payment, payments };
  }
  async function fixture(purpose: 'wallet' | 'sponsorship', captured = false) {
    const owner = randomUUID(), institution = randomUUID(), row = randomUUID(), order = 'order_' + randomUUID(), gateway = 'pay_' + randomUUID(), key = randomUUID();
    await db.query("insert into public.users(id,phone,role,status,source) values($1,$2,'intermediary','active','native-payment-api')", [owner, '8' + randomInt(100000000, 999999999)]);
    await db.query("insert into public.institution_profiles(id,user_id,institution_name,source) values($1,$2,'Native API College','native-payment-api')", [institution, owner]);
    await db.query("insert into public.payments(id,user_id,gateway_order_id,gateway_payment_id,status,amount_inr,currency,credits_added,pack_id,metadata) values($1,$2,$3,$4,$5,177,'INR',$6,$7,$8)",
      [row, owner, order, captured ? gateway : null, captured ? 'captured' : 'created', purpose === 'wallet' ? 50 : 0, purpose === 'wallet' ? 'pack_starter' : null, { purpose, institutionId: institution, activationKey: key }]);
    return { owner, institution, row, order, gateway, key };
  }
  it('uses native sponsorship RPC and rejects canonical payment reuse across service instances', async () => {
    const f = await fixture('sponsorship', true), first = services(), second = services();
    const local = vi.spyOn(PersistentDatabaseStore.getInstance(), 'withFinancialTransaction').mockRejectedValue(new Error('JSON adapter prohibited'));
    const result = await first.sponsor.activateSponsorship(f.institution, { paymentReference: f.gateway, idempotencyKey: f.key }, { id: f.owner, role: 'intermediary' });
    expect(result.success).toBe(true);
    await expect(second.sponsor.activateSponsorship(f.institution, { paymentReference: f.row, idempotencyKey: randomUUID() }, { id: f.owner, role: 'intermediary' }))
      .rejects.toMatchObject({ status: 400, message: 'SPONSORSHIP_PAYMENT_ALREADY_USED' });
    expect(local).not.toHaveBeenCalled();
  });
  it('returns safe failure after native audit error, leaves capture retryable, then settles once', async () => {
    const f = await fixture('wallet'), api = services(), name = 'api_fault_' + randomUUID().replaceAll('-', '');
    const local = vi.spyOn(PersistentDatabaseStore.getInstance(), 'withFinancialTransaction').mockRejectedValue(new Error('JSON adapter prohibited'));
    await db.query(`create function test_support.${name}() returns trigger language plpgsql as $$begin raise exception 'private fixture fault'; end$$`);
    await db.query(`create trigger ${name} before insert on public.audit_logs for each row when (new.actor_id='${f.owner}'::uuid and new.action='PAYMENT_CAPTURED') execute function test_support.${name}()`);
    try {
      await expect(api.payment.processPaymentSuccess(f.order, f.gateway)).rejects.toMatchObject({ status: 503, message: 'PAYMENT_TRANSACTION_UNAVAILABLE' });
      expect((await db.query('select status from public.payments where id=$1', [f.row])).rows).toEqual([{ status: 'created' }]);
      expect((await db.query('select count(*)::int as count from public.credit_ledgers where user_id=$1', [f.owner])).rows).toEqual([{ count: 0 }]);
    } finally { await db.query(`drop trigger ${name} on public.audit_logs; drop function test_support.${name}()`); }
    expect((await api.payment.processPaymentSuccess(f.order, f.gateway)).alreadyProcessed).toBe(false);
    expect((await api.payment.processPaymentSuccess(f.order, f.gateway)).alreadyProcessed).toBe(true);
    expect((await db.query('select sum(amount)::int as balance from public.credit_ledgers where user_id=$1', [f.owner])).rows).toEqual([{ balance: 50 }]);
    expect(local).not.toHaveBeenCalled();
  });
});
