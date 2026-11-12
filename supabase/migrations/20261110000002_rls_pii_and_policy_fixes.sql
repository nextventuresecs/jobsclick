-- Migration: 20261110000002_rls_pii_and_policy_fixes.sql
-- Phase 1.2 DB Hardening: Service-role-only database architecture & Non-PII Public Discovery Views
-- Hard Invariants: #1 (Zero PII leakage), #5 (Dual-layer authorization, default-deny RLS)

-- ============================================================================
-- 1. Create Non-PII Public Discovery Views
-- ============================================================================
-- Note on security_invoker: Views are intentionally created with security_invoker = false
-- (the standard PostgreSQL view owner security context) so that unauthenticated (anon) and
-- authenticated web visitors can read safely projected non-PII company and institution
-- information without granting direct table privileges on the underlying sensitive tables.

CREATE OR REPLACE VIEW public.public_business_profiles AS
SELECT 
    id,
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

CREATE OR REPLACE VIEW public.public_institution_profiles AS
SELECT 
    id,
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

CREATE OR REPLACE VIEW public.public_jobs AS
SELECT 
    id,
    employer_id,
    title,
    description,
    category,
    employment_type,
    experience_level,
    min_pay,
    max_pay,
    city,
    district,
    state,
    openings,
    skills,
    expiry_date,
    is_featured,
    featured_until,
    created_at
FROM public.jobs
WHERE is_active = TRUE
  AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP);

-- Hardened search_jobs function ensuring inactive and expired jobs are strictly excluded
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
        FROM public.jobs j
        WHERE j.is_active = TRUE
          AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP)
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
        f.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ============================================================================
-- 2. Drop all policies that subquery users or permit unmanaged client access
-- ============================================================================
-- Base tables maintain RLS enabled (deny-all by default).
-- All application DML and private reads are routed strictly through service_role.

-- users
DROP POLICY IF EXISTS users_own_row_policy ON public.users;

-- business_profiles
DROP POLICY IF EXISTS business_own_profile_policy ON public.business_profiles;
DROP POLICY IF EXISTS business_public_read_policy ON public.business_profiles;

-- institution_profiles
DROP POLICY IF EXISTS institution_own_profile_policy ON public.institution_profiles;
DROP POLICY IF EXISTS institution_public_read_policy ON public.institution_profiles;
DROP POLICY IF EXISTS institution_profiles_update_policy ON public.institution_profiles;

-- job_seeker_profiles
DROP POLICY IF EXISTS job_seeker_own_profile_policy ON public.job_seeker_profiles;

-- jobs
DROP POLICY IF EXISTS jobs_public_read_policy ON public.jobs;
DROP POLICY IF EXISTS jobs_employer_manage_policy ON public.jobs;

-- applications
DROP POLICY IF EXISTS applications_applicant_policy ON public.applications;
DROP POLICY IF EXISTS applications_employer_policy ON public.applications;

-- audit_logs
DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_admin_select_policy ON public.audit_logs;

-- bulk_import_batches
DROP POLICY IF EXISTS bulk_import_batches_select_policy ON public.bulk_import_batches;
DROP POLICY IF EXISTS bulk_import_batches_insert_policy ON public.bulk_import_batches;
DROP POLICY IF EXISTS bulk_import_batches_update_policy ON public.bulk_import_batches;

-- invite_waves
DROP POLICY IF EXISTS invite_waves_select_policy ON public.invite_waves;
DROP POLICY IF EXISTS invite_waves_insert_policy ON public.invite_waves;
DROP POLICY IF EXISTS invite_waves_update_policy ON public.invite_waves;

-- invitations
DROP POLICY IF EXISTS invitations_select_policy ON public.invitations;
DROP POLICY IF EXISTS invitations_insert_policy ON public.invitations;

-- credit_ledgers
DROP POLICY IF EXISTS credit_ledgers_select_policy ON public.credit_ledgers;
DROP POLICY IF EXISTS credit_ledgers_own_select_policy ON public.credit_ledgers;
DROP POLICY IF EXISTS credit_ledgers_insert_policy ON public.credit_ledgers;

-- payments
DROP POLICY IF EXISTS payments_select_policy ON public.payments;
DROP POLICY IF EXISTS payments_insert_policy ON public.payments;
DROP POLICY IF EXISTS payments_own_select_policy ON public.payments;
DROP POLICY IF EXISTS payments_admin_select_policy ON public.payments;
DROP POLICY IF EXISTS payments_update_policy ON public.payments;

