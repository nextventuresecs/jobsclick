-- AUTH-01 v2.1 S3 draft, requires M1. Not applied to hosted databases.
-- Backend authenticates the subject; no caller-supplied verification/role.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private_auth;
REVOKE ALL ON SCHEMA private_auth FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private_auth TO service_role;
CREATE TABLE private_auth.auth_user_links (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  claim_method text NOT NULL CHECK(claim_method IN ('phone','email')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private_auth.auth_user_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_auth.auth_user_links FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON private_auth.auth_user_links TO service_role;

-- Internal helper is not executable by the backend role or through a wrapper.
CREATE FUNCTION private_auth.finish_invite_claim_v21(
  p_request_id uuid,p_actor uuid,p_code text,p_method text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_outcome text;
BEGIN
  IF p_request_id IS NULL OR p_code IS NULL OR p_method IS NULL
    OR p_code NOT IN ('AUTH_INVITE_CLAIMED','AUTH_INVITE_ALREADY_LINKED','AUTH_IDENTITY_CONFLICT',
      'AUTH_VERIFIED_CONTACT_REQUIRED','AUTH_PROVIDER_USER_INVALID','AUTH_INVITE_NOT_CLAIMABLE','AUTH_ACCOUNT_DISABLED')
    OR p_method NOT IN ('phone','email','unknown') THEN
    RAISE EXCEPTION 'AUTH_CLAIM_AUDIT_INVALID' USING ERRCODE='22023';
  END IF;
  v_outcome := CASE p_code WHEN 'AUTH_INVITE_CLAIMED' THEN 'success'
    WHEN 'AUTH_INVITE_ALREADY_LINKED' THEN 'retry' ELSE 'rejected' END;
  INSERT INTO public.audit_logs(actor_id,action,meta)
  VALUES(p_actor,'auth.invite_claim',jsonb_build_object(
    'request_id',p_request_id,'outcome',v_outcome,'reason',p_code,'claim_method',p_method));
  RETURN jsonb_build_object('outcome',v_outcome,'code',p_code)
    || CASE WHEN v_outcome IN ('success','retry') THEN jsonb_build_object('user_id',p_actor) ELSE '{}'::jsonb END;
END;
$$;
REVOKE ALL ON FUNCTION private_auth.finish_invite_claim_v21(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private_auth.claim_invited_account(p_auth_user_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_phone text; v_email text; v_current_phone text; v_current_email text;
  v_user_id uuid; v_candidates uuid[]; v_method text; v_status public.user_status;
BEGIN
  IF p_auth_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_CLAIM_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  -- Every post-lock query must obtain a fresh snapshot of Auth-managed proof.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'AUTH_CLAIM_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('auth-claim:' || p_auth_user_id::text,0));
  SELECT CASE WHEN a.phone_confirmed_at IS NOT NULL
      AND a.phone ~ '^\+?91[6-9][0-9]{9}$' THEN right(a.phone,10) END,
    CASE WHEN a.email_confirmed_at IS NOT NULL THEN nullif(lower(btrim(a.email)),'') END
    INTO v_phone,v_email FROM auth.users a WHERE a.id=p_auth_user_id
      AND a.deleted_at IS NULL AND NOT coalesce(a.is_anonymous,false)
      AND (a.banned_until IS NULL OR a.banned_until<=now())
      AND a.raw_app_meta_data->>'provider' IN ('phone','email','google');
  IF NOT FOUND THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_PROVIDER_USER_INVALID','unknown');
  END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_VERIFIED_CONTACT_REQUIRED','unknown');
  END IF;

  SELECT l.user_id,l.claim_method,u.status INTO v_user_id,v_method,v_status
    FROM private_auth.auth_user_links l JOIN public.users u ON u.id=l.user_id
    WHERE l.auth_user_id=p_auth_user_id FOR UPDATE OF u;
  IF v_user_id IS NULL THEN
    SELECT array_agg(m.id) INTO v_candidates FROM (
      SELECT u.id FROM public.users u WHERE u.phone=v_phone OR lower(u.email)=v_email
      ORDER BY u.id FOR UPDATE
    ) m;
  END IF;
  -- Auth can change while the application lock is awaited. Never lock its rows;
  -- re-read at READ COMMITTED and reject changed proof instead of claiming stale candidates.
  SELECT CASE WHEN a.phone_confirmed_at IS NOT NULL
      AND a.phone ~ '^\+?91[6-9][0-9]{9}$' THEN right(a.phone,10) END,
    CASE WHEN a.email_confirmed_at IS NOT NULL THEN nullif(lower(btrim(a.email)),'') END
    INTO v_current_phone,v_current_email FROM auth.users a WHERE a.id=p_auth_user_id
      AND a.deleted_at IS NULL AND NOT coalesce(a.is_anonymous,false)
      AND (a.banned_until IS NULL OR a.banned_until<=now())
      AND a.raw_app_meta_data->>'provider' IN ('phone','email','google');
  IF NOT FOUND THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_PROVIDER_USER_INVALID','unknown');
  END IF;
  IF v_current_phone IS NULL AND v_current_email IS NULL THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_VERIFIED_CONTACT_REQUIRED','unknown');
  END IF;
  IF v_phone IS DISTINCT FROM v_current_phone OR v_email IS DISTINCT FROM v_current_email THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_PROVIDER_USER_INVALID','unknown');
  END IF;
  IF v_user_id IS NOT NULL THEN
    IF v_status='disabled' THEN
      RETURN private_auth.finish_invite_claim_v21(p_request_id,v_user_id,'AUTH_ACCOUNT_DISABLED',v_method);
    END IF;
    RETURN private_auth.finish_invite_claim_v21(p_request_id,v_user_id,'AUTH_INVITE_ALREADY_LINKED',v_method);
  END IF;
  IF cardinality(v_candidates)>1 THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_IDENTITY_CONFLICT','unknown');
  END IF;
  SELECT u.id,CASE WHEN u.phone=v_phone THEN 'phone' ELSE 'email' END INTO v_user_id,v_method
    FROM public.users u WHERE u.id=v_candidates[1] AND u.status='invited'
      AND u.role IN ('job_seeker','employer');
  IF v_user_id IS NULL THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_INVITE_NOT_CLAIMABLE','unknown');
  END IF;
  BEGIN
    INSERT INTO private_auth.auth_user_links(auth_user_id,user_id,claim_method)
      VALUES(p_auth_user_id,v_user_id,v_method);
  EXCEPTION WHEN unique_violation THEN
    RETURN private_auth.finish_invite_claim_v21(p_request_id,NULL,'AUTH_IDENTITY_CONFLICT',v_method);
  END;
  -- An audit insertion failure aborts this statement and the new mapping.
  RETURN private_auth.finish_invite_claim_v21(p_request_id,v_user_id,'AUTH_INVITE_CLAIMED',v_method);
END;
$$;
REVOKE ALL ON FUNCTION private_auth.claim_invited_account(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private_auth.claim_invited_account(uuid,uuid) TO service_role;
CREATE FUNCTION public.rpc_claim_invited_account(p_auth_user_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private_auth.claim_invited_account(p_auth_user_id,p_request_id)
$$;
REVOKE ALL ON FUNCTION public.rpc_claim_invited_account(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_invited_account(uuid,uuid) TO service_role;
COMMIT;
