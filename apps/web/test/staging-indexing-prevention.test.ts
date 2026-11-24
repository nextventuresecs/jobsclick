import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '../src/app/robots';
import sitemap from '../src/app/sitemap';
import nextConfig from '../next.config.js';

describe('Staging indexing prevention', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['staging', '', 'production'],
    ['', 'staging', 'production'],
    ['', '', 'staging'],
  ])('publishes an empty sitemap and a crawlable noindex policy (%s, %s, %s)', async (appEnv, publicEnv, nodeEnv) => {
    vi.stubEnv('APP_ENV', appEnv);
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', publicEnv);
    vi.stubEnv('NODE_ENV', nodeEnv);
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/' } });
    expect(await sitemap()).toEqual([]);
    expect(await nextConfig.headers?.()).toEqual([{
      source: '/:path*',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }]);
  });

  it('retains the public sitemap and omits noindex in production', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://jobsclick.live');
    expect(robots().sitemap).toBe('https://jobsclick.live/sitemap.xml');
    expect(await sitemap()).toEqual(expect.arrayContaining([expect.objectContaining({ url: 'https://jobsclick.live/jobs' })]));
    expect(await nextConfig.headers?.()).toEqual([]);
  });
});
