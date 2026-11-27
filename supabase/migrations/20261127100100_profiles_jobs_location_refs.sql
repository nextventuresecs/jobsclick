-- ==============================================================================
-- Migration: 20261127100100_profiles_jobs_location_refs.sql
-- Description: Add nullable location reference columns to profile tables and jobs.
--              Preserves existing free-text columns; no backfill; no search_jobs or location_nodes changes.
--              Drafted for human review prior to database apply.
-- ==============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN IF NOT EXISTS district_id UUID REFERENCES public.districts(id),
  ADD COLUMN IF NOT EXISTS pincode CHAR(6);

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN IF NOT EXISTS district_id UUID REFERENCES public.districts(id),
  ADD COLUMN IF NOT EXISTS pincode CHAR(6);

ALTER TABLE public.institution_profiles
  ADD COLUMN IF NOT EXISTS state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN IF NOT EXISTS district_id UUID REFERENCES public.districts(id),
  ADD COLUMN IF NOT EXISTS pincode CHAR(6);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS state_code INT REFERENCES public.states(lgd_code),
  ADD COLUMN IF NOT EXISTS district_id UUID REFERENCES public.districts(id);

CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_district_id ON public.job_seeker_profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_district_id ON public.business_profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_institution_profiles_district_id ON public.institution_profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_jobs_district_id ON public.jobs(district_id);
