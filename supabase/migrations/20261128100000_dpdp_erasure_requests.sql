-- Migration: 20261128100000_dpdp_erasure_requests.sql
-- T1 DPDP right to erasure: persist requests and record resume PDF cleanup work.
-- NEEDS HUMAN REVIEW (DPDP + backfill insert derived from existing data).
--
-- Erasure anonymises; it never deletes public.users. payments/credit_ledgers/audit_logs
-- already reference users ON DELETE RESTRICT (20261110000003), so GST records (8 years)
-- survive with metadata scrubbed by anonymise_user.

-- ============================================================================
-- 1. Erasure requests (one open/done request per user; failed may be re-requested)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.privacy_erasure_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
    error_code text,
    requested_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS privacy_erasure_requests_one_active
    ON public.privacy_erasure_requests (user_id)
    WHERE status IN ('pending', 'processing', 'done');

ALTER TABLE public.privacy_erasure_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_erasure_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.privacy_erasure_requests TO service_role;
GRANT SELECT, INSERT ON public.privacy_erasure_requests TO jobsclick_api;
GRANT SELECT, UPDATE (status, error_code, processed_at, updated_at)
    ON public.privacy_erasure_requests TO jobsclick_worker;
GRANT EXECUTE ON FUNCTION public.anonymise_user(uuid) TO jobsclick_worker;

-- ============================================================================
-- 2. Resume PDF erasure work + invitation scrub (from docs/decisions/erasure-draft)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.resume_pdf_erasure (
    seeker_id uuid PRIMARY KEY,
    queued_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
ALTER TABLE public.resume_pdf_erasure ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resume_pdf_erasure FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE (completed_at) ON public.resume_pdf_erasure TO service_role, jobsclick_worker;

CREATE OR REPLACE FUNCTION public.record_erased_user_artifacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    original_email text := NULLIF(lower(regexp_replace(OLD.email, '^[[:space:]]+|[[:space:]]+$', '', 'g')), '');
BEGIN
    -- Keep the invitation row and satisfy its contact constraint with the erasure tombstone.
    -- The pending email is unverified and might belong to somebody else.
    UPDATE public.invitations
    SET phone = NEW.phone, email = NULL, status = 'anonymised'
    WHERE phone = OLD.phone
       OR (original_email IS NOT NULL
           AND lower(regexp_replace(email, '^[[:space:]]+|[[:space:]]+$', '', 'g')) = original_email);

    INSERT INTO public.resume_pdf_erasure (seeker_id)
    SELECT id FROM public.job_seeker_profiles WHERE user_id = NEW.id
    ON CONFLICT (seeker_id) DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_erased_user_artifacts() FROM PUBLIC, anon, authenticated, service_role;

-- anonymise_user sets this exact tombstone; ordinary disabling does not create cleanup work.
DROP TRIGGER IF EXISTS record_erased_user_artifacts ON public.users;
CREATE TRIGGER record_erased_user_artifacts
AFTER UPDATE OF phone ON public.users
FOR EACH ROW
WHEN (OLD.phone IS DISTINCT FROM NEW.phone
    AND NEW.status = 'disabled'
    AND NEW.phone = 'DEL_' || substr(md5(NEW.id::text), 1, 10))
EXECUTE FUNCTION public.record_erased_user_artifacts();

-- Older erasures still have a profile ID. Require both the tombstone and the audit event.
INSERT INTO public.resume_pdf_erasure (seeker_id)
SELECT profile.id
FROM public.job_seeker_profiles AS profile
JOIN public.users AS account ON account.id = profile.user_id
WHERE account.status = 'disabled'
  AND account.phone = 'DEL_' || substr(md5(account.id::text), 1, 10)
  AND EXISTS (
      SELECT 1 FROM public.audit_logs AS audit
      WHERE audit.actor_id = account.id AND audit.action = 'USER_ANONYMISED'
  )
ON CONFLICT (seeker_id) DO NOTHING;
