-- Migration: 20261110000006_index_foreign_keys.sql
-- Description: Add covering indexes on foreign key columns identified by Supabase database linter (rule 0001)

-- 1. Alert Deliveries
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_alert_id ON public.alert_deliveries(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_job_id ON public.alert_deliveries(job_id);

-- 2. Broadcast Deliveries
CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_business_profile_id ON public.broadcast_deliveries(business_profile_id);

-- 3. Placement Applications
CREATE INDEX IF NOT EXISTS idx_placement_applications_job_id ON public.placement_applications(job_id);

-- 4. Search Logs & Tasks
CREATE INDEX IF NOT EXISTS idx_search_logs_user_id ON public.search_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_poster_id ON public.tasks(poster_id);

-- 5. Applications Audit FKs
CREATE INDEX IF NOT EXISTS idx_applications_created_by ON public.applications(created_by);
CREATE INDEX IF NOT EXISTS idx_applications_updated_by ON public.applications(updated_by);

-- 6. Batches & Waves Audit FKs
CREATE INDEX IF NOT EXISTS idx_bulk_import_batches_created_by ON public.bulk_import_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_invite_waves_created_by ON public.invite_waves(created_by);

-- 7. Profiles Audit FKs
CREATE INDEX IF NOT EXISTS idx_business_profiles_created_by ON public.business_profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_business_profiles_updated_by ON public.business_profiles(updated_by);
CREATE INDEX IF NOT EXISTS idx_institution_profiles_created_by ON public.institution_profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_institution_profiles_updated_by ON public.institution_profiles(updated_by);
CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_created_by ON public.job_seeker_profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_updated_by ON public.job_seeker_profiles(updated_by);

-- 8. Jobs Audit FKs
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_updated_by ON public.jobs(updated_by);

-- 9. Sponsorships & Tie-ups Audit FKs
CREATE INDEX IF NOT EXISTS idx_corporate_tie_ups_created_by ON public.corporate_tie_ups(created_by);
CREATE INDEX IF NOT EXISTS idx_institution_sponsorships_created_by ON public.institution_sponsorships(created_by);

-- 10. Users Self-Audit FKs
CREATE INDEX IF NOT EXISTS idx_users_created_by ON public.users(created_by);
CREATE INDEX IF NOT EXISTS idx_users_updated_by ON public.users(updated_by);
