-- Migration: 20261025200000_jobs_full_text_search_and_ranking.sql
-- Fix Dimension 2: Postgres Full-Text Search (FTS) & Multi-Page Ranking Procedure (PRD JOB-05 & Hard Invariant #5)
-- Eliminates unindexed ilike table scans, pushes sorting before pagination, and supports skills search.

-- 1. Full-Text Search Generated Column on Jobs
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(description, '') || ' ' ||
            coalesce(array_to_string(skills, ' '), '')
        )
    ) STORED;

-- 2. GIN Index for Sub-Millisecond Full-Text Keyword Search
CREATE INDEX IF NOT EXISTS idx_jobs_fts ON jobs USING GIN (fts);

-- 3. Composite Index for Filtered Ranking
CREATE INDEX IF NOT EXISTS idx_jobs_active_ranking
    ON jobs (is_active, is_featured DESC, featured_until DESC, created_at DESC);

-- 4. High-Performance Search & Multi-Page Ranking Procedure
CREATE OR REPLACE FUNCTION search_jobs(
    p_keyword TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_min_pay NUMERIC DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
) RETURNS TABLE (
    id UUID,
    employer_id UUID,
    title VARCHAR,
    description TEXT,
    category job_category,
    city VARCHAR,
    openings INT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    employment_type VARCHAR,
    experience_level VARCHAR,
    min_pay NUMERIC,
    max_pay NUMERIC,
    district VARCHAR,
    state VARCHAR,
    skills TEXT[],
    expiry_date TIMESTAMPTZ,
    is_featured BOOLEAN,
    featured_until TIMESTAMPTZ,
    source VARCHAR,
    created_by UUID,
    updated_by UUID,
    total_count BIGINT
) LANGUAGE plpgsql STABLE
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
    v_query tsquery;
BEGIN
    IF p_keyword IS NOT NULL AND trim(p_keyword) <> '' THEN
        v_query := websearch_to_tsquery('english', p_keyword);
    END IF;

    RETURN QUERY
    WITH filtered AS (
        SELECT
            j.id,
            j.employer_id,
            j.title,
            j.description,
            j.category,
            j.city,
            j.openings,
            j.is_active,
            j.created_at,
            j.updated_at,
            j.employment_type,
            j.experience_level,
            j.min_pay,
            j.max_pay,
            j.district,
            j.state,
            j.skills,
            j.expiry_date,
            j.is_featured,
            j.featured_until,
            j.source,
            j.created_by,
            j.updated_by,
            COUNT(*) OVER() AS total_count,
            (j.is_featured IS TRUE AND j.featured_until IS NOT NULL AND j.featured_until > NOW()) AS is_currently_promoted,
            CASE WHEN v_query IS NOT NULL THEN ts_rank(j.fts, v_query) ELSE 0.0 END AS relevance_score
        FROM jobs j
        WHERE j.is_active = TRUE
          AND (p_city IS NULL OR j.city ILIKE p_city)
          AND (p_category IS NULL OR j.category::text = p_category)
          AND (p_min_pay IS NULL OR j.max_pay >= p_min_pay)
          AND (v_query IS NULL OR j.fts @@ v_query)
    )
    SELECT
        f.id,
        f.employer_id,
        f.title,
        f.description,
        f.category,
        f.city,
        f.openings,
        f.is_active,
        f.created_at,
        f.updated_at,
        f.employment_type,
        f.experience_level,
        f.min_pay,
        f.max_pay,
        f.district,
        f.state,
        f.skills,
        f.expiry_date,
        f.is_featured,
        f.featured_until,
        f.source,
        f.created_by,
        f.updated_by,
        f.total_count
    FROM filtered f
    ORDER BY
        f.is_currently_promoted DESC,
        f.relevance_score DESC,
        f.created_at DESC,
        f.id ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
