-- Migration: Production Schema Alignment + Public Read for Profiles & Applications RLS
-- Requirement IDs: AUTH-01, AUTH-05, REQ-17, REQ-18

-- 1. Extend enums
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'interview_scheduled';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'selected';

ALTER TYPE job_category ADD VALUE IF NOT EXISTS 'technology';
ALTER TYPE job_category ADD VALUE IF NOT EXISTS 'manufacturing';
ALTER TYPE job_category ADD VALUE IF NOT EXISTS 'sales_operations';
ALTER TYPE job_category ADD VALUE IF NOT EXISTS 'logistics_supply';
ALTER TYPE job_category ADD VALUE IF NOT EXISTS 'creative_services';
ALTER TYPE job_category ADD VALUE IF NOT EXISTS 'healthcare_services';

-- 2. Extended fields for Business Profiles (MSME Onboarding & Public Discovery)
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website VARCHAR(255),
  ADD COLUMN IF NOT EXISTS year_of_registration VARCHAR(10),
  ADD COLUMN IF NOT EXISTS commencement_year VARCHAR(10),
  ADD COLUMN IF NOT EXISTS founder_or_director VARCHAR(255),
  ADD COLUMN IF NOT EXISTS director_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS designation VARCHAR(100),
  ADD COLUMN IF NOT EXISTS know_my_business TEXT,
  ADD COLUMN IF NOT EXISTS products_brief TEXT,
  ADD COLUMN IF NOT EXISTS services_brief TEXT,
  ADD COLUMN IF NOT EXISTS social_media JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_msme BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS udyam_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_dpiit_startup BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dpiit_number VARCHAR(50);

-- 3. Extended fields for Institution Profiles (Public Discovery & Verification)
ALTER TABLE institution_profiles
  ADD COLUMN IF NOT EXISTS institution_type VARCHAR(50) DEFAULT 'iti',
  ADD COLUMN IF NOT EXISTS affiliation_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS establishment_year INT,
  ADD COLUMN IF NOT EXISTS principal_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_designation VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS website VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS district VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS trades_offered TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS annual_capacity INT,
  ADD COLUMN IF NOT EXISTS placement_brochure_url TEXT,
  ADD COLUMN IF NOT EXISTS about TEXT;

-- 4. Extended fields for Job Seeker Profiles (DPDP Compliance & Matching)
ALTER TABLE job_seeker_profiles
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS dpdp_consent_given BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS district VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS qualification VARCHAR(255),
  ADD COLUMN IF NOT EXISTS institution VARCHAR(255),
  ADD COLUMN IF NOT EXISTS graduation_year VARCHAR(10),
  ADD COLUMN IF NOT EXISTS experience_years NUMERIC(4, 1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "current_role" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_locations TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS willing_to_relocate BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- 5. Extended fields for Jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50) DEFAULT 'Full-time',
  ADD COLUMN IF NOT EXISTS experience_level VARCHAR(50) DEFAULT 'Fresher',
  ADD COLUMN IF NOT EXISTS min_pay NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_pay NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS district VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100) DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_institution_profiles_user_id ON institution_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_user_id ON job_seeker_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_id ON applications(applicant_id);

-- 7. RLS Policies
-- Public can read business profiles (for /company/[id] public discovery & QR scans)
DO $$ BEGIN
    CREATE POLICY business_public_read_policy ON business_profiles
        FOR SELECT USING (TRUE);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Public can read institution profiles (for /institution/[id] public discovery & QR scans)
DO $$ BEGIN
    CREATE POLICY institution_public_read_policy ON institution_profiles
        FOR SELECT USING (TRUE);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Employers can read and manage applications submitted to their jobs
DO $$ BEGIN
    CREATE POLICY applications_employer_policy ON applications
        FOR ALL USING (
            job_id IN (SELECT id FROM jobs WHERE employer_id = auth.uid())
        );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Audit logs insert policy (actors can append their own logs or system events)
DO $$ BEGIN
    CREATE POLICY audit_logs_insert_policy ON audit_logs
        FOR INSERT WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Admins can view audit logs
DO $$ BEGIN
    CREATE POLICY audit_logs_admin_select_policy ON audit_logs
        FOR SELECT USING (
            EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'msme_admin'))
        );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
