-- Migration: 20261017000000_credit_ledgers_and_rls.sql
-- Ticket T-15: Credit Wallet Ledger & Dynamic Balance Engine (WAL-01, WAL-02, WAL-04 & Hard Invariant #7)

-- 1. Ensure actor_id column exists on credit_ledgers
ALTER TABLE credit_ledgers ADD COLUMN IF NOT EXISTS actor_id VARCHAR(255);

-- 2. Create index for fast dynamic balance calculation
CREATE INDEX IF NOT EXISTS idx_credit_ledgers_user_created 
    ON credit_ledgers (user_id, created_at DESC);

-- 3. Invariant #7 & #6: Credit Ledger is strictly append-only (No UPDATE or DELETE allowed by anyone)
CREATE OR REPLACE FUNCTION prevent_credit_ledger_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Credit ledger entries are immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS credit_ledger_immutable_update_trigger ON credit_ledgers;
CREATE TRIGGER credit_ledger_immutable_update_trigger
    BEFORE UPDATE ON credit_ledgers
    FOR EACH ROW EXECUTE FUNCTION prevent_credit_ledger_modification();

DROP TRIGGER IF EXISTS credit_ledger_immutable_delete_trigger ON credit_ledgers;
CREATE TRIGGER credit_ledger_immutable_delete_trigger
    BEFORE DELETE ON credit_ledgers
    FOR EACH ROW EXECUTE FUNCTION prevent_credit_ledger_modification();

-- 4. Enable Row-Level Security
ALTER TABLE credit_ledgers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies:
-- Users can view only their own credit ledger entries
DROP POLICY IF EXISTS credit_ledgers_own_select_policy ON credit_ledgers;
DROP POLICY IF EXISTS credit_ledgers_select_policy ON credit_ledgers;
CREATE POLICY credit_ledgers_own_select_policy ON credit_ledgers
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
    );

-- Inserts are allowed by the authenticated user, actor, or admin
DROP POLICY IF EXISTS credit_ledgers_insert_policy ON credit_ledgers;
CREATE POLICY credit_ledgers_insert_policy ON credit_ledgers
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR auth.uid()::text = actor_id
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND role IN ('admin', 'msme_admin')
        )
    );
