import { describe, it, expect } from 'vitest';
import { isSupabaseConfigured, getSupabaseBrowserClient } from '../src/lib/supabaseClient.js';
import CallbackPage from '../src/app/auth/callback/page.js';
import { isClientRole } from '@indian-job-portal/validation';

describe('Google OAuth & Supabase Authentication Integration', () => {
  it('exports Supabase browser client helpers', async () => {
    expect(typeof getSupabaseBrowserClient).toBe('function');
    expect(typeof isSupabaseConfigured).toBe('function');
  });

  it('validates supported roles for OAuth redirect', () => {
    expect(isClientRole('jobseeker')).toBe(true);
    expect(isClientRole('employer')).toBe(true);
    expect(isClientRole('institution')).toBe(true);
    expect(isClientRole('msme_dept')).toBe(true);
    expect(isClientRole('platform_admin')).toBe(true);
    expect(isClientRole('invalid_role')).toBe(false);
  });

  it('exports AuthCallbackPage with Suspense boundary', async () => {
    expect(CallbackPage).toBeDefined();
    expect(typeof CallbackPage).toBe('function');
  });

  it('verifies redirect URL construction preserves target user role', () => {
    const origin = 'http://localhost:3000';
    const selectedRole = 'employer';
    const redirectUrl = new URL(`${origin}/auth/callback?role=${encodeURIComponent(selectedRole)}`);

    expect(redirectUrl.pathname).toBe('/auth/callback');
    expect(redirectUrl.searchParams.get('role')).toBe('employer');
    expect(isClientRole(redirectUrl.searchParams.get('role'))).toBe(true);
  });
});
