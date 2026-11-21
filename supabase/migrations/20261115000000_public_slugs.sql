-- 20261115000000_public_slugs.sql
-- ID-02: Public Slugs for Opaque Public Profiles, Jobs & Share URLs
-- Generates 12-character Crockford Base32 random slugs (NOT derived from user data).

-- 1. Slug Generation Function (12-char Crockford Base32: 0123456789abcdefghjkmnpqrstvwxyz)
CREATE OR REPLACE FUNCTION generate_public_slug() RETURNS text AS $$
DECLARE
  chars text := '0123456789abcdefghjkmnpqrstvwxyz';
  result text := '';
  bytes bytea := gen_random_bytes(12);
  i integer;
BEGIN
  FOR i IN 0..11 LOOP
    result := result || substr(chars, (get_byte(bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 2. Slug Immutability & Fallback Trigger Functions
CREATE OR REPLACE FUNCTION enforce_public_slug_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.public_slug IS NOT NULL AND NEW.public_slug IS DISTINCT FROM OLD.public_slug THEN
    RAISE EXCEPTION 'public_slug is immutable and cannot be modified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_public_slug() RETURNS trigger AS $$
BEGIN
  IF NEW.public_slug IS NULL OR trim(NEW.public_slug) = '' THEN
    NEW.public_slug := generate_public_slug();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Add public_slug to business_profiles
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS public_slug text;
UPDATE business_profiles SET public_slug = generate_public_slug() WHERE public_slug IS NULL;
DO $$
DECLARE dup_count int;
BEGIN
  LOOP
    SELECT count(*) - count(distinct public_slug) INTO dup_count FROM business_profiles;
    EXIT WHEN dup_count = 0;
    UPDATE business_profiles SET public_slug = generate_public_slug()
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY public_slug ORDER BY id) as rn
        FROM business_profiles
      ) t WHERE t.rn > 1
    );
  END LOOP;
END $$;
ALTER TABLE business_profiles ALTER COLUMN public_slug SET NOT NULL;
ALTER TABLE business_profiles ALTER COLUMN public_slug SET DEFAULT generate_public_slug();
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_profiles_public_slug ON business_profiles(public_slug);

DROP TRIGGER IF EXISTS trg_business_profiles_ensure_slug ON business_profiles;
CREATE TRIGGER trg_business_profiles_ensure_slug
  BEFORE INSERT ON business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION ensure_public_slug();

DROP TRIGGER IF EXISTS trg_business_profiles_slug_immutable ON business_profiles;
CREATE TRIGGER trg_business_profiles_slug_immutable
  BEFORE UPDATE ON business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_public_slug_immutable();

-- 4. Add public_slug to institution_profiles
ALTER TABLE institution_profiles ADD COLUMN IF NOT EXISTS public_slug text;
UPDATE institution_profiles SET public_slug = generate_public_slug() WHERE public_slug IS NULL;
DO $$
DECLARE dup_count int;
BEGIN
  LOOP
    SELECT count(*) - count(distinct public_slug) INTO dup_count FROM institution_profiles;
    EXIT WHEN dup_count = 0;
    UPDATE institution_profiles SET public_slug = generate_public_slug()
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY public_slug ORDER BY id) as rn
        FROM institution_profiles
      ) t WHERE t.rn > 1
    );
  END LOOP;
END $$;
ALTER TABLE institution_profiles ALTER COLUMN public_slug SET NOT NULL;
ALTER TABLE institution_profiles ALTER COLUMN public_slug SET DEFAULT generate_public_slug();
CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_profiles_public_slug ON institution_profiles(public_slug);

DROP TRIGGER IF EXISTS trg_institution_profiles_ensure_slug ON institution_profiles;
CREATE TRIGGER trg_institution_profiles_ensure_slug
  BEFORE INSERT ON institution_profiles
  FOR EACH ROW
  EXECUTE FUNCTION ensure_public_slug();

DROP TRIGGER IF EXISTS trg_institution_profiles_slug_immutable ON institution_profiles;
CREATE TRIGGER trg_institution_profiles_slug_immutable
  BEFORE UPDATE ON institution_profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_public_slug_immutable();

-- 5. Add public_slug to job_seeker_profiles
ALTER TABLE job_seeker_profiles ADD COLUMN IF NOT EXISTS public_slug text;
UPDATE job_seeker_profiles SET public_slug = generate_public_slug() WHERE public_slug IS NULL;
DO $$
DECLARE dup_count int;
BEGIN
  LOOP
    SELECT count(*) - count(distinct public_slug) INTO dup_count FROM job_seeker_profiles;
    EXIT WHEN dup_count = 0;
    UPDATE job_seeker_profiles SET public_slug = generate_public_slug()
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY public_slug ORDER BY id) as rn
        FROM job_seeker_profiles
      ) t WHERE t.rn > 1
    );
  END LOOP;
END $$;
ALTER TABLE job_seeker_profiles ALTER COLUMN public_slug SET NOT NULL;
ALTER TABLE job_seeker_profiles ALTER COLUMN public_slug SET DEFAULT generate_public_slug();
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_seeker_profiles_public_slug ON job_seeker_profiles(public_slug);

DROP TRIGGER IF EXISTS trg_job_seeker_profiles_ensure_slug ON job_seeker_profiles;
CREATE TRIGGER trg_job_seeker_profiles_ensure_slug
  BEFORE INSERT ON job_seeker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION ensure_public_slug();

DROP TRIGGER IF EXISTS trg_job_seeker_profiles_slug_immutable ON job_seeker_profiles;
CREATE TRIGGER trg_job_seeker_profiles_slug_immutable
  BEFORE UPDATE ON job_seeker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_public_slug_immutable();

-- 6. Add public_slug to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS public_slug text;
UPDATE jobs SET public_slug = generate_public_slug() WHERE public_slug IS NULL;
DO $$
DECLARE dup_count int;
BEGIN
  LOOP
    SELECT count(*) - count(distinct public_slug) INTO dup_count FROM jobs;
    EXIT WHEN dup_count = 0;
    UPDATE jobs SET public_slug = generate_public_slug()
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY public_slug ORDER BY id) as rn
        FROM jobs
      ) t WHERE t.rn > 1
    );
  END LOOP;
END $$;
ALTER TABLE jobs ALTER COLUMN public_slug SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN public_slug SET DEFAULT generate_public_slug();
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_public_slug ON jobs(public_slug);

DROP TRIGGER IF EXISTS trg_jobs_ensure_slug ON jobs;
CREATE TRIGGER trg_jobs_ensure_slug
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION ensure_public_slug();

DROP TRIGGER IF EXISTS trg_jobs_slug_immutable ON jobs;
CREATE TRIGGER trg_jobs_slug_immutable
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_public_slug_immutable();
