-- AUTH-01 / BULK-02: v2.1 M1 draft; local tests only, not an applied migration.
-- Reuse existing uniqueness and the DEL_...-compatible phone check.
-- Consumers must support missing phones before email-only import is enabled.
BEGIN;
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.users ADD CONSTRAINT users_contact_required_v21
  CHECK (phone IS NOT NULL OR email IS NOT NULL);
ALTER TABLE public.users ADD CONSTRAINT users_email_canonical_v21
  CHECK (email IS NULL OR (email = lower(btrim(email)) AND length(email) <= 254
    AND email !~ '[[:cntrl:][:space:]]' AND email ~ '^[^@]+@[^@]+[.][^@]+$'));
ALTER TABLE public.users ADD CONSTRAINT users_pending_email_canonical_v21
  CHECK (pending_email IS NULL OR (pending_email = lower(btrim(pending_email)) AND length(pending_email) <= 254
    AND pending_email !~ '[[:cntrl:][:space:]]' AND pending_email ~ '^[^@]+@[^@]+[.][^@]+$'));

-- Two independent unique indexes do not prevent cross-column races. This
-- private constraint table reserves both confirmed and pending contacts.
CREATE SCHEMA IF NOT EXISTS private_auth;
REVOKE ALL ON SCHEMA private_auth FROM PUBLIC, anon, authenticated;
CREATE TABLE private_auth.email_reservations (
  email text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE INDEX email_reservations_user_id ON private_auth.email_reservations(user_id);
ALTER TABLE private_auth.email_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_auth.email_reservations FROM PUBLIC, anon, authenticated, service_role;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT email, id FROM public.users WHERE email IS NOT NULL
      UNION SELECT pending_email, id FROM public.users WHERE pending_email IS NOT NULL
    ) contacts GROUP BY email HAVING count(DISTINCT id) > 1
  ) THEN RAISE EXCEPTION 'AUTH_EMAIL_RECONCILIATION_REQUIRED'; END IF;
END;
$$;
INSERT INTO private_auth.email_reservations(email,user_id)
SELECT email,id FROM public.users WHERE email IS NOT NULL
UNION SELECT pending_email,id FROM public.users WHERE pending_email IS NOT NULL;

CREATE FUNCTION private_auth.reserve_user_emails_v21()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text; v_holder uuid;
BEGIN
  FOR v_email IN SELECT DISTINCT e FROM unnest(ARRAY[NEW.email,NEW.pending_email]) e
    WHERE e IS NOT NULL ORDER BY e
  LOOP
    INSERT INTO private_auth.email_reservations(email,user_id) VALUES(v_email,NEW.id)
    ON CONFLICT(email) DO UPDATE SET user_id=EXCLUDED.user_id
      WHERE private_auth.email_reservations.user_id=EXCLUDED.user_id
    RETURNING user_id INTO v_holder;
    IF v_holder IS NULL THEN RAISE EXCEPTION 'AUTH_EMAIL_IN_USE' USING ERRCODE='23505'; END IF;
  END LOOP;
  DELETE FROM private_auth.email_reservations r WHERE r.user_id=NEW.id
    AND r.email NOT IN (SELECT e FROM unnest(ARRAY[NEW.email,NEW.pending_email]) e WHERE e IS NOT NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private_auth.reserve_user_emails_v21() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER users_reserve_emails_v21 AFTER INSERT OR UPDATE OF email,pending_email
  ON public.users FOR EACH ROW EXECUTE FUNCTION private_auth.reserve_user_emails_v21();
COMMIT;
