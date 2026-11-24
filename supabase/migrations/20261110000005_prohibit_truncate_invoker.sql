-- Migration: 20261110000005_prohibit_truncate_invoker.sql
-- Description: Convert prohibit_truncate_trigger to SECURITY INVOKER with empty search_path, and ensure public discovery views run as owner (security_invoker = false).

-- ============================================================================
-- 1. Convert prohibit_truncate_trigger to SECURITY INVOKER & empty search_path
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prohibit_truncate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'TRUNCATE operation is strictly prohibited on table % to preserve immutable audit logs, delivery records, and statutory financial ledgers', TG_TABLE_NAME
        USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
END;
$$;

-- ============================================================================
-- 2. Explicitly Reset security_invoker on Public Discovery Views
-- ============================================================================
-- Ensures unauthenticated (anon) and authenticated web visitors can query
-- non-PII projected discovery views under view owner (postgres) context without
-- requiring direct table grants on sensitive underlying tables.
ALTER VIEW public.public_business_profiles SET (security_invoker = false);
ALTER VIEW public.public_institution_profiles SET (security_invoker = false);
ALTER VIEW public.public_jobs SET (security_invoker = false);
