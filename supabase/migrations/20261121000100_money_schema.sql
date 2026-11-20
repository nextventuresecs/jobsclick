-- ==============================================================================
-- Migration: 20261121000100_money_schema.sql
-- Description: Module 4 Money Schema - payments, ledgers, sponsorships, invoices,
--              refunds, settings, and private_payments isolation schema.
-- ==============================================================================

create schema if not exists private_payments;

-- 1. payments: purpose-bound, paise-exact
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
   set purpose = coalesce(purpose, metadata->>'purpose', 'wallet'),
       amount_paise = coalesce(amount_paise, round(amount_inr * 100)::bigint)
 where amount_paise is null or purpose is null;

-- Drop obsolete chk_payments_status_enum to permit updated status set
alter table public.payments drop constraint if exists chk_payments_status_enum;

alter table public.payments
  alter column purpose set not null,
  alter column amount_paise set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_purpose_chk') then
    alter table public.payments add constraint payments_purpose_chk check (purpose in ('wallet','sponsorship')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_chk') then
    alter table public.payments add constraint payments_amount_chk check (amount_paise > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_currency_chk') then
    alter table public.payments add constraint payments_currency_chk check (currency = 'INR') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_status_chk') then
    alter table public.payments add constraint payments_status_chk check (status in ('created','captured','expired','partially_refunded','refunded')) not valid;
  end if;
end $$;

create unique index if not exists payments_gateway_order_uq on public.payments(gateway_order_id);
create unique index if not exists payments_gateway_payment_uq on public.payments(gateway_payment_id) where gateway_payment_id is not null;

-- 2. ledger: DB-level idempotency
alter table public.credit_ledgers
  add column if not exists payment_id uuid references public.payments(id),
  add column if not exists ref_id uuid,
  add column if not exists expires_at timestamptz;          -- reserved for O4

create unique index if not exists credit_ledgers_payment_reason_uq on public.credit_ledgers(payment_id, reason) where payment_id is not null;
create unique index if not exists credit_ledgers_starter_uq on public.credit_ledgers(user_id) where reason = 'starter_credit';
create unique index if not exists credit_ledgers_application_uq on public.credit_ledgers(user_id, ref_id)
  where reason in ('application','application_sponsored');

create table if not exists public.credit_action_costs (
  action text primary key,
  cost integer not null check (cost >= 0)
);

insert into public.credit_action_costs (action, cost)
values ('job_application', 1)
on conflict (action) do nothing;

-- 3. sponsorship: seat-capped, single active grant
alter table public.institution_sponsorships
  add column if not exists payment_id uuid unique references public.payments(id),
  add column if not exists tier text,
  add column if not exists rate_paise integer,
  add column if not exists student_cap integer,
  add column if not exists seats_used integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sponsorship_seats_chk') then
    alter table public.institution_sponsorships
      add constraint sponsorship_seats_chk check (seats_used >= 0 and (student_cap is null or seats_used <= student_cap)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sponsorship_status_chk') then
    alter table public.institution_sponsorships
      add constraint sponsorship_status_chk check (status in ('active','expired','revoked')) not valid;
  end if;
end $$;

create unique index if not exists one_active_grant_per_institution on public.institution_sponsorships(institution_id) where status = 'active';
alter table public.job_seeker_profiles add column if not exists sponsorship_id uuid references public.institution_sponsorships(id);
create index if not exists idx_job_seeker_profiles_institution_sponsorship on public.job_seeker_profiles(institution_id, sponsorship_id);

-- 4. refunds, invoices, settings
create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  gateway_refund_id text not null unique,
  amount_paise bigint not null check (amount_paise > 0),
  credits_reversed integer not null default 0,
  unrecovered_credits integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  kind text not null check (kind in ('invoice','credit_note')),
  number text not null unique,                 -- e.g. JC/2627/000001 (<=16 chars)
  fy text not null,
  taxable_paise bigint not null,
  cgst_paise bigint not null default 0,
  sgst_paise bigint not null default 0,
  igst_paise bigint not null default 0,
  total_paise bigint not null,
  billing_snapshot jsonb not null,             -- name, GSTIN, state; the only PII here
  pdf_path text,
  emailed_at timestamptz,
  issued_at timestamptz not null default now(),
  unique (payment_id, kind)
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null
);

-- 5. private tables (not exposed by PostgREST)
create or replace function private_payments.reject_mutation() returns trigger language plpgsql set search_path = '' as
$$ begin raise exception 'IMMUTABLE_RECORD'; end $$;

create table if not exists private_payments.payment_grants (
  payment_id uuid primary key references public.payments(id) on delete restrict,
  grant_type text not null check (grant_type in ('wallet_credit','sponsorship')),
  grant_ref uuid not null,
  created_at timestamptz not null default now()
);

drop trigger if exists payment_grants_immutable on private_payments.payment_grants;
create trigger payment_grants_immutable before update or delete on private_payments.payment_grants
  for each row execute function private_payments.reject_mutation();

create table if not exists private_payments.webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

create table if not exists private_payments.payment_anomalies (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  gateway_order_id text,
  gateway_payment_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table if not exists private_payments.invoice_counters (
  fy text,
  kind text,
  last_seq bigint not null,
  primary key (fy, kind)
);

create table if not exists private_payments.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payment_id uuid not null,
  attempts int not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_private_payments_outbox_pending on private_payments.outbox(created_at) where done_at is null;
