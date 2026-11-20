# Module 4 (v2): Wallet, Razorpay & Sponsorships — Production-Ready Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. **Money, RLS and auth changes need a named human reviewer (AGENTS.md). Do not self-merge.**

**Supersedes:** Module 4 plan v1. Commit `06640ec` is **reference material only**. Do not cherry-pick it: it carries `testTransaction` / JSON-store branches and un-revoked RPCs.

**Goal:** Ship wallet recharge (Razorpay) and institution sponsorship to production with: no free-money path by construction, atomic settlement in Postgres, webhook + reconciliation that cannot lose or double-grant a payment, GST invoices, refunds, alerts, a runbook, and a tested kill switch.

**Rough effort:** 15–17 working days, one engineer, after prerequisites. T0 1.5d · T1 1.5d · T2 2d · T3 2.5d · T4 2.5d · T5 2d · T6 2.5d · T7 2d.

---

## 0. What changed from v1 (and why)

| #   | v1                                                                                                        | v2                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | New `public` SECURITY DEFINER RPCs, no REVOKE. Anon key could call `rpc_settle_payment` and mint credits. | **Project pattern (auth plan v2):** public `SECURITY INVOKER` wrapper → `private_payments` `SECURITY DEFINER` function. Wrappers revoked from `PUBLIC, anon, authenticated`, granted to `service_role` only. `search_path=''`. Catalog test fails CI on any violation. |
| 2   | `testTransaction` callbacks, `saveTestPaymentGrant`, `ALLOW_TEST_PAYMENTS`, `NODE_ENV` flipping in tests. | **Deleted.** Prod path is the only path. Tests run on real Postgres. Gateway is a DI port, faked in tests via Nest provider override, never via env sniffing.                                                                                                          |
| 3   | `POST /sponsorship/activate {paymentReference}` (client-supplied payment id).                             | **Endpoint deleted.** Sponsorship activates only when a server-created, purpose-bound order is settled. Amount must equal the order's server-set amount exactly.                                                                                                       |
| 4   | Sponsorship covers "students by institution_id"; nothing sets it; no cap.                                 | Seat-capped grant. `institution_id` / `sponsorship_id` writable by `service_role` only. Import worker links students; `rpc_claim_sponsorship_seats` enforces the cap.                                                                                                  |
| 5   | Rollback test spied on a JS repo that never runs inside the RPC.                                          | DB-level fault injection (trigger) inside a savepoint. Plus a real concurrency test.                                                                                                                                                                                   |
| 6   | Webhook: HMAC on "payload" (rawBody setup missing), no dedupe, trusted payload amounts.                   | `rawBody:true`, equal-length hex compare, event-id dedupe, **amount/status fetched from Razorpay server-side**, row lock, reconciliation sweeper.                                                                                                                      |
| 7   | Client sends bearer from JS; silent unauthenticated fallback; client-computed balance.                    | BFF only. Token never reaches JS. Fail closed. Balance always refetched from server.                                                                                                                                                                                   |
| 8   | No refunds, invoices, alerts, runbook, flags, i18n, CSP.                                                  | All in scope (T4–T7).                                                                                                                                                                                                                                                  |

---

## 1. Confirmed Decisions (Answers to Open Decisions O1–O7)

| ID  | Decision & User Ruling | Confirmed Decision Implemented in Plan | Needed by |
| --- | ---------------------- | -------------------------------------- | --------- |
| O1  | **Credit-pack prices & GST toggle** | Pack prices configurable (base + 18% GST). In `RechargeModal.tsx`, provide an enterprise SaaS-style GST checkbox ("I have a GSTIN / claiming input tax credit") that toggles the GSTIN and legal billing name/address inputs. | T2, T6 |
| O2  | **Institution payments (PO/cheque)** | Offline PO/cheque supported via discussion/admin offline flow; backend MVP logic quotes: total students onboarded + GST + tier rate. | T3 |
| O3  | **Renewal & upgrade rules** | 1-year annual duration per grant. Mid-term upgrades allow quoting and activating for updated student count; renewal upon expiry. | T3 |
| O4  | **Credit expiry (D6: 12 months)** | Credits expire after 12 months if unused. Ledger tracks `created_at` and usage across job applications, candidate recommendations, and ATS checker. | T1, T5 |
| O5  | **Tax details for invoices** | Invoices generated with SAC 998311 (IT Services), 18% GST (CGST 9% + SGST 9% or IGST 18%), customer GSTIN (if provided), and supplier details. | T5 |
| O6  | **Refund policy** | Failed or duplicate payments auto-refunded via Razorpay within 5–7 business days. Used credits are strictly non-refundable. Institutional sponsorship is non-refundable. | T5, T6 |
| O7  | **Owning legal entity** | **SPACECRAFTZZ** owns the Razorpay account and is the supplier on all tax invoices. | T0, T5 |

---

## 2. Scope

**In:** wallet recharge, sponsorship purchase + seat cap + expiry, atomic settlement, webhook, checkout-verify, reconciliation, refunds, invoices (outbox + worker), alerts, BFF + UI, i18n, CSP, exit gate, runbook, flags.

**Out (explicit):** offline/NEFT institution payments (O2) · mid-term upgrade and renewal windows (O3) · credit-expiry job (O4) · admin UI for pricing (WAL-04 is _partial_: tiers stay in `packages/validation`, snapshotted per order) · Razorpay Route/payouts for Job Work (P3) · WhatsApp invoice delivery.

---

## 3. Hard prerequisites (gates, not tasks in this module)

Money endpoints inherit the auth system. A forgeable admin or user token makes every control below moot. **Do not start T4 until all are merged and verified:**

- [ ] Auth lockdown 97a (API) + 97b (web BFF): no `jwt_session_*` legacy tokens, no fake-login handlers, no `x-user-id` trust, user-status check on every request, role whitelist at sign-up.
- [ ] Static OTP `123456` removed outside tests; `AuthController` guarded.
- [ ] PR #106 (`feat/public-slugs-id-02`) merged: payment, invoice and sponsorship responses must never contain `usr_<phone>` ids.
- [ ] UUIDs minted by the DB (`gen_random_uuid()`), never composed (`usr_`, `pay_`, `job_`). Money tables use real UUID FKs.
- [ ] `trustProxy` set (Task 0 does it; auth plan may already have).

T0–T3 (SQL + DB tests) may proceed in parallel with the auth work.

---

## 4. Global constraints

- **Hard Invariant #6:** `audit_logs` immutable, append-only. Audit inserts happen **inside** the settlement transaction. Never `try/catch`-swallowed. If the audit insert fails, settlement rolls back.
- **Hard Invariant #7:** balance = `COALESCE(SUM(amount),0)` over `credit_ledgers`. No stored balance.
- **Hard Invariant #8a:** every new user-facing string in `messages/en.json` **and** `messages/hi.json`.
- **Hard Invariant #1:** no phone number, no `usr_<phone>` anywhere in money API responses, HTML, QR, logs.
- **AGENTS.md #10:** zero secrets in code; production env validated at boot; dummy keys rejected.
- **AGENTS.md #11 (commit gate, every commit, not just T7):** `pnpm -r typecheck && pnpm -r lint && <task tests>`. Zero errors.
- **Money is integer paise.** No floats in SQL, TS or JSON for amounts. Column names end `_paise`.
- **No prod/test code forks.** No `isTestMode`, `NODE_ENV==='test'`, `JOBSCLICK_TEST_MANIFEST`, `ALLOW_TEST_PAYMENTS` in payment, wallet, sponsorship or profile repositories.
- **Single migration tree:** `supabase/migrations/` is canonical (T0).
- **Every money RPC:** `SET search_path = ''`, fully-qualified names, wrapper revoked from `PUBLIC, anon, authenticated`, granted to `service_role` only.
- **Authorisation lives in the API** (actor from verified session, never from request body) **and is re-checked in SQL** where ownership matters.
- **Assumed column names:** `audit_logs(actor_id, action, entity_type, entity_id, metadata)` and `credit_ledgers(user_id, amount, reason, source, …)` follow the v1 fixtures. **Confirm against the live schema in T1 step 1 and adjust the SQL below.**

---

## 5. Architecture

```
create-order   Browser → BFF (cookie session) → API (JWT guard, rate limit)
               → price from server constants → INSERT payments(status=created, order_snapshot)
               → Razorpay order → { orderId, keyId, amountPaise } (keyId from server, not NEXT_PUBLIC)

settle (ONE path, three triggers)
   (a) checkout callback  → POST /wallet/recharge/verify   (HMAC order|payment w/ key secret; order owner only)
   (b) webhook            → POST /webhooks/razorpay        (HMAC raw body w/ webhook secret; event-id dedupe)
   (c) reconciliation job → every 10 min, orders `created` > 15 min old
          ↓
   PaymentService.settleFromGateway(orderId, paymentId, source, eventId?)
          ↓ gateway.fetchPayment()   ← amount, currency, status come from Razorpay, never from client/payload
          ↓ supabase.rpc('rpc_settle_payment')            (public SECURITY INVOKER wrapper, service_role only)
          ↓ private_payments.settle_payment()             (SECURITY DEFINER, ONE transaction)
              lock payments row → amount check → status=captured → ledger credit OR sponsorship grant
              → payment_grants (PK payment_id: one payment, one grant, ever) → audit → outbox(invoice)
```

