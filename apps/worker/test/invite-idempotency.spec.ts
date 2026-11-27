import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { InviteProcessor, type InviteWaveJobData } from '../src/processors/invite.processor.js';

interface SimInvitationRow {
  id: string;
  batch_id: string;
  phone: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  language?: 'en' | 'hi';
  claimed_at?: string | null;
  claimed_by_wave_id?: string | null;
  provider_message_id?: string | null;
}

function createStatefulInviteSupabase(opts: {
  batchId: string;
  waveId: string;
  invitations: SimInvitationRow[];
  batchLanguage?: 'en' | 'hi';
  failSentWriteForId?: string;
}) {
  const wave = {
    id: opts.waveId,
    batch_id: opts.batchId,
    wave_size: opts.invitations.length,
    cost_per_sms_inr: 0.25,
    total_cost_inr: 0,
    status: 'dispatched',
    sent_count: 0,
    failed_count: 0,
    created_at: new Date().toISOString(),
  };

  const rpc = vi.fn(async (fnName: string, params: Record<string, unknown>) => {
    if (fnName === 'reclaim_stale_sending_invitations') {
      const staleMinutes = Number(params['p_stale_minutes'] ?? 15);
      const cutoffMs = Date.now() - staleMinutes * 60 * 1000;
      let reclaimed = 0;
      for (const row of opts.invitations) {
        if (
          row.batch_id === params['p_batch_id'] &&
          row.status === 'sending' &&
          row.claimed_at &&
          new Date(row.claimed_at).getTime() < cutoffMs
        ) {
          row.status = 'pending';
          row.claimed_at = null;
          row.claimed_by_wave_id = null;
          reclaimed++;
        }
      }
      return { data: reclaimed, error: null };
    }

    if (fnName === 'claim_pending_invitations') {
      const limit = Number(params['p_limit'] ?? 0);
      const claimed: Array<{ id: string; phone: string; language: 'en' | 'hi' }> = [];
      for (const row of opts.invitations) {
        if (claimed.length >= limit) break;
        if (row.batch_id === params['p_batch_id'] && row.status === 'pending' && row.phone) {
          row.status = 'sending';
          row.claimed_at = new Date().toISOString();
          row.claimed_by_wave_id = String(params['p_wave_id']);
          claimed.push({
            id: row.id,
            phone: row.phone,
            language: row.language ?? 'en',
          });
        }
      }
      return { data: claimed, error: null };
    }

    return { data: null, error: { message: `Unknown RPC: ${fnName}` } };
  });

  const from = vi.fn((table: string) => {
    const state: {
      filters: Record<string, unknown>;
      updatePayload: Record<string, unknown> | null;
      selectCols: string | null;
    } = {
      filters: {},
      updatePayload: null,
      selectCols: null,
    };

    const builder: Record<string, unknown> = {
      select: (cols = '*') => {
        state.selectCols = cols;
        return builder;
      },
      update: (payload: Record<string, unknown>) => {
        state.updatePayload = payload;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        state.filters[col] = val;
        if (table === 'invitations' && state.updatePayload && col === 'id') {
          const target = opts.invitations.find((r) => r.id === val);
          if (target && opts.failSentWriteForId === target.id && state.updatePayload['status'] === 'sent') {
            return Promise.resolve({
              data: null,
              error: { message: 'simulated supabase write error' },
            });
          }
          if (target) {
            Object.assign(target, state.updatePayload);
          }
          return Promise.resolve({ data: target ? [target] : [], error: null });
        }
        if (table === 'invite_waves' && state.updatePayload && col === 'id') {
          Object.assign(wave, state.updatePayload);
          return Promise.resolve({ data: [wave], error: null });
        }
        return builder;
      },
      not: () => builder,
      limit: async (n: number) => {
        if (table === 'invitations') {
          const rows = opts.invitations
            .filter(
              (r) =>
                (!state.filters['batch_id'] || r.batch_id === state.filters['batch_id']) &&
                (!state.filters['status'] || r.status === state.filters['status']) &&
                Boolean(r.phone),
            )
            .slice(0, n);
          return { data: rows, error: null };
        }
        return { data: [], error: null };
      },
      single: async () => {
        if (table === 'invite_waves') {
          return { data: { ...wave }, error: null };
        }
        if (table === 'bulk_import_batches') {
          return { data: { id: opts.batchId, language: opts.batchLanguage ?? 'en' }, error: null };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'invite_waves') {
          return { data: { ...wave }, error: null };
        }
        if (table === 'bulk_import_batches') {
          return { data: { id: opts.batchId, language: opts.batchLanguage ?? 'en' }, error: null };
        }
        return { data: null, error: null };
      },
    };

    return builder;
  });

  return { wave, rpc, from, supabase: { from, rpc } };
}

