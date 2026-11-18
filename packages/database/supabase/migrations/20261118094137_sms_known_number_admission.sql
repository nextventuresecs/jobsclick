-- AUTH-01/03: narrow service-only presence lookup. Local draft; no hosted apply.
BEGIN;
CREATE FUNCTION public.rpc_sms_phone_is_known(p_phone text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(p_phone ~ '^[6-9][0-9]{9}$',false) AND EXISTS(
  SELECT 1 FROM public.users u WHERE u.phone=p_phone AND u.status IN ('invited','active')
   AND (u.status='invited' OR EXISTS(SELECT 1 FROM private_auth.auth_user_links l WHERE l.user_id=u.id))
 );
$$;
REVOKE ALL ON FUNCTION public.rpc_sms_phone_is_known(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_sms_phone_is_known(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