### Data model (summary)

| Object                                                                                                                                               | Schema               | Purpose                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `payments` (+`purpose`, `amount_paise`, `credits_to_grant`, `order_snapshot`, `billing_state_code`, `terms_version`, `settled_at`, `payment_method`) | public, deny-all RLS | One row per order. `purpose ∈ {wallet, sponsorship}`.                             |
| `credit_ledgers` (+`payment_id`, `ref_id`, `expires_at`)                                                                                             | public, deny-all     | Append-only. Unique `(payment_id, reason)`. Unique starter grant per user.        |
| `credit_action_costs`                                                                                                                                | public, deny-all     | Per-action cost (WAL-04).                                                         |
| `institution_sponsorships` (+`payment_id` unique, `tier`, `rate_paise`, `student_cap`, `seats_used`)                                                 | public, deny-all     | Seat-capped, expiring grant. One `active` per institution.                        |
| `job_seeker_profiles.sponsorship_id`                                                                                                                 | public               | Which grant covers this student. Writable by `service_role` only (guard trigger). |
| `payment_refunds`, `invoices`, `platform_settings`                                                                                                   | public, deny-all     | API reads via service_role.                                                       |
| `private_payments.payment_grants`                                                                                                                    | private              | PK `payment_id`. Immutable. **No PII** → DPDP-safe.                               |
| `private_payments.webhook_events`                                                                                                                    | private              | PK `event_id`. Replay shield.                                                     |
| `private_payments.payment_anomalies`                                                                                                                 | private              | Alertable oddities (mismatch, duplicate capture, unknown order).                  |
| `private_payments.outbox`, `invoice_counters`                                                                                                        | private              | Transactional outbox; gapless per-FY invoice numbers.                             |

---

## Task 0: Harness & foundations

**Files:**

- Modify: `.github/workflows/ci.yml` (add `db-integration` job)
- Create: `scripts/check-migrations-single-tree.sh`
- Delete: `packages/database/supabase/migrations/` (canonical = `supabase/migrations/`; keep a symlink only if tooling needs it)
- Modify: `apps/api/src/main.ts` (`trustProxy`, `rawBody`, `bodyLimit`)
- Modify: `apps/api/src/config/validate-env.ts`
- Delete/replace: every `isTestMode` / `testTransaction` / `saveTestPaymentGrant` / `findTestPaymentGrant` branch in `payment|wallet|sponsorship|profile` repositories and `PersistentDatabaseStore.withFinancialTransaction`
- Test: `apps/api/test/env-validation.spec.ts`

- [ ] **Step 1: Real-Postgres CI job.** `supabase start` → apply migrations → `pnpm test:db` (all `*.local.test.ts`). It is a required check on `main`. Deploy jobs must not be `echo` stubs before T7 sign-off (tracked in T7).

- [ ] **Step 2: One migration tree.** Delete the duplicate tree and the sync script. `check-migrations-single-tree.sh` fails CI if the second tree reappears.

- [ ] **Step 3: Fastify hardening.**

```ts
// apps/api/src/main.ts
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    trustProxy: Number(process.env.TRUST_PROXY_HOPS ?? 1),
    bodyLimit: 1_048_576,
  }),
  { rawBody: true }, // exposes req.rawBody (Buffer) for HMAC
);
app.enableShutdownHooks();
```

Set `TRUST_PROXY_HOPS` to the real number of proxies in front (Cloudflare + host). Verify in staging that `req.ip` is the client, not the proxy.

- [ ] **Step 4: Env validation (fail boot, not request).**

```ts
// apps/api/src/config/payment-env.ts
const DUMMY = /dummy|changeme|example|placeholder|test_key|x{6,}/i;
export const paymentEnv = z
  .object({
    RAZORPAY_KEY_ID: z.string().regex(/^rzp_(live|test)_[A-Za-z0-9]{10,}$/),
    RAZORPAY_KEY_SECRET: z.string().min(16),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(20),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5),
  })
  .superRefine((e, ctx) => {
    const prod = process.env.NODE_ENV === 'production';
    for (const [k, v] of Object.entries(e))
      if (DUMMY.test(String(v)))
        ctx.addIssue({ code: 'custom', path: [k], message: 'dummy value' });
    if (prod && !e.RAZORPAY_KEY_ID.startsWith('rzp_live_'))
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'live key required in production',
      });
  });
```

Also: do not load `.env.local` when `NODE_ENV=production`; remove `ALLOW_TEST_PAYMENTS` and `JOBSCLICK_TEST_MANIFEST` everywhere; `.env.example` placeholders must fail validation.

- [ ] **Step 5: Delete the forks.** `grep -rnE "isTestMode|testTransaction|TestPaymentGrant|withFinancialTransaction|ALLOW_TEST_PAYMENTS|JOBSCLICK_TEST_MANIFEST" apps packages` must return nothing in money paths. Unrelated modules may keep theirs until their own fix; record them in the PR description.

- [ ] **Step 6: Test + commit.** `env-validation.spec.ts`: boot throws for each dummy value; throws for `rzp_test_` in production; passes for a valid live set. Commit gate, then:

```bash
git commit -m "chore(wallet): real-PG CI, single migration tree, rawBody/trustProxy, strict payment env"
```

---

## Task 1: Schema + security baseline

**Files:**

- Create: `supabase/migrations/20261121000100_money_schema.sql`
- Create: `supabase/migrations/20261121000200_money_security.sql`
- Test: `packages/database/test/money-security.local.test.ts`

- [ ] **Step 1: Pre-flight.** Run and paste output into the PR: `select distinct status from public.payments; select distinct reason from public.credit_ledgers;` and `\d` of `payments`, `credit_ledgers`, `audit_logs`, `institution_sponsorships`, `job_seeker_profiles`. Adjust column names in all SQL below to match. Grep `apps/web` for direct `createClient(` use against money tables; if any exists, fix it before the revokes below.

- [ ] **Step 2: Write the failing security test first** (`money-security.local.test.ts`):

