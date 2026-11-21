-- Migration: Add is_published to institution_profiles
-- Fixes missing column required by 20261118085644_public_api_projection_reads.sql

ALTER TABLE public.institution_profiles
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_institution_profiles_is_published
  ON public.institution_profiles(is_published);
