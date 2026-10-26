-- Down-Migration / Rollback Script: 20261026300000_get_user_credit_balance.rollback.sql
-- Reverses: 20261026300000_get_user_credit_balance.sql

BEGIN;

-- Enforce conservative locks to avoid blocking online traffic
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- 1. Drop function and revoke permissions
DROP FUNCTION IF EXISTS public.get_user_credit_balance(UUID);

-- 2. Remove migration entry from supabase_migrations.schema_migrations
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20261026300000';

COMMIT;
