import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { cleanupResumePdfs } from './cleanup-resume-pdfs.mjs';

const seekerId = '00000000-0000-4000-8000-000000000011';

function fixture(storageStatus: number, completionStatus = 204) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/rest/v1/resume_pdf_erasure' && method === 'GET') {
      return Response.json([{ seeker_id: seekerId }]);
    }
    if (url.pathname === '/storage/v1/object/private' && method === 'DELETE') {
      return storageStatus === 200
        ? Response.json([])
        : Response.json({ message: 'fixture storage unavailable' }, { status: storageStatus });
    }
    if (url.pathname === '/rest/v1/resume_pdf_erasure' && method === 'PATCH') {
      return new Response(null, { status: completionStatus });
    }
    throw new Error('Unexpected request');
  });
  const client = createClient('https://example.test', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  return { client, fetch };
}

describe('Draft private resume PDF erasure', () => {
  it('uses the private Storage API and acknowledges an already absent PDF', async () => {
    const { client, fetch } = fixture(200);
    await expect(cleanupResumePdfs(client)).resolves.toEqual({ completed: 1, pendingRetry: 0 });

    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'DELETE', 'PATCH']);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      prefixes: [`resumes/${seekerId}.pdf`],
    });
    const completionUrl = new URL(String(fetch.mock.calls[2]?.[0]));
    expect(completionUrl.searchParams.get('seeker_id')).toBe(`eq.${seekerId}`);
    expect(completionUrl.searchParams.get('completed_at')).toBe('is.null');
  });

  it('leaves a storage failure pending and does not acknowledge it', async () => {
    const { client, fetch } = fixture(500);
    await expect(cleanupResumePdfs(client)).resolves.toEqual({ completed: 0, pendingRetry: 1 });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'DELETE']);
  });

  it('reports work pending when the completion write fails after storage deletion', async () => {
    const { client } = fixture(200, 500);
    await expect(cleanupResumePdfs(client)).resolves.toEqual({ completed: 0, pendingRetry: 1 });
  });
});
