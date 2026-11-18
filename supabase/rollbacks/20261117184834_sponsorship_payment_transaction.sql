-- Manual rollback only, in reverse migration order. Never erase consumed payment evidence.
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM private_payments.payment_grants) THEN RAISE EXCEPTION 'PAYMENT_ROLLBACK_REQUIRES_RECONCILIATION'; END IF;
END$$;
DROP FUNCTION public.rpc_activate_sponsorship(uuid,uuid,text,text,integer,boolean);
DROP FUNCTION private_payments.activate_sponsorship(uuid,uuid,text,text,integer,boolean);
DROP TABLE private_payments.payment_grants;
DROP FUNCTION private_payments.immutable_grant();
DROP SCHEMA private_payments;
