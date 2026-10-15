-- Migration: Harden Database Functions against Supabase Security Linter Warnings (0011, 0028, 0029)
-- Fixes:
-- 1. function_search_path_mutable: public.prevent_audit_log_modification
-- 2. anon_security_definer_function_executable: public.rls_auto_enable
-- 3. authenticated_security_definer_function_executable: public.rls_auto_enable

-- 1. Secure prevent_audit_log_modification with explicit search_path and SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated or deleted.';
END;
$$;

-- 2. Secure rls_auto_enable: set explicit search_path and revoke execute from public/anon/authenticated
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
    ) THEN
        -- Prevent search_path hijacking
        EXECUTE 'ALTER FUNCTION public.rls_auto_enable() SET search_path = ''''';

        -- Revoke PostgREST RPC access from unauthenticated and authenticated users
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated';

        -- Allow only service_role (backend/admin) execution
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role';
    END IF;
END $$;
