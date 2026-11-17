import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { InviteProcessor, type InviteWaveJobData } from '../src/processors/invite.processor.js';

describe('BULK-03 invitation recipient isolation', () => {
  const batchId = '12345678-1234-4234-8234-123456789012';
  it.each([false, true])('never sends unrelated or synthetic recipients when batch lookup is empty/error=%s', async (failed) => {
    const sendInviteSms = vi.fn().mockResolvedValue({ success: true });
    const processor = new InviteProcessor();
    const query = {
      select: () => query, eq: () => query, update: () => query,
      single: async () => ({ data: { batch_id: batchId, status: 'dispatched' }, error: null }),
      limit: async () => ({ data: [], error: failed ? { message: 'unavailable' } : null }),
    };
    const from = vi.fn(() => query);
    Object.assign(processor, { supabase: { from }, smsService: { sendInviteSms } });
    const result = processor.process({ data: { waveId: 'wave-a', batchId, waveSize: 1 }, attemptsMade: 0 } as Job<InviteWaveJobData>);
    if (failed) await expect(result).rejects.toThrow();
    else expect((await result).sentCount).toBe(0);
    expect(from).not.toHaveBeenCalledWith('users');
    expect(sendInviteSms).not.toHaveBeenCalled();
  });
});
