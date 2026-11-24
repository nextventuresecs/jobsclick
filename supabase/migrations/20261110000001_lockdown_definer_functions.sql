-- Migration: 20261110000001_lockdown_definer_functions.sql
-- Phase 1.2 DB Hardening: Complete lockdown of all SECURITY DEFINER functions
-- Hard Invariants: #1 (Zero PII leakage), #5 (Dual-layer authorization, service_role execution)

-- ============================================================================
-- 1. Recreate increment_token_version without leaking user PII
-- ============================================================================
DROP FUNCTION IF EXISTS public.increment_token_version(uuid);

CREATE OR REPLACE FUNCTION public.increment_token_version(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  token_version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED' USING ERRCODE = 'P0004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE users.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  UPDATE public.users
  SET token_version = users.token_version + 1,
      updated_at = NOW()
  WHERE users.id = p_user_id
  RETURNING users.id, users.token_version;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_token_version(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_token_version(uuid) TO service_role;

-- ============================================================================
-- 2. Harden get_district_employment_reports (search_path + permissions)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_district_employment_reports()
RETURNS TABLE (
    district VARCHAR,
    onboarded_msmes BIGINT,
    active_jobs BIGINT,
    total_hires BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH all_districts AS (
        SELECT DISTINCT district FROM public.business_profiles WHERE district IS NOT NULL AND district <> ''
        UNION
        SELECT DISTINCT district FROM public.jobs WHERE district IS NOT NULL AND district <> ''
    ),
    msme_counts AS (
        SELECT 
            bp.district, 
            COUNT(DISTINCT bp.id) AS onboarded_msmes
        FROM public.business_profiles bp
        WHERE bp.district IS NOT NULL AND bp.district <> ''
        GROUP BY bp.district
    ),
    job_counts AS (
        SELECT 
            j.district,
            COUNT(DISTINCT j.id) AS active_jobs
        FROM public.jobs j
        WHERE j.is_active = TRUE AND j.district IS NOT NULL AND j.district <> ''
        GROUP BY j.district
    ),
    hire_counts AS (
        SELECT 
            j.district,
            COUNT(DISTINCT a.id) AS total_hires
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
        WHERE a.status = 'hired' AND j.district IS NOT NULL AND j.district <> ''
        GROUP BY j.district
    )
    SELECT 
        d.district,
        COALESCE(m.onboarded_msmes, 0)::BIGINT AS onboarded_msmes,
        COALESCE(jc.active_jobs, 0)::BIGINT AS active_jobs,
        COALESCE(h.total_hires, 0)::BIGINT AS total_hires
    FROM all_districts d
    LEFT JOIN msme_counts m ON m.district = d.district
    LEFT JOIN job_counts jc ON jc.district = d.district
    LEFT JOIN hire_counts h ON h.district = d.district
    ORDER BY d.district ASC;
$$;

REVOKE ALL ON FUNCTION public.get_district_employment_reports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_district_employment_reports() TO service_role;

-- ============================================================================
-- 3. Harden promote_job_with_ledger with input validation & strict permissions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.promote_job_with_ledger(
    p_user_id UUID,
    p_job_id UUID,
    p_duration_days INT,
    p_cost INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance INT;
    v_current_expiry TIMESTAMPTZ;
    v_new_expiry TIMESTAMPTZ;
    v_ledger_id UUID;
    v_job_employer_id UUID;
    v_user_role TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'USER_ID_REQUIRED' USING ERRCODE = 'P0004';
    END IF;

    IF p_job_id IS NULL THEN
        RAISE EXCEPTION 'JOB_ID_REQUIRED' USING ERRCODE = 'P0004';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- 1. Advisory transaction-scoped lock on user wallet to eliminate TOCTOU balance races
    PERFORM pg_advisory_xact_lock(hashtext('wallet_' || p_user_id::text));

    -- 2. Lock and retrieve the job record to serialize promotion requests
    SELECT employer_id, featured_until INTO v_job_employer_id, v_current_expiry
    FROM public.jobs
    WHERE id = p_job_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Verify ownership unless admin/msme_admin
    SELECT role INTO v_user_role FROM public.users WHERE id = p_user_id;
    IF v_job_employer_id <> p_user_id AND (v_user_role IS NULL OR v_user_role NOT IN ('admin', 'msme_admin')) THEN
        RAISE EXCEPTION 'FORBIDDEN_PROMOTION' USING ERRCODE = 'P0003';
    END IF;

    -- 3. Calculate current dynamic balance from immutable ledger entries (Hard Invariant #7)
    SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
    FROM public.credit_ledgers
    WHERE user_id = p_user_id;

    IF v_current_balance < p_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
    END IF;

    -- 4. Calculate monotonic expiry date
    IF v_current_expiry IS NOT NULL AND v_current_expiry > NOW() THEN
        v_new_expiry := v_current_expiry + (p_duration_days || ' days')::INTERVAL;
    ELSE
        v_new_expiry := NOW() + (p_duration_days || ' days')::INTERVAL;
    END IF;

    -- 5. Atomic state mutation: update job promotion status
    UPDATE public.jobs
    SET is_featured = TRUE,
        featured_until = v_new_expiry,
        updated_at = NOW()
    WHERE id = p_job_id;

    -- 6. Insert immutable credit ledger entry (negative debit)
    v_ledger_id := gen_random_uuid();
    INSERT INTO public.credit_ledgers (id, user_id, amount, reason, actor_id, created_at)
    VALUES (
        v_ledger_id,
        p_user_id,
        -p_cost,
        'job_promotion',
        p_user_id::text,
        NOW()
    );

    -- 7. Audit log recording (Hard Invariant #6)
    INSERT INTO public.audit_logs (id, actor_id, action, meta, created_at)
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

REVOKE ALL ON FUNCTION public.promote_job_with_ledger(UUID, UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_job_with_ledger(UUID, UUID, INT, INT) TO service_role;

-- ============================================================================
-- 4. Harden deduct_application_credit_with_ledger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deduct_application_credit_with_ledger(
    p_applicant_id UUID,
    p_job_id UUID,
    p_job_title TEXT,
    p_cost INT DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    SELECT COALESCE(is_sponsored, FALSE) INTO v_is_sponsored
    FROM public.job_seeker_profiles
    WHERE user_id = p_applicant_id;

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

-- ============================================================================
-- 5. Harden unlock_contact_with_ledger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.unlock_contact_with_ledger(
    p_employer_id UUID,
    p_seeker_id UUID,
    p_cost INT DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance INT;
    v_ledger_id UUID;
BEGIN
    IF p_employer_id IS NULL THEN
        RAISE EXCEPTION 'EMPLOYER_ID_REQUIRED' USING ERRCODE = 'P0004';
    END IF;

    IF p_seeker_id IS NULL THEN
        RAISE EXCEPTION 'SEEKER_ID_REQUIRED' USING ERRCODE = 'P0004';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_employer_id) THEN
        RAISE EXCEPTION 'EMPLOYER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- 1. Advisory transaction-scoped lock on employer wallet to serialize debits
    PERFORM pg_advisory_xact_lock(hashtext('wallet_' || p_employer_id::text));

    -- 2. Calculate current dynamic balance from immutable ledger entries (Hard Invariant #7)
    SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
    FROM public.credit_ledgers
    WHERE user_id = p_employer_id;

    IF v_current_balance < p_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
    END IF;

    -- 3. Insert immutable credit ledger entry (negative debit)
    v_ledger_id := gen_random_uuid();
    INSERT INTO public.credit_ledgers (id, user_id, amount, reason, actor_id, created_at)
    VALUES (
        v_ledger_id,
        p_employer_id,
        -p_cost,
        'contact_unlock',
        p_employer_id::text,
        NOW()
    );

    -- 4. Audit log recording (Hard Invariant #6)
    INSERT INTO public.audit_logs (id, actor_id, action, meta, created_at)
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

REVOKE ALL ON FUNCTION public.unlock_contact_with_ledger(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_contact_with_ledger(UUID, UUID, INT) TO service_role;

-- ============================================================================
-- 6. Harden get_user_credit_balance (guard against NULL & revoke from authenticated)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_credit_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'balance', COALESCE(SUM(amount), 0),
        'credits_added', COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
        'credits_used', COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)
    )
    FROM public.credit_ledgers
    WHERE user_id = p_user_id AND p_user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_user_credit_balance(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_credit_balance(UUID) TO service_role;

-- ============================================================================
-- 7. Harden grant_starter_credits & trigger functions
-- ============================================================================
ALTER FUNCTION public.grant_starter_credits(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.grant_starter_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_starter_credits(uuid) TO service_role;

ALTER FUNCTION public.trigger_auto_bump_token_version() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.trigger_auto_bump_token_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_auto_bump_token_version() TO service_role;

ALTER FUNCTION public.trigger_auto_grant_starter_credits() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.trigger_auto_grant_starter_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_auto_grant_starter_credits() TO service_role;

-- ============================================================================
-- 8. Pin search_path on remaining functions
-- ============================================================================
ALTER FUNCTION public.jobs_update_fts() SET search_path = public, pg_temp;
ALTER FUNCTION public.search_jobs(text, text, text, numeric, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_alert_delivery_modification() SET search_path = '';
ALTER FUNCTION public.prevent_audit_log_modification() SET search_path = '';
ALTER FUNCTION public.prevent_credit_ledger_modification() SET search_path = '';
