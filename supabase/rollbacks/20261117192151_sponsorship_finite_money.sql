-- Manual security rollback requires review; never automatically reopen invalid-money admission.
DO $$BEGIN RAISE EXCEPTION 'PAYMENT_SECURITY_ROLLBACK_REQUIRES_REVIEW'; END$$;
