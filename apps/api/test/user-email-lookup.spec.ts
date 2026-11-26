import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@indian-job-portal/database';
import { UserRepository } from '../src/database/repositories/user.repository.js';

describe('UserRepository email lookup', () => {
  it.each([
    ['findByEmail', 'email'],
    ['findByPendingEmail', 'pending_email'],
  ] as const)('uses literal canonical equality for %s and supports legacy casing', async (method, column) => {
    const filters: string[] = [];
    const email = 'sample_name+tag@example.test';
    const client = createClient<Database>('http://127.0.0.1:54321', 'test-only-key', {
      auth: { persistSession: false },
      global: {
        fetch: vi.fn(async (input: RequestInfo | URL) => {
          filters.push(new URL(String(input)).searchParams.get(column) ?? '');
          return Response.json(filters.length === 1 ? [] : [{ id: 'legacy', [column]: ` ${email.toUpperCase()} ` }]);
        }),
      },
    });

    await expect(new UserRepository(client)[method](` ${email.toUpperCase()} `)).resolves.toMatchObject({ id: 'legacy' });
    expect(filters).toEqual([
      `eq.${email}`,
      'imatch.^[[:space:]]*sample_name\\+tag@example\\.test[[:space:]]*$',
    ]);
  });
});
