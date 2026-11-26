-- Human-review draft. Apply only as a reviewed forward migration.
CREATE TABLE public.resume_pdf_erasure (
    seeker_id uuid PRIMARY KEY,
    queued_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
ALTER TABLE public.resume_pdf_erasure ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resume_pdf_erasure FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE (completed_at) ON public.resume_pdf_erasure TO service_role;

CREATE FUNCTION public.record_erased_user_artifacts()
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

-- The existing service-role-only erasure RPC changes the user row to this tombstone.
-- Ordinary disabling does not generate cleanup work.
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
