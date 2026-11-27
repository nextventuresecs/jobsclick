-- ==============================================================================
-- Migration: 20261127100000_locations_reference_tables.sql
-- Description: India-level location reference tables (states, districts, pincodes)
--              with service_role-only RLS per ADR 0002 (public reads via API).
--              Drafted for human review prior to database apply.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.states (
  lgd_code INT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_hi TEXT,
  is_ut BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lgd_code INT UNIQUE,
  state_code INT NOT NULL REFERENCES public.states(lgd_code),
  name_en TEXT NOT NULL,
  name_hi TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL CHECK (source IN ('lgd', 'manual-gazette')),
  effective_from DATE,
  notes TEXT,
  CONSTRAINT uq_districts_state_id UNIQUE (state_code, id),
  CONSTRAINT chk_district_source CHECK (
    (source = 'lgd' AND lgd_code IS NOT NULL)
    OR (source = 'manual-gazette' AND lgd_code IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.pincodes (
  pincode CHAR(6) PRIMARY KEY CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  state_code INT REFERENCES public.states(lgd_code),
  district_id UUID,
  ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
  candidate_district_ids UUID[] NOT NULL DEFAULT '{}',
  CONSTRAINT fk_pincodes_state_district
    FOREIGN KEY (state_code, district_id) REFERENCES public.districts(state_code, id),
  CONSTRAINT chk_pincodes_state_district_pair
    CHECK (district_id IS NULL OR state_code IS NOT NULL),
  CONSTRAINT chk_pincode_resolution CHECK (
    (ambiguous = TRUE AND district_id IS NULL)
    OR (
      ambiguous = FALSE
      AND district_id IS NOT NULL
      AND state_code IS NOT NULL
      AND cardinality(candidate_district_ids) = 0
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_districts_state_code ON public.districts(state_code);
CREATE INDEX IF NOT EXISTS idx_pincodes_district_id ON public.pincodes(district_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_districts_manual_state_name
  ON public.districts(state_code, lower(name_en))
  WHERE lgd_code IS NULL;

-- ADR 0002: Reference tables are service_role-only (RLS enabled, no anon/authenticated policies)
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pincodes ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.states, public.districts, public.pincodes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.states, public.districts, public.pincodes TO service_role;
