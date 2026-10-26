-- Migration: 20261017300000_institution_cms_and_inquiries.sql
-- Ticket T-18: Institution Public Page CMS & Inquiry Routing (INT-02, INT-03)

-- 1. Add cms_data JSONB to institution_profiles (INT-02 standard tabs: Courses, Subjects, Fee Structure, Departments, Faculty)
ALTER TABLE institution_profiles 
    ADD COLUMN IF NOT EXISTS cms_data JSONB DEFAULT '{}'::jsonb;

-- 2. Create institution_inquiries table for prospective student leads (INT-03)
CREATE TABLE IF NOT EXISTS institution_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institution_profiles(id) ON DELETE CASCADE,
    student_name VARCHAR(255) NOT NULL,
    student_phone VARCHAR(20) NOT NULL,
    student_email VARCHAR(255),
    course_of_interest VARCHAR(255) NOT NULL,
    qualification VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(100) DEFAULT 'Madhya Pradesh',
    message TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'new',
    source VARCHAR(100) NOT NULL DEFAULT 'public_portal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for fast inquiry lookups and dashboard management
CREATE INDEX IF NOT EXISTS idx_institution_inquiries_institution_id 
    ON institution_inquiries (institution_id);

CREATE INDEX IF NOT EXISTS idx_institution_inquiries_status 
    ON institution_inquiries (status);

-- 4. Row Level Security (Hard Invariant #5)
ALTER TABLE institution_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow prospective students / public to submit inquiry forms
DROP POLICY IF EXISTS institution_inquiries_insert_policy ON institution_inquiries;
CREATE POLICY institution_inquiries_insert_policy ON institution_inquiries
    FOR INSERT
    WITH CHECK (true);

-- Allow institution owners to view their institution's inquiries
DROP POLICY IF EXISTS institution_inquiries_owner_select_policy ON institution_inquiries;
CREATE POLICY institution_inquiries_owner_select_policy ON institution_inquiries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM institution_profiles ip
            WHERE ip.id = institution_inquiries.institution_id
            AND ip.user_id = auth.uid()
        )
    );

-- Allow institution owners to update inquiry status (contacted, admitted, closed)
DROP POLICY IF EXISTS institution_inquiries_owner_update_policy ON institution_inquiries;
CREATE POLICY institution_inquiries_owner_update_policy ON institution_inquiries
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM institution_profiles ip
            WHERE ip.id = institution_inquiries.institution_id
            AND ip.user_id = auth.uid()
        )
    );
