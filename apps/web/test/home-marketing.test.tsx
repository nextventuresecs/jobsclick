import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../src/app/page';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'hi',
  getTranslations: async () => (key: string) => key,
}));
vi.mock('../src/components/layout/Navbar', () => ({ Navbar: () => null }));
vi.mock('../src/components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../src/context/AppContext', () => ({
  useApp: () => ({ isAuthenticated: false }),
}));

describe('public homepage journeys', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits labelled searches and links to public routes in Hindi', async () => {
    const fetchJobs = vi.fn().mockResolvedValue(Response.json({
      jobs: [
        { slug: 'welder-pune', title: 'Welder', companyName: 'Example Works', companySlug: 'example-works', city: 'Pune' },
      ],
    }));
    vi.stubGlobal('fetch', fetchJobs);

    const page = renderToStaticMarkup(await HomePage());

    expect(fetchJobs).toHaveBeenCalledWith(expect.stringMatching(/\/jobs\?limit=4$/), expect.anything());
    expect(page).toContain('action="/hi/jobs"');
    expect(page).toContain('for="home-search-keyword"');
    expect(page).toContain('for="home-search-city"');
    expect(page).toContain('href="/hi/jobs/welder-pune"');
    expect(page).toContain('href="/hi/institutions"');
    expect(page).toContain('href="/hi/company"');
    expect(page).not.toContain('500+');
  });

  it('distinguishes an unavailable feed from an empty feed and leaves job search available', async () => {
    const fetchJobs = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ jobs: [] }));
    vi.stubGlobal('fetch', fetchJobs);

    const unavailable = renderToStaticMarkup(await HomePage());
    const empty = renderToStaticMarkup(await HomePage());

    expect(unavailable).toContain('recentJobsUnavailable');
    expect(unavailable).not.toContain('noRecentJobs');
    expect(empty).toContain('noRecentJobs');
    expect(empty).not.toContain('recentJobsUnavailable');
    expect(unavailable).toContain('action="/hi/jobs"');
  });
});