```ts
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
beforeAll(() => db.connect());
afterAll(() => db.end());

describe('money surface is service_role-only', () => {
  it('no SECURITY DEFINER function in public/private_payments is executable by anon/authenticated/PUBLIC', async () => {
    const { rows } = await db.query(`
      select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private_payments') and p.prosecdef
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE'))`);
    expect(rows).toEqual([]);
  });

  it('every public rpc_* wrapper is SECURITY INVOKER with search_path pinned', async () => {
    const { rows } = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'rpc\\_%'
        and (p.prosecdef or p.proconfig is null or not (p.proconfig::text like '%search_path=%'))`);
    expect(rows).toEqual([]);
  });

  it.each([
    'payments',
    'credit_ledgers',
    'audit_logs',
    'institution_sponsorships',
    'payment_refunds',
    'invoices',
    'credit_action_costs',
    'platform_settings',
  ])('anon/authenticated have no privileges on public.%s', async (t) => {
    const { rows } = await db.query(
      `select has_table_privilege('anon', $1, 'SELECT') a, has_table_privilege('authenticated', $1, 'SELECT') b,
              has_table_privilege('authenticated', $1, 'INSERT') c`,
      [`public.${t}`],
    );
    expect(rows[0]).toEqual({ a: false, b: false, c: false });
  });

  it('live anon-key call to a money wrapper is rejected with permission denied', async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc('rpc_settle_payment', {
      p_gateway_order_id: 'x',
      p_gateway_payment_id: 'y',
      p_amount_paise: 1,
      p_currency: 'INR',
      p_method: 'upi',
      p_event_id: null,
      p_source: 'attack',
    });
    expect(error?.code).toBe('42501');
  });

  it('client roles cannot write institution_id / sponsorship_id on seeker profiles', async () => {
    /* added in T3 once column exists */
  });
});
```

Run: expected FAIL (red).

- [ ] **Step 3: `money_schema.sql`** (additive; backfills before constraints):

```sql
create schema if not exists private_payments;

-- payments: purpose-bound, paise-exact
alter table public.payments
  add column if not exists purpose text,
  add column if not exists amount_paise bigint,
  add column if not exists credits_to_grant integer not null default 0,
  add column if not exists order_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists billing_state_code text,
  add column if not exists terms_version text,
  add column if not exists settled_at timestamptz,
  add column if not exists payment_method text;
update public.payments
   set purpose = coalesce(metadata->>'purpose','wallet'),
       amount_paise = round(amount_inr * 100)::bigint
 where amount_paise is null;
alter table public.payments
  alter column purpose set not null,
  alter column amount_paise set not null,
  add constraint payments_purpose_chk check (purpose in ('wallet','sponsorship')),
  add constraint payments_amount_chk check (amount_paise > 0),
  add constraint payments_currency_chk check (currency = 'INR'),
  add constraint payments_status_chk check (status in ('created','captured','expired','partially_refunded','refunded'));
create unique index payments_gateway_order_uq on public.payments(gateway_order_id);
create unique index payments_gateway_payment_uq on public.payments(gateway_payment_id) where gateway_payment_id is not null;

-- ledger: DB-level idempotency
alter table public.credit_ledgers
  add column if not exists payment_id uuid references public.payments(id),
  add column if not exists ref_id uuid,
  add column if not exists expires_at timestamptz;          -- reserved for O4
create unique index credit_ledgers_payment_reason_uq on public.credit_ledgers(payment_id, reason) where payment_id is not null;
create unique index credit_ledgers_starter_uq on public.credit_ledgers(user_id) where reason = 'starter_credit';
create unique index credit_ledgers_application_uq on public.credit_ledgers(user_id, ref_id)
  where reason in ('application','application_sponsored');

create table public.credit_action_costs (action text primary key, cost integer not null check (cost >= 0));
insert into public.credit_action_costs values ('job_application', 1);

-- sponsorship: seat-capped, single active grant
alter table public.institution_sponsorships
  add column if not exists payment_id uuid unique references public.payments(id),
  add column if not exists tier text,
  add column if not exists rate_paise integer,
  add column if not exists student_cap integer,
  add column if not exists seats_used integer not null default 0,
  add constraint sponsorship_seats_chk check (seats_used >= 0 and (student_cap is null or seats_used <= student_cap)),
  add constraint sponsorship_status_chk check (status in ('active','expired','revoked'));
create unique index one_active_grant_per_institution on public.institution_sponsorships(institution_id) where status = 'active';
alter table public.job_seeker_profiles add column if not exists sponsorship_id uuid references public.institution_sponsorships(id);
create index on public.job_seeker_profiles(institution_id, sponsorship_id);

-- refunds, invoices, settings
create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  gateway_refund_id text not null unique,
  amount_paise bigint not null check (amount_paise > 0),
  credits_reversed integer not null default 0,
  unrecovered_credits integer not null default 0,
  created_at timestamptz not null default now());
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  kind text not null check (kind in ('invoice','credit_note')),
  number text not null unique,                 -- e.g. JC/2627/000001 (<=16 chars)
  fy text not null,
  taxable_paise bigint not null, cgst_paise bigint not null default 0,
  sgst_paise bigint not null default 0, igst_paise bigint not null default 0,
  total_paise bigint not null,
  billing_snapshot jsonb not null,             -- name, GSTIN, state; the only PII here
  pdf_path text, emailed_at timestamptz,
  issued_at timestamptz not null default now(),
  unique (payment_id, kind));
create table public.platform_settings (key text primary key, value jsonb not null);

-- private tables (not exposed by PostgREST)
create function private_payments.reject_mutation() returns trigger language plpgsql set search_path = '' as
$$ begin raise exception 'IMMUTABLE_RECORD'; end $$;
create table private_payments.payment_grants (
  payment_id uuid primary key references public.payments(id) on delete restrict,
  grant_type text not null check (grant_type in ('wallet_credit','sponsorship')),
  grant_ref uuid not null, created_at timestamptz not null default now());
create trigger payment_grants_immutable before update or delete on private_payments.payment_grants
  for each row execute function private_payments.reject_mutation();
create table private_payments.webhook_events (
  event_id text primary key, event_type text not null, received_at timestamptz not null default now());
create table private_payments.payment_anomalies (
  id uuid primary key default gen_random_uuid(), kind text not null,
  gateway_order_id text, gateway_payment_id text, details jsonb not null default '{}',
  created_at timestamptz not null default now(), acknowledged_at timestamptz);
create table private_payments.invoice_counters (fy text, kind text, last_seq bigint not null, primary key (fy, kind));
create table private_payments.outbox (
  id uuid primary key default gen_random_uuid(), kind text not null, payment_id uuid not null,
  attempts int not null default 0, done_at timestamptz, created_at timestamptz not null default now());
create index on private_payments.outbox(created_at) where done_at is null;
```

- [ ] **Step 4: `money_security.sql`:**

```sql
revoke all on schema private_payments from public, anon, authenticated;
grant usage on schema private_payments to service_role;

-- future functions are not executable by client roles unless granted explicitly
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private_payments revoke execute on functions from public, anon, authenticated;

-- money tables: deny-all to client roles, drop every existing policy
do $$
declare t text; pol record;
begin
  foreach t in array array['payments','credit_ledgers','audit_logs','institution_sponsorships',
                           'payment_refunds','invoices','credit_action_costs','platform_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- audit-log immutability preserved; ledger rows are append-only too
create trigger credit_ledgers_no_update before update on public.credit_ledgers
  for each row execute function private_payments.reject_mutation();
create trigger credit_ledgers_no_delete before delete on public.credit_ledgers
  for each row execute function private_payments.reject_mutation();
```

> DPDP note: ledger DELETE is blocked on purpose. Erasure = anonymise the `users` row; money tables hold only the user UUID and no PII (invoice `billing_snapshot` is the exception and is anonymised after the retention window the CA sets, O5).

- [ ] **Step 5: Revoke the pre-existing RPCs** (they appeared in the API audit P1 list). In the same migration, **drop and recreate in T2/T3** the wallet ones; for the one outside this module, revoke only:

```sql
revoke execute on function public.get_district_employment_reports(/* existing args */) from public, anon, authenticated;
grant  execute on function public.get_district_employment_reports(/* existing args */) to service_role;
-- promote_job_with_ledger, get_user_credit_balance, deduct_application_credit_with_ledger:
-- revoke now; replaced by rpc_* wrappers in T2 (promote: revoke only, no redesign here)
```

Leave no old wallet function callable by client roles between T1 and T2.

- [ ] **Step 6: Green.** `pnpm --filter @indian-job-portal/database test test/money-security.local.test.ts`. Expected PASS (except the T3 placeholder). Commit gate, then:

```bash
git commit -m "feat(database): WAL money schema, deny-all RLS, service_role-only RPC surface"
```

---

## Task 2: Atomic wallet settlement, charging, balance

**Files:**

- Create: `supabase/migrations/20261121000300_wallet_settlement.sql`
- Test: `packages/database/test/payment-settlement.local.test.ts`
- Test: `packages/database/test/credit-charge.local.test.ts`

**Interfaces (statuses are a closed set):**
`rpc_settle_payment(p_gateway_order_id text, p_gateway_payment_id text, p_amount_paise bigint, p_currency text, p_method text, p_event_id text, p_source text) → jsonb { status: 'settled'|'already_settled'|'duplicate_event'|'amount_mismatch'|'unknown_order'|'duplicate_capture', payment_id?, purpose? }`
`rpc_charge_application(p_applicant_id uuid, p_job_id uuid) → jsonb { charged boolean, sponsored boolean, balance bigint }` (raises `INSUFFICIENT_CREDITS`)
`rpc_get_balance(p_user_id uuid) → bigint`

**Rules baked into the SQL:** expected-failure cases (mismatch, unknown order, duplicate capture) **return a status and write an anomaly**. They do not raise, so the anomaly row commits and the webhook gets a 200. **Unexpected** failures raise, so everything rolls back and Razorpay retries.

- [ ] **Step 1: Write failing tests** (`payment-settlement.local.test.ts`). Fixture helper `createOrder({purpose:'wallet', amountPaise:59000, credits:50})` inserts a real `users` row, then a `payments` row (`status='created'`). All run as a superuser `pg` client against real Postgres.

```ts
const settle = (c: pg.Client, o: Fixture, over: Partial<Args> = {}) =>
  c.query('select public.rpc_settle_payment($1,$2,$3,$4,$5,$6,$7) as r',
    [o.orderId, o.paymentId, o.amountPaise, 'INR', 'upi', over.eventId ?? null, 'test']).then(r => r.rows[0].r);

it('settles once: credits granted, grant row, audit rows, outbox row', async () => {
  const f = await order(); const r = await settle(db, f);
  expect(r.status).toBe('settled');
  expect(await balance(f.userId)).toBe(50);
  expect(await count('private_payments.payment_grants', f.paymentRowId)).toBe(1);
  expect(await auditActions(f.paymentRowId)).toEqual(expect.arrayContaining(['PAYMENT_CAPTURED','CREDIT_WALLET_GRANTED']));
  expect(await outbox(f.paymentRowId)).toBe(1);
});
it('is idempotent: second settle => already_settled, balance unchanged', ...);
it('replayed event id => duplicate_event, no second grant', ...);
it('amount mismatch (1 paise) => amount_mismatch, status stays created, no credits, anomaly row', ...);
it('currency != INR => amount_mismatch', ...);
it('unknown order => unknown_order + anomaly, no raise', ...);
it('second DIFFERENT payment id on an already-paid order => duplicate_capture + anomaly (customer paid twice → refund)', ...);
it('late payment on a locally-expired order still settles', ...);

it('rolls back EVERYTHING when ledger insert fails; clean retry settles once', async () => {
  const f = await order();
  await db.query('BEGIN');
  await db.query(`create trigger fault before insert on public.credit_ledgers
                  for each row when (new.user_id = '${f.userId}') execute function test_fault.boom()`); // test-only fn, created in beforeAll
  await db.query('SAVEPOINT s');
  await expect(settle(db, f, { eventId: 'evt_1' })).rejects.toThrow('FAULT');
  await db.query('ROLLBACK TO SAVEPOINT s');
  expect((await payment(f)).status).toBe('created');
  expect(await balance(f.userId)).toBe(0);
  expect(await auditActions(f.paymentRowId)).toEqual([]);
  expect(await eventExists('evt_1')).toBe(false);          // event row rolled back too → retry is processed
  await db.query('drop trigger fault on public.credit_ledgers');
  expect((await settle(db, f, { eventId: 'evt_1' })).status).toBe('settled');
  expect(await balance(f.userId)).toBe(50);
  await db.query('ROLLBACK');
});

it('50 concurrent settles on separate connections => exactly 1 settled, balance == credits once', async () => {
  const f = await order(); const clients = await connect(50);
  const res = await Promise.all(clients.map(c => settle(c, f)));
  expect(res.filter(r => r.status === 'settled')).toHaveLength(1);
  expect(res.filter(r => r.status === 'already_settled')).toHaveLength(49);
  expect(await balance(f.userId)).toBe(50);
});
```

`credit-charge.local.test.ts`:

```ts
it('50 concurrent applications at balance=1 => exactly one succeeds, others INSUFFICIENT_CREDITS, balance never < 0', ...);
it('same (user, job) twice => one charge (idempotent), second returns charged:false', ...);
it('sponsored student (active unexpired grant) pays 0 and a zero-amount ledger row is written', ...);
it('starter credit granted once even if called 20x concurrently', ...);
it('rpc_get_balance == SUM(ledger) (Invariant #7); no stored balance column read', ...);
```

Run: expected FAIL.

- [ ] **Step 2: Migration `wallet_settlement.sql`.** Helper first:

```sql
create function private_payments.audit(p_action text, p_actor uuid, p_entity text, p_entity_id uuid, p_meta jsonb)
returns void language sql security definer set search_path = '' as
$$ insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
   values (p_actor, p_action, p_entity, p_entity_id, p_meta) $$;
revoke execute on function private_payments.audit(text,uuid,text,uuid,jsonb) from public, anon, authenticated;

create function private_payments.settle_payment(
  p_gateway_order_id text, p_gateway_payment_id text, p_amount_paise bigint,
  p_currency text, p_method text, p_event_id text, p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_pay public.payments%rowtype; v_ref uuid;
begin
  if p_event_id is not null then
    insert into private_payments.webhook_events(event_id, event_type) values (p_event_id, 'payment.captured')
      on conflict do nothing;
    if not found then return jsonb_build_object('status','duplicate_event'); end if;
  end if;

  select * into v_pay from public.payments where gateway_order_id = p_gateway_order_id for update;

  if not found then
    insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
      values ('UNKNOWN_ORDER', p_gateway_order_id, p_gateway_payment_id, jsonb_build_object('source', p_source));
    return jsonb_build_object('status','unknown_order');
  end if;

  if v_pay.status in ('captured','partially_refunded','refunded') then
    if v_pay.gateway_payment_id is distinct from p_gateway_payment_id then
      insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
        values ('DUPLICATE_CAPTURE', p_gateway_order_id, p_gateway_payment_id,
                jsonb_build_object('settled_with', v_pay.gateway_payment_id));
      return jsonb_build_object('status','duplicate_capture','payment_id', v_pay.id);
    end if;
    return jsonb_build_object('status','already_settled','payment_id', v_pay.id,'purpose', v_pay.purpose);
  end if;

  if p_amount_paise <> v_pay.amount_paise or p_currency <> 'INR' then
    insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
      values ('AMOUNT_MISMATCH', p_gateway_order_id, p_gateway_payment_id,
              jsonb_build_object('expected', v_pay.amount_paise, 'got', p_amount_paise, 'currency', p_currency));
    return jsonb_build_object('status','amount_mismatch','payment_id', v_pay.id);
  end if;

  update public.payments set status='captured', gateway_payment_id=p_gateway_payment_id,
         payment_method=p_method, settled_at=now() where id = v_pay.id;

  if v_pay.purpose = 'wallet' then
    insert into public.credit_ledgers(user_id, amount, reason, payment_id, source)
      values (v_pay.user_id, v_pay.credits_to_grant, 'wallet_recharge', v_pay.id, 'razorpay') returning id into v_ref;
    insert into private_payments.payment_grants(payment_id, grant_type, grant_ref) values (v_pay.id,'wallet_credit', v_ref);
    perform private_payments.audit('CREDIT_WALLET_GRANTED', v_pay.user_id, 'payment', v_pay.id,
                                   jsonb_build_object('credits', v_pay.credits_to_grant));
  else
    raise exception 'PURPOSE_NOT_ENABLED';       -- replaced in T3
  end if;

  perform private_payments.audit('PAYMENT_CAPTURED', v_pay.user_id, 'payment', v_pay.id,
            jsonb_build_object('amount_paise', v_pay.amount_paise, 'source', p_source));
  insert into private_payments.outbox(kind, payment_id) values ('issue_invoice', v_pay.id);   -- invoice is issued async (T5)
  return jsonb_build_object('status','settled','payment_id', v_pay.id,'purpose', v_pay.purpose);
end $fn$;
```

Wrapper pattern (repeat for every RPC):

```sql
create function public.rpc_settle_payment(p_gateway_order_id text, p_gateway_payment_id text, p_amount_paise bigint,
  p_currency text, p_method text, p_event_id text, p_source text)
returns jsonb language sql security invoker set search_path = '' as
$$ select private_payments.settle_payment($1,$2,$3,$4,$5,$6,$7) $$;
revoke all on function public.rpc_settle_payment(text,text,bigint,text,text,text,text) from public, anon, authenticated;
grant  execute on function public.rpc_settle_payment(text,text,bigint,text,text,text,text) to service_role;
revoke all on function private_payments.settle_payment(text,text,bigint,text,text,text,text) from public, anon, authenticated;
grant  execute on function private_payments.settle_payment(text,text,bigint,text,text,text,text) to service_role;
```

Why invoker + definer: the invoker wrapper only runs if the caller's role has EXECUTE on it; the privileged body is unreachable from PostgREST directly.

Charging (advisory lock serialises per user, so no overdraft race):

```sql
create function private_payments.charge_application(p_applicant uuid, p_job uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_cost int; v_bal bigint; v_sponsored boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_applicant::text, 0));
  if exists (select 1 from public.credit_ledgers where user_id=p_applicant and ref_id=p_job
             and reason in ('application','application_sponsored')) then
    return jsonb_build_object('charged', false, 'sponsored', false, 'balance',
           (select coalesce(sum(amount),0) from public.credit_ledgers where user_id=p_applicant));
  end if;
  select cost into v_cost from public.credit_action_costs where action='job_application';
  if v_cost is null then raise exception 'COST_NOT_CONFIGURED'; end if;

  select exists (select 1 from public.job_seeker_profiles s
                   join public.institution_sponsorships g on g.id = s.sponsorship_id
                  where s.user_id = p_applicant and g.status='active'
                    and g.started_at <= now() and g.expires_at > now()) into v_sponsored;
  if v_sponsored then
    insert into public.credit_ledgers(user_id, amount, reason, ref_id, source) values (p_applicant, 0, 'application_sponsored', p_job, 'system');
    return jsonb_build_object('charged', false, 'sponsored', true, 'balance',
           (select coalesce(sum(amount),0) from public.credit_ledgers where user_id=p_applicant));
  end if;

  select coalesce(sum(amount),0) into v_bal from public.credit_ledgers where user_id=p_applicant;
  if v_bal < v_cost then raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001'; end if;
  insert into public.credit_ledgers(user_id, amount, reason, ref_id, source) values (p_applicant, -v_cost, 'application', p_job, 'system');
  perform private_payments.audit('CREDIT_DEBITED', p_applicant, 'job', p_job, jsonb_build_object('cost', v_cost));
  return jsonb_build_object('charged', true, 'sponsored', false, 'balance', v_bal - v_cost);
end $fn$;
```

Sponsorship expiry is read **only here, in SQL**. Delete the duplicate expiry logic from `wallet.service.ts` (TOCTOU + clock skew). Add `rpc_get_balance` and `rpc_charge_application` wrappers with the same revoke/grant block. **Drop** `deduct_application_credit_with_ledger`, `get_user_credit_balance`; update callers. Keep `ensureStarterCredits` as a single `insert … on conflict do nothing` into the unique starter index.

- [ ] **Step 3: Green.** `pnpm --filter @indian-job-portal/database test test/payment-settlement.local.test.ts test/credit-charge.local.test.ts test/money-security.local.test.ts`. Commit gate, then:

```bash
git commit -m "feat(database): WAL-01/02/03 atomic settlement, race-safe charging, ledger-derived balance"
```

---

## Task 3: Sponsorship (seat-capped, server-bound, no client payment reference)

**Files:**

- Create: `supabase/migrations/20261121000400_sponsorship.sql`
- Test: `packages/database/test/sponsorship.local.test.ts`
- Modify: `apps/api/src/bulk-import/*` (worker sets `institution_id`, calls the claim RPC)
- Modify: `packages/validation/src/wallet.ts` (tier constants + `computeSponsorshipQuote`)

**Quote (single source, integer paise):** tiers from `packages/validation` (Small ≤2,000: ₹150 · Medium 2,001–10,000: ₹100 · Large 10,001+: ₹70 per student/year). `subtotal_paise = students × rate × 100`; `gst_paise = subtotal × 18 / 100` (always integral because subtotal is a multiple of 100); `total = subtotal + gst`. Snapshot goes into `payments.order_snapshot`:
`{ institutionId, tier, ratePaise, studentCap, subtotalPaise, gstPaise, totalPaise, termDays: 365, pricingVersion }`.
The order amount **is** `totalPaise`. Razorpay enforces payment == order amount, and the DB enforces settled amount == `payments.amount_paise`. There is no "≥ quote" comparison that an attacker can game.

- [ ] **Step 1: Failing tests** (`sponsorship.local.test.ts`):

```ts
it('settling a sponsorship order creates one grant with cap/tier/term from the snapshot and claims linked students oldest-first up to cap', ...);
it('amount_mismatch (1 paise vs snapshot total) => no grant, no seat claimed, payment stays created', ...);
it('a wallet-purpose payment can never become a grant (payment_grants PK + purpose check)', async () => {
  const w = await settledWalletPayment();
  await expect(db.query('select private_payments.create_sponsorship_grant($1)', [w.paymentRowId])).rejects.toThrow();
  expect(await grantsFor(w.paymentRowId)).toHaveLength(1);        // still the wallet grant only
});
it('settle again / replay => already_settled / duplicate_event; still exactly 1 grant', ...);
it('order whose snapshot institution is NOT owned by payment.user_id => SPONSORSHIP_PRECONDITION_FAILED anomaly, status stays created, no grant', ...);
it('seat cap: cap=2, 5 students linked => rpc_claim_sponsorship_seats claims exactly 2; charging: 2 pay 0, 3 pay 1 credit', ...);
it('claim is concurrency-safe: 20 parallel claims never push seats_used above cap', ...);
it('expired grant: expires_at in the past => charge deducts 1 credit; grant flipped to expired on next settle/sweep', ...);
it('only one active grant per institution (partial unique index); API-level 409 covered in T4', ...);
it('as role authenticated/anon: INSERT/UPDATE of job_seeker_profiles.institution_id or sponsorship_id raises FORBIDDEN_COLUMN', async () => {
  await db.query('BEGIN'); await db.query('SET LOCAL ROLE authenticated');
  await expect(db.query('update public.job_seeker_profiles set sponsorship_id=$1 where id=$2',[g, p])).rejects.toThrow(/FORBIDDEN_COLUMN|permission denied/);
  await db.query('ROLLBACK');
});
it('free-text institution name no longer grants anything (is_sponsored boolean is not read by any RPC)', ...);
```

Run: FAIL.

- [ ] **Step 2: Migration.**

```sql
-- guard: client roles can never set the money-linking columns
create function private_payments.guard_seeker_link_columns() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') and (
       (tg_op = 'INSERT' and (new.sponsorship_id is not null or new.institution_id is not null)) or
       (tg_op = 'UPDATE' and (new.sponsorship_id is distinct from old.sponsorship_id
                           or new.institution_id is distinct from old.institution_id)))
  then raise exception 'FORBIDDEN_COLUMN'; end if;
  return new;
end $$;
create trigger seeker_link_guard before insert or update on public.job_seeker_profiles
  for each row execute function private_payments.guard_seeker_link_columns();

create function private_payments.create_sponsorship_grant(p_pay public.payments)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare v_inst uuid := (p_pay.order_snapshot->>'institutionId')::uuid; v_gid uuid; v_cap int := (p_pay.order_snapshot->>'studentCap')::int;
begin
  if not exists (select 1 from public.institution_profiles where id = v_inst and user_id = p_pay.user_id) then
    return null;                                   -- caller turns null into the PRECONDITION anomaly
  end if;
  update public.institution_sponsorships set status='expired'
   where institution_id = v_inst and status='active' and expires_at <= now();
  insert into public.institution_sponsorships(institution_id, status, started_at, expires_at, payment_id, tier, rate_paise, student_cap, seats_used)
  values (v_inst, 'active', now(), now() + make_interval(days => (p_pay.order_snapshot->>'termDays')::int),
          p_pay.id, p_pay.order_snapshot->>'tier', (p_pay.order_snapshot->>'ratePaise')::int, v_cap, 0)
  returning id into v_gid;                         -- unique partial index rejects a 2nd active grant → raises → rollback
  perform private_payments.claim_seats(v_gid, v_inst, v_cap);
  return v_gid;
end $fn$;

create function private_payments.claim_seats(p_grant uuid, p_inst uuid, p_limit int)
returns int language plpgsql security definer set search_path = '' as $fn$
declare v_free int; v_n int;
begin
  select student_cap - seats_used into v_free from public.institution_sponsorships where id = p_grant for update;
  with pick as (select id from public.job_seeker_profiles
                 where institution_id = p_inst and sponsorship_id is null
                 order by created_at limit least(v_free, p_limit) for update skip locked)
  update public.job_seeker_profiles s set sponsorship_id = p_grant from pick where s.id = pick.id;
  get diagnostics v_n = row_count;
  update public.institution_sponsorships set seats_used = seats_used + v_n where id = p_grant;
  return v_n;
end $fn$;

create function private_payments.claim_sponsorship_seats(p_inst uuid, p_profile_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $fn$
declare v_g public.institution_sponsorships%rowtype; v_free int; v_n int;
begin
  select * into v_g from public.institution_sponsorships
   where institution_id = p_inst and status='active' and expires_at > now() for update;
  if not found then return 0; end if;
  v_free := v_g.student_cap - v_g.seats_used;
  with pick as (select id from public.job_seeker_profiles
                 where id = any(p_profile_ids) and institution_id = p_inst and sponsorship_id is null
                 order by created_at limit v_free for update skip locked)
  update public.job_seeker_profiles s set sponsorship_id = v_g.id from pick where s.id = pick.id;
  get diagnostics v_n = row_count;
  update public.institution_sponsorships set seats_used = seats_used + v_n where id = v_g.id;
  return v_n;
end $fn$;
```

Replace the `else raise 'PURPOSE_NOT_ENABLED'` branch of `settle_payment` (via `create or replace`):

```sql
  else
    v_ref := private_payments.create_sponsorship_grant(v_pay);
    if v_ref is null then
      -- precondition failed: record, leave payment 'created', do NOT raise (anomaly must commit)
      update public.payments set status='created', gateway_payment_id=null, settled_at=null, payment_method=null where id=v_pay.id;
      insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
        values ('SPONSORSHIP_PRECONDITION_FAILED', p_gateway_order_id, p_gateway_payment_id, '{}');
      return jsonb_build_object('status','amount_mismatch','payment_id', v_pay.id);   -- same “not settled, needs human” class
    end if;
    insert into private_payments.payment_grants(payment_id, grant_type, grant_ref) values (v_pay.id,'sponsorship', v_ref);
    perform private_payments.audit('INSTITUTION_SPONSORSHIP_ACTIVATED', v_pay.user_id, 'sponsorship', v_ref,
              jsonb_build_object('cap', v_pay.order_snapshot->'studentCap','tier', v_pay.order_snapshot->'tier'));
  end if;
```

Use a dedicated status string `precondition_failed` in the final code (add it to the closed set in T2 and the TS union in T4). The wrappers `rpc_claim_sponsorship_seats` follow the same revoke/grant block. **Deprecate** (stop reading, drop in a later migration): `job_seeker_profiles.is_sponsored`, `institution_profiles.is_sponsorship_active`, `sponsorship_expires_at`. The API derives status from the grant row.

- [ ] **Step 3: Import worker.** `institution_id` comes from the **batch owner's institution profile resolved server-side at batch creation**, never from CSV columns or request body. After each upserted chunk the worker calls `rpc_claim_sponsorship_seats(institutionId, chunkProfileIds)`. Remove every free-text match (`updateStudentSponsorshipByInstitution(name)`). Strip `institution_id` from the self-service profile DTO.
  - Student self-registration choosing a college does **not** link them. Linking happens only through import or an institution-approval action.

- [ ] **Step 4: Green.** Run `sponsorship.local.test.ts` + `money-security.local.test.ts` (now including the seeker-column test). Commit gate, then:

```bash
git commit -m "feat(database): WAL-05 INT-05 seat-capped sponsorship bound to settled orders; remove free-text matching"
```

---

## Task 4: API — gateway port, settlement service, webhook, verify, endpoints

**Files:**

- Create: `apps/api/src/wallet/razorpay.gateway.ts` (port + SDK adapter)
- Create: `apps/api/src/wallet/razorpay-signature.ts`
- Rewrite: `apps/api/src/wallet/payment.service.ts`, `razorpay.webhook.ts`, `wallet.controller.ts`, `sponsorship.service.ts`, `sponsorship.controller.ts`
- Rewrite (thin RPC callers only): `apps/api/src/database/repositories/payment.repository.ts`, `profile.repository.ts`
- Modify: `packages/validation/src/wallet.ts` (zod DTO **classes** for every endpoint, so the pipe validates)
- Test: `apps/api/test/razorpay-signature.spec.ts`, `payment-webhook.e2e-spec.ts`, `payment-verify.e2e-spec.ts`, `wallet-endpoints.e2e-spec.ts`, `sponsorship-endpoints.e2e-spec.ts`

**Endpoints:**

| Method + path                                | Auth                                             | Notes                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /wallet/recharge/create-order`         | JWT (`job_seeker`,`employer`)                    | 10/h/user. Price from `CREDIT_PACKS` only. Requires `termsVersion`, optional `billingStateCode`.                       |
| `POST /wallet/recharge/verify`               | JWT, **order owner only**                        | 30/h/user. Non-owner or unknown order → **404**. Returns `{status:'settled'\|'pending', balance}`.                     |
| `GET /wallet/balance`                        | JWT                                              | `rpc_get_balance`.                                                                                                     |
| `POST /institution/sponsorship/quote`        | JWT `intermediary`, owner                        | Server computes tier/cap/total.                                                                                        |
| `POST /institution/sponsorship/create-order` | JWT `intermediary`, owner                        | **409 `SPONSORSHIP_ALREADY_ACTIVE`** if an unexpired active grant exists. Requires `billingStateCode`, `termsVersion`. |
| `GET /institution/sponsorship`               | JWT `intermediary`, owner                        | `{status, tier, cap, seatsUsed, expiresAt}`.                                                                           |
| `POST /webhooks/razorpay`                    | **public** (repo's public-route decorator), HMAC | No CORS. 1 MB body limit.                                                                                              |
| ~~`POST /sponsorship/activate`~~             | —                                                | **Deleted.** Also delete `processPaymentSuccess`, `requireAudit`, `secretOverride`.                                    |

- [ ] **Step 1: Signature tests first** (`razorpay-signature.spec.ts`):

```ts
import { createHmac } from 'node:crypto';
import { verifyHmacHex, verifyCheckoutSignature } from '../src/wallet/razorpay-signature.js';

const secret = 'whsec_' + 'a'.repeat(32);
const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
const good = createHmac('sha256', secret).update(body).digest('hex');

it('accepts the exact bytes + correct secret', () =>
  expect(verifyHmacHex(body, good, secret)).toBe(true));
it('rejects altered bytes', () =>
  expect(verifyHmacHex(Buffer.concat([body, Buffer.from(' ')]), good, secret)).toBe(false));
it('rejects wrong secret', () => expect(verifyHmacHex(body, good, secret + 'x')).toBe(false));
it.each([
  '',
  'wrong_hex_sig',
  good.slice(0, 62),
  good + '00',
  good.toUpperCase().replace(/[0-9A-F]/g, 'G'),
])('returns false (never throws) for malformed signature %#', (sig) =>
  expect(verifyHmacHex(body, sig, secret)).toBe(false),
);
it('checkout signature = HMAC(order|payment, keySecret)', () => {
  const s = createHmac('sha256', 'k'.repeat(20)).update('order_1|pay_1').digest('hex');
  expect(verifyCheckoutSignature('order_1', 'pay_1', s, 'k'.repeat(20))).toBe(true);
  expect(verifyCheckoutSignature('order_1', 'pay_2', s, 'k'.repeat(20))).toBe(false);
});
```

```ts
// razorpay-signature.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyHmacHex(message: string | Buffer, sigHex: string, secret: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(sigHex)) return false; // length + charset, before timingSafeEqual
  const expected = createHmac('sha256', secret).update(message).digest();
  const given = Buffer.from(sigHex, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
export const verifyCheckoutSignature = (
  orderId: string,
  paymentId: string,
  sig: string,
  keySecret: string,
) => verifyHmacHex(`${orderId}|${paymentId}`, sig, keySecret);
```

- [ ] **Step 2: Gateway port** (DI token `RAZORPAY_GATEWAY`; the SDK adapter is the prod provider; tests override with `FakeRazorpayGateway`; **no env branching**):

```ts
export interface RazorpayGateway {
  readonly keyId: string;
  createOrder(i: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<{ id: string }>;
  fetchPayment(
    id: string,
  ): Promise<{
    id: string;
    orderId: string;
    status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
    amountPaise: number;
    currency: string;
    method: string;
    amountRefundedPaise: number;
  }>;
  listOrderPayments(orderId: string): Promise<Array<{ id: string; status: string }>>;
  fetchRefund(
    id: string,
  ): Promise<{ id: string; paymentId: string; amountPaise: number; status: string }>;
}
```

All SDK calls get a 10 s timeout and no retry on `createOrder` (a retry could create two orders).

- [ ] **Step 3: `PaymentService.settleFromGateway(orderId, paymentId, source, eventId?)`:**
  1. `gateway.fetchPayment(paymentId)`; require `p.orderId === orderId`.
  2. `status==='captured'` else: `authorized` → return `{status:'pending'}` (auto-capture must be on; alert if seen); other → `pending`.
  3. `rpc_settle_payment(orderId, paymentId, p.amountPaise, p.currency, p.method, eventId, source)` — amount/currency **from Razorpay**, not from the client/payload.
  4. Map the closed status set to a typed union; unknown string → throw (fail loud).

- [ ] **Step 4: Webhook controller** (tests in `payment-webhook.e2e-spec.ts`, via `app.inject` against a real Nest+Fastify app + real Postgres + Fake gateway):
  - Read `req.rawBody` (Buffer); if absent → 500 (misconfiguration, never fall back to `JSON.stringify(body)`).
  - Verify `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET` → else **400 `INVALID_SIGNATURE`**.
  - Require `x-razorpay-event-id` → else 400.
  - `payment.captured` / `order.paid` → `settleFromGateway(..., 'webhook', eventId)`. `refund.processed` → T5 refund path. `payment.failed` / others → record + 200.
  - `unknown_order`, `amount_mismatch`, `duplicate_capture`, `duplicate_event`, `precondition_failed` → **200** (anomaly row already written; retries would never fix them).
  - Transient/infra error → **500** so Razorpay retries.
  - Response body contains **no** user or institution data.

  Tests: forged signature, wrong secret, altered bytes, truncated sig, missing event id, malformed JSON with valid sig (400, no settle), replay same event id (200, one grant), different event id same payment (200 `already_settled`, one grant), payload claims ₹1 while gateway says ₹590 (gateway wins), payload claims ₹590 while gateway says ₹1 (anomaly, no credit), unknown order (200 + anomaly), DB down (500).

- [ ] **Step 5: Verify endpoint** (`payment-verify.e2e-spec.ts`): HMAC with `RAZORPAY_KEY_SECRET` → 400 on bad; order must belong to the actor else **404** (no existence leak); race with the webhook (`Promise.all` of verify + webhook) → one grant; `authorized`-only payment → `{status:'pending'}`; settled → returns balance.

- [ ] **Step 6: Sponsorship endpoints** (`sponsorship-endpoints.e2e-spec.ts`):
  - Not the owner of the institution → 404.
  - Quote ignores any client-supplied price/tier.
  - Active unexpired grant → 409.
  - Declared student count < currently linked students → server uses the larger.
  - **Attack matrix (each must end with zero grants):** ₹590 wallet payment replayed against a sponsorship order id; another user's captured payment; payment for a different institution; `paymentReference` in any body (ignored/400); `force`, `idempotencyKey` extras (400 via strict zod).
  - Rate limits return 429.

- [ ] **Step 7: Remove v1 surface.** Delete `getRazorpayKeyId`, `activateSponsorship(paymentReference)`, the `amount_inr` readers, and all references to dummy keys.

- [ ] **Step 8: Green + commit.** `pnpm --filter @indian-job-portal/api test` (all new specs). Commit gate, then:

```bash
git commit -m "feat(payment): WAL-03 gateway port, verified settlement, HMAC webhook with dedupe, owner-bound verify"
```

---

## Task 5: Worker — reconciliation, refunds, invoices, alerts

**Files:**

- Create: `apps/worker/src/payments/{reconcile,expire-orders,refund,invoice-outbox}.processor.ts`
- Create: `supabase/migrations/20261121000500_refunds_invoices.sql`
- Test: `packages/database/test/refund.local.test.ts`, `invoice.local.test.ts`, `apps/worker/test/reconcile.spec.ts`

**Queue hygiene (applies to every payments queue):** payloads contain **ids only, never PII**; `removeOnComplete: { age: 86400, count: 1000 }`, `removeOnFail: { age: 604800 }`; jobs idempotent; `enableShutdownHooks`.

- [ ] **Step 1: Reconciliation** (repeatable, every 10 min). For `payments.status='created'` and `created_at` between 15 min and 48 h old: `gateway.listOrderPayments(orderId)` → for any `captured` → `settleFromGateway(..., 'reconcile')`. Covers lost webhooks, delayed webhooks, closed tabs, and webhook-secret rotation gaps. Orders `created` > 48 h with no payment → `status='expired'` (late payments still settle, T2). Daily: sum of captured per day vs Razorpay report → anomaly if different.
      Tests: fake gateway reports captured → settled once; run twice → no-op; webhook + reconcile race → one grant.

- [ ] **Step 2: Refunds** — `rpc_apply_refund(p_gateway_payment_id, p_gateway_refund_id, p_refund_paise, p_event_id)` (same wrapper/definer pattern):
  - Lock the payment. Insert `payment_refunds` (unique `gateway_refund_id` → idempotent, replay returns `already_applied`).
  - **Wallet:** target reversal = `floor(credits_to_grant × cumulative_refund / amount_paise)` minus already reversed. Reverse `least(target, greatest(balance,0))` as a negative ledger row; any remainder is `unrecovered_credits` + anomaly `REFUND_UNRECOVERED` (credits already spent; admin decides).
  - **Sponsorship:** cumulative refund ≥ amount → grant `status='revoked'` (seats stay assigned but the join requires `active`); partial → anomaly `SPONSORSHIP_PARTIAL_REFUND`, no automatic change.
  - Payment → `partially_refunded` / `refunded`. Audit `PAYMENT_REFUNDED`. Enqueue credit-note outbox row.
  - Hard-coded "1 credit" refund logic from v1 is deleted.
    Tests: full refund of unspent wallet credits → balance 0; refund after spending → partial reversal + anomaly; partial refund pro-rata; replay; sponsorship full refund → students pay again; concurrent refund + charge → balance never < 0.

- [ ] **Step 2b: DISPUTES.** `payment.dispute.created` → anomaly `DISPUTE_OPENED` + page. No automatic ledger action (decide per case).

- [ ] **Step 3: Invoices via outbox** (`FOR UPDATE SKIP LOCKED`, attempts counter, alert after 5 failures; **failure never blocks credit grant**). `rpc_issue_invoice(payment_id)`:
  - Settings from `platform_settings` (legal name, GSTIN, state code, address, SAC, series prefix). **No hardcoded GSTIN.** Boot check: GSTIN passes format **and checksum**, and is not the `23AAAAA0000A1Z5` placeholder.
  - Number: `JC/2627/000001` (≤16 chars). FY from `settled_at` in `Asia/Kolkata`. Gapless: `insert … on conflict (fy, kind) do update set last_seq = last_seq + 1 returning last_seq` **inside the issuing transaction**; a rollback releases the number.
  - Tax split: buyer state = `billing_state_code`; same as supplier state → CGST 9% + SGST 9%, else IGST 18%. Taxable = `round(total × 100 / 118)` if inclusive (O1). Rounding remainder goes to the larger component so lines always sum to total.
  - Credit note (`kind='credit_note'`, own sequence) on refund.
  - **O5/O7 sign-off by the client's CA is required before enabling in production.**
    Tests: sequential numbers under 20 concurrent issues (no gap/duplicate); intra vs inter-state split; sums equal total; second issue for same payment → same invoice (unique `(payment_id, kind)`); GSTIN checksum validator unit tests.

- [ ] **Step 4: PDF + email.** `@react-pdf/renderer` (per PRD), stored in Storage at `invoices/{invoiceId}.pdf` (private bucket, signed URL on demand), emailed via Resend. Email body: no phone number. `GET /wallet/invoices` returns the caller's own invoices only.

- [ ] **Step 5: Alerts (Sentry + log-based).** Page on: any `payment_anomalies` row; settlement 5xx rate > 1% over 5 min; webhook 400 rate spike (probing or secret drift); oldest unsettled `created` order with a captured gateway payment > 20 min; outbox `done_at is null` older than 30 min; daily reconciliation delta ≠ 0. Logs carry `paymentId`, `orderId`, `source`, `status`; never phone/email/name.

- [ ] **Step 6: Commit gate, then**

```bash
git commit -m "feat(worker): WAL-03 reconciliation, refunds/credit notes, invoice outbox, payment alerts"
```

---

## Task 6: Frontend — BFF, RechargeModal, SponsorshipCard, wiring, i18n, CSP

**Files:**

- Create: `apps/web/src/lib/bff.ts`
- Create: `apps/web/src/app/api/wallet/{create-order,verify,balance}/route.ts`
- Create: `apps/web/src/app/api/institution/sponsorship/{quote,create-order,status}/route.ts`
- Create: `apps/web/src/components/wallet/{useRazorpayCheckout.ts,useWalletBalance.ts}`
- Rewrite: `apps/web/src/components/wallet/RechargeModal.tsx`, `apps/web/src/components/**/SponsorshipCard.tsx`
- Modify: employer header/overview, seeker overview, institution workspace (mount modal/card)
- Modify: `apps/web/messages/en.json`, `hi.json`; `next.config` / middleware (CSP)
- Test: `apps/web/test/bff.test.ts`, `recharge-modal.test.tsx`, `wallet-i18n.test.ts`, `e2e/wallet.spec.ts` (Playwright)

**Rules:** the bearer token **never reaches the browser** (web audit, staff issue #2). No `accessToken` prop. No `localStorage` token reads. No `NEXT_PUBLIC_RAZORPAY_KEY_ID` (the key id arrives in the create-order response). No `jwt_session_*`, `usr_seeker_77`, `admin_root` fallbacks. No "simulate success" on any failure.

- [ ] **Step 1: BFF helper** (`bff.ts`):
  - Reads the session server-side (HttpOnly `__Host-` cookie, per 97b); **no session → 401**.
  - Rejects unless `Origin` equals the app origin and `Sec-Fetch-Site` is `same-origin` (CSRF).
  - Adds `Authorization` server-side; 10 s timeout; maps API errors to `{code}` only (never echoes `err.message`).
  - Tests (`bff.test.ts`): cross-origin POST → 403; no session → 401; token absent from every response body and `Set-Cookie` leaks; upstream 500 → generic error.

- [ ] **Step 2: Checkout hook + modal state machine.** `idle → creating → checkout → verifying → crediting → success | pending_long | error`.
  - Load `https://checkout.razorpay.com/v1/checkout.js` with `next/script` **only when the modal opens**.
  - `creating` disables the button (no double order). Terms checkbox (versioned, `termsVersion` sent with the order) must be ticked.
  - `handler(response)` → POST `/api/wallet/verify`. If `pending`, poll `/api/wallet/balance` (1 s, 2 s, 4 s, … up to 30 s). After 30 s show `pending_long`: _"Payment received, credits will appear shortly"_ + the order reference (the webhook/reconciler will settle it).
  - `modal.ondismiss` → back to `idle`, no error. `payment.failed` event → `error` with retry.
  - **Balance is always refetched from `/api/wallet/balance`**; `onSuccess` carries no number. One shared `useWalletBalance()` (header + modal) is invalidated on success.
  - No-session → modal shows the sign-in prompt, never calls Razorpay.

- [ ] **Step 3: SponsorshipCard (institution).** Delete the "Fallback simulation for client demo" path and the `DIRECT_WEB_${Date.now()}` payment reference. Flow: enter student count → `/quote` (server tier, cap, subtotal, GST, total; **display "covers up to N students"**) → billing state + terms → `/create-order` → checkout (reuse the hook) → poll `/status` until `active`. Show cap, seats used, expiry. Show 409 as "already active until {date}". Pay-while-active is blocked in the UI and the API.

- [ ] **Step 4: Wiring.** Employer: balance badge + "Recharge" in header/overview. Seeker: wallet card in overview, plus the "10 free applications used" state opens the modal. Institution: SponsorshipCard. Remove mock `INITIAL_*`/`SAMPLE_*` wallet data.

- [ ] **Step 5: i18n.** All strings under `wallet.*` / `sponsorship.*` in **both** bundles (including errors, polling states, terms label, tier names, `pending_long`). `wallet-i18n.test.ts`: key sets of `en` and `hi` are identical for those namespaces; no Hindi value equals its English value; ESLint rule (or grep test) forbids JSX string literals in the new components.

- [ ] **Step 6: CSP.** Allow `script-src https://checkout.razorpay.com`, `frame-src https://api.razorpay.com https://checkout.razorpay.com`, `connect-src https://lumberjack.razorpay.com`; no `unsafe-inline` additions. Verify the checkout actually loads in staging with the policy on.

- [ ] **Step 7: Tests.**
  - Component (`window.Razorpay` stubbed): success, failure, dismiss, verify=pending then credited, verify=pending forever → `pending_long`, 401, 429, double-click creates one order.
  - Playwright (`e2e/wallet.spec.ts`): sign in → open modal → stub checkout → balance updates without a reload; institution flow → grant active; axe: zero serious violations on both modals; Hindi locale renders both.
  - Grep gate in CI: `localStorage.*token`, `NEXT_PUBLIC_RAZORPAY`, `jwt_session_`, `usr_seeker_77`, `Fallback simulation` return nothing.

- [ ] **Step 8: Commit gate, then**

```bash
git commit -m "feat(web): WAL-03 WAL-05 BFF wallet + sponsorship checkout, i18n, CSP; remove simulated payment paths"
```

---

## Task 7: Exit gate, rollout, runbook

**Files:**

- Create: `scripts/attack/module4.ts`, `load/module4.k6.js`
- Create: `docs/runbooks/payments.md`
- Create: `docs/audits/evidence/module-4/` (command output, k6 report, attacker log, UAT screenshots)
- Modify: `.github/workflows/ci.yml` (deploy jobs real, not `echo`)

- [ ] **Step 1: Scripted attacker run (staging, real Postgres, real Razorpay test mode).** Every row must **fail to gain anything** and the script exits non-zero otherwise:

| Attack                                                                                | Expected               |
| ------------------------------------------------------------------------------------- | ---------------------- |
| Anon key → every `rpc_*` and private function                                         | 42501                  |
| `authenticated` role → same                                                           | 42501                  |
| Forged webhook: bad sig / wrong secret / altered bytes / truncated / missing event id | 400                    |
| Replay same event id ×100                                                             | 1 grant                |
| Different event id, same payment ×100                                                 | 1 grant                |
| Webhook payload amount ≠ gateway amount                                               | gateway wins / anomaly |
| ₹590 wallet payment → sponsorship                                                     | no grant               |
| Reuse a captured payment (any reference)                                              | no second grant        |
| Other user's order on `/verify`                                                       | 404                    |
| Self-set `institution_id` / `sponsorship_id` as client                                | FORBIDDEN_COLUMN       |
| Free-text college name                                                                | no coverage            |
| 50 concurrent settles of one order                                                    | 1 credit grant         |
| 50 concurrent applications at balance 1                                               | 1 success, balance ≥ 0 |
| Forged role / `jwt_session_*` / `?role=platform_admin` on money endpoints             | 401/403                |

- [ ] **Step 2: Load.** k6 against staging: 200 req/s mixed (create-order, verify, webhook, balance) for 10 min. Targets (proposed, confirm): p95 < 500 ms, 0 double grants, 0 negative balances, 0 unsettled captured payments after reconciliation. Also: 500 webhooks for one order in 10 s → exactly one grant.

- [ ] **Step 3: Staging UAT (Razorpay test mode, real webhook URL).** Success (UPI `success@razorpay`, card), failure, dismissed checkout, **webhook disabled → reconciliation settles within 15 min**, duplicate delivery, refund from the dashboard → ledger reversal + credit note, institution purchase → seats claimed from a real CSV import, expiry (time-travel a grant) → students pay again. Screenshots + DB queries into `evidence/`.

- [ ] **Step 4: Rollout controls.**
  - Flags `WALLET_ENABLED`, `SPONSORSHIP_ENABLED` default **off** in production.
  - **Kill-switch semantics:** off = no new orders (`503`). **Webhook, verify, reconciliation and refunds stay live**, so already-paid orders still settle.
  - Order: internal accounts → ₹1 live payment end-to-end (live keys) → 5 pilot institutions → general.
  - First 7 days: daily reconciliation delta review.

- [ ] **Step 5: Runbook (`payments.md`).** Stuck order (captured at gateway, `created` locally); duplicate capture → refund; amount mismatch → investigate then refund; webhook secret rotation (update Razorpay dashboard + env together; reconciliation covers the gap); key rotation; manual settle via `settleFromGateway` admin command; refund/dispute handling; who is on call; how to flip the kill switch.

- [ ] **Step 6: Human review (AGENTS.md).** PR template has: named payments reviewer ☐, security reviewer (second person) ☐, DB/RLS reviewer ☐, client CA sign-off on invoices (O5/O7) ☐, legal sign-off on checkout terms/refund text (O6) ☐.

- [ ] **Step 7: Launch gate. Do not enable in production until all are true:**
  - [ ] Full API + DB + web suites pass on real Postgres in CI; no `x-user-id`, no `NODE_ENV=test` branches in money code.
  - [ ] Attacker run, load test and UAT evidence are filed under `evidence/module-4/`.
  - [ ] Catalog security test green on the production-bound migration set.
  - [ ] Deploy jobs are real (not `echo`); migrations applied to staging by CI.
  - [ ] Prerequisites in §3 merged and verified.
  - [ ] Open decisions O1–O7 answered in `docs/decisions/` (or consciously deferred with the default above).

- [ ] **Step 8: Commit gate, then**

```bash
git commit -m "chore(release): Module 4 exit gate — attacker run, load test, runbook, rollout flags"
```

---

## Requirement coverage (honest)

| Req                                           | Status                                                                                                                      | Where                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| WAL-01 ledger-derived balance                 | Done                                                                                                                        | T1, T2 (`rpc_get_balance`; no stored balance) |
| WAL-02 starter credits / 10 free applications | Done                                                                                                                        | T2 (unique starter index, concurrency test)   |
| WAL-03 recharge + automatic invoice           | Done, **pending CA sign-off (O5)**                                                                                          | T4, T5                                        |
| WAL-04 admin-configurable costs/tiers         | **Partial:** action costs in DB (`credit_action_costs`); tiers in `packages/validation`, snapshotted per order; no admin UI | T1, T3                                        |
| WAL-05 / INT-05 sponsorship                   | Done (seat-capped, expiring, order-bound); renewal/upgrade deferred (O3); offline payment deferred (O2)                     | T3, T4, T6                                    |
| WAL-06 / D6 refunds & expiry                  | Refunds handled; **expiry not enforced** (O4)                                                                               | T5                                            |
| Inv. #6 immutable audit                       | Done, inside settlement tx                                                                                                  | T1, T2                                        |
| Inv. #7 ledger-derived                        | Done                                                                                                                        | T2                                            |
| Inv. #8a EN+HI                                | Done                                                                                                                        | T6                                            |
| Inv. #1 no phone in ids                       | Depends on PR #106                                                                                                          | §3                                            |
| DPDP                                          | Money tables hold no PII beyond user UUID; invoice snapshot anonymised after retention (O5)                                 | T1, T5                                        |

## Self-review checklist (run before opening the PR)

1. `grep -rnE "isTestMode|testTransaction|TestPaymentGrant|ALLOW_TEST_PAYMENTS" apps/api/src/{wallet,database}` → empty.
2. The catalog test lists zero client-executable SECURITY DEFINER functions.
3. No endpoint accepts a payment reference, amount, price, tier or user id from the client.
4. Every status string returned by `rpc_settle_payment` appears in the TS union and in a test.
5. Every new UI string exists in both `en.json` and `hi.json`.
6. No amount is a float anywhere (`grep -rn "amount_inr" apps packages` only in the deprecated-column migration).
7. Each commit passed `pnpm -r typecheck && pnpm -r lint` and its task tests.
