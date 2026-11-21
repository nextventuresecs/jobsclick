-- Migration: 20261115100000_public_views_and_rpc_slugs.sql
-- Description: Recreate public_business_profiles, public_institution_profiles, and public_jobs
-- views without internal IDs (id, employer_id, user_id). Expose public_slug as slug and company_slug.
-- Update search_jobs RPC to return slug and company_slug instead of internal UUIDs.

-- 1. Recreate public.public_business_profiles without internal IDs
DROP VIEW IF EXISTS public.public_business_profiles CASCADE;

CREATE VIEW public.public_business_profiles AS
SELECT 
    public_slug AS slug,
    company_name,
    ownership_type,
    company_size,
    sector,
    city,
    district,
    state,
    logo_url,
    website,
    year_of_registration,
    commencement_year,
    know_my_business,
    products_brief,
    services_brief,
    is_msme,
    is_dpiit_startup,
    created_at
FROM public.business_profiles;

ALTER VIEW public.public_business_profiles RESET (security_invoker);
GRANT SELECT ON public.public_business_profiles TO anon, authenticated;

-- 2. Recreate public.public_institution_profiles without internal IDs
DROP VIEW IF EXISTS public.public_institution_profiles CASCADE;

CREATE VIEW public.public_institution_profiles AS
SELECT 
    public_slug AS slug,
    institution_name,
    institution_type,
    affiliation,
    establishment_year,
    website,
    city,
    district,
    state,
    trades_offered,
    annual_capacity,
    placement_brochure_url,
    about,
    cms_data,
    created_at
FROM public.institution_profiles;

ALTER VIEW public.public_institution_profiles RESET (security_invoker);
GRANT SELECT ON public.public_institution_profiles TO anon, authenticated;

-- 3. Recreate public.public_jobs without id or employer_id
DROP VIEW IF EXISTS public.public_jobs CASCADE;

CREATE VIEW public.public_jobs AS
SELECT 
    j.public_slug AS slug,
    bp.public_slug AS company_slug,
    j.title,
    j.description,
    j.category,
    j.employment_type,
    j.experience_level,
    j.min_pay,
    j.max_pay,
    j.city,
    j.district,
    j.state,
    j.openings,
    j.skills,
    j.expiry_date,
    j.is_featured,
    j.featured_until,
    j.created_at
FROM public.jobs j
LEFT JOIN public.business_profiles bp ON bp.user_id = j.employer_id
WHERE j.is_active = TRUE
  AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP);

ALTER VIEW public.public_jobs RESET (security_invoker);
GRANT SELECT ON public.public_jobs TO anon, authenticated;

-- 4. Update search_jobs RPC return columns to return slug & company_slug without internal UUIDs
DROP FUNCTION IF EXISTS public.search_jobs(text, text, text, numeric, integer, integer);
DROP FUNCTION IF EXISTS public.search_jobs(text, varchar, varchar, numeric, integer, integer);

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
    source VARCHAR,
    total_count BIGINT
) LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
            j.source,
            COUNT(*) OVER() AS total_count,
            (j.is_featured IS TRUE AND j.featured_until IS NOT NULL AND j.featured_until > NOW()) AS is_currently_promoted,
            CASE WHEN v_query IS NOT NULL THEN ts_rank(j.fts, v_query) ELSE 0.0 END AS relevance_score
        FROM public.jobs j
        LEFT JOIN public.business_profiles bp ON bp.user_id = j.employer_id
        WHERE j.is_active = TRUE
          AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP)
          AND (p_city IS NULL OR j.city ILIKE p_city)
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
        f.source,
        f.total_count
    FROM filtered f
    ORDER BY
        f.is_currently_promoted DESC,
        f.relevance_score DESC,
        f.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_jobs(text, text, text, numeric, integer, integer) TO anon, authenticated;
