-- Migration: 20261025300000_alert_deliveries_and_job_alerts_rls.sql
-- Ticket T-21: Row-Level Security & Ledger Immutability Hardening for Job Alerts & Deliveries (JOB-05, JOB-06)
-- Compliance: Hard Invariants #5 (RLS second lock), #6 (Immutable audit & ledger history)

-- 1. Hard Invariant #6: Delivery history is strictly append-only (Prevent UPDATE and DELETE)
CREATE OR REPLACE FUNCTION public.prevent_alert_delivery_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Alert delivery entries are immutable deduplication logs and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS alert_delivery_immutable_update_trigger ON alert_deliveries;
CREATE TRIGGER alert_delivery_immutable_update_trigger
    BEFORE UPDATE ON alert_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.prevent_alert_delivery_modification();

DROP TRIGGER IF EXISTS alert_delivery_immutable_delete_trigger ON alert_deliveries;
CREATE TRIGGER alert_delivery_immutable_delete_trigger
    BEFORE DELETE ON alert_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.prevent_alert_delivery_modification();

-- 2. Hard Invariant #5: Alert Deliveries RLS Hardening
-- Allow users to view their own alert deliveries, and admins to view all
DROP POLICY IF EXISTS alert_deliveries_select_policy ON alert_deliveries;
CREATE POLICY alert_deliveries_select_policy ON alert_deliveries
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );

-- Allow users to insert alert deliveries for themselves, or allow platform admins/service workers
DROP POLICY IF EXISTS alert_deliveries_insert_policy ON alert_deliveries;
CREATE POLICY alert_deliveries_insert_policy ON alert_deliveries
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );

-- 3. Hard Invariant #5: Explicit Job Alerts Policy Segmentation
-- Separate job_alerts policies for clarity, least-privilege scoping, and tenant isolation
DROP POLICY IF EXISTS job_alerts_owner_policy ON job_alerts;

-- Users and admins can view job alerts
CREATE POLICY job_alerts_select_policy ON job_alerts
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );

-- Users can only insert alerts for their own user_id; admins can insert for anyone
CREATE POLICY job_alerts_insert_policy ON job_alerts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );

-- Users can only update their own alerts; cannot change alert ownership to another user
CREATE POLICY job_alerts_update_policy ON job_alerts
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );

-- Users can only delete their own alerts
CREATE POLICY job_alerts_delete_policy ON job_alerts
    FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );
