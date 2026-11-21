-- ==============================================================================
-- Migration: 20261121000500_refunds_invoices.sql
-- Description: Module 4 Refunds, Gapless Invoices, Credit Notes, and GST Validation
--              - Schema additions: payments.refunded_at
--              - Drop single-recharge payment_reason_uq on credit_ledgers, add recharge & refund uq
--              - private_payments.validate_gstin: Modulo-36 Luhn-variant checksum
--              - Seed platform_settings: legal name, GSTIN, SAC, series prefix
--              - private_payments.apply_refund & public.rpc_apply_refund
--              - private_payments.record_dispute & public.rpc_record_dispute
--              - private_payments.issue_invoice & public.rpc_issue_invoice
-- ==============================================================================

-- 1. Schema extensions
alter table public.payments
  add column if not exists refunded_at timestamptz;

-- Upgrade credit_ledgers unique indexes: allow multiple partial refunds per payment
drop index if exists public.credit_ledgers_payment_reason_uq;
create unique index if not exists credit_ledgers_payment_recharge_uq
  on public.credit_ledgers(payment_id) where reason = 'wallet_recharge';
create unique index if not exists credit_ledgers_refund_uq
  on public.credit_ledgers(ref_id) where reason = 'refund';

-- 2. Modulo-36 Luhn-variant GSTIN validator
create or replace function private_payments.validate_gstin(p_gstin text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_total int := 0;
  v_i int;
  v_ch char;
  v_idx int;
  v_factor int;
  v_prod int;
  v_check_idx int;
  v_clean text;
begin
  if p_gstin is null then
    return false;
  end if;
  v_clean := upper(trim(p_gstin));
  if length(v_clean) <> 15 then
    return false;
  end if;
  -- Explicitly reject known placeholder
  if v_clean = '23AAAAA0000A1Z5' then
    return false;
  end if;
  -- Standard Indian GSTIN Regex
  if not (v_clean ~ '^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$') then
    return false;
  end if;

  -- Modulo-36 Checksum on first 14 characters
  for v_i in 0..13 loop
    v_ch := substr(v_clean, v_i + 1, 1);
    v_idx := position(v_ch in v_chars) - 1;
    if v_idx < 0 then
      return false;
    end if;
    if (v_i % 2) <> 0 then
      v_factor := 2;
    else
      v_factor := 1;
    end if;
    v_prod := v_idx * v_factor;
    v_total := v_total + (v_prod / 36) + (v_prod % 36);
  end loop;

  v_check_idx := (36 - (v_total % 36)) % 36;
  return substr(v_clean, 15, 1) = substr(v_chars, v_check_idx + 1, 1);
end;
$$;

revoke all on function private_payments.validate_gstin(text) from public, anon, authenticated;
grant execute on function private_payments.validate_gstin(text) to service_role;

-- 3. Seed platform settings with valid GSTIN (Maharashtra 27AAPFU0939F1ZV)
insert into public.platform_settings (key, value)
values ('invoice_settings', jsonb_build_object(
  'legal_name', 'Indian Job Portal Private Limited',
  'gstin', '27AAPFU0939F1ZV',
  'state_code', '27',
  'address', '100 Marine Drive, Nariman Point, Mumbai, Maharashtra 400021',
  'sac', '998311',
  'series_prefix', 'JC'
))
on conflict (key) do nothing;

-- 4. Refund procedure: atomic partial/full refund, pro-rata credits, seat revocation, outbox credit note
create or replace function private_payments.apply_refund(
  p_gateway_payment_id text,
  p_gateway_refund_id text,
  p_refund_paise bigint,
  p_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pay public.payments%rowtype;
  v_existing_refund_id uuid;
  v_refund_id uuid;
  v_prev_refund_paise bigint;
  v_already_reversed_credits int;
  v_cumulative_refund bigint;
  v_target_reversal int;
  v_bal bigint;
  v_recoverable_balance int;
  v_credits_to_reverse int := 0;
  v_unrecovered_credits int := 0;
begin
  -- 1. Deduplicate webhook event
  if p_event_id is not null then
    insert into private_payments.webhook_events(event_id, event_type)
    values (p_event_id, 'refund.processed')
    on conflict do nothing;

    if not found then
      return jsonb_build_object('status', 'duplicate_event');
    end if;
  end if;

  -- 2. Idempotency: replay check on unique gateway_refund_id
  select id into v_existing_refund_id
  from public.payment_refunds
  where gateway_refund_id = p_gateway_refund_id;

  if found then
    return jsonb_build_object('status', 'already_applied', 'refund_id', v_existing_refund_id);
  end if;

  -- 3. Lock payment row
  select * into v_pay
  from public.payments
  where gateway_payment_id = p_gateway_payment_id
  for update;

  if not found then
    insert into private_payments.payment_anomalies(kind, gateway_payment_id, details)
    values ('UNKNOWN_PAYMENT', p_gateway_payment_id,
            jsonb_build_object('gateway_refund_id', p_gateway_refund_id, 'amount_paise', p_refund_paise));
    return jsonb_build_object('status', 'unknown_payment');
  end if;

  if p_refund_paise <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;

  -- 4. Calculate cumulative refund on this payment
  select coalesce(sum(amount_paise), 0), coalesce(sum(credits_reversed), 0)
  into v_prev_refund_paise, v_already_reversed_credits
  from public.payment_refunds
  where payment_id = v_pay.id;

  v_cumulative_refund := v_prev_refund_paise + p_refund_paise;

  if v_cumulative_refund > v_pay.amount_paise then
    insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
    values ('REFUND_EXCEEDS_PAYMENT', v_pay.gateway_order_id, p_gateway_payment_id,
            jsonb_build_object('cumulative_refund', v_cumulative_refund, 'amount_paise', v_pay.amount_paise));
    return jsonb_build_object('status', 'refund_exceeds_payment');
  end if;

  v_refund_id := gen_random_uuid();

  -- 5. Wallet purpose: pro-rata clawback, user balance lock, anomaly on unrecovered credits
  if v_pay.purpose = 'wallet' then
    -- Serialize concurrent operations on this user's balance
    perform pg_advisory_xact_lock(hashtextextended(v_pay.user_id::text, 0));

    -- Target reversal = floor(credits_to_grant * cumulative_refund / amount_paise) - already_reversed_credits
    v_target_reversal := floor(v_pay.credits_to_grant::numeric * v_cumulative_refund::numeric / v_pay.amount_paise::numeric)::int - v_already_reversed_credits;
    if v_target_reversal < 0 then
      v_target_reversal := 0;
    end if;

    select coalesce(sum(amount), 0) into v_bal
    from public.credit_ledgers
    where user_id = v_pay.user_id;

    v_recoverable_balance := greatest(v_bal, 0)::int;
    v_credits_to_reverse := least(v_target_reversal, v_recoverable_balance);

    if v_target_reversal > v_recoverable_balance then
      v_unrecovered_credits := v_target_reversal - v_recoverable_balance;
      insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
      values ('REFUND_UNRECOVERED', v_pay.gateway_order_id, p_gateway_payment_id,
              jsonb_build_object(
                'user_id', v_pay.user_id,
                'target_reversal', v_target_reversal,
                'recoverable_balance', v_recoverable_balance,
                'unrecovered_credits', v_unrecovered_credits,
                'refund_id', v_refund_id
              ));
    else
      v_unrecovered_credits := 0;
    end if;

    if v_credits_to_reverse > 0 then
      insert into public.credit_ledgers(user_id, amount, reason, payment_id, ref_id, source)
      values (v_pay.user_id, -v_credits_to_reverse, 'refund', v_pay.id, v_refund_id, 'razorpay');
    end if;

    insert into public.payment_refunds(id, payment_id, gateway_refund_id, amount_paise, credits_reversed, unrecovered_credits)
    values (v_refund_id, v_pay.id, p_gateway_refund_id, p_refund_paise, v_credits_to_reverse, v_unrecovered_credits);

  -- 6. Sponsorship purpose: full refund revokes grant; partial logs anomaly
  elsif v_pay.purpose = 'sponsorship' then
    insert into public.payment_refunds(id, payment_id, gateway_refund_id, amount_paise, credits_reversed, unrecovered_credits)
    values (v_refund_id, v_pay.id, p_gateway_refund_id, p_refund_paise, 0, 0);

    if v_cumulative_refund >= v_pay.amount_paise then
      update public.institution_sponsorships
      set status = 'revoked',
          updated_at = now()
      where payment_id = v_pay.id;

      perform private_payments.audit('INSTITUTION_SPONSORSHIP_REVOKED', v_pay.user_id, 'sponsorship', v_pay.id,
                                     jsonb_build_object('refund_id', v_refund_id, 'cumulative_refund', v_cumulative_refund));
    else
      insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
      values ('SPONSORSHIP_PARTIAL_REFUND', v_pay.gateway_order_id, p_gateway_payment_id,
              jsonb_build_object('refund_id', v_refund_id, 'amount_paise', p_refund_paise, 'cumulative_refund', v_cumulative_refund));
    end if;
  else
    raise exception 'UNSUPPORTED_PURPOSE';
  end if;

  -- 7. Update payments status
  update public.payments
  set status = case when v_cumulative_refund >= amount_paise then 'refunded' else 'partially_refunded' end,
      refunded_at = now()
  where id = v_pay.id;

  -- 8. Audit log
  perform private_payments.audit('PAYMENT_REFUNDED', v_pay.user_id, 'payment', v_pay.id,
                                 jsonb_build_object(
                                   'refund_id', v_refund_id,
                                   'gateway_refund_id', p_gateway_refund_id,
                                   'amount_paise', p_refund_paise,
                                   'cumulative_refund', v_cumulative_refund,
                                   'credits_reversed', v_credits_to_reverse,
                                   'unrecovered_credits', v_unrecovered_credits
                                 ));

  -- 9. Enqueue credit note outbox row
  insert into private_payments.outbox(kind, payment_id)
  values ('credit_note', v_pay.id);

  return jsonb_build_object(
    'status', 'applied',
    'refund_id', v_refund_id,
    'payment_id', v_pay.id,
    'amount_paise', p_refund_paise,
    'cumulative_refund', v_cumulative_refund,
    'credits_reversed', v_credits_to_reverse,
    'unrecovered_credits', v_unrecovered_credits
  );
end $fn$;

create or replace function public.rpc_apply_refund(
  p_gateway_payment_id text,
  p_gateway_refund_id text,
  p_refund_paise bigint,
  p_event_id text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private_payments.apply_refund($1, $2, $3, $4);
$$;

revoke all on function private_payments.apply_refund(text, text, bigint, text) from public, anon, authenticated;
grant execute on function private_payments.apply_refund(text, text, bigint, text) to service_role;

revoke all on function public.rpc_apply_refund(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.rpc_apply_refund(text, text, bigint, text) to service_role;

-- 5. Dispute logging RPC: anomaly DISPUTE_OPENED, no automatic ledger action
create or replace function private_payments.record_dispute(
  p_gateway_payment_id text,
  p_dispute_id text,
  p_amount_paise bigint,
  p_reason text default null,
  p_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pay public.payments%rowtype;
begin
  if p_event_id is not null then
    insert into private_payments.webhook_events(event_id, event_type)
    values (p_event_id, 'payment.dispute.created')
    on conflict do nothing;

    if not found then
      return jsonb_build_object('status', 'duplicate_event');
    end if;
  end if;

  select * into v_pay
  from public.payments
  where gateway_payment_id = p_gateway_payment_id;

  insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
  values ('DISPUTE_OPENED', v_pay.gateway_order_id, p_gateway_payment_id,
          jsonb_build_object(
            'dispute_id', p_dispute_id,
            'amount_paise', p_amount_paise,
            'reason', p_reason,
            'event_id', p_event_id
          ));

  return jsonb_build_object('status', 'dispute_recorded', 'dispute_id', p_dispute_id);
end $fn$;

create or replace function public.rpc_record_dispute(
  p_gateway_payment_id text,
  p_dispute_id text,
  p_amount_paise bigint,
  p_reason text default null,
  p_event_id text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private_payments.record_dispute($1, $2, $3, $4, $5);
$$;

revoke all on function private_payments.record_dispute(text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function private_payments.record_dispute(text, text, bigint, text, text) to service_role;

revoke all on function public.rpc_record_dispute(text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.rpc_record_dispute(text, text, bigint, text, text) to service_role;

-- 6. Gapless invoice issuing with tax split and GSTIN verification
create or replace function private_payments.issue_invoice(
  p_payment_id uuid,
  p_kind text default 'invoice'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pay public.payments%rowtype;
  v_existing_inv public.invoices%rowtype;
  v_settings jsonb;
  v_supplier_gstin text;
  v_supplier_state text;
  v_buyer_state text;
  v_series_prefix text;
  v_dt timestamptz;
  v_year int;
  v_month int;
  v_fy text;
  v_seq bigint;
  v_num_prefix text;
  v_number text;
  v_total_paise bigint;
  v_taxable_paise bigint;
  v_tax_paise bigint;
  v_cgst_paise bigint := 0;
  v_sgst_paise bigint := 0;
  v_igst_paise bigint := 0;
  v_billing_snapshot jsonb;
  v_invoice public.invoices%rowtype;
begin
  if p_kind not in ('invoice', 'credit_note') then
    raise exception 'INVALID_INVOICE_KIND';
  end if;

  -- 1. Idempotency: return existing invoice if already issued
  select * into v_existing_inv
  from public.invoices
  where payment_id = p_payment_id and kind = p_kind;

  if found then
    return row_to_json(v_existing_inv)::jsonb;
  end if;

  -- 2. Fetch payment
  select * into v_pay
  from public.payments
  where id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_pay.status = 'created' then
    raise exception 'PAYMENT_NOT_SETTLED';
  end if;

  -- 3. Fetch platform settings
  select value into v_settings
  from public.platform_settings
  where key = 'invoice_settings';

  if not found then
    raise exception 'INVOICE_SETTINGS_NOT_CONFIGURED';
  end if;

  v_supplier_gstin := v_settings->>'gstin';
  if not private_payments.validate_gstin(v_supplier_gstin) then
    raise exception 'INVALID_PLATFORM_GSTIN';
  end if;

  v_supplier_state := coalesce(v_settings->>'state_code', '27');
  v_series_prefix := coalesce(v_settings->>'series_prefix', 'JC');

  -- 4. Derive FY from settled_at in Asia/Kolkata timezone
  v_dt := coalesce(v_pay.settled_at, now()) at time zone 'Asia/Kolkata';
  v_year := extract(year from v_dt)::int;
  v_month := extract(month from v_dt)::int;
  if v_month >= 4 then
    v_fy := to_char(v_year % 100, 'FM00') || to_char((v_year + 1) % 100, 'FM00');
  else
    v_fy := to_char((v_year - 1) % 100, 'FM00') || to_char(v_year % 100, 'FM00');
  end if;

  -- 5. Atomic gapless sequence inside issuing transaction
  insert into private_payments.invoice_counters (fy, kind, last_seq)
  values (v_fy, p_kind, 1)
  on conflict (fy, kind) do update
    set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  -- 6. Format invoice number (<=16 chars)
  if p_kind = 'credit_note' then
    v_num_prefix := 'CN';
  else
    v_num_prefix := v_series_prefix;
  end if;
  v_number := v_num_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 6, '0');

  -- 7. Amount determination
  if p_kind = 'credit_note' then
    select coalesce(sum(amount_paise), 0) into v_total_paise
    from public.payment_refunds
    where payment_id = v_pay.id;

    if v_total_paise <= 0 then
      v_total_paise := v_pay.amount_paise;
    end if;
  else
    v_total_paise := v_pay.amount_paise;
  end if;

  -- 8. Tax calculation (inclusive 18% GST)
  v_buyer_state := coalesce(v_pay.billing_state_code, v_supplier_state);
  v_taxable_paise := round(v_total_paise::numeric * 100.0 / 118.0)::bigint;
  v_tax_paise := v_total_paise - v_taxable_paise;

  if v_buyer_state = v_supplier_state then
    -- Intra-state: CGST 9% + SGST 9%
    v_igst_paise := 0;
    v_cgst_paise := v_tax_paise / 2;
    v_sgst_paise := v_tax_paise - v_cgst_paise;
  else
    -- Inter-state: IGST 18%
    v_cgst_paise := 0;
    v_sgst_paise := 0;
    v_igst_paise := v_tax_paise;
  end if;

  -- 9. Billing snapshot (the only PII stored here)
  v_billing_snapshot := jsonb_build_object(
    'name', coalesce(v_pay.order_snapshot->>'billingName', 'Customer'),
    'gstin', v_pay.order_snapshot->>'billingGstin',
    'state_code', v_buyer_state,
    'address', v_pay.order_snapshot->>'billingAddress',
    'email', v_pay.order_snapshot->>'billingEmail'
  );

  -- 10. Persist invoice record
  insert into public.invoices (
    payment_id,
    kind,
    number,
    fy,
    taxable_paise,
    cgst_paise,
    sgst_paise,
    igst_paise,
    total_paise,
    billing_snapshot,
    issued_at
  ) values (
    v_pay.id,
    p_kind,
    v_number,
    v_fy,
    v_taxable_paise,
    v_cgst_paise,
    v_sgst_paise,
    v_igst_paise,
    v_total_paise,
    v_billing_snapshot,
    now()
  )
  returning * into v_invoice;

  return row_to_json(v_invoice)::jsonb;
end $fn$;

create or replace function public.rpc_issue_invoice(
  p_payment_id uuid,
  p_kind text default 'invoice'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private_payments.issue_invoice($1, $2);
$$;

revoke all on function private_payments.issue_invoice(uuid, text) from public, anon, authenticated;
grant execute on function private_payments.issue_invoice(uuid, text) to service_role;

revoke all on function public.rpc_issue_invoice(uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_issue_invoice(uuid, text) to service_role;

-- 7. Outbox processing procedures: FOR UPDATE SKIP LOCKED, batch claim, completion, and monitoring
create or replace function private_payments.claim_outbox_batch(p_limit int default 10)
returns table (
  id uuid,
  kind text,
  payment_id uuid,
  attempts int,
  done_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select id, kind, payment_id, attempts, done_at, created_at
  from private_payments.outbox
  where done_at is null and attempts < 5
  order by created_at asc
  limit p_limit
  for update skip locked;
$$;

create or replace function public.rpc_claim_outbox_batch(p_limit int default 10)
returns table (
  id uuid,
  kind text,
  payment_id uuid,
  attempts int,
  done_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private_payments.claim_outbox_batch($1);
$$;

revoke all on function private_payments.claim_outbox_batch(int) from public, anon, authenticated;
grant execute on function private_payments.claim_outbox_batch(int) to service_role;

revoke all on function public.rpc_claim_outbox_batch(int) from public, anon, authenticated;
grant execute on function public.rpc_claim_outbox_batch(int) to service_role;

create or replace function private_payments.complete_outbox(
  p_id uuid,
  p_attempts int,
  p_done boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private_payments.outbox
  set done_at = case when p_done then now() else null end,
      attempts = p_attempts
  where id = p_id;
end;
$$;

create or replace function public.rpc_complete_outbox(
  p_id uuid,
  p_attempts int,
  p_done boolean default true
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private_payments.complete_outbox($1, $2, $3);
$$;

revoke all on function private_payments.complete_outbox(uuid, int, boolean) from public, anon, authenticated;
grant execute on function private_payments.complete_outbox(uuid, int, boolean) to service_role;

revoke all on function public.rpc_complete_outbox(uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.rpc_complete_outbox(uuid, int, boolean) to service_role;

create or replace function private_payments.check_stuck_outbox(p_minutes int default 30)
returns int
language sql
security definer
set search_path = ''
as $$
  select count(*)::int from private_payments.outbox
  where done_at is null and created_at < now() - make_interval(mins => p_minutes);
$$;

create or replace function public.rpc_check_stuck_outbox(p_minutes int default 30)
returns int
language sql
security invoker
set search_path = ''
as $$
  select private_payments.check_stuck_outbox($1);
$$;

revoke all on function private_payments.check_stuck_outbox(int) from public, anon, authenticated;
grant execute on function private_payments.check_stuck_outbox(int) to service_role;

revoke all on function public.rpc_check_stuck_outbox(int) from public, anon, authenticated;
grant execute on function public.rpc_check_stuck_outbox(int) to service_role;

-- 8. Notify PostgREST to reload schema
notify pgrst, 'reload schema';
