-- Migration: 20261018100002_contract_payments.sql
-- STAGE 3: CONTRACT (Post-Deployment Validation)
-- Validates historical rows without blocking concurrent DML.
-- Executed after all application instances (API + Worker) have deployed version N.

SET LOCAL lock_timeout = '5s';
-- Validation requires a sequential scan; do not throttle statement_timeout too low.
SET LOCAL statement_timeout = '10min';

-- VALIDATE CONSTRAINT acquires only a SHARE UPDATE EXCLUSIVE lock.
-- Concurrently running SELECT, INSERT, UPDATE, and DELETE operations continue unobstructed.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_payments_status_enum' 
          AND convalidated = false
    ) THEN
        ALTER TABLE payments VALIDATE CONSTRAINT chk_payments_status_enum;
    END IF;
END $$;
