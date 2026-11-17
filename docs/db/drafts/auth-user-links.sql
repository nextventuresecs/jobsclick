-- AUTH-01 slice 1: HUMAN-REVIEW DRAFT, not an applied migration.
-- Backend must authenticate the provider session before passing its subject.
-- No OTP dispatch, public signup, account activation, or existing-ID rewrite.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private_auth;
REVOKE ALL ON SCHEMA private_auth FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private_auth TO service_role;

CREATE TABLE private_auth.auth_user_links (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private_auth.auth_user_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_auth.auth_user_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private_auth.auth_user_links TO service_role;

-- SECURITY DEFINER is necessary: service_role cannot SELECT auth.users.
-- Non-exposed schema, no dynamic SQL, empty search_path, explicit EXECUTE grant.
CREATE FUNCTION private_auth.claim_invited_account(p_auth_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phone text;
  v_email text;
  v_user_id uuid;
  v_candidates uuid[];
BEGIN
  SELECT CASE WHEN a.phone_confirmed_at IS NOT NULL
      AND a.phone ~ '^\+?91[6-9][0-9]{9}$' THEN right(a.phone, 10) END,
    CASE WHEN a.email_confirmed_at IS NOT NULL THEN nullif(lower(btrim(a.email)), '') END
  INTO v_phone, v_email FROM auth.users a
  WHERE a.id = p_auth_user_id FOR UPDATE;
  IF v_phone IS NULL AND v_email IS NULL THEN RAISE EXCEPTION 'AUTH_VERIFIED_CONTACT_REQUIRED'; END IF;

  SELECT l.user_id INTO v_user_id FROM private_auth.auth_user_links l
  JOIN public.users u ON u.id = l.user_id
  WHERE l.auth_user_id = p_auth_user_id AND u.status <> 'disabled' FOR UPDATE OF u;
  IF v_user_id IS NOT NULL THEN RETURN v_user_id; END IF;

  SELECT array_agg(m.id) INTO v_candidates FROM (
    SELECT u.id FROM public.users u
    WHERE u.phone = v_phone OR lower(u.email) = v_email
    ORDER BY u.id FOR UPDATE
  ) m;
  IF cardinality(v_candidates) > 1 THEN RAISE EXCEPTION 'AUTH_IDENTITY_CONFLICT'; END IF;
  SELECT u.id INTO v_user_id FROM public.users u
  WHERE u.id = v_candidates[1] AND u.status = 'invited'
    AND u.role IN ('job_seeker', 'employer');
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_INVITE_NOT_CLAIMABLE'; END IF;

  INSERT INTO private_auth.auth_user_links(auth_user_id, user_id)
  VALUES (p_auth_user_id, v_user_id);
  RETURN v_user_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'AUTH_IDENTITY_CONFLICT';
END;
$$;
REVOKE ALL ON FUNCTION private_auth.claim_invited_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private_auth.claim_invited_account(uuid) TO service_role;
COMMIT;
