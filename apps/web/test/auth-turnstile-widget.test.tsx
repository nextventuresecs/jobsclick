import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { AuthModal } from '../src/components/auth/AuthModal';

const context = vi.hoisted(() => ({ entry: 'job_seeker' }));
const renderModal = (locale: 'en' | 'hi' = 'en') => renderToStaticMarkup(
  <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : hi} timeZone="Asia/Kolkata">
    <AuthModal />
  </NextIntlClientProvider>,
);

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
    authModalDefaultEntry: context.entry,
    refreshSession: vi.fn(),
    addToast: vi.fn(),
  }),
}));

describe('AuthModal Turnstile Bot Challenge Integration (Hard Invariant #4)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    context.entry = 'job_seeker';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('renders Cloudflare Turnstile widget container when NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAABBBCCCDDDEEEFFF12345';
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
    process.env.APP_ENV = 'staging';

    const html = renderModal();

    // Must render Turnstile container (default id for Turnstile component is cf-turnstile)
    expect(html).toContain('id="cf-turnstile"');
    expect(html).not.toContain('Security verification is unavailable (Turnstile site key missing).');
  });

  it('renders clear error banner in strict environment when NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing', () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
    delete process.env.APP_ENV;
    delete process.env.NEXT_PUBLIC_APP_ENV;

    const html = renderModal();

    expect(html).toContain('Security verification is unavailable (Turnstile site key missing).');
    expect(html).not.toContain('id="cf-turnstile"');
  });

  it('renders test mode placeholder when in test environment without site key', () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'test';
    delete process.env.APP_ENV;
    delete process.env.NEXT_PUBLIC_APP_ENV;

    const html = renderModal();

    expect(html).toContain('data-testid="turnstile-test-placeholder"');
    expect(html).toContain('Bot verification enabled (test mode)');
  });

  it('offers separate entry points for all four audiences', () => {
    const html = renderModal();
    for (const label of ['Institution Login', 'Invited Student', 'Independent Job Seeker', 'Employer / MSME']) {
      expect(html).toContain(label);
    }
  });

  it('guides invited students to mobile OTP without showing other sign-in channels', () => {
    context.entry = 'invited_student';
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN = 'true';
    const html = renderModal();
    expect(html).toContain('mobile number your institution used');
    expect(html).toContain('type="tel"');
    expect(html).not.toContain('Continue with Google');
    expect(html).not.toContain('Email Address');
  });

  it('preselects the institution path with localized Hindi guidance', () => {
    context.entry = 'institution';
    const html = renderModal('hi');
    expect(html).toMatch(/<input[^>]*name="auth-entry"[^>]*checked=""[^>]*\/><span[^>]*>संस्थान लॉगिन/);
    expect(html).toContain('प्लेसमेंट अधिकारी');
  });
});
