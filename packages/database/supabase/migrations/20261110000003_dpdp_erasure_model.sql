-- Migration: 20261110000003_dpdp_erasure_model.sql
-- Phase 1.2 DB Hardening: DPDP Digital Personal Data Protection Act - Right to Erasure Model
-- Hard Invariants: #1 (Zero PII retention), #6 (Immutable audit log), #7 (Immutable credit ledger)

-- ============================================================================
-- 1. Prevent Cascade / Set Null deletions on immutable tables
-- ============================================================================
-- Hard DELETE on users is prohibited by converting FKs to ON DELETE RESTRICT.
-- User erasure must occur via the anonymise_user procedure.

ALTER TABLE public.credit_ledgers 
    DROP CONSTRAINT IF EXISTS credit_ledgers_user_id_fkey;

ALTER TABLE public.credit_ledgers 
    ADD CONSTRAINT credit_ledgers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.audit_logs 
    DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;

ALTER TABLE public.audit_logs 
    ADD CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.payments 
    DROP CONSTRAINT IF EXISTS payments_user_id_fkey;

ALTER TABLE public.payments 
    ADD CONSTRAINT payments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ============================================================================
-- 2. Update users.phone constraint to allow tombstone identifiers upon erasure
-- ============================================================================
ALTER TABLE public.users 
    DROP CONSTRAINT IF EXISTS check_phone_regex;

ALTER TABLE public.users 
    ADD CONSTRAINT check_phone_regex 
    CHECK ((status = 'disabled' AND phone LIKE 'DEL_%') OR phone ~ '^[6-9][0-9]{9}$');

-- ============================================================================
-- 3. Stored Procedure: anonymise_user (DPDP Section 12 Right to Erasure)
-- ============================================================================
-- Irreversibly scrubs all personal identifiers (PII) from user and profile records,
-- sets status to disabled, revokes active sessions via token_version, and records an
-- immutable audit record. Credit history and system audit integrity remain intact.

CREATE OR REPLACE FUNCTION public.anonymise_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orig_phone VARCHAR(15);
    v_tombstone_phone VARCHAR(15);
    v_new_token_version INT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'USER_ID_REQUIRED' USING ERRCODE = 'P0004';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Capture original phone for secondary table scrubbing
    SELECT phone INTO v_orig_phone FROM public.users WHERE id = p_user_id;

    -- Generate a unique 14-character tombstone phone (DEL_ + 10-char hash)
    v_tombstone_phone := 'DEL_' || substr(md5(p_user_id::text), 1, 10);

    -- 1. Anonymize user record and invalidate all sessions
    UPDATE public.users
    SET phone = v_tombstone_phone,
        email = NULL,
        pending_email = NULL,
        email_verified_at = NULL,
        status = 'disabled',
        token_version = token_version + 1,
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING token_version INTO v_new_token_version;

    -- 2. Scrub Job Seeker Profile PII if exists
    UPDATE public.job_seeker_profiles
    SET full_name = 'Deleted User',
        photo_url = NULL,
        apaar_id = NULL,
        aadhaar_last_four = NULL,
        aadhaar_verified = FALSE,
        gender = NULL,
        dob = NULL,
        dpdp_consent_given = FALSE,
        skills = '{}',
        preferred_categories = '{}',
        city = NULL,
        district = NULL,
        state = NULL,
        pincode = NULL,
        qualification = NULL,
        institution = NULL,
        graduation_year = NULL,
        experience_years = 0,
        "current_role" = NULL,
        languages = '{}',
        preferred_locations = '{}',
        willing_to_relocate = FALSE,
        bio = NULL,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 3. Scrub Business Profile PII if exists
    UPDATE public.business_profiles
    SET company_name = 'Deleted Entity',
        address = NULL,
        phone = NULL,
        email = NULL,
        website = NULL,
        founder_or_director = NULL,
        director_photo_url = NULL,
        designation = NULL,
        know_my_business = NULL,
        products_brief = NULL,
        services_brief = NULL,
        social_media = '{}'::jsonb,
        udyam_number = NULL,
        dpiit_number = NULL,
        logo_url = NULL,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 4. Scrub Institution Profile PII if exists
    UPDATE public.institution_profiles
    SET principal_name = NULL,
        contact_person = NULL,
        contact_designation = NULL,
        contact_email = NULL,
        contact_phone = NULL,
        website = NULL,
        address = NULL,
        affiliation_code = NULL,
        placement_brochure_url = NULL,
        about = NULL,
        cms_data = '{}'::jsonb,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 5. Scrub placement pipeline offer details & personal notes (NIRF statistical retention basis)
    UPDATE public.placement_applications
    SET offer_letter_url = NULL,
        offer_package = NULL,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE student_id IN (SELECT id FROM public.job_seeker_profiles WHERE user_id = p_user_id);

    -- 6. Scrub broadcast deliveries recipient phone mask (TRAI DLT delivery record retention basis)
    UPDATE public.broadcast_deliveries
    SET phone_masked = 'DEL_REDACTED',
        gateway_message_id = NULL,
        updated_at = NOW()
    WHERE business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = p_user_id);

    -- 7. Scrub metadata from payments while preserving tax invoice & payment integrity (GST Act Sec 36)
    UPDATE public.payments
    SET metadata = '{}'::jsonb
    WHERE user_id = p_user_id;

    -- 8. Scrub linked invitations
    IF v_orig_phone IS NOT NULL THEN
        UPDATE public.invitations
        SET phone = v_tombstone_phone,
            status = 'anonymised'
        WHERE phone = v_orig_phone;

        -- 9. Scrub linked institution inquiries
        UPDATE public.institution_inquiries
        SET student_name = 'Deleted Applicant',
            student_phone = v_tombstone_phone,
            student_email = NULL,
            message = '[REDACTED PURSUANT TO DPDP ERASURE]'
        WHERE student_phone = v_orig_phone;
    END IF;

    -- 10. Disassociate search history and deactivate job alerts
    UPDATE public.search_logs
    SET user_id = NULL
    WHERE user_id = p_user_id;

    UPDATE public.job_alerts
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 11. Record immutable erasure audit entry (Hard Invariant #6)
    INSERT INTO public.audit_logs (id, actor_id, action, meta, created_at)
    VALUES (
        gen_random_uuid(),
        p_user_id,
        'USER_ANONYMISED',
        jsonb_build_object(
            'reason', 'DPDP_RIGHT_TO_ERASURE',
            'anonymised_at', NOW()
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_user_id,
        'status', 'disabled',
        'token_version', v_new_token_version,
        'anonymised_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.anonymise_user(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymise_user(UUID) TO service_role;
