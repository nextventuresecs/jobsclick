-- ==============================================================================
-- Migration: 20261121000400_sponsorship.sql
-- Description: Module 4 Sponsorship Settlement, Seat Capping, and Linking Guard
--              - private_payments.guard_seeker_link_columns & trigger
--              - private_payments.claim_seats & private_payments.claim_sponsorship_seats
--              - public.rpc_claim_sponsorship_seats
--              - private_payments.create_sponsorship_grant
--              - Update private_payments.settle_payment for 'sponsorship'
-- ==============================================================================

-- 1. Guard: Client roles (anon/authenticated) can never write money-linking columns
create or replace function private_payments.guard_seeker_link_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       (tg_op = 'INSERT' and (new.sponsorship_id is not null or new.institution_id is not null)) or
       (tg_op = 'UPDATE' and (new.sponsorship_id is distinct from old.sponsorship_id
                           or new.institution_id is distinct from old.institution_id)))
  then
    raise exception 'FORBIDDEN_COLUMN';
  end if;
  return new;
end $$;

drop trigger if exists seeker_link_guard on public.job_seeker_profiles;
create trigger seeker_link_guard
  before insert or update on public.job_seeker_profiles
  for each row execute function private_payments.guard_seeker_link_columns();

-- 2. Extend bulk_import_batches to store server-resolved institution_id
alter table public.bulk_import_batches
  add column if not exists institution_id uuid references public.institution_profiles(id) on delete set null;

create index if not exists idx_bulk_import_batches_institution_id on public.bulk_import_batches(institution_id);

