import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Location Reference Tables & Profile/Jobs Columns Migrations (20261127100000 & 20261127100100)', () => {
  const refMigrationPath = resolve(
    __dirname,
    '../../../supabase/migrations/20261127100000_locations_reference_tables.sql',
  );
  const colsMigrationPath = resolve(
    __dirname,
    '../../../supabase/migrations/20261127100100_profiles_jobs_location_refs.sql',
  );

  it('defines states, districts, and pincodes with required constraints and indexes', () => {
    expect(existsSync(refMigrationPath)).toBe(true);
    const sql = readFileSync(refMigrationPath, 'utf-8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.states');
    expect(sql).toContain('lgd_code INT PRIMARY KEY');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.districts');
    expect(sql).toContain("source TEXT NOT NULL CHECK (source IN ('lgd', 'manual-gazette'))");
    expect(sql).toContain('CONSTRAINT uq_districts_state_id UNIQUE (state_code, id)');
    expect(sql).toContain('CONSTRAINT chk_district_source CHECK');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.pincodes');
    expect(sql).toContain("pincode CHAR(6) PRIMARY KEY CHECK (pincode ~ '^[1-9][0-9]{5}$')");
    expect(sql).toContain('CONSTRAINT fk_pincodes_state_district');
    expect(sql).toContain('FOREIGN KEY (state_code, district_id) REFERENCES public.districts(state_code, id)');
    expect(sql).toContain('CONSTRAINT chk_pincodes_state_district_pair');
    expect(sql).toContain('CONSTRAINT chk_pincode_resolution CHECK');
    expect(sql).toContain("candidate_district_ids UUID[] NOT NULL DEFAULT '{}'");
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_districts_state_code ON public.districts(state_code)');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_pincodes_district_id ON public.pincodes(district_id)');
  });

  it('enforces ADR 0002 service_role-only RLS and denies anon/authenticated access on reference tables', () => {
    const sql = readFileSync(refMigrationPath, 'utf-8');

    expect(sql).toContain('ALTER TABLE public.states ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.pincodes ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public.states, public.districts, public.pincodes FROM PUBLIC, anon, authenticated, service_role',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.states, public.districts, public.pincodes TO service_role',
    );
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
  });

  it('adds nullable location columns to profile tables and jobs without touching search_jobs or location_nodes', () => {
    expect(existsSync(colsMigrationPath)).toBe(true);
    const sql = readFileSync(colsMigrationPath, 'utf-8');

    const nonCommentSql = sql.replace(/--.*$/gm, '');
    expect(nonCommentSql).toContain('ALTER TABLE public.job_seeker_profiles');
    expect(nonCommentSql).toContain('ALTER TABLE public.business_profiles');
    expect(nonCommentSql).toContain('ALTER TABLE public.institution_profiles');
    expect(nonCommentSql).toContain('ALTER TABLE public.jobs');
    expect(nonCommentSql).toContain('ADD COLUMN state_code INT REFERENCES public.states(lgd_code)');
    expect(nonCommentSql).toContain('FOREIGN KEY (state_code, district_id) REFERENCES public.districts(state_code, id)');
    expect(nonCommentSql).toContain("CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$')");
    expect(nonCommentSql).toContain('CREATE INDEX IF NOT EXISTS idx_jobs_state_district ON public.jobs(state_code, district_id)');
    expect(nonCommentSql).not.toMatch(/DROP\s+COLUMN/i);
    expect(nonCommentSql).not.toMatch(/search_jobs/i);
    expect(nonCommentSql).not.toMatch(/location_nodes/i);

    // jobs must not receive a pincode column
    const jobsSection = nonCommentSql.split('ALTER TABLE public.jobs')[1] ?? '';
    expect(jobsSection.split(';')[0]).not.toContain('pincode');
  });
});
