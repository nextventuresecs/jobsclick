import { afterEach, expect, it, vi } from 'vitest';
import { requestSeekerPdfUrl } from '../src/components/workspaces/seeker/seekerApi';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('waits for the first resume to be ready through the authenticated web route', async () => {
  vi.useFakeTimers();
  const url = 'https://storage.example.test/private/resumes/example.pdf';
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ downloadUrl: null }, { status: 202 }))
    .mockResolvedValueOnce(Response.json({ downloadUrl: url }));
  vi.stubGlobal('fetch', fetchMock);

  const request = requestSeekerPdfUrl();
  const verified = expect(request).resolves.toBe(url);
  await vi.advanceTimersByTimeAsync(2000);
  await verified;
  expect(fetchMock.mock.calls).toEqual([
    ['/api/profiles/seeker/me/pdf', { cache: 'no-store' }],
    ['/api/profiles/seeker/me/pdf', { cache: 'no-store' }],
  ]);
});

it('does not retry an upstream failure as though it were a queued resume', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({}, { status: 503 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(requestSeekerPdfUrl()).rejects.toThrow('RESUME_UNAVAILABLE');
  expect(fetchMock).toHaveBeenCalledOnce();
});