-- 3. Seat claiming procedures (race-safe, SKIP LOCKED, within capacity)
create or replace function private_payments.claim_seats(p_grant uuid, p_inst uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_free int;
  v_n int;
begin
  select student_cap - seats_used into v_free
  from public.institution_sponsorships
  where id = p_grant
  for update;

  if v_free is null or v_free <= 0 or p_limit <= 0 then
    return 0;
  end if;

  with pick as (
    select id from public.job_seeker_profiles
    where institution_id = p_inst and sponsorship_id is null
    order by created_at asc
    limit least(v_free, p_limit)
    for update skip locked
  )
  update public.job_seeker_profiles s
  set sponsorship_id = p_grant
  from pick
  where s.id = pick.id;

  get diagnostics v_n = row_count;

  update public.institution_sponsorships
  set seats_used = seats_used + v_n
  where id = p_grant;

  return v_n;
end $fn$;

revoke all on function private_payments.claim_seats(uuid, uuid, int) from public, anon, authenticated;
grant execute on function private_payments.claim_seats(uuid, uuid, int) to service_role;

create or replace function private_payments.claim_sponsorship_seats(p_inst uuid, p_profile_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_g public.institution_sponsorships%rowtype;
  v_free int;
  v_n int;
begin
  select * into v_g
  from public.institution_sponsorships
  where institution_id = p_inst and status = 'active' and expires_at > now()
  for update;

  if not found then
    return 0;
  end if;

  v_free := v_g.student_cap - v_g.seats_used;
  if v_free <= 0 then
    return 0;
  end if;

  with pick as (
    select id from public.job_seeker_profiles
    where id = any(p_profile_ids) and institution_id = p_inst and sponsorship_id is null
    order by created_at asc
    limit v_free
    for update skip locked
  )
  update public.job_seeker_profiles s
  set sponsorship_id = v_g.id
  from pick
  where s.id = pick.id;

  get diagnostics v_n = row_count;

  update public.institution_sponsorships
  set seats_used = seats_used + v_n
  where id = v_g.id;

  return v_n;
end $fn$;

revoke all on function private_payments.claim_sponsorship_seats(uuid, uuid[]) from public, anon, authenticated;
grant execute on function private_payments.claim_sponsorship_seats(uuid, uuid[]) to service_role;

-- 4. Public RPC wrapper for claim_sponsorship_seats (SECURITY INVOKER)
create or replace function public.rpc_claim_sponsorship_seats(p_inst uuid, p_profile_ids uuid[])
returns int
language sql
security invoker
set search_path = ''
as $$
  select private_payments.claim_sponsorship_seats($1, $2);
$$;

revoke all on function public.rpc_claim_sponsorship_seats(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_claim_sponsorship_seats(uuid, uuid[]) to service_role;

-- 5. Sponsorship grant creation helper
create or replace function private_payments.create_sponsorship_grant(p_pay public.payments)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_inst uuid := (p_pay.order_snapshot->>'institutionId')::uuid;
  v_gid uuid;
  v_cap int := (p_pay.order_snapshot->>'studentCap')::int;
  v_term int := coalesce((p_pay.order_snapshot->>'termDays')::int, 365);
  v_rate int := (p_pay.order_snapshot->>'ratePaise')::int;
  v_tier text := coalesce(p_pay.order_snapshot->>'tier', 'Small');
begin
  if p_pay.purpose <> 'sponsorship' then
    raise exception 'INVALID_PURPOSE_FOR_SPONSORSHIP';
  end if;

  if v_inst is null or not exists (
    select 1 from public.institution_profiles
    where id = v_inst and user_id = p_pay.user_id
  ) then
    return null; -- caller turns null into the PRECONDITION anomaly
  end if;

  -- Expire previous active grants whose expires_at <= now()
  update public.institution_sponsorships
  set status = 'expired'
  where institution_id = v_inst and status = 'active' and expires_at <= now();

  insert into public.institution_sponsorships(
    institution_id,
    status,
    started_at,
    expires_at,
    payment_id,
    tier,
    rate_paise,
    rate_per_student,
    annual_fee,
    student_cap,
    student_count,
    seats_used
  )
  values (
    v_inst,
    'active',
    now(),
    now() + make_interval(days => v_term),
    p_pay.id,
    v_tier,
    v_rate,
    round(v_rate::numeric / 100, 2),
    round(coalesce((p_pay.order_snapshot->>'totalPaise')::numeric, (v_rate * v_cap)::numeric) / 100, 2),
    v_cap,
    v_cap,
    0
  )
  returning id into v_gid;

  perform private_payments.claim_seats(v_gid, v_inst, v_cap);
  return v_gid;
end $fn$;

revoke all on function private_payments.create_sponsorship_grant(public.payments) from public, anon, authenticated;
grant execute on function private_payments.create_sponsorship_grant(public.payments) to service_role;

-- 6. Replace settle_payment to fulfill sponsorship orders atomically
create or replace function private_payments.settle_payment(
  p_gateway_order_id text,
  p_gateway_payment_id text,
  p_amount_paise bigint,
  p_currency text,
  p_method text,
  p_event_id text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pay public.payments%rowtype;
  v_ref uuid;
begin
  if p_event_id is not null then
    insert into private_payments.webhook_events(event_id, event_type)
    values (p_event_id, 'payment.captured')
    on conflict do nothing;

    if not found then
      return jsonb_build_object('status', 'duplicate_event');
    end if;
  end if;

  select * into v_pay
  from public.payments
  where gateway_order_id = p_gateway_order_id
  for update;

  if not found then
    insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
    values ('UNKNOWN_ORDER', p_gateway_order_id, p_gateway_payment_id, jsonb_build_object('source', p_source));
    return jsonb_build_object('status', 'unknown_order');
  end if;

  if v_pay.status in ('captured', 'partially_refunded', 'refunded') then
    if v_pay.gateway_payment_id is distinct from p_gateway_payment_id then
      insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
      values ('DUPLICATE_CAPTURE', p_gateway_order_id, p_gateway_payment_id,
              jsonb_build_object('settled_with', v_pay.gateway_payment_id));
      return jsonb_build_object('status', 'duplicate_capture', 'payment_id', v_pay.id);
    end if;
    return jsonb_build_object('status', 'already_settled', 'payment_id', v_pay.id, 'purpose', v_pay.purpose);
  end if;

  if p_amount_paise <> v_pay.amount_paise or p_currency <> 'INR' then
    insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
    values ('AMOUNT_MISMATCH', p_gateway_order_id, p_gateway_payment_id,
            jsonb_build_object('expected', v_pay.amount_paise, 'got', p_amount_paise, 'currency', p_currency));
    return jsonb_build_object('status', 'amount_mismatch', 'payment_id', v_pay.id);
  end if;

  update public.payments
  set status = 'captured',
      gateway_payment_id = p_gateway_payment_id,
      payment_method = p_method,
      settled_at = now()
  where id = v_pay.id;

  if v_pay.purpose = 'wallet' then
    insert into public.credit_ledgers(user_id, amount, reason, payment_id, source)
    values (v_pay.user_id, v_pay.credits_to_grant, 'wallet_recharge', v_pay.id, 'razorpay')
    returning id into v_ref;

    insert into private_payments.payment_grants(payment_id, grant_type, grant_ref)
    values (v_pay.id, 'wallet_credit', v_ref);

    perform private_payments.audit('CREDIT_WALLET_GRANTED', v_pay.user_id, 'payment', v_pay.id,
                                   jsonb_build_object('credits', v_pay.credits_to_grant));
  elsif v_pay.purpose = 'sponsorship' then
    v_ref := private_payments.create_sponsorship_grant(v_pay);
    if v_ref is null then
      -- Precondition failed: leave payment 'created', log anomaly, return precondition_failed
      update public.payments
      set status = 'created',
          gateway_payment_id = null,
          payment_method = null,
          settled_at = null
      where id = v_pay.id;

      insert into private_payments.payment_anomalies(kind, gateway_order_id, gateway_payment_id, details)
      values ('SPONSORSHIP_PRECONDITION_FAILED', p_gateway_order_id, p_gateway_payment_id,
              jsonb_build_object('user_id', v_pay.user_id, 'order_snapshot', v_pay.order_snapshot));

      return jsonb_build_object('status', 'precondition_failed', 'payment_id', v_pay.id);
    end if;

    insert into private_payments.payment_grants(payment_id, grant_type, grant_ref)
    values (v_pay.id, 'sponsorship', v_ref);

    perform private_payments.audit('INSTITUTION_SPONSORSHIP_ACTIVATED', v_pay.user_id, 'sponsorship', v_ref,
              jsonb_build_object('cap', v_pay.order_snapshot->'studentCap',
                                 'tier', v_pay.order_snapshot->'tier'));
  else
    raise exception 'PURPOSE_NOT_ENABLED';
  end if;

  perform private_payments.audit('PAYMENT_CAPTURED', v_pay.user_id, 'payment', v_pay.id,
                                 jsonb_build_object('amount_paise', v_pay.amount_paise, 'source', p_source));
  insert into private_payments.outbox(kind, payment_id)
  values ('issue_invoice', v_pay.id);

  return jsonb_build_object('status', 'settled', 'payment_id', v_pay.id, 'purpose', v_pay.purpose);
end $fn$;

revoke all on function private_payments.settle_payment(text, text, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function private_payments.settle_payment(text, text, bigint, text, text, text, text) to service_role;

-- 7. Notify PostgREST to reload schema
notify pgrst, 'reload schema';