-- location_nodes
DROP POLICY IF EXISTS location_nodes_public_select_policy ON public.location_nodes;
DROP POLICY IF EXISTS location_nodes_manage_policy ON public.location_nodes;

-- search_logs
DROP POLICY IF EXISTS search_logs_select_policy ON public.search_logs;
DROP POLICY IF EXISTS search_logs_insert_policy ON public.search_logs;

-- tasks
DROP POLICY IF EXISTS tasks_public_select_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_poster_manage_policy ON public.tasks;

-- institution_sponsorships
DROP POLICY IF EXISTS institution_sponsorships_admin_policy ON public.institution_sponsorships;
DROP POLICY IF EXISTS institution_sponsorships_owner_select_policy ON public.institution_sponsorships;
DROP POLICY IF EXISTS institution_sponsorships_owner_insert_policy ON public.institution_sponsorships;

-- corporate_tie_ups
DROP POLICY IF EXISTS corporate_tie_ups_admin_policy ON public.corporate_tie_ups;
DROP POLICY IF EXISTS corporate_tie_ups_institution_policy ON public.corporate_tie_ups;
DROP POLICY IF EXISTS corporate_tie_ups_employer_read_policy ON public.corporate_tie_ups;

-- placement_applications
DROP POLICY IF EXISTS placement_applications_admin_policy ON public.placement_applications;
DROP POLICY IF EXISTS placement_applications_institution_policy ON public.placement_applications;
DROP POLICY IF EXISTS placement_applications_employer_policy ON public.placement_applications;
DROP POLICY IF EXISTS placement_applications_seeker_read_policy ON public.placement_applications;

-- broadcast_campaigns
DROP POLICY IF EXISTS broadcast_campaigns_admin_policy ON public.broadcast_campaigns;

-- broadcast_deliveries
DROP POLICY IF EXISTS broadcast_deliveries_admin_policy ON public.broadcast_deliveries;

-- job_alerts
DROP POLICY IF EXISTS job_alerts_owner_policy ON public.job_alerts;
DROP POLICY IF EXISTS job_alerts_select_policy ON public.job_alerts;
DROP POLICY IF EXISTS job_alerts_insert_policy ON public.job_alerts;
DROP POLICY IF EXISTS job_alerts_update_policy ON public.job_alerts;
DROP POLICY IF EXISTS job_alerts_delete_policy ON public.job_alerts;

-- alert_deliveries
DROP POLICY IF EXISTS alert_deliveries_owner_policy ON public.alert_deliveries;
DROP POLICY IF EXISTS alert_deliveries_select_policy ON public.alert_deliveries;
DROP POLICY IF EXISTS alert_deliveries_insert_policy ON public.alert_deliveries;

-- institution_inquiries owner policies (dropped in favor of service_role API access)
DROP POLICY IF EXISTS institution_inquiries_owner_select_policy ON public.institution_inquiries;
DROP POLICY IF EXISTS institution_inquiries_owner_update_policy ON public.institution_inquiries;

-- ============================================================================
-- 3. Hardened Public Insert on institution_inquiries
-- ============================================================================
-- Prospective student lead capture form: Constrain column lengths and force status = 'new'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_inquiries_payload_limits'
    ) THEN
        ALTER TABLE public.institution_inquiries
        ADD CONSTRAINT chk_inquiries_payload_limits
        CHECK (
            length(student_name) <= 255 AND
            length(student_phone) <= 20 AND
            (student_email IS NULL OR length(student_email) <= 255) AND
            length(course_of_interest) <= 255 AND
            status = 'new'
        );
    END IF;
END $$;

DROP POLICY IF EXISTS institution_inquiries_insert_policy ON public.institution_inquiries;
DROP POLICY IF EXISTS allow_anon_and_auth_insert_inquiries ON public.institution_inquiries;

-- ============================================================================
-- 4. Ensure RLS is Enabled across all 23 base tables (Deny-All Default)
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_seeker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_sponsorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_tie_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Strict Permission Revocations on Base Tables & Grants on Public Views
-- ============================================================================
-- Revoke all direct permissions on all base tables from anon & authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- Ensure future objects created by postgres in schema public grant zero access to anon/authenticated
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

-- Allow public read on non-PII discovery views
GRANT SELECT ON public.public_business_profiles TO anon, authenticated;
GRANT SELECT ON public.public_institution_profiles TO anon, authenticated;
GRANT SELECT ON public.public_jobs TO anon, authenticated;

-- Grant full procedural database management rights to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
