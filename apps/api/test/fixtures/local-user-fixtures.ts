import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import type { UserRepository } from '../../src/database/repositories/user.repository.js';
import type { OtpRedisService } from '../../src/auth/otp-redis.service.js';

/** Tag real repository writes, then remove only this suite's exact synthetic IDs. */
export function tagLocalUserFixtures(repository: UserRepository, database: SupabaseClient<Database>, sessions: Pick<OtpRedisService, 'invalidateUserSession'>) {
  if (process.env['NODE_ENV'] !== 'test' || !process.env['JOBSCLICK_TEST_MANIFEST']) throw new Error('LOCAL_AUTH_FIXTURES_ONLY');
  const source = `auth-fixture-${randomUUID()}`;
  const ids = new Set<string>();
  const create = repository.create.bind(repository);
  repository.create = async input => {
    const user = await create({ ...input, source });
    ids.add(user.id);
    return user;
  };
  return async () => {
    try {
      const before = await database.from('users').select('id').eq('source', source);
      if (before.error || before.data.length !== ids.size || before.data.some(user => !ids.has(user.id))) throw new Error('LOCAL_AUTH_FIXTURE_RECONCILIATION_FAILED');
      if (ids.size) {
        const removed = await database.from('users').delete().eq('source', source).in('id', [...ids]).select('id');
        if (removed.error || removed.data.length !== ids.size) throw new Error('LOCAL_AUTH_FIXTURE_CLEANUP_FAILED');
      }
      const after = await database.from('users').select('id').eq('source', source);
      if (after.error || after.data.length) throw new Error('LOCAL_AUTH_FIXTURE_CLEANUP_FAILED');
      await Promise.all([...ids].map(id => sessions.invalidateUserSession(id)));
    } finally { repository.create = create; }
  };
}
