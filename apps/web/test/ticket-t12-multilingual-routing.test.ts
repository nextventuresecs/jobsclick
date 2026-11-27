import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { createSessionToken } from '../src/lib/auth-session';

const require = createRequire(__filename);

describe('Ticket T-12: Multilingual Hindi Routing & SEO (/hi/...)', () => {
  it('AC-1: forwards Hindi and clean-path headers for /hi/jobs', async () => {
    const request = new NextRequest('https://jobsclick.live/hi/jobs');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-next-locale')).toBe('hi');
    expect(response.headers.get('x-middleware-request-x-clean-path')).toBe('/jobs');

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

  it('AC-1: forwards Hindi and clean-path headers for /hi', async () => {
    const request = new NextRequest('https://jobsclick.live/hi');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-next-locale')).toBe('hi');
    expect(response.headers.get('x-middleware-request-x-clean-path')).toBe('/');

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

  it('forwards the session cookie alongside Hindi route headers', async () => {
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

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-cookie')).toBe(`auth_token=${validToken}`);
    expect(response.headers.get('x-middleware-request-x-next-locale')).toBe('hi');
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

  it('redirects unauthenticated requests to /hi/workspace to login gate', async () => {
    const request = new NextRequest('https://jobsclick.live/hi/workspace');
    const response = await middleware(request);

    expect([301, 302, 307, 308]).toContain(response.status);
    const location = response.headers.get('location');
    expect(location).toBe('https://jobsclick.live/?authRequired=1');
  });

  it('redirects unauthenticated requests to /workspace to login gate unchanged', async () => {
    const request = new NextRequest('https://jobsclick.live/workspace');
    const response = await middleware(request);

    expect([301, 302, 307, 308]).toContain(response.status);
    const location = response.headers.get('location');
    expect(location).toBe('https://jobsclick.live/?authRequired=1');
  });

  it('sets X-Robots-Tag noindex header when APP_ENV is not production', async () => {
    const prevAppEnv = process.env['APP_ENV'];
    const prevNodeEnv = process.env['NODE_ENV'];
    try {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      process.env['APP_ENV'] = 'staging';

      const request = new NextRequest('https://staging.jobsclick.live/hi/jobs');
      const response = await middleware(request);

      expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    } finally {
      const envRef = process.env as Record<string, string | undefined>;
      if (prevAppEnv !== undefined) {
        envRef['APP_ENV'] = prevAppEnv;
      } else {
        delete envRef['APP_ENV'];
      }
      if (prevNodeEnv !== undefined) {
        envRef['NODE_ENV'] = prevNodeEnv;
      } else {
        delete envRef['NODE_ENV'];
      }
    }
  });

  it.each([
    '/hi/api',
    '/hi/api/auth/session',
    '/hi/_next',
    '/hi/_next/static/chunks/app.js',
  ])('does not set Hindi locale headers or cookies for internal path %s', (pathname) => {
    const request = new NextRequest(`https://jobsclick.live${pathname}`);
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-next-locale')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-locale')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-clean-path')).toBeNull();
    expect(response.headers.get('Link')).toBeNull();
    expect(response.headers.get('set-cookie') ?? '').not.toContain('NEXT_LOCALE=hi');
  });

  it('excludes /hi/api/* and /hi/_next/* from next.config.js rewrites while preserving localized pages', async () => {
    const nextConfig = require('../next.config.js') as {
      rewrites: () => Promise<{ beforeFiles: Array<{ source: string; destination: string }> }>;
    };
    const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match') as {
      getPathMatch: (path: string) => (pathname: string) => Record<string, string | string[]> | false;
    };
    const { prepareDestination } = require('next/dist/shared/lib/router/utils/prepare-destination') as {
      prepareDestination: (opts: {
        appendParamsToQuery: boolean;
        destination: string;
        params: Record<string, string | string[]>;
        query: Record<string, string | string[]>;
      }) => { parsedDestination: { pathname: string } };
    };

    const { beforeFiles } = await nextConfig.rewrites();
    const resolveRewrite = (pathname: string): string | null => {
      for (const rule of beforeFiles) {
        const matched = getPathMatch(rule.source)(pathname);
        if (matched) {
          return prepareDestination({
            appendParamsToQuery: false,
            destination: rule.destination,
            params: matched,
            query: {},
          }).parsedDestination.pathname;
        }
      }
      return null;
    };

    expect(resolveRewrite('/hi')).toBe('/');
    expect(resolveRewrite('/hi/jobs')).toBe('/jobs');
    expect(resolveRewrite('/hi/jobs/3m8x0b7k9w2a')).toBe('/jobs/3m8x0b7k9w2a');
    expect(resolveRewrite('/hi/api')).toBeNull();
    expect(resolveRewrite('/hi/api/auth/session')).toBeNull();
    expect(resolveRewrite('/hi/_next')).toBeNull();
    expect(resolveRewrite('/hi/_next/static/chunks/app.js')).toBeNull();
  });
});
