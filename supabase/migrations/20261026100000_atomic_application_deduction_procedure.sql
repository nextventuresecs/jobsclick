-- Migration: 20261026100000_atomic_application_deduction_procedure.sql
-- Ticket 03: Atomic Job Application Credit Deduction (WAL-02, WAL-05, Invariant #7)
-- Eliminates TOCTOU race conditions via PostgreSQL transaction-scoped advisory lock.

CREATE OR REPLACE FUNCTION deduct_application_credit_with_ledger(
    p_applicant_id UUID,
    p_job_id UUID,
    p_job_title TEXT,
    p_cost INT DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_sponsored BOOLEAN := FALSE;
    v_current_balance INT := 0;
    v_ledger_id UUID;
    v_effective_title TEXT;
BEGIN
    -- 1. Advisory transaction-scoped lock on applicant wallet to serialize deductions
    PERFORM pg_advisory_xact_lock(hashtext('wallet_' || p_applicant_id::text));

    -- 2. Check if applicant is a sponsored candidate enrolled in an institution (WAL-05)
    SELECT COALESCE(is_sponsored, FALSE) INTO v_is_sponsored
    FROM job_seeker_profiles
    WHERE user_id = p_applicant_id;

    -- Calculate current dynamic balance from immutable ledger entries (Hard Invariant #7)
    SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
    FROM credit_ledgers
    WHERE user_id = p_applicant_id;

    -- Sponsored candidates apply freely without consuming personal credits
    IF v_is_sponsored IS TRUE THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'cost', 0,
            'remaining_balance', v_current_balance,
            'is_sponsored', TRUE
        );
    END IF;

    -- 3. Verify sufficient credits for non-sponsored applicants
    IF v_current_balance < p_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Required %, available %', p_cost, v_current_balance
            USING ERRCODE = 'P0001';
    END IF;

    -- 4. Atomic ledger debit (Immutable append-only)
    v_effective_title := COALESCE(p_job_title, p_job_id::text);
    v_ledger_id := gen_random_uuid();

    INSERT INTO credit_ledgers (id, user_id, amount, reason, actor_id, created_at)
    VALUES (
        v_ledger_id,
        p_applicant_id,
        -p_cost,
        'Job application: ' || v_effective_title,
        p_applicant_id::text,
        NOW()
    );

    -- 5. Audit log recording (Hard Invariant #6)
    INSERT INTO audit_logs (id, actor_id, action, meta, created_at)
    VALUES (
        gen_random_uuid(),
        p_applicant_id,
        'CREDIT_WALLET_DEDUCTED',
        jsonb_build_object(
            'job_id', p_job_id,
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
        'is_sponsored', FALSE
    );
END;
$$;
