-- Migration: 20261026300000_get_user_credit_balance.sql
-- STF-10: Optimized PostgreSQL aggregate calculation for credit ledger balance (WAL-01, Hard Invariant #7)

CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT jsonb_build_object(
        'balance', COALESCE(SUM(amount), 0),
        'credits_added', COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
        'credits_used', COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)
    )
    FROM credit_ledgers
    WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_user_credit_balance(UUID) TO authenticated, service_role;
