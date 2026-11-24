-- Migration: 20261122130000_search_jobs_invoker_hardening.sql
-- Description: Recreate public.search_jobs as SECURITY INVOKER for service_role only.
-- Hardens search_jobs:
-- 1. SECURITY INVOKER with pinned search_path = public, pg_temp
-- 2. Removes internal/provenance column 'source' from public search projection
-- 3. Caps p_limit (1..100, default 20) and p_offset (0..10000, default 0)
-- 4. Uses exact lower(j.city) = lower(p_city) comparison instead of ILIKE
-- 5. Preserves active, unexpired, and public Crockford Base32 slug projections
-- 6. Strictly restricts execution to service_role (revoking public, anon, authenticated)

DROP FUNCTION IF EXISTS public.search_jobs(text, text, text, numeric, integer, integer);

CREATE OR REPLACE FUNCTION public.search_jobs(
    p_keyword TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_min_pay NUMERIC DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
) RETURNS TABLE (
    slug VARCHAR,
    company_slug VARCHAR,
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
    total_count BIGINT
) LANGUAGE plpgsql STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_query tsquery;
    v_limit INT := LEAST(100, GREATEST(1, COALESCE(p_limit, 20)));
    v_offset INT := LEAST(10000, GREATEST(0, COALESCE(p_offset, 0)));
BEGIN
    IF p_keyword IS NOT NULL AND trim(p_keyword) <> '' THEN
        v_query := websearch_to_tsquery('english', p_keyword);
    END IF;

    RETURN QUERY
    WITH filtered AS (
        SELECT
            j.public_slug::VARCHAR AS slug,
            bp.public_slug::VARCHAR AS company_slug,
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
            COUNT(*) OVER() AS total_count,
            (j.is_featured IS TRUE AND j.featured_until IS NOT NULL AND j.featured_until > NOW()) AS is_currently_promoted,
            CASE WHEN v_query IS NOT NULL THEN ts_rank(j.fts, v_query) ELSE 0.0 END AS relevance_score
        FROM public.jobs j
        LEFT JOIN public.business_profiles bp ON bp.user_id = j.employer_id
        WHERE j.is_active = TRUE
          AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP)
          AND (p_city IS NULL OR LOWER(j.city) = LOWER(p_city))
          AND (p_category IS NULL OR j.category::text = p_category)
          AND (p_min_pay IS NULL OR j.max_pay >= p_min_pay)
          AND (v_query IS NULL OR j.fts @@ v_query)
    )
    SELECT
        f.slug,
        f.company_slug,
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
        f.total_count
    FROM filtered f
    ORDER BY
        f.is_currently_promoted DESC,
        f.relevance_score DESC,
        f.created_at DESC
    LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_jobs(text, text, text, numeric, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_jobs(text, text, text, numeric, integer, integer) TO service_role;
