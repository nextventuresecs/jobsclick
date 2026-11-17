-- Manual rollback only; never remove the settlement path while receipts exist.
DO $$BEGIN IF EXISTS(SELECT 1 FROM private_payments.payment_grants) THEN RAISE EXCEPTION 'PAYMENT_ROLLBACK_REQUIRES_RECONCILIATION'; END IF; END$$;
DROP FUNCTION public.rpc_settle_payment(text,text,bigint,text,text,text,text);
DROP FUNCTION private_payments.settle_payment(text,text,bigint,text,text,text,text);
