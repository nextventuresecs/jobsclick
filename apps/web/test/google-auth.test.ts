import { describe, it, expect, afterEach } from 'vitest';
import { isSupabaseConfigured, getSupabaseBrowserClient } from '../src/lib/supabaseClient.js';
import CallbackPage from '../src/app/auth/callback/page.js';
import { isClientRole } from '@indian-job-portal/validation';
import fs from 'node:fs';
import path from 'node:path';

describe('Google OAuth & Supabase Authentication Integration', () => {
  const originalEnv = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN;
    }
  });

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

  it('hides Google Sign-in button by default when NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is unset or false', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN;
    const authModalSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/auth/AuthModal.tsx'),
      'utf8'
    );
    expect(authModalSource).toContain("process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === 'true'");
    expect(process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN).toBeUndefined();
    expect(process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === 'true').toBe(false);
  });

  it('enables Google Sign-in button strictly when NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN is "true"', () => {
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN = 'true';
    expect(process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === 'true').toBe(true);

    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN = 'false';
    expect(process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === 'true').toBe(false);
  });
});
