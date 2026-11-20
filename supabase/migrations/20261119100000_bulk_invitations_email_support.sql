-- Migration: bulk_invitations_email_support
-- Enables contact-only CSV bulk onboarding (email or phone) with batch indexing for fast wave queries.
BEGIN;

-- Allow phone to be nullable in invitations for email-only imported users
ALTER TABLE public.invitations ALTER COLUMN phone DROP NOT NULL;

-- Add email column to invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Ensure at least one contact method is present on every invitation
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS check_invitation_contact_present;
ALTER TABLE public.invitations ADD CONSTRAINT check_invitation_contact_present
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- Index for high-throughput wave candidate lookups (P0-6 fix)
CREATE INDEX IF NOT EXISTS idx_invitations_batch_status ON public.invitations(batch_id, status);

COMMIT;
