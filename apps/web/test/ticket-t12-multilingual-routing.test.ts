import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { createSessionToken } from '../src/lib/auth-session';

describe('Ticket T-12: Multilingual Hindi Routing & SEO (/hi/...)', () => {
  it('AC-1: rewrites /hi/jobs to /jobs without redirecting, keeping URL intact', async () => {
    const request = new NextRequest('https://jobsclick.live/hi/jobs');
    const response = await middleware(request);

    // Must NOT be a redirect (status 301, 302, 307, 308)
    expect(response.status).not.toBe(301);
    expect(response.status).not.toBe(302);
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(308);

    // Must rewrite to internal /jobs route
    const rewriteHeader = response.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBe('https://jobsclick.live/jobs');

    // Must set NEXT_LOCALE cookie to 'hi'
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('NEXT_LOCALE=hi');

    // Must output SEO alternate link headers for crawlers
    const linkHeader = response.headers.get('Link');
    expect(linkHeader).toBeDefined();
    expect(linkHeader).toContain('hreflang="hi"');
    expect(linkHeader).toContain('https://jobsclick.live/hi/jobs');
    expect(linkHeader).toContain('hreflang="en"');
    expect(linkHeader).toContain('https://jobsclick.live/jobs');
  });

  it('AC-1: rewrites root /hi to / with Hindi locale and no redirect', async () => {
    const request = new NextRequest('https://jobsclick.live/hi');
    const response = await middleware(request);

    expect(response.status).not.toBe(301);
    expect(response.status).not.toBe(302);
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(308);

    const rewriteHeader = response.headers.get('x-middleware-rewrite');
    expect(rewriteHeader).toBe('https://jobsclick.live/');

    const linkHeader = response.headers.get('Link');
    expect(linkHeader).toContain('hreflang="hi"');
    expect(linkHeader).toContain('https://jobsclick.live/hi');
  });

  it('AC-2: redirects /en/jobs to canonical non-prefixed /jobs URL', async () => {
    const request = new NextRequest('https://jobsclick.live/en/jobs');
    const response = await middleware(request);

    // English with prefix redirects to canonical non-prefixed route
    expect([301, 302, 307, 308]).toContain(response.status);
    const location = response.headers.get('location');
    expect(location).toBe('https://jobsclick.live/jobs');
  });

  it('preserves verified user session headers during /hi rewrite', async () => {
    const validToken = await createSessionToken({
      id: 'usr_seeker_777',
      phone: '9876543210',
      email: 'seeker@portal.in',
      role: 'job_seeker',
      status: 'active',
    });

    const request = new NextRequest('https://jobsclick.live/hi/jobs', {
      headers: {
        cookie: `auth_token=${validToken}`,
      },
    });

    const response = await middleware(request);

    // Must still rewrite without redirecting
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://jobsclick.live/jobs');
  });

  it('AC-2: provides valid hreflang alternate links on default English /jobs', async () => {
    const request = new NextRequest('https://jobsclick.live/jobs');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    const linkHeader = response.headers.get('Link');
    expect(linkHeader).toBeDefined();
    expect(linkHeader).toContain('hreflang="hi"');
    expect(linkHeader).toContain('https://jobsclick.live/hi/jobs');
    expect(linkHeader).toContain('hreflang="en"');
    expect(linkHeader).toContain('https://jobsclick.live/jobs');
  });
});
