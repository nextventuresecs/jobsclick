-- AUTH-01 S3 draft rollback; preserve audits and refuse populated mappings.
BEGIN;
LOCK TABLE private_auth.auth_user_links IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM private_auth.auth_user_links) THEN
    RAISE EXCEPTION 'AUTH_IDENTITY_ROLLBACK_REQUIRES_FORWARD_RECOVERY';
  END IF;
END;
$$;
DROP FUNCTION public.rpc_claim_invited_account(uuid,uuid);
DROP FUNCTION private_auth.claim_invited_account(uuid,uuid);
DROP FUNCTION private_auth.finish_invite_claim_v21(uuid,uuid,text,text);
DROP TABLE private_auth.auth_user_links;
-- Do not drop private_auth (M1 owns email_reservations) or audit rows.
COMMIT;
