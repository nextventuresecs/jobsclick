-- DB Schema v1 + RLS & Immutability Policies

-- Add source, created_by, updated_by to entities
ALTER TABLE users ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'direct';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE job_seeker_profiles ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'direct';
ALTER TABLE job_seeker_profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE job_seeker_profiles ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'direct';
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE institution_profiles ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'direct';
ALTER TABLE institution_profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE institution_profiles ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'direct';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'direct';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_seeker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users see only their own private data
CREATE POLICY users_own_row_policy ON users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY job_seeker_own_profile_policy ON job_seeker_profiles
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY business_own_profile_policy ON business_profiles
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY institution_own_profile_policy ON institution_profiles
    FOR ALL USING (auth.uid() = user_id);

-- Public Job Postings are readable by everyone
CREATE POLICY jobs_public_read_policy ON jobs
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY jobs_employer_manage_policy ON jobs
    FOR ALL USING (auth.uid() = employer_id);

-- Applications visible only to candidate and employer
CREATE POLICY applications_applicant_policy ON applications
    FOR ALL USING (auth.uid() = applicant_id);

-- Audit log is append-only (No UPDATE or DELETE allowed by anyone)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated or deleted.';
END;
$$;

CREATE TRIGGER audit_log_immutable_update_trigger
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER audit_log_immutable_delete_trigger
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
