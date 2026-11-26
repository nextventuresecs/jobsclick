import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Public Projection Reads Migration (20261118085644)', () => {
  const migrationPath = resolve(
    __dirname,
    '../../../supabase/migrations/20261118085644_public_api_projection_reads.sql'
  );

  it('declares search_public_jobs RPC with FTS ts_rank and slug projections', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('FUNCTION public.search_public_jobs');
    expect(sql).toContain('ts_rank(j.fts');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_public_jobs');
    expect(sql).toContain('TO service_role');
  });

  it('declares read_public_institution_cms with security invoker and jsonb output', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('FUNCTION public.read_public_institution_cms');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.read_public_institution_cms');
    expect(sql).toContain('TO service_role');
  });

  it('allows application/pdf in private storage bucket MIME types', () => {
    const bucketMigration = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/20261110000000_private_storage_bucket.sql'),
      'utf-8'
    );
    expect(bucketMigration).toContain("'application/pdf'");
  });

  it('defines is_published on institution_profiles with DEFAULT true prior to projection views', () => {
    const isPublishedMigrationPath = resolve(
      __dirname,
      '../../../supabase/migrations/20261118080000_add_institution_is_published.sql'
    );
    expect(existsSync(isPublishedMigrationPath)).toBe(true);
    const sql = readFileSync(isPublishedMigrationPath, 'utf-8');
    expect(sql).toContain('ALTER TABLE public.institution_profiles');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_institution_profiles_is_published');
  });

  it('hardens public_business_profiles and public_jobs to filter active owners and revoke write/PUBLIC grants (AUTHZ-07)', () => {
    const hardenViewsPath = resolve(
      __dirname,
      '../../../supabase/migrations/20261126000100_harden_public_views.sql'
    );
    expect(existsSync(hardenViewsPath)).toBe(true);
    const sql = readFileSync(hardenViewsPath, 'utf-8');
    expect(sql).toContain("WHERE u.status = 'active'");
    expect(sql).toContain('REVOKE ALL ON public.public_business_profiles FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON public.public_jobs FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT SELECT ON public.public_business_profiles TO anon, authenticated;');
    expect(sql).toContain('GRANT SELECT ON public.public_jobs TO anon, authenticated;');
  });
});
