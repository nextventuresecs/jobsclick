import { afterEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  addEventProcessor: vi.fn(),
  replayIntegration: vi.fn(),
  consoleLoggingIntegration: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => sentry);

describe('Sentry Replay email verification privacy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('strips tokens from recordings and replay metadata before transmission', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.test/1');
    await import('../sentry.client.config.js');

    const href = '/auth/verify-email?token=fixture#token=fragment';
    const recording = { type: 4, timestamp: 123, data: { href, width: 1024, height: 768 } };
    const scrubRecording = sentry.replayIntegration.mock.calls[0]?.[0].beforeAddRecordingEvent;
    expect(scrubRecording(recording)).toEqual({
      ...recording,
      data: { ...recording.data, href: '/auth/verify-email' },
    });

    const processReplayEvent = sentry.addEventProcessor.mock.calls[0]?.[0];
    expect(processReplayEvent({
      type: 'replay_event',
      urls: [href, '/jobs?q=welder'],
      request: { url: href, query_string: 'token=fixture' },
    })).toEqual({
      type: 'replay_event',
      urls: ['/auth/verify-email', '/jobs?q=welder'],
      request: { url: '/auth/verify-email', query_string: 'token=[REDACTED]' },
    });
  });
});
