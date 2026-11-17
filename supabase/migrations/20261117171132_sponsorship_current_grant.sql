-- WAL-05 / F0-d local draft: require a current UUID-associated sponsorship grant.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
CREATE OR REPLACE FUNCTION public.deduct_application_credit_with_ledger(
    p_applicant_id UUID,
    p_job_id UUID,
    p_job_title TEXT,
    p_cost INT DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_sponsored BOOLEAN;
    v_current_balance INT;
    v_ledger_id UUID;
BEGIN
    IF p_applicant_id IS NULL THEN
        RAISE EXCEPTION 'APPLICANT_ID_REQUIRED' USING ERRCODE = 'P0004';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_applicant_id) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- 1. Advisory transaction-scoped lock on applicant wallet to serialize deductions
    PERFORM pg_advisory_xact_lock(hashtext('wallet_' || p_applicant_id::text));

    -- 2. Check if applicant is a sponsored candidate enrolled in an institution (WAL-05)
    SELECT EXISTS (
        SELECT 1
        FROM public.job_seeker_profiles AS student
        JOIN public.institution_profiles AS institution ON institution.id = student.institution_id
        JOIN public.institution_sponsorships AS grant_row ON grant_row.institution_id = institution.id
        WHERE student.user_id = p_applicant_id AND student.is_sponsored IS TRUE
          AND institution.is_sponsorship_active IS TRUE
          AND institution.sponsorship_expires_at > now()
          AND grant_row.status = 'active'
          AND grant_row.started_at <= now() AND grant_row.expires_at > now()
    ) INTO v_is_sponsored;

    -- Sponsored candidates apply for free
    IF v_is_sponsored IS TRUE THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'cost', 0,
            'remaining_balance', NULL,
            'is_sponsored', TRUE
        );
    END IF;

    -- 3. Calculate current dynamic balance from immutable ledger entries (Hard Invariant #7)
    SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
    FROM public.credit_ledgers
    WHERE user_id = p_applicant_id;

    IF v_current_balance < p_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
    END IF;

    -- 4. Insert immutable credit ledger entry (negative debit)
    v_ledger_id := gen_random_uuid();
    INSERT INTO public.credit_ledgers (id, user_id, amount, reason, actor_id, created_at)
    VALUES (
        v_ledger_id,
        p_applicant_id,
        -p_cost,
        'application_deduction',
        p_applicant_id::text,
        NOW()
    );

    -- 5. Audit log recording (Hard Invariant #6)
    INSERT INTO public.audit_logs (id, actor_id, action, meta, created_at)
    VALUES (
        gen_random_uuid(),
        p_applicant_id,
        'CREDIT_WALLET_DEDUCTED',
        jsonb_build_object(
            'job_id', p_job_id,
            'job_title', p_job_title,
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

REVOKE ALL ON FUNCTION public.deduct_application_credit_with_ledger(UUID, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_application_credit_with_ledger(UUID, UUID, TEXT, INT) TO service_role;
