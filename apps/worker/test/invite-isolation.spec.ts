import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { InviteProcessor, type InviteWaveJobData } from '../src/processors/invite.processor.js';

describe('BULK-03 invitation recipient isolation (P0-6 Fix)', () => {
  const batchId = '12345678-1234-4234-8234-123456789012';

  it('queries ONLY invitations scoped to batch_id with status pending, never queries users globally', async () => {
    const sendInviteSms = vi.fn().mockResolvedValue({ success: true });
    const processor = new InviteProcessor();

    const query: any = {
      select: () => query,
      eq: vi.fn(() => query),
      not: vi.fn(() => query),
      update: () => query,
      single: async () => ({ data: { id: 'wave-1', batch_id: batchId, status: 'dispatched' }, error: null }),
      limit: async () => ({
        data: [
          { id: 'inv-1', phone: '9876543210' },
          { id: 'inv-2', phone: '9876543211' },
        ],
        error: null,
      }),
    };
    const from = vi.fn((table: string) => query);
    Object.assign(processor, { supabase: { from }, smsService: { sendInviteSms } });

    const result = await processor.process({
      data: { waveId: 'wave-1', batchId, waveSize: 2 },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<InviteWaveJobData>);

    expect(result.sentCount).toBe(2);
    expect(sendInviteSms).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalledWith('users');
    expect(from).toHaveBeenCalledWith('invitations');
    expect(query.eq).toHaveBeenCalledWith('batch_id', batchId);
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('never sends unrelated or synthetic recipients when batch lookup is empty', async () => {
    const sendInviteSms = vi.fn().mockResolvedValue({ success: true });
    const processor = new InviteProcessor();

    const query: any = {
      select: () => query,
      eq: vi.fn(() => query),
      not: vi.fn(() => query),
      update: () => query,
      single: async () => ({ data: { id: 'wave-2', batch_id: batchId, status: 'dispatched' }, error: null }),
      limit: async () => ({ data: [], error: null }),
    };
    const from = vi.fn(() => query);
    Object.assign(processor, { supabase: { from }, smsService: { sendInviteSms } });

    const result = await processor.process({
      data: { waveId: 'wave-2', batchId, waveSize: 10 },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<InviteWaveJobData>);

    expect(result.sentCount).toBe(0);
    expect(sendInviteSms).not.toHaveBeenCalled();
  });
});
