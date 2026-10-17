-- Migration: 20261017200000_institution_sponsorship_tiers.sql
-- Ticket T-17: Institution Sponsorship Tiers & Annual Billing Engine (WAL-05, Section 10.1)

-- 1. Add is_sponsored and institution_id to job_seeker_profiles
ALTER TABLE job_seeker_profiles 
    ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE job_seeker_profiles 
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institution_profiles(id) ON DELETE SET NULL;

-- 2. Add sponsorship management fields to institution_profiles
ALTER TABLE institution_profiles 
    ADD COLUMN IF NOT EXISTS is_sponsorship_active BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE institution_profiles 
    ADD COLUMN IF NOT EXISTS sponsorship_tier VARCHAR(50) DEFAULT 'Small';

ALTER TABLE institution_profiles 
    ADD COLUMN IF NOT EXISTS sponsorship_rate_per_student NUMERIC(10, 2) DEFAULT 150.00;

ALTER TABLE institution_profiles 
    ADD COLUMN IF NOT EXISTS sponsorship_expires_at TIMESTAMPTZ;

ALTER TABLE institution_profiles 
    ADD COLUMN IF NOT EXISTS total_sponsored_students INT NOT NULL DEFAULT 0;

ALTER TABLE institution_profiles 
    ADD COLUMN IF NOT EXISTS annual_sponsorship_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- 3. Indexes for fast sponsorship verification and bulk student lookups
CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_is_sponsored 
    ON job_seeker_profiles (is_sponsored);

CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_institution_id 
    ON job_seeker_profiles (institution_id);

CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_institution_name 
    ON job_seeker_profiles (institution);
