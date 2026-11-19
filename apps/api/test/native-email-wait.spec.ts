import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForNativeEmailOtp } from './fixtures/native-email-wait.js';
describe('AUTH-03 native mailbox readiness', () => {
  afterEach(() => vi.useRealTimers());
  it('waits for the actual message beyond the former four-second window', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const result = waitForNativeEmailOtp(async () => (Date.now() - start >= 4500 ? '654321' : ''));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toBe('654321');
  });
  it('remains bounded and never invents a missing code', async () => {
    vi.useFakeTimers();
    const result = waitForNativeEmailOtp(async () => '');
    await vi.advanceTimersByTimeAsync(15000);
    expect(await result).toBe('');
  });
});
