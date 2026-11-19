-- Migration: allow_email_first_users
-- Allows users to be created with email only (via Email OTP or Google OAuth) before phone linking.
BEGIN;

ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS check_phone_regex;

ALTER TABLE public.users ADD CONSTRAINT check_phone_regex
  CHECK (phone IS NULL OR (status = 'disabled'::user_status AND phone::text ~~ 'DEL_%'::text OR phone::text ~ '^[6-9][0-9]{9}$'::text));

ALTER TABLE public.users ADD CONSTRAINT check_contact_present
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

COMMIT;
