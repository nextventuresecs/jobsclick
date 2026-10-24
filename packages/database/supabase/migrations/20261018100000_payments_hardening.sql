-- Migration: 20261018100000_payments_hardening.sql
-- Ticket: Payment Flow Hardening (WAL-03 Hardening)
-- Industry-grade Razorpay Payment lifecycle alignment and strict idempotency
-- Zero-Downtime Guard: Set short lock_timeout to prevent lock-queue starvation on payments table
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- 1. Ensure gateway columns exist
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_signature VARCHAR(255);

-- 2. Add audit and reconciliation metadata columns
ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS processed_by VARCHAR(100);

-- 3. Strict Check Constraint on payments.status matching official Razorpay Payment Status Lifecycle:
--    'created'    : Initial order attempt created on merchant platform
--    'authorized' : Customer authenticated & debited by bank, pending capture
--    'captured'   : Payment successfully settled and captured (funds confirmed)
--    'refunded'   : Captured funds refunded back to customer
--    'failed'     : Payment attempt failed / rejected by bank
--    Zero-Downtime Rule: Applied NOT VALID first to avoid ACCESS EXCLUSIVE full-table scan.
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

-- 4. Partial unique index to enforce strict idempotency and prevent double-application of gateway payments
-- Note: When applying outside transactional migration blocks, append CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_payment_id_idx 
    ON payments (gateway_payment_id) 
    WHERE gateway_payment_id IS NOT NULL;

-- 5. Harden RLS update policy on payments (Defense-in-depth)
-- Prevent regular users from tampering with processed_at, processed_by, or forcing 'captured' status via client-side Supabase updates
DROP POLICY IF EXISTS payments_update_policy ON payments;
CREATE POLICY payments_update_policy ON payments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );
