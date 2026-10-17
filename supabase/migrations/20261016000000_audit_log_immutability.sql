-- Migration: 20261016000000_audit_log_immutability.sql
-- Enforce Hard Invariant #6: Audit log is append-only, not editable by admins or service_role

-- 1. Ensure trigger function exists with search_path secured
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

-- 2. Drop triggers if existing, then recreate
DROP TRIGGER IF EXISTS audit_log_immutable_update_trigger ON audit_logs;
DROP TRIGGER IF EXISTS audit_log_immutable_delete_trigger ON audit_logs;

CREATE TRIGGER audit_log_immutable_update_trigger
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

CREATE TRIGGER audit_log_immutable_delete_trigger
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

-- 3. Explicitly revoke UPDATE and DELETE permissions from all database roles
REVOKE UPDATE, DELETE ON audit_logs FROM public, anon, authenticated, service_role;
