import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthModal } from '../src/components/auth/AuthModal';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock AppContext
vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({
    isAuthModalOpen: true,
    closeAuthModal: vi.fn(),
    authModalDefaultRole: 'job_seeker',
    refreshSession: vi.fn(),
    addToast: vi.fn(),
  }),
}));

describe('AuthModal Turnstile Bot Challenge Integration (Hard Invariant #4)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('renders Cloudflare Turnstile widget container when NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAABBBCCCDDDEEEFFF12345';
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
    process.env.APP_ENV = 'staging';

    const html = renderToStaticMarkup(<AuthModal />);

    // Must render Turnstile container (default id for Turnstile component is cf-turnstile)
    expect(html).toContain('id="cf-turnstile"');
    expect(html).not.toContain('Security verification is unavailable (Turnstile site key missing).');
  });

  it('renders clear error banner in strict environment when NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing', () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
    delete process.env.APP_ENV;
    delete process.env.NEXT_PUBLIC_APP_ENV;

    const html = renderToStaticMarkup(<AuthModal />);

    expect(html).toContain('Security verification is unavailable (Turnstile site key missing).');
    expect(html).not.toContain('id="cf-turnstile"');
  });

  it('renders test mode placeholder when in test environment without site key', () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'test';
    delete process.env.APP_ENV;
    delete process.env.NEXT_PUBLIC_APP_ENV;

    const html = renderToStaticMarkup(<AuthModal />);

    expect(html).toContain('data-testid="turnstile-test-placeholder"');
    expect(html).toContain('Bot verification enabled (test mode)');
  });
});
