import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import robots from '../src/app/robots';
import sitemap from '../src/app/sitemap';
import { middleware } from '../src/middleware';
import nextConfig from '../next.config.js';

describe('Task 8: Staging Indexing Prevention Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. robots.txt Route Handler', () => {
    it('returns Disallow: / in staging when APP_ENV=staging', () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      process.env['APP_ENV'] = 'staging';

      const config = robots();
      expect(config).toEqual({
        rules: {
          userAgent: '*',
          disallow: '/',
        },
      });
      expect(config.sitemap).toBeUndefined();
    });

    it('returns Disallow: / in staging when only NODE_ENV=staging', () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'staging';
      delete process.env['APP_ENV'];

      const config = robots();
      expect(config).toEqual({
        rules: {
          userAgent: '*',
          disallow: '/',
        },
      });
      expect(config.sitemap).toBeUndefined();
    });

    it('returns production allow rules and sitemap in production', () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      delete process.env['APP_ENV'];
      process.env['NEXT_PUBLIC_APP_URL'] = 'https://jobsclick.live';

      const config = robots();
      expect(config.rules).toEqual({
        userAgent: '*',
        allow: '/',
        disallow: ['/workspace/', '/api/', '/monitoring/'],
      });
      expect(config.sitemap).toBe('https://jobsclick.live/sitemap.xml');
    });
  });

  describe('2. sitemap.xml Route Handler', () => {
    it('returns empty array [] in staging when APP_ENV=staging', async () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      process.env['APP_ENV'] = 'staging';

      const entries = await sitemap();
      expect(entries).toEqual([]);
    });

    it('returns empty array [] in staging when only NODE_ENV=staging', async () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'staging';
      delete process.env['APP_ENV'];

      const entries = await sitemap();
      expect(entries).toEqual([]);
    });

    it('returns indexed public routes in production', async () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      delete process.env['APP_ENV'];
      process.env['NEXT_PUBLIC_APP_URL'] = 'https://jobsclick.live';

      const entries = await sitemap();
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.some((entry) => entry.url === 'https://jobsclick.live/')).toBe(true);
      expect(entries.some((entry) => entry.url === 'https://jobsclick.live/jobs')).toBe(true);
    });
  });

  describe('3. Edge Middleware X-Robots-Tag Header', () => {
    it('sets X-Robots-Tag: noindex, nofollow on staging when APP_ENV=staging', () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      process.env['APP_ENV'] = 'staging';

      const req = new NextRequest('https://staging.jobsclick.live/jobs');
      const res = middleware(req);

      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('sets X-Robots-Tag: noindex, nofollow on staging when only NODE_ENV=staging', () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'staging';
      delete process.env['APP_ENV'];

      const req = new NextRequest('https://staging.jobsclick.live/jobs');
      const res = middleware(req);

      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('does NOT set X-Robots-Tag on production requests', () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      delete process.env['APP_ENV'];

      const req = new NextRequest('https://jobsclick.live/jobs');
      const res = middleware(req);

      expect(res.headers.get('X-Robots-Tag')).toBeNull();
    });
  });

  describe('4. next.config.js Headers Configuration', () => {
    it('injects X-Robots-Tag: noindex, nofollow in next.config headers for staging', async () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      process.env['APP_ENV'] = 'staging';

      const getHeaders = nextConfig.headers as (() => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>) | undefined;
      expect(getHeaders).toBeDefined();

      const headerConfigs = await getHeaders!();
      const allRoutes = headerConfigs.find((h) => h.source === '/(.*)');
      expect(allRoutes).toBeDefined();

      const robotsHeader = allRoutes?.headers.find(
        (header) => header.key === 'X-Robots-Tag'
      );
      expect(robotsHeader).toBeDefined();
      expect(robotsHeader?.value).toBe('noindex, nofollow');
    });

    it('omits X-Robots-Tag in next.config headers for production', async () => {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
      delete process.env['APP_ENV'];

      const getHeaders = nextConfig.headers as (() => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>) | undefined;
      expect(getHeaders).toBeDefined();

      const headerConfigs = await getHeaders!();
      const allRoutes = headerConfigs.find((h) => h.source === '/(.*)');
      expect(allRoutes).toBeDefined();

      const robotsHeader = allRoutes?.headers.find(
        (header) => header.key === 'X-Robots-Tag'
      );
      expect(robotsHeader).toBeUndefined();
    });
  });
});
