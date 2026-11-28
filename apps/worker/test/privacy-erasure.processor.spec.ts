import { describe, it, expect } from 'vitest';
import type { Job } from 'bullmq';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  privacyErasureProcessor,
  type PrivacyErasureJobData,
} from '../src/processors/privacy-erasure.processor.js';

type Call = { table: string; op: string; payload?: unknown };

function fakeDb(request: { id: string; user_id: string; status: string }, opts: { rpcError?: boolean } = {}) {
  const calls: Call[] = [];
  const rpcCalls: Array<[string, unknown]> = [];
  const removed: string[][] = [];
  const builder = (table: string) => {
    const chain = {
      select: () => { calls.push({ table, op: 'select' }); return chain; },
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return chain; },
      delete: () => { calls.push({ table, op: 'delete' }); return chain; },
      eq: () => chain,
      is: () => chain,
      single: async () => ({ data: request, error: null }),
      then: (resolve: (v: unknown) => void) =>
        resolve(table === 'job_seeker_profiles' ? { data: [{ id: 'seeker-1' }], error: null } : { data: null, error: null }),
    };
    return chain;
  };
  const db = {
    from: builder,
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push([fn, args]);
      return { error: opts.rpcError ? { message: 'boom' } : null };
    },
    storage: { from: () => ({ remove: async (paths: string[]) => { removed.push(paths); return { error: null }; } }) },
  } as unknown as SupabaseClient;
  return { db, calls, rpcCalls, removed };
}

const job = (data: PrivacyErasureJobData, attemptsMade = 0) =>
  ({ data, attemptsMade, opts: { attempts: 3 } }) as unknown as Job<PrivacyErasureJobData>;

describe('T1 privacy erasure processor', () => {
  it('anonymises, deletes resume PDFs, marks done, never deletes users or payments', async () => {
    const { db, calls, rpcCalls, removed } = fakeDb({ id: 'r1', user_id: 'u1', status: 'pending' });
    const result = await privacyErasureProcessor(job({ requestId: 'r1', userId: 'u1' }), db);

    expect(result).toEqual({ requestId: 'r1', status: 'done', resumePdfsDeleted: 1 });
    expect(rpcCalls).toEqual([['anonymise_user', { p_user_id: 'u1' }]]);
    expect(removed).toEqual([['resumes/seeker-1.pdf']]);
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
    expect(calls.some((c) => c.table === 'payments')).toBe(false);
    const statuses = calls
      .filter((c) => c.table === 'privacy_erasure_requests' && c.op === 'update')
      .map((c) => (c.payload as { status: string }).status);
    expect(statuses).toEqual(['processing', 'done']);
  });

  it('refuses a job whose userId does not own the request', async () => {
    const { db, rpcCalls } = fakeDb({ id: 'r1', user_id: 'owner', status: 'pending' });
    await expect(privacyErasureProcessor(job({ requestId: 'r1', userId: 'attacker' }), db)).rejects.toThrow(
      'ERASURE_REQUEST_USER_MISMATCH',
    );
    expect(rpcCalls).toHaveLength(0);
  });

  it('is a no-op for an already completed request', async () => {
    const { db, rpcCalls } = fakeDb({ id: 'r1', user_id: 'u1', status: 'done' });
    await privacyErasureProcessor(job({ requestId: 'r1', userId: 'u1' }), db);
    expect(rpcCalls).toHaveLength(0);
  });

  it('marks failed only on the last attempt', async () => {
    const early = fakeDb({ id: 'r1', user_id: 'u1', status: 'pending' }, { rpcError: true });
    await expect(privacyErasureProcessor(job({ requestId: 'r1', userId: 'u1' }, 0), early.db)).rejects.toThrow();
    const last = fakeDb({ id: 'r1', user_id: 'u1', status: 'pending' }, { rpcError: true });
    await expect(privacyErasureProcessor(job({ requestId: 'r1', userId: 'u1' }, 2), last.db)).rejects.toThrow();
    const final = (c: Call[]) => (c.filter((x) => x.op === 'update').at(-1)?.payload as { status: string }).status;
    expect(final(early.calls)).toBe('processing');
    expect(final(last.calls)).toBe('failed');
  });
});
