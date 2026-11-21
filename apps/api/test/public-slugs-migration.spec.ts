import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWZlcmVuY2UiOiJkZWZhdWx0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY0ODQwMCwiZXhwIjoyMDk2MjI0NDAwfQ.dummy_service_role_key_for_testing_only';

const CROCKFORD_BASE32_REGEX = /^[0-9a-km-np-tv-z]{12}$/;

describe('Migration 20261115000000: Public Slugs Backfill & Invariants (Task 1)', () => {
  let supabase: SupabaseClient;

  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { count: bCount } = await supabase
      .from('business_profiles')
      .select('id', { count: 'exact', head: true });
    if (!bCount || bCount === 0) {
      const employerId = crypto.randomUUID();
      const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
      await supabase.from('users').insert({
        id: employerId,
        phone,
        role: 'employer',
        status: 'active',
        source: 'seed',
      });
      await supabase.from('business_profiles').insert({
        user_id: employerId,
        company_name: 'Test Enterprise Corp',
        ownership_type: 'private_limited',
        company_size: '11-50',
        city: 'Indore',
        state: 'Madhya Pradesh',
        source: 'seed',
      });
    }
  });

  const tables = ['business_profiles', 'institution_profiles', 'job_seeker_profiles', 'jobs'] as const;

  for (const table of tables) {
    it(`verifies ${table} public_slug column exists, is non-null, unique, and strictly 12-char Crockford Base32`, async () => {
      // 1. Fetch sample rows and total count
      const { data: rows, error, count } = await supabase
        .from(table)
        .select('id, public_slug', { count: 'exact' })
        .limit(100);

      expect(error).toBeNull();
      expect(count).toBeGreaterThan(0);
      expect(rows).toBeDefined();
      expect(rows!.length).toBeGreaterThan(0);

      // 2. Assert all sample rows have valid 12-char Crockford Base32 slug
      const seen = new Set<string>();
      for (const row of rows!) {
        expect(row.public_slug).toBeDefined();
        expect(typeof row.public_slug).toBe('string');
        expect(row.public_slug).toMatch(CROCKFORD_BASE32_REGEX);
        expect(seen.has(row.public_slug)).toBe(false);
        seen.add(row.public_slug);

        // 3. Slugs must not equal or contain the row's internal id
        expect(row.public_slug).not.toBe(row.id);
        expect(row.id).not.toContain(row.public_slug);
        expect(row.public_slug).not.toContain(row.id);
      }
    });
  }

  it('verifies that public_slugs never contain or equal user phone numbers', async () => {
    // Check job_seeker_profiles joined with users
    const { data: seekers, error } = await supabase
      .from('job_seeker_profiles')
      .select('id, public_slug, user_id, users!job_seeker_profiles_user_id_fkey(phone)')
      .limit(100);

    expect(error).toBeNull();
    expect(seekers).toBeDefined();

    for (const seeker of seekers!) {
      const user = (seeker as unknown as { users?: { phone?: string } }).users;
      if (user?.phone) {
        const rawPhone = user.phone.replace(/\D/g, '');
        expect(seeker.public_slug).not.toBe(rawPhone);
        expect(seeker.public_slug).not.toContain(rawPhone);
        if (rawPhone.length >= 6) {
          expect(seeker.public_slug).not.toContain(rawPhone.slice(-6));
        }
      }
    }
  });

  it('verifies public_slug immutability trigger blocks updates', async () => {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, public_slug')
      .limit(1)
      .single();

    expect(job).toBeDefined();

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ public_slug: 'tampered1234' })
      .eq('id', job!.id);

    expect(updateError).not.toBeNull();
    expect(updateError?.message).toContain('public_slug is immutable');
  });
});
