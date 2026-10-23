-- Migration: 20261023000000_corporate_tieups_and_placement_pipeline.sql
-- Ticket T-19: Placement Cell Corporate Tie-Ups & Institutional Placement Pipeline
-- Compliance: Hard Invariants #1 (Zero PII), #5 (RLS second lock), and #11

-- 1. Corporate Tie-Ups (MoU Partnerships between Institutions and MSME Employers)
CREATE TABLE IF NOT EXISTS corporate_tie_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institution_profiles(id) ON DELETE CASCADE,
    employer_id UUID REFERENCES employer_profiles(id) ON DELETE SET NULL,
    company_name VARCHAR(255) NOT NULL,
    sector VARCHAR(255) NOT NULL,
    partnership_status VARCHAR(50) NOT NULL DEFAULT 'mou_signed' 
        CHECK (partnership_status IN ('mou_signed', 'active', 'dormant', 'terminated')),
    preferred_trades TEXT[] NOT NULL DEFAULT '{}',
    active_campus_drives INT NOT NULL DEFAULT 0 CHECK (active_campus_drives >= 0),
    total_offers_issued INT NOT NULL DEFAULT 0 CHECK (total_offers_issued >= 0),
    contact_person VARCHAR(255) NOT NULL,
    partnered_since DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Placement Pipeline Applications
CREATE TABLE IF NOT EXISTS placement_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tie_up_id UUID NOT NULL REFERENCES corporate_tie_ups(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institution_profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES job_seeker_profiles(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    job_title VARCHAR(255) NOT NULL,
    stage VARCHAR(50) NOT NULL DEFAULT 'applied'
        CHECK (stage IN ('applied', 'shortlisted', 'interview', 'offered', 'placed', 'rejected')),
    offer_package VARCHAR(255),
    offer_letter_url TEXT,
    interview_date TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent duplicate active applications for same student in same drive
    CONSTRAINT unique_student_campus_drive UNIQUE (student_id, tie_up_id, job_title)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_corporate_tie_ups_institution_id 
    ON corporate_tie_ups (institution_id);

CREATE INDEX IF NOT EXISTS idx_corporate_tie_ups_employer_id 
    ON corporate_tie_ups (employer_id);

CREATE INDEX IF NOT EXISTS idx_placement_applications_institution_id 
    ON placement_applications (institution_id);

CREATE INDEX IF NOT EXISTS idx_placement_applications_student_id 
    ON placement_applications (student_id);

CREATE INDEX IF NOT EXISTS idx_placement_applications_tie_up_id 
    ON placement_applications (tie_up_id);

CREATE INDEX IF NOT EXISTS idx_placement_applications_stage 
    ON placement_applications (stage);

-- ============================================================================
-- 3. Row-Level Security Policies (Hard Invariant #5)
-- ============================================================================

ALTER TABLE corporate_tie_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_applications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Corporate Tie-Ups Policies
-- ----------------------------------------------------------------------------

-- Admin full access
DROP POLICY IF EXISTS corporate_tie_ups_admin_policy ON corporate_tie_ups;
CREATE POLICY corporate_tie_ups_admin_policy ON corporate_tie_ups
    FOR ALL
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

-- Institution owner access: Institutions manage only their own tie-ups
DROP POLICY IF EXISTS corporate_tie_ups_institution_policy ON corporate_tie_ups;
CREATE POLICY corporate_tie_ups_institution_policy ON corporate_tie_ups
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM institution_profiles
            WHERE institution_profiles.id = corporate_tie_ups.institution_id
              AND institution_profiles.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM institution_profiles
            WHERE institution_profiles.id = corporate_tie_ups.institution_id
              AND institution_profiles.user_id = auth.uid()
        )
    );

-- Employer read access: Employers can view tie-ups they are party to
DROP POLICY IF EXISTS corporate_tie_ups_employer_read_policy ON corporate_tie_ups;
CREATE POLICY corporate_tie_ups_employer_read_policy ON corporate_tie_ups
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employer_profiles
            WHERE employer_profiles.id = corporate_tie_ups.employer_id
              AND employer_profiles.user_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- Placement Applications Policies
-- ----------------------------------------------------------------------------

-- Admin full access
DROP POLICY IF EXISTS placement_applications_admin_policy ON placement_applications;
CREATE POLICY placement_applications_admin_policy ON placement_applications
    FOR ALL
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

-- Institution policy: Institutions manage applications of their students
DROP POLICY IF EXISTS placement_applications_institution_policy ON placement_applications;
CREATE POLICY placement_applications_institution_policy ON placement_applications
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM institution_profiles
            WHERE institution_profiles.id = placement_applications.institution_id
              AND institution_profiles.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM institution_profiles
            WHERE institution_profiles.id = placement_applications.institution_id
              AND institution_profiles.user_id = auth.uid()
        )
    );

-- Employer policy: Employers view and update applications in drives shared with them
DROP POLICY IF EXISTS placement_applications_employer_policy ON placement_applications;
CREATE POLICY placement_applications_employer_policy ON placement_applications
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM corporate_tie_ups
            JOIN employer_profiles ON employer_profiles.id = corporate_tie_ups.employer_id
            WHERE corporate_tie_ups.id = placement_applications.tie_up_id
              AND employer_profiles.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM corporate_tie_ups
            JOIN employer_profiles ON employer_profiles.id = corporate_tie_ups.employer_id
            WHERE corporate_tie_ups.id = placement_applications.tie_up_id
              AND employer_profiles.user_id = auth.uid()
        )
    );

-- Job Seeker read-only policy: Seekers view ONLY their own placement application status
DROP POLICY IF EXISTS placement_applications_seeker_read_policy ON placement_applications;
CREATE POLICY placement_applications_seeker_read_policy ON placement_applications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM job_seeker_profiles
            WHERE job_seeker_profiles.id = placement_applications.student_id
              AND job_seeker_profiles.user_id = auth.uid()
        )
    );
