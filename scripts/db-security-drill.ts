import type { ClientConfig } from 'pg';
import pg from 'pg';
const { Client } = pg;
import crypto from 'node:crypto';
import { assertLocalhostOnly } from './common/host-guard.ts';

export interface DrillResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export async function runSecurityDrill(connectionString: string): Promise<{ success: boolean; results: DrillResult[] }> {
  assertLocalhostOnly(connectionString, 'Security Attack Drill');
  const results: DrillResult[] = [];

  const adminClient = new Client({ connectionString });
  await adminClient.connect();

  console.log('--- 1. Testing Role "anon" Attack Vectors ---');
  const anonClient = new Client({ connectionString });
  await anonClient.connect();
  await anonClient.query('SET ROLE anon;');

  // Anon attack 1: Read users base table
  try {
    await anonClient.query('SELECT * FROM public.users LIMIT 1;');
    results.push({
      name: 'Anon blocked from SELECT on users base table',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'Query succeeded (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Anon blocked from SELECT on users base table',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Anon attack 2: Read job_seeker_profiles base table (PII leak)
  try {
    await anonClient.query('SELECT * FROM public.job_seeker_profiles LIMIT 1;');
    results.push({
      name: 'Anon blocked from SELECT on job_seeker_profiles (PII)',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'Query succeeded (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Anon blocked from SELECT on job_seeker_profiles (PII)',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Anon attack 3: Read credit_ledgers
  try {
    await anonClient.query('SELECT * FROM public.credit_ledgers LIMIT 1;');
    results.push({
      name: 'Anon blocked from SELECT on credit_ledgers',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'Query succeeded (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Anon blocked from SELECT on credit_ledgers',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Anon attack 4: Execute grant_starter_credits RPC
  try {
    await anonClient.query(`SELECT public.grant_starter_credits('00000000-0000-0000-0000-000000000001');`);
    results.push({
      name: 'Anon blocked from executing grant_starter_credits RPC',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'RPC executed (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Anon blocked from executing grant_starter_credits RPC',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Anon attack 5: Execute increment_token_version RPC
  try {
    await anonClient.query(`SELECT * FROM public.increment_token_version('00000000-0000-0000-0000-000000000001');`);
    results.push({
      name: 'Anon blocked from executing increment_token_version RPC',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'RPC executed (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Anon blocked from executing increment_token_version RPC',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Anon attack 6: Execute anonymise_user RPC
  try {
    await anonClient.query(`SELECT public.anonymise_user('00000000-0000-0000-0000-000000000001');`);
    results.push({
      name: 'Anon blocked from executing anonymise_user RPC',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'RPC executed (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Anon blocked from executing anonymise_user RPC',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Anon attack 7: Forged role claims and non-UUID sub claim spoofing
  try {
    await anonClient.query(`
      SET LOCAL "request.jwt.claim.role" = 'admin';
      SET LOCAL "request.jwt.claim.sub" = 'non-uuid-attacker-header';
      SELECT * FROM public.users LIMIT 1;
    `);
    results.push({
      name: 'Anon blocked with forged admin role & non-UUID sub claim spoofing',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'Query succeeded (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Anon blocked with forged admin role & non-UUID sub claim spoofing',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  await anonClient.end();

  console.log('--- 2. Testing Role "authenticated" Attack Vectors ---');
  const authClient = new Client({ connectionString });
  await authClient.connect();
  await authClient.query('SET ROLE authenticated;');

  // Authenticated attack 1: Insert credit directly into credit_ledgers
  try {
    await authClient.query(`
      INSERT INTO public.credit_ledgers (user_id, amount, reason) 
      VALUES ('00000000-0000-0000-0000-000000000001', 1000, 'hacked_free_credits');
    `);
    results.push({
      name: 'Authenticated client blocked from direct credit_ledgers INSERT',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'Insert succeeded (CRITICAL VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Authenticated client blocked from direct credit_ledgers INSERT',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Authenticated attack 2: Delete from audit_logs
  try {
    await authClient.query(`DELETE FROM public.audit_logs;`);
    results.push({
      name: 'Authenticated client blocked from DELETE on audit_logs',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'Delete succeeded (CRITICAL VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Authenticated client blocked from DELETE on audit_logs',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Authenticated attack 3: Call wallet RPC promote_job_with_ledger directly
  try {
    await authClient.query(`
      SELECT public.promote_job_with_ledger(
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        7,
        0
      );
    `);
    results.push({
      name: 'Authenticated client blocked from direct wallet RPC execution',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'RPC succeeded (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Authenticated client blocked from direct wallet RPC execution',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  await authClient.end();

  console.log('--- 3. Testing Seed Rows, View Isolation & is_active Filtering ---');
  // Seed employer and 2 jobs (one active, one inactive)
  const empId = crypto.randomUUID();
  const empPhone = '98111' + Math.floor(10000 + Math.random() * 90000);
  const empEmail = `employer_view_${crypto.randomUUID().slice(0, 8)}@test.com`;
  await adminClient.query(`
    INSERT INTO public.users (id, phone, email, role, status, source)
    VALUES ($1, $2, $3, 'employer', 'active', 'view_test');
  `, [empId, empPhone, empEmail]);

  const bizName = `Alpha Tech ${crypto.randomUUID().slice(0, 6)} Pvt Ltd`;
  await adminClient.query(`
    INSERT INTO public.business_profiles (
      id, user_id, company_name, ownership_type, company_size, sector, city, district, state,
      phone, email, founder_or_director, udyam_number, source
    ) VALUES (
      gen_random_uuid(), $1, $2, 'Private Limited', '10-50', 'IT', 'Pune', 'Pune', 'Maharashtra',
      '9811100000', 'private_ceo@alphatech.com', 'Rahul Sharma', 'UDYAM-MH-01-0001234', 'view_test'
    );
  `, [empId, bizName]);

  const activeJobId = crypto.randomUUID();
  const inactiveJobId = crypto.randomUUID();
  const expiredJobId = crypto.randomUUID();

  await adminClient.query(`
    INSERT INTO public.jobs (
      id, employer_id, title, description, category, city, openings, is_active, expiry_date, source
    ) VALUES 
    ($1, $4, 'Senior Fullstack Engineer', 'Develop high performance apps', 'technology', 'Pune', 3, true, NOW() + INTERVAL '30 days', 'view_test'),
    ($2, $4, 'Deprecated Legacy Role', 'Old unlisted role', 'technology', 'Pune', 1, false, NULL, 'view_test'),
    ($3, $4, 'Expired Contract Role', 'Expired past role', 'technology', 'Pune', 1, true, NOW() - INTERVAL '2 days', 'view_test');
  `, [activeJobId, inactiveJobId, expiredJobId, empId]);

  // Read public_jobs as anon
  const anonViewer = new Client({ connectionString });
  await anonViewer.connect();
  await anonViewer.query('SET ROLE anon;');

  const jobsRes = await anonViewer.query(`
    SELECT * FROM public.public_jobs WHERE employer_id = $1;
  `, [empId]);

  const returnedJobIds = jobsRes.rows.map((r) => r.id);
  const activeReturned = returnedJobIds.includes(activeJobId);
  const inactiveFiltered = !returnedJobIds.includes(inactiveJobId);
  const expiredFiltered = !returnedJobIds.includes(expiredJobId);

  // Assert exact column keys in public_jobs
  const jobRow = jobsRes.rows[0];
  const expectedJobCols = new Set([
    'id', 'employer_id', 'title', 'description', 'category', 'employment_type',
    'experience_level', 'min_pay', 'max_pay', 'city', 'district', 'state',
    'openings', 'skills', 'expiry_date', 'is_featured', 'featured_until', 'created_at'
  ]);
  const actualJobCols = Object.keys(jobRow);
  const exactJobCols = actualJobCols.length === expectedJobCols.size && actualJobCols.every((c) => expectedJobCols.has(c));
  const noFtsLeak = !('fts' in jobRow) && !('source' in jobRow) && !('created_by' in jobRow);

  results.push({
    name: 'public_jobs view strictly filters WHERE is_active = true and unexpired',
    passed: activeReturned && inactiveFiltered && expiredFiltered,
    expected: 'Active job included, inactive & expired jobs filtered out',
    actual: `active=${activeReturned}, inactiveFiltered=${inactiveFiltered}, expiredFiltered=${expiredFiltered}`,
  });

  results.push({
    name: 'public_jobs view returns exact sanitized columns without internal metadata',
    passed: exactJobCols && noFtsLeak,
    expected: '18 specific public columns, 0 fts/source/created_by leaks',
    actual: `colsCount=${actualJobCols.length}, exactMatch=${exactJobCols}, noLeak=${noFtsLeak}`,
  });

  // Read public_business_profiles as anon
  const bizRes = await anonViewer.query(`
    SELECT * FROM public.public_business_profiles WHERE company_name = $1;
  `, [bizName]);
  const bizRow = bizRes.rows[0];
  const noPiiInBiz = !('phone' in bizRow) && !('email' in bizRow) && !('founder_or_director' in bizRow) && !('udyam_number' in bizRow);

  results.push({
    name: 'public_business_profiles view scrubs contact phone, email, director, and udyam numbers',
    passed: bizRes.rows.length === 1 && noPiiInBiz,
    expected: 'Company found, phone/email/director/udyam columns stripped from view',
    actual: `found=1, noPiiLeak=${noPiiInBiz}`,
  });

  await anonViewer.end();

  console.log('--- 4. Testing Immutability Triggers (Audit, Ledger, Alert Deliveries) ---');
  // Ledger immutability test
  const testUserId = crypto.randomUUID();
  const testPhone = '99999' + Math.floor(10000 + Math.random() * 90000);
  await adminClient.query(`
    INSERT INTO public.users (id, phone, role, status, source) 
    VALUES ($1, $2, 'job_seeker', 'active', 'test') RETURNING id;
  `, [testUserId, testPhone]);

  const ledRes = await adminClient.query(`
    INSERT INTO public.credit_ledgers (user_id, amount, reason)
    VALUES ($1, 10, 'initial_test_credit') RETURNING id;
  `, [testUserId]);
  const ledgerId = ledRes.rows[0].id;

  try {
    await adminClient.query(`UPDATE public.credit_ledgers SET amount = 9999 WHERE id = $1;`, [ledgerId]);
    results.push({
      name: 'Service role UPDATE on credit_ledgers blocked by immutability trigger',
      passed: false,
      expected: 'Trigger exception P0001',
      actual: 'Update succeeded without error (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role UPDATE on credit_ledgers blocked by immutability trigger',
      passed: err.code === 'P0001',
      expected: 'Trigger exception P0001',
      actual: `${err.code}: ${err.message}`,
    });
  }

  try {
    await adminClient.query(`DELETE FROM public.credit_ledgers WHERE id = $1;`, [ledgerId]);
    results.push({
      name: 'Service role DELETE on credit_ledgers blocked by immutability trigger',
      passed: false,
      expected: 'Trigger exception P0001',
      actual: 'Delete succeeded without error (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role DELETE on credit_ledgers blocked by immutability trigger',
      passed: err.code === 'P0001',
      expected: 'Trigger exception P0001',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Audit log immutability test
  const auditRes = await adminClient.query(`
    INSERT INTO public.audit_logs (actor_id, action, meta)
    VALUES ($1, 'test_action', '{"key": "val"}'::jsonb) RETURNING id;
  `, [testUserId]);
  const auditId = auditRes.rows[0].id;

  try {
    await adminClient.query(`UPDATE public.audit_logs SET action = 'tampered' WHERE id = $1;`, [auditId]);
    results.push({
      name: 'Service role UPDATE on audit_logs blocked by immutability trigger',
      passed: false,
      expected: 'Trigger exception P0001',
      actual: 'Update succeeded without error (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role UPDATE on audit_logs blocked by immutability trigger',
      passed: err.code === 'P0001',
      expected: 'Trigger exception P0001',
      actual: `${err.code}: ${err.message}`,
    });
  }

  try {
    await adminClient.query(`DELETE FROM public.audit_logs WHERE id = $1;`, [auditId]);
    results.push({
      name: 'Service role DELETE on audit_logs blocked by immutability trigger',
      passed: false,
      expected: 'Trigger exception P0001',
      actual: 'Delete succeeded without error (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role DELETE on audit_logs blocked by immutability trigger',
      passed: err.code === 'P0001',
      expected: 'Trigger exception P0001',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // Alert deliveries immutability test
  const alertId = crypto.randomUUID();
  await adminClient.query(`
    INSERT INTO public.job_alerts (id, user_id, title, filters, frequency)
    VALUES ($1, $2, 'Daily Pune Tech Jobs', '{"city": "Pune"}'::jsonb, 'daily');
  `, [alertId, testUserId]);

  const deliveryRes = await adminClient.query(`
    INSERT INTO public.alert_deliveries (alert_id, user_id, job_id)
    VALUES ($1, $2, $3) RETURNING id;
  `, [alertId, testUserId, activeJobId]);
  const deliveryId = deliveryRes.rows[0].id;

  try {
    await adminClient.query(`UPDATE public.alert_deliveries SET user_id = $1 WHERE id = $2;`, [empId, deliveryId]);
    results.push({
      name: 'Service role UPDATE on alert_deliveries blocked by immutability trigger',
      passed: false,
      expected: 'Trigger exception P0001',
      actual: 'Update succeeded without error (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role UPDATE on alert_deliveries blocked by immutability trigger',
      passed: err.code === 'P0001',
      expected: 'Trigger exception P0001',
      actual: `${err.code}: ${err.message}`,
    });
  }

  try {
    await adminClient.query(`DELETE FROM public.alert_deliveries WHERE id = $1;`, [deliveryId]);
    results.push({
      name: 'Service role DELETE on alert_deliveries blocked by immutability trigger',
      passed: false,
      expected: 'Trigger exception P0001',
      actual: 'Delete succeeded without error (VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role DELETE on alert_deliveries blocked by immutability trigger',
      passed: err.code === 'P0001',
      expected: 'Trigger exception P0001',
      actual: `${err.code}: ${err.message}`,
    });
  }

  console.log('--- 4b. Testing TRUNCATE Revocation & Statement Triggers ---');
  // 1. service_role direct TRUNCATE on audit_logs (privilege path -> 42501)
  const serviceClient1 = new Client({ connectionString });
  await serviceClient1.connect();
  try {
    await serviceClient1.query('SET ROLE service_role;');
    await serviceClient1.query('TRUNCATE public.audit_logs;');
    results.push({
      name: 'Service role TRUNCATE on audit_logs blocked by privilege check',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'TRUNCATE succeeded (CRITICAL IMMUTABILITY HOLE)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role TRUNCATE on audit_logs blocked by privilege check',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  } finally {
    await serviceClient1.end();
  }

  // 2. service_role direct TRUNCATE on credit_ledgers (privilege path -> 42501)
  const serviceClient2 = new Client({ connectionString });
  await serviceClient2.connect();
  try {
    await serviceClient2.query('SET ROLE service_role;');
    await serviceClient2.query('TRUNCATE public.credit_ledgers;');
    results.push({
      name: 'Service role TRUNCATE on credit_ledgers blocked by privilege check',
      passed: false,
      expected: 'Permission denied (42501)',
      actual: 'TRUNCATE succeeded (CRITICAL LEDGER HOLE)',
    });
  } catch (err: any) {
    results.push({
      name: 'Service role TRUNCATE on credit_ledgers blocked by privilege check',
      passed: err.code === '42501',
      expected: 'Permission denied (42501)',
      actual: `${err.code}: ${err.message}`,
    });
  } finally {
    await serviceClient2.end();
  }

  // 3. Table owner direct TRUNCATE on audit_logs (trigger path -> 55000)
  try {
    await adminClient.query('TRUNCATE public.audit_logs;');
    results.push({
      name: 'Table owner TRUNCATE on audit_logs blocked by BEFORE TRUNCATE trigger',
      passed: false,
      expected: 'Trigger exception (55000)',
      actual: 'TRUNCATE succeeded (CRITICAL IMMUTABILITY HOLE)',
    });
  } catch (err: any) {
    results.push({
      name: 'Table owner TRUNCATE on audit_logs blocked by BEFORE TRUNCATE trigger',
      passed: err.code === '55000',
      expected: 'Trigger exception (55000)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // 4. Table owner direct TRUNCATE on payments (trigger path -> 55000)
  try {
    await adminClient.query('TRUNCATE public.payments;');
    results.push({
      name: 'Table owner TRUNCATE on payments blocked by BEFORE TRUNCATE trigger',
      passed: false,
      expected: 'Trigger exception (55000)',
      actual: 'TRUNCATE succeeded (FINANCIAL DATA LOSS)',
    });
  } catch (err: any) {
    results.push({
      name: 'Table owner TRUNCATE on payments blocked by BEFORE TRUNCATE trigger',
      passed: err.code === '55000',
      expected: 'Trigger exception (55000)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // 5. TRUNCATE users without CASCADE blocked by foreign key constraint (0A000)
  try {
    await adminClient.query('TRUNCATE public.users;');
    results.push({
      name: 'TRUNCATE users without CASCADE blocked by foreign key constraint',
      passed: false,
      expected: 'Feature not supported / foreign key restriction (0A000)',
      actual: 'TRUNCATE succeeded without CASCADE (FK INTEGRITY HOLE)',
    });
  } catch (err: any) {
    results.push({
      name: 'TRUNCATE users without CASCADE blocked by foreign key constraint',
      passed: err.code === '0A000',
      expected: 'Feature not supported / foreign key restriction (0A000)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  // 6. TRUNCATE users CASCADE blocked by statement triggers on referencing tables (55000)
  try {
    await adminClient.query('TRUNCATE public.users CASCADE;');
    results.push({
      name: 'TRUNCATE users CASCADE blocked by BEFORE TRUNCATE triggers on referencing immutable tables',
      passed: false,
      expected: 'Trigger exception (55000)',
      actual: 'TRUNCATE CASCADE succeeded (DATA LOSS VULNERABILITY)',
    });
  } catch (err: any) {
    results.push({
      name: 'TRUNCATE users CASCADE blocked by BEFORE TRUNCATE triggers on referencing immutable tables',
      passed: err.code === '55000',
      expected: 'Trigger exception (55000)',
      actual: `${err.code}: ${err.message}`,
    });
  }

  console.log('--- 5. Testing actor_id Foreign Key ON DELETE RESTRICT ---');
  const actorTestId = crypto.randomUUID();
  const actorPhone = '97777' + Math.floor(10000 + Math.random() * 90000);
  const actorEmail = `actor_test_${crypto.randomUUID().slice(0, 8)}@test.com`;
  await adminClient.query(`
    INSERT INTO public.users (id, phone, email, role, status, source)
    VALUES ($1, $2, $3, 'job_seeker', 'invited', 'actor_test');
  `, [actorTestId, actorPhone, actorEmail]);

  await adminClient.query(`
    INSERT INTO public.audit_logs (actor_id, action, meta)
    VALUES ($1, 'privileged_admin_action', '{"event": "system_bootstrap"}'::jsonb);
  `, [actorTestId]);

  try {
    await adminClient.query(`DELETE FROM public.users WHERE id = $1;`, [actorTestId]);
    results.push({
      name: 'actor_id ON DELETE RESTRICT blocks user deletion when referenced as audit actor',
      passed: false,
      expected: 'Foreign key violation (23503)',
      actual: 'User was deleted (ORPHANED AUDIT ACTOR VULNERABILITY)',
    });
  } catch (fkErr: any) {
    results.push({
      name: 'actor_id ON DELETE RESTRICT blocks user deletion when referenced as audit actor',
      passed: fkErr.code === '23503',
      expected: 'Foreign key violation (23503)',
      actual: `${fkErr.code}: ${fkErr.message}`,
    });
  }

  console.log('--- 6. Testing Service Role Wallet Positive RPC Flows ---');
  const walletUserId = crypto.randomUUID();
  const walletPhone = '98222' + Math.floor(10000 + Math.random() * 90000);
  const walletEmail = `wallet_user_${crypto.randomUUID().slice(0, 8)}@test.com`;
  await adminClient.query(`
    INSERT INTO public.users (id, phone, email, role, status, source)
    VALUES ($1, $2, $3, 'employer', 'invited', 'wallet_test');
  `, [walletUserId, walletPhone, walletEmail]);

  // Test 1: grant_starter_credits on invited user
  const starterRes = await adminClient.query(`SELECT public.grant_starter_credits($1) as success;`, [walletUserId]);
  const starterSuccess = starterRes.rows[0].success === true;
  // Test idempotent re-run (returns false because starter already granted)
  const starterReRun = await adminClient.query(`SELECT public.grant_starter_credits($1) as success;`, [walletUserId]);
  const idempotentDuplicateBlocked = starterReRun.rows[0].success === false;

  // Test 2: promote_job_with_ledger (spend 3 of 10 starter credits)
  const promoteJobId = crypto.randomUUID();
  await adminClient.query(`
    INSERT INTO public.jobs (id, employer_id, title, description, category, city, openings, is_active, source)
    VALUES ($1, $2, 'Promoted DevOps Role', 'K8s & CI/CD', 'technology', 'Pune', 2, true, 'wallet_test');
  `, [promoteJobId, walletUserId]);

  const promoteRes = await adminClient.query(`
    SELECT public.promote_job_with_ledger($1, $2, 7, 3) as res;
  `, [walletUserId, promoteJobId]);
  const promoteOutput = promoteRes.rows[0].res;
  const promoteOk = promoteOutput.success === true && promoteOutput.cost === 3 && promoteOutput.remaining_balance === 7;

  // Verify job is now featured
  const jobFeaturedCheck = await adminClient.query(`SELECT is_featured, featured_until FROM public.jobs WHERE id = $1;`, [promoteJobId]);
  const jobFeaturedOk = jobFeaturedCheck.rows[0].is_featured === true && jobFeaturedCheck.rows[0].featured_until !== null;

  // Test 3: unlock_contact_with_ledger (spend 5 of 7 remaining credits)
  const seekerId = crypto.randomUUID();
  const seekerPhone = '98333' + Math.floor(10000 + Math.random() * 90000);
  await adminClient.query(`
    INSERT INTO public.users (id, phone, role, status, source)
    VALUES ($1, $2, 'job_seeker', 'active', 'wallet_test');
  `, [seekerId, seekerPhone]);

  const unlockRes = await adminClient.query(`
    SELECT public.unlock_contact_with_ledger($1, $2, 5) as res;
  `, [walletUserId, seekerId]);
  const unlockOutput = unlockRes.rows[0].res;
  const unlockOk = unlockOutput.success === true && unlockOutput.cost === 5 && unlockOutput.remaining_balance === 2;

  // Test 4: deduct_application_credit_with_ledger (spend 1 of 2 remaining credits)
  const deductRes = await adminClient.query(`
    SELECT public.deduct_application_credit_with_ledger($1, $2, 'Promoted DevOps Role', 1) as res;
  `, [walletUserId, promoteJobId]);
  const deductOutput = deductRes.rows[0].res;
  const deductOk = deductOutput.success === true && deductOutput.cost === 1 && deductOutput.remaining_balance === 1;

  results.push({
    name: 'Service role wallet flow: starter credits, promote job, unlock contact, and deduct application credit',
    passed: starterSuccess && idempotentDuplicateBlocked && promoteOk && jobFeaturedOk && unlockOk && deductOk,
    expected: '10 credits granted -> 3 spent on promo -> 5 on unlock -> 1 on app -> 1 remaining',
    actual: `starter=${starterSuccess}, idempotentBlocked=${idempotentDuplicateBlocked}, promoteRemaining=${promoteOutput.remaining_balance}, unlockRemaining=${unlockOutput.remaining_balance}, deductRemaining=${deductOutput.remaining_balance}`,
  });

  console.log('--- 7. Testing 20-Parallel-Deduct Concurrency ---');
  // Create candidate user with status invited (0 auto-starter credits) and exactly 5 credits
  const concUserId = crypto.randomUUID();
  const concPhone = '98444' + Math.floor(10000 + Math.random() * 90000);
  await adminClient.query(`
    INSERT INTO public.users (id, phone, role, status, source)
    VALUES ($1, $2, 'job_seeker', 'invited', 'concurrency_test');
  `, [concUserId, concPhone]);

  // Insert exactly 5 credits
  await adminClient.query(`
    INSERT INTO public.credit_ledgers (user_id, amount, reason)
    VALUES ($1, 5, 'concurrency_test_credits');
  `, [concUserId]);

  // Fire 20 parallel deduction requests
  const parallelCount = 20;
  const deductionPromises = Array.from({ length: parallelCount }).map(async (_, idx) => {
    const workerClient = new Client({ connectionString });
    await workerClient.connect();
    try {
      const res = await workerClient.query(`
        SELECT public.deduct_application_credit_with_ledger($1, $2, 'Concurrency Target Job', 1) as res;
      `, [concUserId, promoteJobId]);
      return { success: true, res: res.rows[0].res };
    } catch (err: any) {
      if (err.message.includes('INSUFFICIENT_CREDITS') || err.code === 'P0001') {
        return { success: false, error: 'INSUFFICIENT_CREDITS' };
      }
      throw err;
    } finally {
      await workerClient.end();
    }
  });

  const parallelResults = await Promise.all(deductionPromises);
  const successDeductions = parallelResults.filter((r) => r.success === true);
  const failedDeductions = parallelResults.filter((r) => r.success === false);

  // Check final ledger balance
  const finalBalRes = await adminClient.query(`
    SELECT COALESCE(SUM(amount), 0)::int as balance FROM public.credit_ledgers WHERE user_id = $1;
  `, [concUserId]);
  const finalBalance = finalBalRes.rows[0].balance;

  const concurrencySafe = successDeductions.length === 5 && failedDeductions.length === 15 && finalBalance === 0;

  results.push({
    name: '20 concurrent parallel deductions strictly serialize: 5 succeed, 15 fail, balance stops at 0',
    passed: concurrencySafe,
    expected: 'Exactly 5 successes, exactly 15 failures, final balance = 0',
    actual: `successes=${successDeductions.length}, failures=${failedDeductions.length}, finalBalance=${finalBalance}`,
  });

  console.log('--- 8. Testing DPDP Erasure Model (ON DELETE RESTRICT & Anonymisation) ---');
  const dpdpUserId = crypto.randomUUID();
  const rawPhone = '98765' + Math.floor(10000 + Math.random() * 90000);
  const dpdpEmail = `dpdp_test_${crypto.randomUUID().slice(0, 8)}@example.com`;
  await adminClient.query(`
    INSERT INTO public.users (id, phone, email, role, status, source)
    VALUES ($1, $2, $3, 'job_seeker', 'active', 'dpdp_test');
  `, [dpdpUserId, rawPhone, dpdpEmail]);

  await adminClient.query(`
    INSERT INTO public.job_seeker_profiles (
      user_id, full_name, seeker_type, aadhaar_last_four, aadhaar_verified, apaar_id, bio, skills, source
    ) VALUES (
      $1, 'John Candidate', 'individual', '1234', true, 'APAAR999', 'My private biography', ARRAY['React', 'TypeScript'], 'dpdp_test'
    );
  `, [dpdpUserId]);

  await adminClient.query(`
    INSERT INTO public.credit_ledgers (user_id, amount, reason)
    VALUES ($1, 10, 'starter_pack');
  `, [dpdpUserId]);

  await adminClient.query(`
    INSERT INTO public.audit_logs (actor_id, action, meta)
    VALUES ($1, 'profile_created', '{"ip": "127.0.0.1"}'::jsonb);
  `, [dpdpUserId]);

  // Insert search_logs row for user
  const searchKeyword = 'SearchTest_' + crypto.randomUUID().slice(0, 8);
  await adminClient.query(`
    INSERT INTO public.search_logs (user_id, query)
    VALUES ($1, $2);
  `, [dpdpUserId, searchKeyword]);

  // Insert job_alerts row for user
  await adminClient.query(`
    INSERT INTO public.job_alerts (user_id, title, filters, frequency, is_active)
    VALUES ($1, 'Pune React Jobs', '{"city": "Pune"}'::jsonb, 'daily', TRUE);
  `, [dpdpUserId]);

  // Insert linked invitation record
  await adminClient.query(`
    INSERT INTO public.invitations (id, phone, status)
    VALUES (gen_random_uuid(), $1, 'pending');
  `, [rawPhone]);

  // Insert linked institution inquiry record
  const instIdRes = await adminClient.query(`SELECT id FROM public.institution_profiles LIMIT 1;`);
  let dummyInstId = instIdRes.rows[0]?.id;
  if (!dummyInstId) {
    const dummyUser = crypto.randomUUID();
    await adminClient.query(`INSERT INTO public.users (id, phone, role, status, source) VALUES ($1, '9999911111', 'intermediary', 'active', 'test');`, [dummyUser]);
    const instCreate = await adminClient.query(`INSERT INTO public.institution_profiles (user_id, institution_name, institution_type, source) VALUES ($1, 'Test Inst', 'iti', 'test') RETURNING id;`, [dummyUser]);
    dummyInstId = instCreate.rows[0].id;
  }
  await adminClient.query(`
    INSERT INTO public.institution_inquiries (institution_id, student_name, student_phone, student_email, course_of_interest)
    VALUES ($1, 'John Candidate', $2, 'john@example.com', 'Fitter');
  `, [dummyInstId, rawPhone]);

  // Insert linked business profile for user
  const dpdpBizRes = await adminClient.query(`
    INSERT INTO public.business_profiles (
      id, user_id, company_name, ownership_type, company_size, sector, city, district, state,
      phone, email, founder_or_director, udyam_number, source
    ) VALUES (
      gen_random_uuid(), $1, 'DPDP Test Biz', 'Private Limited', '1-10', 'IT', 'Pune', 'Pune', 'Maharashtra',
      '9876500000', 'biz@dpdp.com', 'Director Doe', 'UDYAM-MH-01-9999999', 'dpdp_test'
    ) RETURNING id;
  `, [dpdpUserId]);
  const dpdpBizId = dpdpBizRes.rows[0].id;

  // Insert corporate tie-up and placement application linked to student
  const tieUpRes = await adminClient.query(`
    INSERT INTO public.corporate_tie_ups (
      institution_id, employer_id, company_name, sector, contact_person
    ) VALUES ($1, $2, 'DPDP Partner Corp', 'IT', 'Contact Person') RETURNING id;
  `, [dummyInstId, dpdpBizId]);
  const tieUpId = tieUpRes.rows[0].id;

  const placementAppRes = await adminClient.query(`
    INSERT INTO public.placement_applications (
      tie_up_id, institution_id, student_id, job_title, offer_package, offer_letter_url
    ) VALUES ($1, $2, (SELECT id FROM public.job_seeker_profiles WHERE user_id = $3), 'Graduate Trainee', '8 LPA', 'https://storage.supabase.co/private/offer_letter.pdf')
    RETURNING id;
  `, [tieUpId, dummyInstId, dpdpUserId]);
  const placementAppId = placementAppRes.rows[0].id;

  // Insert broadcast campaign and delivery linked to business profile
  const campaignRes = await adminClient.query(`
    INSERT INTO public.broadcast_campaigns (
      created_by, dlt_template_id, recipient_count, estimated_cost_paise, status
    ) VALUES ($1, 'DLT_123', 1, 50, 'completed') RETURNING id;
  `, [dpdpUserId]);
  const campaignId = campaignRes.rows[0].id;

  const bcastDeliveryRes = await adminClient.query(`
    INSERT INTO public.broadcast_deliveries (
      campaign_id, business_profile_id, phone_masked, idempotency_key
    ) VALUES ($1, $2, '+91 98765 12345', $3) RETURNING id;
  `, [campaignId, dpdpBizId, 'idemp_' + crypto.randomUUID()]);
  const bcastDeliveryId = bcastDeliveryRes.rows[0].id;

  // Insert payment record linked to user
  const paymentRes = await adminClient.query(`
    INSERT INTO public.payments (
      user_id, gateway_order_id, amount_inr, status, invoice_number, metadata
    ) VALUES ($1, 'order_dpdp_123', 500.00, 'captured', 'INV-2026-001', '{"customer_name": "John Candidate", "ip": "1.2.3.4", "gstin": "27AAAAA0000A1Z5"}'::jsonb)
    RETURNING id;
  `, [dpdpUserId]);
  const paymentId = paymentRes.rows[0].id;

  // DPDP Test 1: Hard DELETE FROM users is blocked by ON DELETE RESTRICT on ledgers, audits, and payments
  try {
    await adminClient.query(`DELETE FROM public.users WHERE id = $1;`, [dpdpUserId]);
    results.push({
      name: 'Foreign key ON DELETE RESTRICT prevents accidental user deletion when ledgers/payments exist',
      passed: false,
      expected: 'Foreign key violation (23503)',
      actual: 'User was hard deleted (LEDGER/PAYMENT ORPHANING VULNERABILITY)',
    });
  } catch (fkErr: any) {
    results.push({
      name: 'Foreign key ON DELETE RESTRICT prevents accidental user deletion when ledgers/payments exist',
      passed: fkErr.code === '23503',
      expected: 'Foreign key violation (23503)',
      actual: `${fkErr.code}: ${fkErr.message}`,
    });
  }

  // DPDP Test 2: Call anonymise_user(dpdpUserId)
  const anonRes = await adminClient.query(`SELECT public.anonymise_user($1) as res;`, [dpdpUserId]);
  const anonOutput = anonRes.rows[0].res;
  const isAnonSuccess = anonOutput.success === true;

  // Inspect users table
  const userCheck = await adminClient.query(`SELECT phone, email, status, token_version FROM public.users WHERE id = $1;`, [dpdpUserId]);
  const u = userCheck.rows[0];
  const isPhoneTombstone = /^DEL_[a-f0-9]{10}$/.test(u.phone);
  const isEmailNull = u.email === null;
  const isStatusDisabled = u.status === 'disabled';
  const isTokenBumped = u.token_version >= 1;

  // Inspect job_seeker_profiles table
  const profCheck = await adminClient.query(`
    SELECT full_name, photo_url, dob, apaar_id, aadhaar_last_four, aadhaar_verified, bio 
    FROM public.job_seeker_profiles WHERE user_id = $1;
  `, [dpdpUserId]);
  const p = profCheck.rows[0];
  const isNameScrubbed = p.full_name === 'Deleted User';
  const isAadhaarScrubbed = p.aadhaar_last_four === null && p.aadhaar_verified === false;
  const isApaarScrubbed = p.apaar_id === null;
  const isBioScrubbed = p.bio === null;

  // Inspect placement_applications scrub
  const placeCheck = await adminClient.query(`SELECT offer_letter_url, offer_package FROM public.placement_applications WHERE id = $1;`, [placementAppId]);
  const isPlacementScrubbed = placeCheck.rows[0].offer_letter_url === null && placeCheck.rows[0].offer_package === null;

  // Inspect broadcast_deliveries scrub
  const broadCheck = await adminClient.query(`SELECT phone_masked FROM public.broadcast_deliveries WHERE id = $1;`, [bcastDeliveryId]);
  const isBroadcastScrubbed = broadCheck.rows[0].phone_masked === 'DEL_REDACTED';

  // Inspect payments metadata scrub (financial transaction & tax invoice retained per GST Act Sec 36)
  const payCheck = await adminClient.query(`SELECT invoice_number, metadata, amount_inr FROM public.payments WHERE id = $1;`, [paymentId]);
  const isPaymentMetaScrubbed = JSON.stringify(payCheck.rows[0].metadata) === '{}' && payCheck.rows[0].invoice_number === 'INV-2026-001';

  // Inspect invitations scrub
  const invCheck = await adminClient.query(`SELECT phone, status FROM public.invitations WHERE phone = $1 OR phone = $2;`, [rawPhone, u.phone]);
  const isInvScrubbed = invCheck.rows.length > 0 && invCheck.rows.every(r => r.phone === u.phone && r.status === 'anonymised');

  // Inspect inquiries scrub
  const inqCheck = await adminClient.query(`SELECT student_name, student_phone, student_email FROM public.institution_inquiries WHERE student_phone = $1 OR student_phone = $2;`, [rawPhone, u.phone]);
  const isInqScrubbed = inqCheck.rows.length > 0 && inqCheck.rows.every(r => r.student_name === 'Deleted Applicant' && r.student_phone === u.phone && r.student_email === null);

  // Inspect search_logs disassociation
  const searchLogsCheck = await adminClient.query(`SELECT user_id, query FROM public.search_logs WHERE query = $1;`, [searchKeyword]);
  const isSearchScrubbed = searchLogsCheck.rows.length > 0 && searchLogsCheck.rows.every(r => r.user_id === null);

  // Inspect job_alerts deactivation
  const alertsCheck = await adminClient.query(`SELECT is_active FROM public.job_alerts WHERE user_id = $1;`, [dpdpUserId]);
  const isAlertsDeactivated = alertsCheck.rows.length > 0 && alertsCheck.rows.every(r => r.is_active === false);

  // Inspect ledger rows preserved
  const ledCheck = await adminClient.query(`SELECT count(*)::int as count FROM public.credit_ledgers WHERE user_id = $1;`, [dpdpUserId]);
  const ledPreserved = ledCheck.rows[0].count >= 1;

  const dpdpOverall = isAnonSuccess && isPhoneTombstone && isEmailNull && isStatusDisabled &&
                      isTokenBumped && isNameScrubbed && isAadhaarScrubbed && isApaarScrubbed &&
                      isBioScrubbed && isPlacementScrubbed && isBroadcastScrubbed &&
                      isPaymentMetaScrubbed && isInvScrubbed && isInqScrubbed && isSearchScrubbed &&
                      isAlertsDeactivated && ledPreserved;

  results.push({
    name: 'DPDP anonymise_user scrubs PII across all profiles, placements, broadcasts, payments, invitations, inquiries, search, alerts while preserving immutable ledger audit trail',
    passed: dpdpOverall,
    expected: 'PII scrubbed, DEL_* tombstone, session revoked, placement/broadcast/payment/invitations/inquiries scrubbed, ledger preserved',
    actual: `success=${isAnonSuccess}, phone=${u.phone}, status=${u.status}, placementScrubbed=${isPlacementScrubbed}, broadcastScrubbed=${isBroadcastScrubbed}, paymentScrubbed=${isPaymentMetaScrubbed}, invScrubbed=${isInvScrubbed}, inqScrubbed=${isInqScrubbed}, ledgerCount=${ledCheck.rows[0].count}`,
  });

  console.log('--- 9. Testing Job Expiry, Active Filtering & search_jobs Hardening ---');
  // Check column type of jobs.expiry_date
  const expiryColType = await adminClient.query(`
    SELECT data_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'expiry_date';
  `);
  const isExpiryTimestamptz = expiryColType.rows[0]?.data_type === 'timestamp with time zone';
  results.push({
    name: 'jobs.expiry_date column is TIMESTAMPTZ (timestamp with time zone)',
    passed: isExpiryTimestamptz,
    expected: 'timestamp with time zone',
    actual: expiryColType.rows[0]?.data_type || 'NOT_FOUND',
  });

  // Create employer user for job tests
  const testEmployerId = crypto.randomUUID();
  const employerPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
  await adminClient.query(`
    INSERT INTO public.users (id, phone, role, status, source)
    VALUES ($1, $2, 'employer', 'active', 'job_expiry_test');
  `, [testEmployerId, employerPhone]);

  // Seed 4 test jobs
  const jobActiveValid = crypto.randomUUID();
  const jobExpired = crypto.randomUUID();
  const jobInactive = crypto.randomUUID();
  const jobActiveNoExpiry = crypto.randomUUID();
  const jobUniqueKeyword = 'JobXYZ_' + crypto.randomUUID().slice(0, 8);

  // Job 1: Active + Future expiry -> EXPECTED VISIBLE
  await adminClient.query(`
    INSERT INTO public.jobs (id, employer_id, title, description, category, city, openings, is_active, expiry_date, source)
    VALUES ($1, $2, 'Active Future ' || $3, 'Valid job desc', 'technology', 'Pune', 2, TRUE, NOW() + INTERVAL '5 days', 'test');
  `, [jobActiveValid, testEmployerId, jobUniqueKeyword]);

  // Job 2: Active + Expired date -> EXPECTED HIDDEN
  await adminClient.query(`
    INSERT INTO public.jobs (id, employer_id, title, description, category, city, openings, is_active, expiry_date, source)
    VALUES ($1, $2, 'Expired ' || $3, 'Expired job desc', 'technology', 'Pune', 1, TRUE, NOW() - INTERVAL '2 days', 'test');
  `, [jobExpired, testEmployerId, jobUniqueKeyword]);

  // Job 3: Inactive + Future expiry -> EXPECTED HIDDEN
  await adminClient.query(`
    INSERT INTO public.jobs (id, employer_id, title, description, category, city, openings, is_active, expiry_date, source)
    VALUES ($1, $2, 'Inactive ' || $3, 'Inactive job desc', 'technology', 'Pune', 1, FALSE, NOW() + INTERVAL '5 days', 'test');
  `, [jobInactive, testEmployerId, jobUniqueKeyword]);

  // Job 4: Active + NULL expiry -> EXPECTED VISIBLE
  await adminClient.query(`
    INSERT INTO public.jobs (id, employer_id, title, description, category, city, openings, is_active, expiry_date, source)
    VALUES ($1, $2, 'Active No Expiry ' || $3, 'No expiry job desc', 'technology', 'Pune', 3, TRUE, NULL, 'test');
  `, [jobActiveNoExpiry, testEmployerId, jobUniqueKeyword]);

  // Assert public_jobs view filters expired and inactive jobs
  const publicJobsViewRes = await adminClient.query(`
    SELECT id, title FROM public.public_jobs WHERE id IN ($1, $2, $3, $4);
  `, [jobActiveValid, jobExpired, jobInactive, jobActiveNoExpiry]);
  const viewVisibleIds = publicJobsViewRes.rows.map(r => r.id);
  const viewPasses = viewVisibleIds.includes(jobActiveValid) &&
                     viewVisibleIds.includes(jobActiveNoExpiry) &&
                     !viewVisibleIds.includes(jobExpired) &&
                     !viewVisibleIds.includes(jobInactive);

  results.push({
    name: 'public_jobs view strictly filters out expired and inactive jobs',
    passed: viewPasses,
    expected: `Only [${jobActiveValid}, ${jobActiveNoExpiry}] visible`,
    actual: `Visible IDs: [${viewVisibleIds.join(', ')}]`,
  });

  // Assert search_jobs RPC filters expired and inactive jobs
  const searchJobsRes = await adminClient.query(`
    SELECT id, title FROM public.search_jobs(p_keyword := $1, p_city := 'Pune');
  `, [jobUniqueKeyword]);
  const searchVisibleIds = searchJobsRes.rows.map(r => r.id);
  const searchPasses = searchVisibleIds.includes(jobActiveValid) &&
                       searchVisibleIds.includes(jobActiveNoExpiry) &&
                       !searchVisibleIds.includes(jobExpired) &&
                       !searchVisibleIds.includes(jobInactive);

  results.push({
    name: 'search_jobs RPC strictly filters out expired and inactive jobs',
    passed: searchPasses,
    expected: `Only [${jobActiveValid}, ${jobActiveNoExpiry}] visible`,
    actual: `Visible IDs: [${searchVisibleIds.join(', ')}]`,
  });

  await adminClient.end();

  const allPassed = results.every((r) => r.passed);
  return { success: allPassed, results };
}

if (process.argv[1]?.includes('db-security-drill')) {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  console.log(`Running Security & Attack Drill against: ${url.replace(/:[^:@]*@/, ':****@')}`);
  runSecurityDrill(url).then((res) => {
    console.log('\n======================================================');
    console.log('🛡️ SECURITY ATTACK DRILL RESULTS:');
    console.log('======================================================');
    for (const r of res.results) {
      console.log(`${r.passed ? '✅' : '❌'} ${r.name}`);
      console.log(`   Expected: ${r.expected}`);
      console.log(`   Actual:   ${r.actual}`);
    }
    console.log('======================================================');
    if (res.success) {
      console.log('🎉 ALL SECURITY DRILL CHECKS PASSED!');
      process.exit(0);
    } else {
      console.error('❌ SOME DRILL CHECKS FAILED!');
      process.exit(1);
    }
  }).catch((err) => {
    console.error('Fatal error running security drill:', err);
    process.exit(1);
  });
}
