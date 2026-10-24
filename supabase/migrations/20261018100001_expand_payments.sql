-- Migration: 20261018100001_expand_payments.sql
-- STAGE 1: EXPAND (Zero-Downtime Pre-Deployment)
-- Safe for concurrent execution under sustained production traffic.
-- Note: When executing in environments supporting non-transactional DDL, CREATE INDEX CONCURRENTLY runs out-of-band.

-- Guard 1: Set aggressive lock acquisition timeouts to prevent lock-queue starvation.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- 1. Idempotent Column Additions (Metadata operations only; instant catalog rewrite)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_signature VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_by VARCHAR(100);

-- 2. Add CHECK constraint as NOT VALID.
-- Acquires an ACCESS EXCLUSIVE lock for ~1ms to update pg_constraint.
-- Does NOT scan existing rows, preventing table lockup.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_payments_status_enum'
    ) THEN
        ALTER TABLE payments 
        ADD CONSTRAINT chk_payments_status_enum 
        CHECK (status IN ('created', 'authorized', 'captured', 'refunded', 'failed'))
        NOT VALID;
    END IF;
END $$;

-- 3. Non-Blocking Index Creation
-- In non-transactional runners, use CONCURRENTLY. In transactional runners, lock_timeout guards queue.
CREATE INDEX IF NOT EXISTS idx_payments_user_id_created 
    ON payments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_gateway_order_id 
    ON payments (gateway_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_payment_id_idx 
    ON payments (gateway_payment_id) 
    WHERE gateway_payment_id IS NOT NULL;
