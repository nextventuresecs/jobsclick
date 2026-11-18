-- AUTH-05 / PRN-03 / F0-f. Approved Option A; local review draft, never hosted-applied here.
BEGIN;
ALTER TABLE public.business_profiles ADD COLUMN is_published boolean NOT NULL DEFAULT false;
ALTER TABLE public.institution_profiles ADD COLUMN is_published boolean NOT NULL DEFAULT false;
-- Existence never implies publication. No existing-row publication backfill.
CREATE OR REPLACE VIEW public.public_business_profiles WITH (security_invoker=true) AS
SELECT b.id, b.company_name, b.ownership_type, b.company_size, b.sector, b.city, b.district, b.state, b.logo_url, b.website, b.year_of_registration, b.commencement_year, b.know_my_business, b.products_brief, b.services_brief, b.is_msme, b.is_dpiit_startup, b.created_at
FROM public.business_profiles b JOIN public.users u ON u.id=b.user_id
WHERE b.is_published AND u.role='employer' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$';
REVOKE ALL ON public.public_business_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.public_business_profiles TO service_role;
CREATE OR REPLACE VIEW public.public_institution_profiles WITH (security_invoker=true) AS
SELECT i.id, i.institution_name, i.institution_type, i.affiliation, i.establishment_year, i.website, i.city, i.district, i.state, i.trades_offered, i.annual_capacity, i.placement_brochure_url, i.about, i.cms_data, i.created_at
FROM public.institution_profiles i JOIN public.users u ON u.id=i.user_id
WHERE i.is_published AND u.role='intermediary' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$';
REVOKE ALL ON public.public_institution_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.public_institution_profiles TO service_role;
CREATE OR REPLACE VIEW public.public_jobs WITH (security_invoker=true) AS
SELECT j.id, j.employer_id, j.title, j.description, j.category, j.employment_type, j.experience_level, j.min_pay, j.max_pay, j.city, j.district, j.state, j.openings, j.skills, j.expiry_date, j.is_featured, j.featured_until, j.created_at
FROM public.jobs j JOIN public.users u ON u.id=j.employer_id JOIN public.business_profiles b ON b.user_id=u.id
WHERE j.is_active AND (j.expiry_date IS NULL OR j.expiry_date>=CURRENT_TIMESTAMP) AND b.is_published AND u.role='employer' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$';
REVOKE ALL ON public.public_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.public_jobs TO service_role;
COMMIT;
