-- Migration: 20261025000000_featured_jobs_and_search_alerts.sql
-- Ticket T-21: Featured Job Promotions & Search Alerts (PRD JOB-05, JOB-06)
-- Compliance: Hard Invariants #1 (Zero PII), #5 (RLS second lock), #6 (Immutable audit logs), #7 (Ledger derived balance)

-- 1. Alter Jobs Table for Promoted / Featured Listings
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

-- 2. Job Search Alerts Table (Saved Search Preferences)
CREATE TABLE IF NOT EXISTS job_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    frequency VARCHAR(20) NOT NULL DEFAULT 'daily'
        CHECK (frequency IN ('daily', 'weekly')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Alert Delivery Deduplication Ledger
CREATE TABLE IF NOT EXISTS alert_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES job_alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_job_alert UNIQUE (user_id, job_id)
);

-- 4. Indexes for Query Performance & Relevance
CREATE INDEX IF NOT EXISTS idx_jobs_search_promoted 
    ON jobs (is_active, is_featured, featured_until, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_alerts_user_active 
    ON job_alerts (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_lookup 
    ON alert_deliveries (user_id, job_id);

-- 5. Row-Level Security Policies (Hard Invariant #5: RLS second lock)
ALTER TABLE job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;

-- Job Alerts RLS Policies
CREATE POLICY job_alerts_owner_policy ON job_alerts
    FOR ALL
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

-- Alert Deliveries RLS Policies
CREATE POLICY alert_deliveries_owner_policy ON alert_deliveries
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );
