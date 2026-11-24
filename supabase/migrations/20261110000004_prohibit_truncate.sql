-- Migration: 20261110000004_prohibit_truncate.sql
-- Description: Revoke TRUNCATE privilege across all public tables and attach BEFORE TRUNCATE statement triggers on immutable and financial ledger tables.

-- ============================================================================
-- 1. Create Generic Prohibit TRUNCATE Trigger Function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prohibit_truncate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'TRUNCATE operation is strictly prohibited on table % to preserve immutable audit logs, delivery records, and statutory financial ledgers', TG_TABLE_NAME
        USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prohibit_truncate_trigger() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Revoke TRUNCATE Privilege on All Public Tables from anon, authenticated, service_role, and PUBLIC
-- ============================================================================
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role, PUBLIC;

-- ============================================================================
-- 3. Attach BEFORE TRUNCATE Statement Triggers on Immutable & Ledger Tables
-- ============================================================================

-- Immutable Audit Log
DROP TRIGGER IF EXISTS audit_log_prohibit_truncate_trigger ON public.audit_logs;
CREATE TRIGGER audit_log_prohibit_truncate_trigger
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prohibit_truncate_trigger();

-- Immutable Credit Ledger
DROP TRIGGER IF EXISTS credit_ledger_prohibit_truncate_trigger ON public.credit_ledgers;
CREATE TRIGGER credit_ledger_prohibit_truncate_trigger
    BEFORE TRUNCATE ON public.credit_ledgers
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prohibit_truncate_trigger();

-- Immutable Alert Deliveries
DROP TRIGGER IF EXISTS alert_deliveries_prohibit_truncate_trigger ON public.alert_deliveries;
CREATE TRIGGER alert_deliveries_prohibit_truncate_trigger
    BEFORE TRUNCATE ON public.alert_deliveries
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prohibit_truncate_trigger();

-- Statutory Payments & Invoicing
DROP TRIGGER IF EXISTS payments_prohibit_truncate_trigger ON public.payments;
CREATE TRIGGER payments_prohibit_truncate_trigger
    BEFORE TRUNCATE ON public.payments
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prohibit_truncate_trigger();

-- Commercial Institution Sponsorships
DROP TRIGGER IF EXISTS sponsorships_prohibit_truncate_trigger ON public.institution_sponsorships;
CREATE TRIGGER sponsorships_prohibit_truncate_trigger
    BEFORE TRUNCATE ON public.institution_sponsorships
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prohibit_truncate_trigger();

-- MSME Broadcast Campaigns & Delivery Records
DROP TRIGGER IF EXISTS broadcast_campaigns_prohibit_truncate_trigger ON public.broadcast_campaigns;
CREATE TRIGGER broadcast_campaigns_prohibit_truncate_trigger
    BEFORE TRUNCATE ON public.broadcast_campaigns
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prohibit_truncate_trigger();

DROP TRIGGER IF EXISTS broadcast_deliveries_prohibit_truncate_trigger ON public.broadcast_deliveries;
CREATE TRIGGER broadcast_deliveries_prohibit_truncate_trigger
    BEFORE TRUNCATE ON public.broadcast_deliveries
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prohibit_truncate_trigger();
