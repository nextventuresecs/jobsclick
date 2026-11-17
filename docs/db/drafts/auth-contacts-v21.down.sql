-- AUTH-01 M1 draft rollback: never delete contacts to restore NOT NULL.
BEGIN;
LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.users WHERE phone IS NULL)
    OR to_regclass('private_auth.auth_user_links') IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH_CONTACT_ROLLBACK_REQUIRES_FORWARD_RECOVERY';
  END IF;
END;
$$;
DROP TRIGGER users_reserve_emails_v21 ON public.users;
DROP FUNCTION private_auth.reserve_user_emails_v21();
DROP TABLE private_auth.email_reservations;
ALTER TABLE public.users DROP CONSTRAINT users_contact_required_v21;
ALTER TABLE public.users DROP CONSTRAINT users_email_canonical_v21;
ALTER TABLE public.users DROP CONSTRAINT users_pending_email_canonical_v21;
ALTER TABLE public.users ALTER COLUMN phone SET NOT NULL;
-- Keep private_auth: another reviewed slice may own objects in it.
COMMIT;
