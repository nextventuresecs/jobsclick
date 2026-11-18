-- Coordinate API rollback before removing public job slug projections; no base-table fallback.
DO $$ BEGIN RAISE EXCEPTION 'PUBLIC_JOB_SLUG_API_ROLLBACK_REQUIRES_REVIEW'; END $$;
