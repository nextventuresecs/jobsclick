-- Migration: Add token_version to users table for server-side session revocation & state validation
-- Every sign-out-all, disable, or role change increments token_version.
-- JWT claims carry tv (token_version at issue time); guard rejects if tv != current DB value.

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- Atomic increment function for use via supabase.rpc()
CREATE OR REPLACE FUNCTION increment_token_version(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  phone varchar,
  email varchar,
  role varchar,
  status varchar,
  source varchar,
  token_version integer,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE users
  SET token_version = users.token_version + 1,
      updated_at = NOW()
  WHERE users.id = p_user_id
  RETURNING
    users.id,
    users.phone,
    users.email,
    users.role,
    users.status,
    users.source,
    users.token_version,
    users.created_by,
    users.updated_by,
    users.created_at,
    users.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
