-- Migration: 20261016000001_remediate_rls_enabled_no_policy.sql
-- Fixes Supabase Security Linter: 0008_rls_enabled_no_policy
-- Tables remediated:
-- 1. bulk_import_batches
-- 2. invite_waves
-- 3. invitations
-- 4. credit_ledgers
-- 5. payments
-- 6. location_nodes
-- 7. search_logs
-- 8. tasks

-- ============================================================================
-- 1. bulk_import_batches
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY bulk_import_batches_select_policy ON bulk_import_batches
        FOR SELECT USING (
            created_by = auth.uid()
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY bulk_import_batches_insert_policy ON bulk_import_batches
        FOR INSERT WITH CHECK (
            auth.uid() = created_by
            OR created_by IS NULL
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY bulk_import_batches_update_policy ON bulk_import_batches
        FOR UPDATE USING (
            created_by = auth.uid()
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 2. invite_waves
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY invite_waves_select_policy ON invite_waves
        FOR SELECT USING (
            created_by = auth.uid()
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY invite_waves_insert_policy ON invite_waves
        FOR INSERT WITH CHECK (
            auth.uid() = created_by
            OR created_by IS NULL
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY invite_waves_update_policy ON invite_waves
        FOR UPDATE USING (
            created_by = auth.uid()
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 3. invitations
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY invitations_select_policy ON invitations
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM bulk_import_batches b
                WHERE b.id = invitations.batch_id
                AND (
                    b.created_by = auth.uid()
                    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
                )
            )
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY invitations_insert_policy ON invitations
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1 FROM bulk_import_batches b
                WHERE b.id = invitations.batch_id
                AND (
                    b.created_by = auth.uid()
                    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
                )
            )
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 4. credit_ledgers (P2 MVP stub: append-only ledger)
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY credit_ledgers_select_policy ON credit_ledgers
        FOR SELECT USING (
            auth.uid() = user_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY credit_ledgers_insert_policy ON credit_ledgers
        FOR INSERT WITH CHECK (
            auth.uid() = user_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 5. payments (P2 MVP stub: payment orders & history)
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY payments_select_policy ON payments
        FOR SELECT USING (
            auth.uid() = user_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY payments_insert_policy ON payments
        FOR INSERT WITH CHECK (
            auth.uid() = user_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY payments_update_policy ON payments
        FOR UPDATE USING (
            auth.uid() = user_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 6. location_nodes (P2/P3 table: geographical radius clustering)
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY location_nodes_public_select_policy ON location_nodes
        FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY location_nodes_manage_policy ON location_nodes
        FOR ALL USING (
            auth.uid() = entity_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 7. search_logs (P2/P3 table: candidate & job search queries)
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY search_logs_insert_policy ON search_logs
        FOR INSERT WITH CHECK (
            auth.uid() = user_id
            OR user_id IS NULL
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY search_logs_select_policy ON search_logs
        FOR SELECT USING (
            auth.uid() = user_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 8. tasks (P2/P3 table: micro-tasks & gigs)
-- ============================================================================
DO $$ BEGIN
    CREATE POLICY tasks_public_select_policy ON tasks
        FOR SELECT USING (
            status = 'posted'
            OR poster_id = auth.uid()
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY tasks_poster_manage_policy ON tasks
        FOR ALL USING (
            auth.uid() = poster_id
            OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION WHEN duplicate_object THEN null; END $$;
