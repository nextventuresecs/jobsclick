-- Durable task state for QStash integration
-- Extends existing bulk_import_batches, adds invite_waves table
-- PostgreSQL is the source of truth; QStash only carries safe IDs.

-- Task status enum shared by imports and waves
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('queued', 'dispatched', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Extend bulk_import_batches with lifecycle + QStash metadata
ALTER TABLE bulk_import_batches
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS valid_rows INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_rows INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status task_status NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS csv_storage_path TEXT,          -- Supabase Storage path, NOT raw CSV
  ADD COLUMN IF NOT EXISTS error_csv_storage_path TEXT,    -- Error report storage path
  ADD COLUMN IF NOT EXISTS qstash_message_id VARCHAR(255), -- For cancellation
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for status queries (admin dashboard)
CREATE INDEX IF NOT EXISTS idx_bulk_import_batches_status ON bulk_import_batches(status);

-- Invite waves: SMS batch sends with cost tracking and QStash control
CREATE TABLE IF NOT EXISTS invite_waves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES bulk_import_batches(id) ON DELETE CASCADE,
  wave_size INT NOT NULL,
  cost_per_sms_inr NUMERIC(10, 4) NOT NULL,
  total_cost_inr NUMERIC(10, 2) NOT NULL,
  status task_status NOT NULL DEFAULT 'queued',
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  qstash_message_id VARCHAR(255),  -- For cancellation via QStash API
  failure_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invite_waves_batch_id ON invite_waves(batch_id);
CREATE INDEX IF NOT EXISTS idx_invite_waves_status ON invite_waves(status);

-- RLS for new table (service_role bypasses; app users see own waves via API)
ALTER TABLE invite_waves ENABLE ROW LEVEL SECURITY;
