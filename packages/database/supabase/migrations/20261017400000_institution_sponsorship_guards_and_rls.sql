-- Migration: 20261017400000_institution_sponsorship_guards_and_rls.sql
-- Defense-in-depth: Institution sponsorships table, idempotency constraint, and DB-level RLS policies (WAL-05 & Invariant #5)

-- 1. Create institution_sponsorships table for recording active annual sponsorship grants
CREATE TABLE IF NOT EXISTS institution_sponsorships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institution_profiles(id) ON DELETE CASCADE,
    tier VARCHAR(50) NOT NULL DEFAULT 'Small',
    rate_per_student NUMERIC(10, 2) NOT NULL DEFAULT 150.00,
    annual_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    student_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    payment_reference VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for performance and uniqueness
CREATE INDEX IF NOT EXISTS idx_institution_sponsorships_institution_id 
    ON institution_sponsorships (institution_id);

CREATE INDEX IF NOT EXISTS idx_institution_sponsorships_status 
    ON institution_sponsorships (status);

CREATE INDEX IF NOT EXISTS idx_institution_sponsorships_idempotency_key 
    ON institution_sponsorships (idempotency_key);

-- 3. Enable Row-Level Security on institution_sponsorships (Hard Invariant #5)
ALTER TABLE institution_sponsorships ENABLE ROW LEVEL SECURITY;

-- Admins full access policy
DROP POLICY IF EXISTS institution_sponsorships_admin_policy ON institution_sponsorships;
CREATE POLICY institution_sponsorships_admin_policy ON institution_sponsorships
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

-- Owners / Intermediaries can read their own institution sponsorships
DROP POLICY IF EXISTS institution_sponsorships_owner_select_policy ON institution_sponsorships;
CREATE POLICY institution_sponsorships_owner_select_policy ON institution_sponsorships
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM institution_profiles ip
            WHERE ip.id = institution_sponsorships.institution_id
            AND (ip.user_id = auth.uid() OR ip.created_by = auth.uid())
        )
    );

-- Owners / Intermediaries can insert sponsorships for their institutions only
DROP POLICY IF EXISTS institution_sponsorships_owner_insert_policy ON institution_sponsorships;
CREATE POLICY institution_sponsorships_owner_insert_policy ON institution_sponsorships
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM institution_profiles ip
            WHERE ip.id = institution_sponsorships.institution_id
            AND (ip.user_id = auth.uid() OR ip.created_by = auth.uid())
        )
    );

-- 4. Harden institution_profiles UPDATE policy: Only owner, intermediary creator, or admin can update
DROP POLICY IF EXISTS institution_profiles_update_policy ON institution_profiles;
CREATE POLICY institution_profiles_update_policy ON institution_profiles
    FOR UPDATE
    USING (
        auth.uid() = user_id
        OR auth.uid() = created_by
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role IN ('admin', 'msme_admin')
        )
    );
