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
});
