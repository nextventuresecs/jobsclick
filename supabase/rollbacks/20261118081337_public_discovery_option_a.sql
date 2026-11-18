-- Security reversal is never automatic. Review publication data and client contract first.
DO $$ BEGIN RAISE EXCEPTION 'PUBLIC_DISCOVERY_OPTION_A_ROLLBACK_REQUIRES_REVIEW'; END $$;
