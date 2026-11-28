import { describe, it, expect } from 'vitest';
import { jobFilterSchema } from '@indian-job-portal/validation';
import { JobRepository, toLiteralSearchTerm } from '../src/database/repositories/job.repository.js';

function recordingClient() {
  const calls: Array<[string, unknown[]]> = [];
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'ilike', 'gte', 'or', 'order', 'range']) {
    query[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return query;
    };
  }
  query['then'] = (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null });
  const client = {
    from: () => query,
    rpc: async () => ({ data: null, error: { message: 'force fallback' } }),
  };
  return { client, calls };
}

describe('T2 PostgREST filter injection', () => {
  it.each(['a,id.neq.0', 'x),or(is_active.eq.false', '%', 'a_b*c{d}e\\f"g'])(
    'keyword %j cannot add filters or wildcards',
    async (keyword) => {
      const { client, calls } = recordingClient();
      const repo = new JobRepository(client as never, false);
      await repo.findMany({ keyword, city: '%' });

      const orCalls = calls.filter(([m]) => m === 'or');
      for (const [, [expr]] of orCalls) {
        // Exactly the 3 intended OR branches; user text contributes no separators or wildcards.
        expect((expr as string).split(',')).toHaveLength(3);
        expect(expr as string).not.toMatch(/%%|\(|\)|\*|_|\\|"/);
      }
      expect(calls.some(([m, args]) => m === 'eq' && args[0] === 'id')).toBe(false);
      expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a[0])).toEqual(['is_active']);
      // City '%' strips to empty, so no ILIKE wildcard match-all is sent.
      expect(calls.some(([m]) => m === 'ilike')).toBe(false);
    },
  );

  it('sanitiser keeps ordinary terms', () => {
    expect(toLiteralSearchTerm('  Node.js developer ')).toBe('Node.js developer');
    expect(toLiteralSearchTerm('a,id.neq.0')).toBe('a id.neq.0');
  });

  it('validation bounds keyword/city length and limit', () => {
    expect(jobFilterSchema.safeParse({ keyword: 'x'.repeat(101) }).success).toBe(false);
    expect(jobFilterSchema.safeParse({ city: 'x'.repeat(101) }).success).toBe(false);
    expect(jobFilterSchema.safeParse({ limit: 1000 }).success).toBe(false);
    expect(jobFilterSchema.parse({ keyword: '  plumber ' }).keyword).toBe('plumber');
  });
});
