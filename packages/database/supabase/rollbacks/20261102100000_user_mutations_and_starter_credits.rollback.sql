-- Down-Migration / Rollback Script: 20261102100000_user_mutations_and_starter_credits.rollback.sql
-- Reverses: 20261102100000_user_mutations_and_starter_credits.sql
--
-- Deployment Rollback Order: APP-BEFORE-DB
-- (Roll back application container/code first to previous release, then execute this DB rollback)

BEGIN;

-- Enforce conservative locks to avoid blocking online traffic
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- 1. Drop token_version auto-bump trigger and function
DROP TRIGGER IF EXISTS trg_users_bump_token_version ON users;
DROP FUNCTION IF EXISTS trigger_auto_bump_token_version();

-- 2. Drop starter credits trigger and stored procedure
DROP TRIGGER IF EXISTS trg_users_auto_grant_starter_credits ON users;
DROP FUNCTION IF EXISTS trigger_auto_grant_starter_credits();
DROP FUNCTION IF EXISTS grant_starter_credits(uuid);

-- 3. Drop credit ledgers indexes
DROP INDEX IF EXISTS uq_credit_ledgers_user_starter;
DROP INDEX IF EXISTS idx_credit_ledgers_user_id;

-- 4. Drop unique email indexes
DROP INDEX IF EXISTS uq_users_pending_email_lower;
DROP INDEX IF EXISTS uq_users_email_lower;

-- 5. Drop email verification columns
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
ALTER TABLE users DROP COLUMN IF EXISTS pending_email;

-- 6. Drop phone check constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_phone_regex;

-- 7. Policy / REVOKE Reversal Decision:
-- Re-grant basic SELECT on users to authenticated role for legacy app read compatibility.
-- CAUTION: Do NOT restore permissive credit_ledgers_insert_policy (direct client credit minting backdoor).
GRANT SELECT ON users TO authenticated;

-- 8. Remove migration record from schema_migrations
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20261102100000';

COMMIT;
