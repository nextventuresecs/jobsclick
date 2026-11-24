import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

describe('Invitations Schema Migration (Email Support & Batch Indexing)', () => {
  it('defines nullable phone, email column, contact check constraint, and batch_id+status index', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../supabase/migrations/20261119100000_bulk_invitations_email_support.sql',
    );
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/ALTER TABLE (?:public\.)?invitations ALTER COLUMN phone DROP NOT NULL/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS email VARCHAR\(255\)/i);
    expect(sql).toMatch(/CHECK \((?:phone IS NOT NULL OR email IS NOT NULL)\)/i);
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_invitations_batch_status ON (?:public\.)?invitations\s*\(batch_id,\s*status\)/i,
    );
  });
});
