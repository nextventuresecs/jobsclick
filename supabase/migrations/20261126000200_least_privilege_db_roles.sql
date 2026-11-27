-- Migration: 20261126000200_least_privilege_db_roles.sql
-- Description: ADR 0002 / AUTHZ-12 - Provision Option 3 least-privilege NOLOGIN
--              database workload identities and scoped privileges while keeping
--              PUBLIC, anon, and authenticated strictly deny-all on base tables.

BEGIN;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['jobsclick_api', 'jobsclick_worker', 'jobsclick_finance', 'jobsclick_migrator'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS', v_role);
    END IF;
  END LOOP;

  -- Baseline schema usage for runtime roles (zero PUBLIC/anon/authenticated grants)
  GRANT USAGE ON SCHEMA public TO jobsclick_api, jobsclick_worker, jobsclick_finance;
  GRANT USAGE ON SCHEMA private_payments TO jobsclick_finance;

  -- jobsclick_api: standard application tables (never direct DELETE/UPDATE on immutable audit/ledger tables)
  GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.users,
    public.job_seeker_profiles,
    public.business_profiles,
    public.institution_profiles,
    public.jobs,
    public.applications,
    public.job_alerts,
    public.corporate_tie_ups,
    public.placement_applications,
    public.institution_inquiries,
    public.bulk_import_batches,
    public.invite_waves,
    public.invitations,
    public.broadcast_campaigns,
    public.location_nodes
  TO jobsclick_api;

  GRANT SELECT, INSERT ON public.audit_logs, public.search_logs, public.alert_deliveries TO jobsclick_api;
  GRANT SELECT ON public.credit_ledgers, public.payments, public.invoices, public.institution_sponsorships,
    public.credit_action_costs, public.platform_settings, public.broadcast_deliveries TO jobsclick_api;

  -- jobsclick_worker: bulk import, invitations, PDF/alerts/broadcast & outbox claim RPCs only
  GRANT SELECT, INSERT, UPDATE ON
    public.bulk_import_batches,
    public.invite_waves,
    public.invitations,
    public.users,
    public.job_seeker_profiles,
    public.broadcast_campaigns,
    public.broadcast_deliveries,
    public.job_alerts,
    public.alert_deliveries,
    public.business_profiles,
    public.jobs
  TO jobsclick_worker;
  GRANT SELECT, INSERT ON public.audit_logs TO jobsclick_worker;

  -- jobsclick_finance: financial tables and private_payments settlement/refund/invoice RPCs
  GRANT SELECT, INSERT, UPDATE ON
    public.payments,
    public.payment_refunds,
    public.invoices,
    public.institution_sponsorships,
    public.credit_action_costs,
    public.platform_settings
  TO jobsclick_finance;
  GRANT SELECT, INSERT ON public.credit_ledgers, public.audit_logs TO jobsclick_finance;

  -- Scoped RPC execute grants
  GRANT EXECUTE ON FUNCTION
    public.increment_token_version(uuid),
    public.get_district_employment_reports(),
    public.promote_job_with_ledger(uuid, uuid, integer, integer),
    public.unlock_contact_with_ledger(uuid, uuid, integer),
    public.anonymise_user(uuid),
    public.search_jobs(text, text, text, numeric, integer, integer),
    public.search_public_jobs(text, text, text, numeric, uuid, integer, integer),
    public.read_public_institution_cms(text),
    public.rpc_get_balance(uuid),
    public.rpc_charge_application(uuid, uuid)
  TO jobsclick_api;

  GRANT EXECUTE ON FUNCTION
    public.rpc_claim_outbox_batch(integer),
    public.rpc_complete_outbox(uuid, integer, boolean)
  TO jobsclick_worker;

  GRANT EXECUTE ON FUNCTION
    public.rpc_settle_payment(text, text, bigint, text, text, text, text),
    public.rpc_apply_refund(text, text, bigint, text),
    public.rpc_record_dispute(text, text, bigint, text, text),
    public.rpc_issue_invoice(uuid, text)
  TO jobsclick_finance;

EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping role creation/grants in restricted DB context: %', SQLERRM;
END $$;

COMMIT;
