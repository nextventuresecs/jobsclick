-- ==============================================================================
-- Migration: 20261121000300_wallet_settlement.sql
-- Description: Module 4 Wallet Settlement, Charging, and Dynamic Balance
--              - private_payments.audit immutable logging helper
--              - private_payments.settle_payment & public.rpc_settle_payment
--              - private_payments.charge_application & public.rpc_charge_application
--              - private_payments.get_balance & public.rpc_get_balance
--              - Drop legacy RPCs: deduct_application_credit_with_ledger, get_user_credit_balance
-- ==============================================================================

-- 1. Schema extensions for ledgers and audit logs
alter table public.credit_ledgers
  add column if not exists source text;

alter table public.audit_logs
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists metadata jsonb;

create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

-- 2. Immutable audit logging helper in private_payments
drop function if exists private_payments.audit(text, uuid, text, uuid, jsonb);
create or replace function private_payments.audit(
  p_action text,
  p_actor uuid,
  p_entity text,
  p_entity_id uuid,
  p_meta jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata, meta)
  values (p_actor, p_action, p_entity, p_entity_id, p_meta, p_meta);
$$;

revoke all on function private_payments.audit(text, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function private_payments.audit(text, uuid, text, uuid, jsonb) to service_role;

-- 3. Payment settlement (atomic fulfillment, idempotency, anomaly logging)
drop function if exists public.rpc_settle_payment(text, text, bigint, text, text, text, text);
drop function if exists private_payments.settle_payment(text, text, bigint, text, text, text, text);

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
  else
    raise exception 'PURPOSE_NOT_ENABLED';
  end if;

  perform private_payments.audit('PAYMENT_CAPTURED', v_pay.user_id, 'payment', v_pay.id,
                                 jsonb_build_object('amount_paise', v_pay.amount_paise, 'source', p_source));
  insert into private_payments.outbox(kind, payment_id)
  values ('issue_invoice', v_pay.id);

  return jsonb_build_object('status', 'settled', 'payment_id', v_pay.id, 'purpose', v_pay.purpose);
end $fn$;

create or replace function public.rpc_settle_payment(
  p_gateway_order_id text,
  p_gateway_payment_id text,
  p_amount_paise bigint,
  p_currency text,
  p_method text,
  p_event_id text,
  p_source text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private_payments.settle_payment($1, $2, $3, $4, $5, $6, $7);
$$;

revoke all on function public.rpc_settle_payment(text, text, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rpc_settle_payment(text, text, bigint, text, text, text, text) to service_role;

revoke all on function private_payments.settle_payment(text, text, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function private_payments.settle_payment(text, text, bigint, text, text, text, text) to service_role;

-- 4. Application credit charging (advisory lock per applicant, sponsorship check, idempotency)
drop function if exists public.rpc_charge_application(uuid, uuid);
drop function if exists private_payments.charge_application(uuid, uuid);

create or replace function private_payments.charge_application(p_applicant uuid, p_job uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cost int;
  v_bal bigint;
  v_sponsored boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_applicant::text, 0));

  if exists (
    select 1 from public.credit_ledgers
    where user_id = p_applicant and ref_id = p_job
      and reason in ('application', 'application_sponsored')
  ) then
    return jsonb_build_object(
      'charged', false,
      'sponsored', false,
      'balance', (select coalesce(sum(amount), 0) from public.credit_ledgers where user_id = p_applicant)
    );
  end if;

  select cost into v_cost from public.credit_action_costs where action = 'job_application';
  if v_cost is null then
    raise exception 'COST_NOT_CONFIGURED';
  end if;

  select exists (
    select 1 from public.job_seeker_profiles s
    join public.institution_sponsorships g on g.id = s.sponsorship_id
    where s.user_id = p_applicant
      and g.status = 'active'
      and g.started_at <= now()
      and g.expires_at > now()
  ) into v_sponsored;

  if v_sponsored then
    insert into public.credit_ledgers(user_id, amount, reason, ref_id, source)
    values (p_applicant, 0, 'application_sponsored', p_job, 'system');

    return jsonb_build_object(
      'charged', false,
      'sponsored', true,
      'balance', (select coalesce(sum(amount), 0) from public.credit_ledgers where user_id = p_applicant)
    );
  end if;

  select coalesce(sum(amount), 0) into v_bal
  from public.credit_ledgers
  where user_id = p_applicant;

  if v_bal < v_cost then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;

  insert into public.credit_ledgers(user_id, amount, reason, ref_id, source)
  values (p_applicant, -v_cost, 'application', p_job, 'system');

  perform private_payments.audit('CREDIT_DEBITED', p_applicant, 'job', p_job, jsonb_build_object('cost', v_cost));

  return jsonb_build_object(
    'charged', true,
    'sponsored', false,
    'balance', v_bal - v_cost
  );
end $fn$;

create or replace function public.rpc_charge_application(p_applicant_id uuid, p_job_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private_payments.charge_application($1, $2);
$$;

revoke all on function public.rpc_charge_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_charge_application(uuid, uuid) to service_role;

revoke all on function private_payments.charge_application(uuid, uuid) from public, anon, authenticated;
grant execute on function private_payments.charge_application(uuid, uuid) to service_role;

-- 5. Dynamic credit balance calculation (ledger aggregate, Hard Invariant #7)
drop function if exists public.rpc_get_balance(uuid);
drop function if exists private_payments.get_balance(uuid);

create or replace function private_payments.get_balance(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::bigint from public.credit_ledgers where user_id = p_user_id;
$$;

create or replace function public.rpc_get_balance(p_user_id uuid)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private_payments.get_balance($1);
$$;

revoke all on function public.rpc_get_balance(uuid) from public, anon, authenticated;
grant execute on function public.rpc_get_balance(uuid) to service_role;

revoke all on function private_payments.get_balance(uuid) from public, anon, authenticated;
grant execute on function private_payments.get_balance(uuid) to service_role;

-- 6. Drop legacy procedures superseded by atomic RPCs
drop function if exists public.deduct_application_credit_with_ledger(uuid, uuid, text, integer);
drop function if exists public.get_user_credit_balance(uuid);

-- 7. Notify PostgREST to reload schema
notify pgrst, 'reload schema';
