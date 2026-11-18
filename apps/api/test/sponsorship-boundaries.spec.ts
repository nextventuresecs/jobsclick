import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database, InstitutionProfileRow, JobSeekerProfileRow, PaymentRow } from '@indian-job-portal/database';
import { describe, expect, it, vi } from 'vitest';
import { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { PaymentRepository } from '../src/database/repositories/payment.repository.js';
import { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import { CreditLedgerRepository } from '../src/database/repositories/credit-ledger.repository.js';
import { SponsorshipService } from '../src/wallet/sponsorship.service.js';
import { WalletService } from '../src/wallet/wallet.service.js';

// Public service/repository seams; JSON fixtures are confined by the disposable runner.
async function fixture(amount = 177) {
  const client = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
  const profiles = new ProfileRepository(client), payments = new PaymentRepository(client);
  const audits = new AuditLogRepository(client), ledger = new CreditLedgerRepository(client);
  const service = new SponsorshipService(profiles, audits, payments);
  const wallet = new WalletService(ledger, audits, profiles);
  const now = new Date().toISOString(), owner = randomUUID();
  const institution: InstitutionProfileRow = { id: randomUUID(), user_id: owner, institution_name: 'Same College',
    affiliation: null, address: null, source: 'f0-fixture', created_by: owner, updated_by: null, created_at: now, updated_at: now };
  const student: JobSeekerProfileRow = { id: randomUUID(), user_id: randomUUID(), full_name: 'Fixture Student',
    photo_url: null, seeker_type: 'student', apaar_id: null, aadhaar_last_four: null, aadhaar_verified: false,
    skills: [], institution_id: institution.id, institution: 'Same College', is_sponsored: false,
    source: 'f0-fixture', created_by: owner, updated_by: null, created_at: now, updated_at: now };
  const payment: PaymentRow = { id: randomUUID(), user_id: owner, gateway_order_id: 'order_' + randomUUID(),
    gateway_payment_id: 'pay_' + randomUUID(), status: 'captured', amount_inr: amount, currency: 'INR', metadata: { purpose: 'sponsorship', institutionId: institution.id }, created_at: now };
  await profiles.saveInstitutionProfile(institution); await profiles.saveSeekerProfile(student); await payments.create(payment);
  const actor = { id: owner, role: 'intermediary' };
  const activate = (extra = {}) => service.activateSponsorship(institution.id, { paymentReference: payment.gateway_payment_id!, ...extra }, actor);
  return { profiles, payments, ledger, service, wallet, institution, student, payment, actor, activate };
}

describe('F0-d WAL-05 sponsorship attacker boundaries', () => {
  it('rejects a captured payment below the server quote before granting any sponsorship', async () => {
    const f = await fixture(1);
    await expect(f.activate()).rejects.toThrow('SPONSORSHIP_PAYMENT_INSUFFICIENT');
    expect((await f.profiles.findSeekerProfileById(f.student.id))?.is_sponsored).toBe(false);
    expect(await f.profiles.findSponsorshipsByInstitutionId(f.institution.id)).toHaveLength(0);
  });
  it('rejects a small payment when requesting a larger quoted tier', async () => {
    const f = await fixture(177);
    await expect(f.activate({ studentCountOverride: 2500 })).rejects.toThrow('SPONSORSHIP_PAYMENT_INSUFFICIENT');
    expect((await f.profiles.findSeekerProfileById(f.student.id))?.is_sponsored).toBe(false);
  });
  it('does not grant sponsorship through a free-text institution name, including another institution UUID', async () => {
    const f = await fixture();
    const outsider = { ...f.student, id: randomUUID(), user_id: randomUUID(), institution_id: randomUUID() };
    await f.profiles.saveSeekerProfile(outsider);
    const result = await f.activate(); expect(result.sponsoredStudentsCount).toBe(1);
    expect((await f.profiles.findSeekerProfileById(f.student.id))?.is_sponsored).toBe(true);
    expect((await f.profiles.findSeekerProfileById(outsider.id))?.is_sponsored).toBe(false);
    expect(await f.profiles.findStudentsByInstitution('Same College')).toHaveLength(0);
  });
  it('reads sponsorship expiry rather than trusting a stale sponsored boolean', async () => {
    const f = await fixture();
    await f.profiles.saveSeekerProfile({ ...f.student, is_sponsored: true });
    await f.profiles.saveInstitutionProfile({ ...f.institution, is_sponsorship_active: true, sponsorship_expires_at: '2000-01-01T00:00:00Z' });
    const result = await f.wallet.deductForJobApplication(f.student.user_id, randomUUID());
    expect(result.isSponsored).not.toBe(true); expect(result.remainingBalance).toBe(9);
  });
  it('allows a paid UUID-associated student only while its institutional sponsorship is current', async () => {
    const f = await fixture(); await f.activate();
    const result = await f.wallet.deductForJobApplication(f.student.user_id, randomUUID());
    expect(result.isSponsored).toBe(true); expect(result.remainingBalance).toBe(0);
  });
  it('rejects reuse of the same canonical payment under its alternate reference and a new idempotency key', async () => {
    const f = await fixture(); await f.activate();
    await expect(f.service.activateSponsorship(f.institution.id, { paymentReference: f.payment.id, force: true, idempotencyKey: randomUUID() }, f.actor))
      .rejects.toThrow('SPONSORSHIP_PAYMENT_ALREADY_USED');
    expect(await f.profiles.findSponsorshipsByInstitutionId(f.institution.id)).toHaveLength(1);
  });
  it('leaves no partial student grant if the sponsorship record write crashes', async () => {
    const f = await fixture();
    vi.spyOn(f.profiles, 'saveSponsorship').mockRejectedValueOnce(new Error('fixture write crash'));
    await expect(f.activate()).rejects.toThrow('fixture write crash');
    expect((await f.profiles.findSeekerProfileById(f.student.id))?.is_sponsored).toBe(false);
    expect((await f.profiles.findInstitutionProfileById(f.institution.id))?.is_sponsorship_active).not.toBe(true);
  });
});
