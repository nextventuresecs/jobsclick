-- Migration: 20261126000100_harden_public_views.sql
-- Description: AUTHZ-07 / ADR 0002 - Harden approved public read views with
--              explicit column allowlists and active-account visibility filters
--              so suspended or inactive owners cannot appear in public views.

BEGIN;

-- 1. public.public_business_profiles: explicit column allowlist + active user filter
DROP VIEW IF EXISTS public.public_business_profiles CASCADE;

CREATE VIEW public.public_business_profiles AS
SELECT
    bp.public_slug AS slug,
    bp.company_name,
    bp.ownership_type,
    bp.company_size,
    bp.sector,
    bp.city,
    bp.district,
    bp.state,
    bp.logo_url,
    bp.website,
    bp.year_of_registration,
    bp.commencement_year,
    bp.know_my_business,
    bp.products_brief,
    bp.services_brief,
    bp.is_msme,
    bp.is_dpiit_startup,
    bp.created_at
FROM public.business_profiles bp
JOIN public.users u ON u.id = bp.user_id
WHERE u.status = 'active';

ALTER VIEW public.public_business_profiles RESET (security_invoker);
REVOKE ALL ON public.public_business_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_business_profiles TO anon, authenticated;

-- 2. public.public_jobs: explicit column allowlist + active, unexpired, active-employer filter
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
JOIN public.users u ON u.id = j.employer_id
LEFT JOIN public.business_profiles bp ON bp.user_id = j.employer_id
WHERE j.is_active = TRUE
  AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP)
  AND u.status = 'active';

ALTER VIEW public.public_jobs RESET (security_invoker);
REVOKE ALL ON public.public_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_jobs TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
