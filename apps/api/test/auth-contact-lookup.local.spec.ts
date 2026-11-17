import { randomInt, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@indian-job-portal/database';
import { UserRepository } from '../src/database/repositories/user.repository.js';

describe.runIf(process.env['RUN_LOCAL_SUPABASE'] === '1')('AUTH-01 literal email lookup', () => {
  const id = randomUUID();
  const source = `contact-lookup-${id}`;
  const email = `person-${id}@example.invalid`;
  const pending = `pending-${id}@example.invalid`;
  const database = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!, { auth: { persistSession: false, autoRefreshToken: false } });
  const repository = new UserRepository(database);
  let local = false;
  beforeAll(async () => {
    if (process.env['NODE_ENV'] !== 'test' || !process.env['JOBSCLICK_TEST_MANIFEST']) throw new Error('LOCAL_TEST_ONLY');
    local = true;
    expect((await database.from('users').insert({ id, phone: `8${randomInt(100000000, 999999999)}`, email, pending_email: pending, role: 'employer', status: 'invited', source })).error).toBeNull();
  });
  afterAll(async () => { if (local) expect((await database.from('users').delete().eq('id', id).eq('source', source)).error).toBeNull(); });

  it('compares email underscores literally instead of matching another user', async () => {
    expect((await repository.findByEmail(email.toUpperCase()))?.id).toBe(id);
    expect(await repository.findByEmail(`person_${id}@example.invalid`)).toBeNull();
    expect(await repository.findByPendingEmail(`pending_${id}@example.invalid`)).toBeNull();
  });
});
