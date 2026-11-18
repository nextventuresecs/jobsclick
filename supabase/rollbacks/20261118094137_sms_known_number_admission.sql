-- AUTH-01/03 manual rollback: missing lookup keeps hook admission closed.
BEGIN;
DROP FUNCTION public.rpc_sms_phone_is_known(text);
COMMIT;
