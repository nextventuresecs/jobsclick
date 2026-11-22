import { describe, it, expect } from 'vitest';

describe('Public Views and RPC Security Specs (ID-02 Task 1)', () => {
  const anonKey =
    process.env['SUPABASE_ANON_KEY'] ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  const serviceRoleKey =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWZlcmVuY2UiOiJkZWZhdWx0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY0ODQwMCwiZXhwIjoyMDk2MjI0NDAwfQ.dummy_service_role_key_for_testing_only';
  const restUrl =
    process.env['SUPABASE_URL']
      ? `${process.env['SUPABASE_URL']}/rest/v1`
      : 'http://127.0.0.1:54321/rest/v1';

  const forbiddenRegex = /(^|_)(id|user_id|owner_id|employer_id)$/i;
  const views = ['public_business_profiles', 'public_jobs'] as const;

  it('rejects anon direct access to public_institution_profiles under AUTH-05 F0-f (service-only view)', async () => {
    const res = await fetch(`${restUrl}/public_institution_profiles?limit=1`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    expect(res.status).toBe(401);
  });

  for (const view of views) {
    describe(`View: ${view}`, () => {
      it(`with anon key, GET /rest/v1/${view} returns no forbidden keys and includes slug`, async () => {
        const res = await fetch(`${restUrl}/${view}?limit=5`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as Record<string, unknown>[];
        expect(Array.isArray(data)).toBe(true);

        if (data.length > 0) {
          for (const row of data) {
            expect(row).toHaveProperty('slug');
            expect(typeof row['slug']).toBe('string');
            expect(row['slug']).toMatch(/^[0-9a-km-np-tv-z]{12}$/);

            for (const key of Object.keys(row)) {
              expect(
                forbiddenRegex.test(key),
                `Forbidden key "${key}" found in ${view} row: ${JSON.stringify(row)}`,
              ).toBe(false);
            }
          }
        }
      });

      it(`selecting "id" from ${view} with anon key fails (400 Bad Request)`, async () => {
        const res = await fetch(`${restUrl}/${view}?select=id&limit=1`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        });

        // PostgREST returns 400 Bad Request when an unselected or non-existent column is selected
        expect(res.status).toBe(400);
        const errText = await res.text();
        expect(errText.toLowerCase()).toContain('id');
      });
    });
  }

  describe('RPC: search_jobs', () => {
    it('rejects anon direct access to search_jobs under service-role permission boundary', async () => {
      const res = await fetch(`${restUrl}/rpc/search_jobs`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_limit: 5 }),
      });

      expect([401, 403, 404]).toContain(res.status);
    });

    it('returns slug and company_slug without internal UUIDs or employer_id with service role key', async () => {
      const res = await fetch(`${restUrl}/rpc/search_jobs`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_limit: 5 }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>[];
      expect(Array.isArray(data)).toBe(true);

      if (data.length > 0) {
        for (const job of data) {
          expect(job).toHaveProperty('slug');
          expect(job).toHaveProperty('company_slug');
          expect(job).not.toHaveProperty('id');
          expect(job).not.toHaveProperty('employer_id');
          expect(job).not.toHaveProperty('created_by');
          expect(job).not.toHaveProperty('updated_by');
          expect(job).not.toHaveProperty('source');
          expect(job).not.toHaveProperty('fts');

          for (const key of Object.keys(job)) {
            expect(
              forbiddenRegex.test(key),
              `Forbidden key "${key}" returned by search_jobs RPC: ${JSON.stringify(job)}`,
            ).toBe(false);
          }
        }
      }
    });
  });
});
