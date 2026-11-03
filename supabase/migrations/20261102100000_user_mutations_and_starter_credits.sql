-- Migration: 20261102100000_user_mutations_and_starter_credits.sql
-- Step 7: Atomic user mutations, starter credit trigger, and email verification columns.

-- 1. Pre-check for duplicate phones or emails prior to adding indexes
DO $$
DECLARE
  v_dup_phone_count integer;
  v_dup_email_count integer;
BEGIN
  SELECT COUNT(*) INTO v_dup_phone_count
  FROM (
    SELECT phone FROM users GROUP BY phone HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_phone_count > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: users table contains duplicate phone numbers.';
  END IF;

  SELECT COUNT(*) INTO v_dup_email_count
  FROM (
    SELECT LOWER(email) FROM users WHERE email IS NOT NULL GROUP BY LOWER(email) HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_email_count > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: users table contains duplicate email addresses.';
  END IF;
END $$;

-- 2. Add phone regex CHECK constraint using zero-downtime NOT VALID + VALIDATE pattern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_phone_regex'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_phone_regex CHECK (phone ~ '^[6-9][0-9]{9}$') NOT VALID;
    ALTER TABLE users VALIDATE CONSTRAINT check_phone_regex;
  END IF;
END $$;

-- 3. Add email verification columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- 4. Case-insensitive unique partial indexes on email and pending_email
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_pending_email_lower
  ON users (LOWER(pending_email))
  WHERE pending_email IS NOT NULL;

-- 5. Credit ledgers indexing and partial unique constraint for starter grants
CREATE INDEX IF NOT EXISTS idx_credit_ledgers_user_id
  ON credit_ledgers (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledgers_user_starter
  ON credit_ledgers (user_id)
  WHERE reason = 'starter';

-- 6. Atomic Starter Credit Grant function (Hardened with search_path and variable_conflict)
CREATE OR REPLACE FUNCTION grant_starter_credits(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO credit_ledgers (id, user_id, amount, reason, actor_id, created_at)
  VALUES (
    gen_random_uuid(),
    p_user_id,
    10,
    'starter',
    p_user_id::varchar,
    NOW()
  )
  ON CONFLICT (user_id) WHERE (reason = 'starter') DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

-- Revoke execute from public/anon/authenticated and restrict strictly to service_role
REVOKE EXECUTE ON FUNCTION grant_starter_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_starter_credits(uuid) TO service_role;

-- 7. Database trigger to guarantee starter credits inside the same transaction
CREATE OR REPLACE FUNCTION trigger_auto_grant_starter_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  -- New user created with role = 'job_seeker' and status = 'active'
  IF (TG_OP = 'INSERT' AND NEW.role = 'job_seeker' AND NEW.status = 'active') THEN
    PERFORM grant_starter_credits(NEW.id);
  -- User updated from 'invited' to 'active' with role = 'job_seeker'
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'invited' AND NEW.status = 'active' AND NEW.role = 'job_seeker') THEN
    PERFORM grant_starter_credits(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION trigger_auto_grant_starter_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trigger_auto_grant_starter_credits() TO service_role;

DROP TRIGGER IF EXISTS trg_users_auto_grant_starter_credits ON users;
CREATE TRIGGER trg_users_auto_grant_starter_credits
  AFTER INSERT OR UPDATE OF status, role ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_grant_starter_credits();

-- 8. Column privileges: Deny direct modification of users table by anon or authenticated roles
REVOKE UPDATE ON users FROM anon, authenticated;
