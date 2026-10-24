-- Migration: 20261017100000_payments_and_invoicing.sql
-- Ticket T-16: Razorpay Payment Gateway & Invoicing (WAL-03, Section 8.7.1)
-- Zero-Downtime Guard: Short lock_timeout prevents lock-queue starvation on payments table
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- 1. Extend payments table columns for gateway reference, GST tax breakdown, and invoices
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_signature VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pack_id VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS credits_added INT NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tax_amount_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'INR';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Indexes for fast payment and order lookup
CREATE INDEX IF NOT EXISTS idx_payments_user_id_created 
    ON payments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_gateway_order_id 
    ON payments (gateway_order_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_number 
    ON payments (invoice_number) WHERE invoice_number IS NOT NULL;

-- 3. Enable Row-Level Security
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies:
-- Users can view only their own payments
DROP POLICY IF EXISTS payments_own_select_policy ON payments;
CREATE POLICY payments_own_select_policy ON payments
    FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all payment records
DROP POLICY IF EXISTS payments_admin_select_policy ON payments;
CREATE POLICY payments_admin_select_policy ON payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Payment rows can be inserted by the authenticated user or admin
DROP POLICY IF EXISTS payments_insert_policy ON payments;
CREATE POLICY payments_insert_policy ON payments
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Payment status updates (e.g. captured/completed) restricted to owner or admin
DROP POLICY IF EXISTS payments_update_policy ON payments;
CREATE POLICY payments_update_policy ON payments
    FOR UPDATE USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );
