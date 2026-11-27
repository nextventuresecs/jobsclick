-- ==============================================================================
-- Migration: 20261127100100_profiles_jobs_location_refs.sql
-- Description: Add nullable location reference columns and composite state/district
--              constraints to profile tables and jobs.
--              Preserves existing free-text columns; no backfill; no search_jobs or location_nodes changes.
--              Drafted for human review prior to database apply.
-- ==============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.job_seeker_profiles
  ADD COLUMN state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN district_id UUID,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD CONSTRAINT fk_job_seeker_profiles_state_district
    FOREIGN KEY (state_code, district_id) REFERENCES public.districts(state_code, id),
  ADD CONSTRAINT chk_job_seeker_profiles_state_district_pair
    CHECK (district_id IS NULL OR state_code IS NOT NULL),
  ADD CONSTRAINT chk_job_seeker_profiles_pincode_format
    CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');

ALTER TABLE public.business_profiles
  ADD COLUMN state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN district_id UUID,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD CONSTRAINT fk_business_profiles_state_district
    FOREIGN KEY (state_code, district_id) REFERENCES public.districts(state_code, id),
  ADD CONSTRAINT chk_business_profiles_state_district_pair
    CHECK (district_id IS NULL OR state_code IS NOT NULL),
  ADD CONSTRAINT chk_business_profiles_pincode_format
    CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');

ALTER TABLE public.institution_profiles
  ADD COLUMN state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN district_id UUID,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD CONSTRAINT fk_institution_profiles_state_district
    FOREIGN KEY (state_code, district_id) REFERENCES public.districts(state_code, id),
  ADD CONSTRAINT chk_institution_profiles_state_district_pair
    CHECK (district_id IS NULL OR state_code IS NOT NULL),
  ADD CONSTRAINT chk_institution_profiles_pincode_format
    CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');

ALTER TABLE public.jobs
  ADD COLUMN state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN district_id UUID,
  ADD CONSTRAINT fk_jobs_state_district
    FOREIGN KEY (state_code, district_id) REFERENCES public.districts(state_code, id),
  ADD CONSTRAINT chk_jobs_state_district_pair
    CHECK (district_id IS NULL OR state_code IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_district_id ON public.job_seeker_profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_district_id ON public.business_profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_institution_profiles_district_id ON public.institution_profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_jobs_district_id ON public.jobs(district_id);
CREATE INDEX IF NOT EXISTS idx_jobs_state_district ON public.jobs(state_code, district_id);
