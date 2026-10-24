-- Migration: 20261024000000_msme_broadcast_and_district_reports.sql
-- Ticket T-20: MSME Department Broadcast Engine & District Employment Reports (PRD MSME-03, MSME-04)
-- Compliance: Hard Invariants #1 (Zero PII), #4 (OTP/SMS controls), #5 (RLS second lock), #6 (Immutable audit logs)

-- 1. Broadcast Campaigns Table
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    dlt_template_id VARCHAR(100) NOT NULL,
    target_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    recipient_count INT NOT NULL CHECK (recipient_count >= 0),
    segment_count INT NOT NULL DEFAULT 1 CHECK (segment_count >= 1),
    estimated_cost_paise BIGINT NOT NULL CHECK (estimated_cost_paise >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    confirmation_token VARCHAR(150),
    audience_digest VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Broadcast Individual Deliveries Table
CREATE TABLE IF NOT EXISTS broadcast_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
    business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    phone_masked VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed')),
    gateway_message_id VARCHAR(100),
    idempotency_key VARCHAR(150) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_created_by 
    ON broadcast_campaigns (created_by);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status 
    ON broadcast_campaigns (status);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_confirmation_token
    ON broadcast_campaigns (confirmation_token);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_campaign_id 
    ON broadcast_deliveries (campaign_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_status 
    ON broadcast_deliveries (status);

CREATE INDEX IF NOT EXISTS idx_business_profiles_district_sector_size 
    ON business_profiles (district, sector, company_size);

CREATE INDEX IF NOT EXISTS idx_applications_status_created 
    ON applications (status, created_at);

-- 4. Row-Level Security Policies (Hard Invariant #5: RLS second lock)
ALTER TABLE broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY broadcast_campaigns_admin_policy ON broadcast_campaigns
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );

CREATE POLICY broadcast_deliveries_admin_policy ON broadcast_deliveries
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );

-- 5. Secure Aggregate Function for District Employment Reports (Hard Invariant #1 & PRD Decision D12: Zero PII Leakage)
CREATE OR REPLACE FUNCTION get_district_employment_reports()
RETURNS TABLE (
    district VARCHAR,
    onboarded_msmes BIGINT,
    active_jobs BIGINT,
    total_hires BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    WITH all_districts AS (
        SELECT DISTINCT district FROM business_profiles WHERE district IS NOT NULL AND district <> ''
        UNION
        SELECT DISTINCT district FROM jobs WHERE district IS NOT NULL AND district <> ''
    ),
    msme_counts AS (
        SELECT 
            bp.district, 
            COUNT(DISTINCT bp.id) AS onboarded_msmes
        FROM business_profiles bp
        WHERE bp.district IS NOT NULL AND bp.district <> ''
        GROUP BY bp.district
    ),
    job_counts AS (
        SELECT 
            j.district,
            COUNT(DISTINCT j.id) AS active_jobs
        FROM jobs j
        WHERE j.is_active = TRUE AND j.district IS NOT NULL AND j.district <> ''
        GROUP BY j.district
    ),
    hire_counts AS (
        SELECT 
            j.district,
            COUNT(DISTINCT a.id) AS total_hires
        FROM applications a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.status = 'hired' AND j.district IS NOT NULL AND j.district <> ''
        GROUP BY j.district
    )
    SELECT 
        d.district,
        COALESCE(m.onboarded_msmes, 0)::BIGINT AS onboarded_msmes,
        COALESCE(jc.active_jobs, 0)::BIGINT AS active_jobs,
        COALESCE(h.total_hires, 0)::BIGINT AS total_hires
    FROM all_districts d
    LEFT JOIN msme_counts m ON m.district = d.district
    LEFT JOIN job_counts jc ON jc.district = d.district
    LEFT JOIN hire_counts h ON h.district = d.district
    ORDER BY d.district ASC;
$$;
