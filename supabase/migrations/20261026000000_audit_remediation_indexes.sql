-- Migration: 20261026000000_audit_remediation_indexes.sql
-- Audit Remediation: Foreign Key & Performance Lookup Indexes

-- 1. Index on jobs.employer_id for employer dashboard filtering & CASCADE performance
CREATE INDEX IF NOT EXISTS idx_jobs_employer_id ON jobs(employer_id);

-- 2. Indexes on audit_logs for admin log sorting and actor filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);

-- 3. Indexes on invitations for bulk batch processing and candidate phone lookups
CREATE INDEX IF NOT EXISTS idx_invitations_batch_id ON invitations(batch_id);
CREATE INDEX IF NOT EXISTS idx_invitations_phone ON invitations(phone);
