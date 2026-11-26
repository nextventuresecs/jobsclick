import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';

describe('document CSP', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('passes a fresh nonce to Next rendering and allows the configured service origins', () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api-staging.example.test/v1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth-staging.example.test');
    const req = new NextRequest('https://staging.example.test/jobs', {
      headers: { 'content-security-policy': "script-src 'nonce-client-controlled'" },
    });

    const response = middleware(req);
    const csp = response.headers.get('content-security-policy') ?? '';
    const scriptSrc = csp.split('; ').find((directive) => directive.startsWith('script-src '));
    const connectSrc = csp.split('; ').find((directive) => directive.startsWith('connect-src '));
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/]+=*'/);
    expect(scriptSrc).toContain('https://checkout.razorpay.com');
    expect(scriptSrc).toContain('https://challenges.cloudflare.com');
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain('blob:');
    expect(csp.split('; ')).toContain("worker-src 'self' blob:");
    expect(csp).not.toContain('client-controlled');
    expect(connectSrc?.split(' ')).toContain('https://api-staging.example.test');
    expect(connectSrc?.split(' ')).toContain('https://auth-staging.example.test');
    expect(connectSrc).not.toContain('/v1');
    expect(connectSrc).toContain('https://lumberjack.razorpay.com');
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(middleware(req).headers.get('content-security-policy')).not.toBe(csp);
  });

  it('does not allow malformed origins or plain HTTP upstreams in staging', () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api-staging.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', "https://invalid.example.test; script-src *");
    const res = middleware(new NextRequest('https://staging.example.test/hi/jobs'));
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain('script-src');
    expect(csp).not.toContain('api-staging.example.test');
    expect(csp).not.toContain('invalid.example.test');
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(res.headers.get('x-middleware-request-x-next-locale')).toBe('hi');
  });
});
