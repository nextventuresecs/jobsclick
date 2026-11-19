import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendInterviewInviteSmsApi } from '../src/components/workspaces/employer/employerApi';

describe('Employer Interview Invite API Client (Hard Invariant #1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /jobs/applications/:appId/interview-invite and returns confirmation message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Interview invite sent via platform SMS',
      }),
    } as unknown as Response);

    const result = await sendInterviewInviteSmsApi(
      'http://localhost:3001',
      'Bearer mock-jwt',
      'usr-employer-1',
      'app-999'
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('Interview invite');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/jobs/applications/app-999/interview-invite',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-jwt',
          'x-user-id': 'usr-employer-1',
        }),
      })
    );
  });

  it('throws an error when the server returns an error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message: 'You do not have permission to invite candidates for this job',
      }),
    } as unknown as Response);

    await expect(
      sendInterviewInviteSmsApi(
        'http://localhost:3001',
        'Bearer mock-jwt',
        'usr-unauthorized',
        'app-999'
      )
    ).rejects.toThrow('You do not have permission to invite candidates for this job');
  });
});
