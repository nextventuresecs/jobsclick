-- Migration: 20261025100000_atomic_job_promotion_procedure.sql
-- Fix 1.1: Atomic Job Promotion & Ledger Transaction (PRD JOB-05, Hard Invariant #7)
-- Guarantees ACID atomicity: Zero credit loss on partial failures, TOCTOU race immunity, and monotonic expiry stacking.

CREATE OR REPLACE FUNCTION promote_job_with_ledger(
    p_user_id UUID,
    p_job_id UUID,
    p_duration_days INT,
    p_cost INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_current_balance INT;
    v_current_expiry TIMESTAMPTZ;
    v_new_expiry TIMESTAMPTZ;
    v_ledger_id UUID;
    v_job_employer_id UUID;
    v_user_role TEXT;
BEGIN
    -- 1. Advisory transaction-scoped lock on user wallet to eliminate TOCTOU balance races
    PERFORM pg_advisory_xact_lock(hashtext('wallet_' || p_user_id::text));

    -- 2. Lock and retrieve the job record to serialize promotion requests
    SELECT employer_id, featured_until INTO v_job_employer_id, v_current_expiry
    FROM jobs
    WHERE id = p_job_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Verify ownership unless admin/msme_admin
    SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
    IF v_job_employer_id <> p_user_id AND (v_user_role IS NULL OR v_user_role NOT IN ('admin', 'msme_admin')) THEN
        RAISE EXCEPTION 'FORBIDDEN_PROMOTION' USING ERRCODE = 'P0003';
    END IF;

    -- 3. Calculate dynamic balance directly from immutable credit_ledgers (Hard Invariant #7)
    SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
    FROM credit_ledgers
    WHERE user_id = p_user_id;

    IF v_current_balance < p_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Required %, available %', p_cost, v_current_balance
            USING ERRCODE = 'P0001';
    END IF;

    -- 4. Monotonic expiry calculation (stacks cleanly onto future expiry if currently featured)
    IF v_current_expiry IS NOT NULL AND v_current_expiry > NOW() THEN
        v_new_expiry := v_current_expiry + (p_duration_days || ' days')::INTERVAL;
    ELSE
        v_new_expiry := NOW() + (p_duration_days || ' days')::INTERVAL;
    END IF;

    -- 5. Atomic ledger debit (Immutable append-only)
    v_ledger_id := gen_random_uuid();
    INSERT INTO credit_ledgers (id, user_id, amount, reason, actor_id, created_at)
    VALUES (
        v_ledger_id,
        p_user_id,
        -p_cost,
        'Featured job promotion: ' || p_job_id || ' (' || p_duration_days || ' days)',
        p_user_id::text,
        NOW()
    );

    -- 6. Atomic job promotion state update
    UPDATE jobs
    SET is_featured = TRUE,
        featured_until = v_new_expiry,
        updated_at = NOW()
    WHERE id = p_job_id;

    -- 7. Audit log recording (Hard Invariant #6)
    INSERT INTO audit_logs (id, actor_id, action, meta, created_at)
    VALUES (
        gen_random_uuid(),
        p_user_id,
        'JOB_PROMOTED_FEATURED',
        jsonb_build_object(
            'job_id', p_job_id,
            'duration_days', p_duration_days,
            'cost', p_cost,
            'featured_until', v_new_expiry,
            'ledger_id', v_ledger_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'cost', p_cost,
        'remaining_balance', v_current_balance - p_cost,
        'featured_until', v_new_expiry
    );
END;
$$;
