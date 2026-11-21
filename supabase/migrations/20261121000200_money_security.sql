-- ==============================================================================
-- Migration: 20261121000200_money_security.sql
-- Description: Module 4 Money Security - Deny-all RLS on money tables,
--              service_role-only isolation, trigger immutability for ledgers,
--              revocation of client access to money RPCs.
-- ==============================================================================

-- 1. Private payments schema privileges
revoke all on schema private_payments from public, anon, authenticated;
grant usage on schema private_payments to service_role;

-- Future functions are not executable by client roles unless granted explicitly
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private_payments revoke execute on functions from public, anon, authenticated;

-- 2. Money tables: deny-all to client roles, drop every existing policy
do $$
declare
  t text;
  pol record;
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

-- 3. Audit-log immutability preserved; ledger rows are append-only too
drop trigger if exists credit_ledgers_no_update on public.credit_ledgers;
drop trigger if exists credit_ledgers_no_delete on public.credit_ledgers;
create trigger credit_ledgers_no_update before update on public.credit_ledgers
  for each row execute function private_payments.reject_mutation();
create trigger credit_ledgers_no_delete before delete on public.credit_ledgers
  for each row execute function private_payments.reject_mutation();

drop trigger if exists credit_ledger_immutable_update_trigger on public.credit_ledgers;
drop trigger if exists credit_ledger_immutable_delete_trigger on public.credit_ledgers;
create trigger credit_ledger_immutable_update_trigger before update on public.credit_ledgers
  for each row execute function private_payments.reject_mutation();
create trigger credit_ledger_immutable_delete_trigger before delete on public.credit_ledgers
  for each row execute function private_payments.reject_mutation();

-- 4. Revoke pre-existing RPCs from client roles, grant to service_role only
revoke execute on function public.get_district_employment_reports() from public, anon, authenticated;
grant  execute on function public.get_district_employment_reports() to service_role;

revoke execute on function public.promote_job_with_ledger(uuid, uuid, integer, integer) from public, anon, authenticated;
grant  execute on function public.promote_job_with_ledger(uuid, uuid, integer, integer) to service_role;

revoke execute on function public.get_user_credit_balance(uuid) from public, anon, authenticated;
grant  execute on function public.get_user_credit_balance(uuid) to service_role;

revoke execute on function public.deduct_application_credit_with_ledger(uuid, uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.deduct_application_credit_with_ledger(uuid, uuid, text, integer) to service_role;

-- 5. Harden search_jobs to SECURITY DEFINER with pinned search_path and service_role-only execution boundary
alter function public.search_jobs(text, text, text, numeric, integer, integer) security definer;
alter function public.search_jobs(text, text, text, numeric, integer, integer) set search_path = public, pg_temp;
revoke execute on function public.search_jobs(text, text, text, numeric, integer, integer) from public, anon, authenticated;
grant  execute on function public.search_jobs(text, text, text, numeric, integer, integer) to service_role;

-- 6. Stub for rpc_settle_payment establishing service_role-only permission boundary
--    (full implementation provided in 20261121000300_wallet_settlement.sql)
create or replace function public.rpc_settle_payment(
  p_gateway_order_id text default null,
  p_gateway_payment_id text default null,
  p_amount_paise bigint default null,
  p_currency text default null,
  p_method text default null,
  p_event_id text default null,
  p_source text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'NOT_IMPLEMENTED';
end;
$$;

revoke all on function public.rpc_settle_payment(text, text, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rpc_settle_payment(text, text, bigint, text, text, text, text) to service_role;

-- 7. Notify PostgREST to reload its schema cache
notify pgrst, 'reload schema';
