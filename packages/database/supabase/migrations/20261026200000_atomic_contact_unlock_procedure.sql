-- Migration: 20261026200000_atomic_contact_unlock_procedure.sql
-- Ticket 04: Atomic Employer Candidate Contact Unlock (WAL-04, Invariant #7)
-- Eliminates race conditions and overdrafts via PostgreSQL transaction-scoped advisory locks.

CREATE OR REPLACE FUNCTION unlock_contact_with_ledger(
    p_employer_id UUID,
    p_seeker_id UUID,
    p_cost INT DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_current_balance INT := 0;
    v_ledger_id UUID;
BEGIN
    -- 1. Advisory transaction-scoped lock on employer wallet to serialize debits
    PERFORM pg_advisory_xact_lock(hashtext('wallet_' || p_employer_id::text));

    -- 2. Calculate current dynamic balance from immutable ledger entries (Hard Invariant #7)
    SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
    FROM credit_ledgers
    WHERE user_id = p_employer_id;

    -- 3. Verify sufficient credits to unlock contact details
    IF v_current_balance < p_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Required %, available %', p_cost, v_current_balance
            USING ERRCODE = 'P0001';
    END IF;

    -- 4. Atomic ledger debit (Immutable append-only)
    v_ledger_id := gen_random_uuid();

    INSERT INTO credit_ledgers (id, user_id, amount, reason, actor_id, created_at)
    VALUES (
        v_ledger_id,
        p_employer_id,
        -p_cost,
        'Candidate contact unlock: ' || p_seeker_id::text,
        p_employer_id::text,
        NOW()
    );

    -- 5. Audit log recording (Hard Invariant #6)
    INSERT INTO audit_logs (id, actor_id, action, meta, created_at)
    VALUES (
        gen_random_uuid(),
        p_employer_id,
        'CREDIT_WALLET_DEDUCTED',
        jsonb_build_object(
            'seeker_id', p_seeker_id,
            'cost', p_cost,
            'remaining_balance', v_current_balance - p_cost,
            'ledger_id', v_ledger_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'cost', p_cost,
        'remaining_balance', v_current_balance - p_cost,
        'seeker_id', p_seeker_id
    );
END;
$$;

-- Grant execution to authenticated users and service role
GRANT EXECUTE ON FUNCTION unlock_contact_with_ledger(UUID, UUID, INT) TO authenticated, service_role;