describe('#134 Invite wave idempotency, claim-before-send, reaper, and Hindi language routing', () => {
  it('claims pending rows before send so a failed sent-status write does not cause a re-send on retry', async () => {
    const batchId = '11111111-1111-4111-8111-111111111111';
    const waveId = '22222222-2222-4222-8222-222222222222';
    const invitations: SimInvitationRow[] = [
      { id: 'inv-1', batch_id: batchId, phone: '9876543210', status: 'pending', language: 'en' },
      { id: 'inv-2', batch_id: batchId, phone: '9876543211', status: 'pending', language: 'en' },
    ];

    const sim = createStatefulInviteSupabase({
      batchId,
      waveId,
      invitations,
      failSentWriteForId: 'inv-1',
    });

    const sendInviteSms = vi.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      messageId: 'msg_123',
    });

    const processor = new InviteProcessor(null, sim.supabase as never);
    Object.assign(processor, { smsService: { sendInviteSms } });

    const job = {
      id: 'job-1',
      attemptsMade: 0,
      data: { waveId, batchId, waveSize: 2, costPerSmsInr: 0.25 } satisfies InviteWaveJobData,
      updateProgress: vi.fn(),
    } as unknown as Job<InviteWaveJobData>;

    await expect(processor.process(job)).rejects.toThrow(/INVITE_STATUS_WRITE_FAILED/);
    // Only inv-1 was attempted before the write error surfaced; inv-1 stays 'sending' (not 'pending')
    expect(invitations[0]!.status).toBe('sending');
    expect(sendInviteSms).toHaveBeenCalledTimes(1);

    // Retry attempt: inv-1 is still 'sending' so claim_pending_invitations MUST NOT pick it up again
    const retryResult = await processor.process({ ...job, attemptsMade: 1 } as Job<InviteWaveJobData>);
    expect(sendInviteSms).toHaveBeenCalledTimes(2);
    expect(sendInviteSms.mock.calls.map((c) => c[0].phone)).toEqual(['9876543210', '9876543211']);
    expect(invitations[1]!.status).toBe('sent');
    expect(retryResult.sentCount).toBe(1);
    expect(retryResult.totalCostInr).toBe(0.25);
  });

  it('reclaims stale sending rows older than N minutes back to pending via reaper', async () => {
    const batchId = '33333333-3333-4333-8333-333333333333';
    const waveId = '44444444-4444-4444-8444-444444444444';
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    const invitations: SimInvitationRow[] = [
      { id: 'inv-stale', batch_id: batchId, phone: '9876500001', status: 'sending', claimed_at: twentyMinutesAgo },
      { id: 'inv-fresh', batch_id: batchId, phone: '9876500002', status: 'sending', claimed_at: oneMinuteAgo },
    ];

    const sim = createStatefulInviteSupabase({ batchId, waveId, invitations });
    const processor = new InviteProcessor(null, sim.supabase as never);

    const reclaimed = await processor.reclaimStaleSendingInvitations(batchId, 15);
    expect(reclaimed).toBe(1);
    expect(invitations[0]!.status).toBe('pending');
    expect(invitations[0]!.claimed_at).toBeNull();
    expect(invitations[1]!.status).toBe('sending');
  });

  it('routes Hindi language from invitation row (and batch fallback) to sendInviteSms', async () => {
    const batchId = '55555555-5555-4555-8555-555555555555';
    const waveId = '66666666-6666-4666-8666-666666666666';
    const invitations: SimInvitationRow[] = [
      { id: 'inv-hi', batch_id: batchId, phone: '9876543210', status: 'pending', language: 'hi' },
      { id: 'inv-en', batch_id: batchId, phone: '9876543211', status: 'pending', language: 'en' },
    ];

    const sim = createStatefulInviteSupabase({ batchId, waveId, invitations });
    const sendInviteSms = vi.fn().mockResolvedValue({ success: true, message: 'ok', messageId: 'msg_hi' });

    const processor = new InviteProcessor(null, sim.supabase as never);
    Object.assign(processor, { smsService: { sendInviteSms } });

    const result = await processor.process({
      id: 'job-hi',
      attemptsMade: 0,
      data: { waveId, batchId, waveSize: 2, costPerSmsInr: 0.2 } satisfies InviteWaveJobData,
      updateProgress: vi.fn(),
    } as unknown as Job<InviteWaveJobData>);

    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.totalCostInr).toBe(0.4);
    expect(sendInviteSms).toHaveBeenNthCalledWith(1, { phone: '9876543210', language: 'hi' });
    expect(sendInviteSms).toHaveBeenNthCalledWith(2, { phone: '9876543211', language: 'en' });
  });
});
