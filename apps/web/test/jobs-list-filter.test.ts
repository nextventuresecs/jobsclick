import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobsListPage from '../src/app/jobs/page';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace: string) => {
    const fn = (key: string, values?: Record<string, string | number>) => {
      if (!values) return `${namespace}.${key}`;
      const args = Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(',');
      return `${namespace}.${key}(${args})`;
    };
    fn.rich = (key: string, values?: Record<string, unknown>) =>
      `${namespace}.${key}(count=${String(values?.['count'] ?? '')})`;
    return fn;
  },
}));
vi.mock('../src/components/layout/Navbar', () => ({ Navbar: () => null }));
vi.mock('../src/components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../src/components/jobs/SaveSearchAlertModal', () => ({
  SaveSearchAlertModal: () => null,
}));

describe('JobsListPage employmentType server filter and pagination (JOB-02)', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://localhost:3001');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('passes employmentType to the API and supports page 2 pagination and total', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        total: 25,
        jobs: [
          {
            slug: 'contract-fitter-21',
            companySlug: 'acme-works-1',
            companyName: 'Acme Works',
            title: 'Contract Mechanical Fitter',
            city: 'Pune',
            district: 'Pune',
            category: 'manufacturing',
            employmentType: 'Contract',
            minPay: 18000,
            maxPay: 24000,
            createdAt: '2026-11-20T00:00:00.000Z',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const html = renderToStaticMarkup(
      await JobsListPage({ searchParams: Promise.resolve({ employmentType: 'Contract', page: '2' }) }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    const parsedUrl = new URL(calledUrl);
    expect(parsedUrl.pathname).toBe('/jobs');
    expect(parsedUrl.searchParams.get('employmentType')).toBe('Contract');
    expect(parsedUrl.searchParams.get('limit')).toBe('20');
    expect(parsedUrl.searchParams.get('offset')).toBe('20');

    expect(html).toContain('Contract Mechanical Fitter');
    expect(html).toContain('JobsPage.pageCount(start=21,end=21,total=25)');
    expect(html).toContain('rel="prev"');
    expect(html).toContain('/jobs?employmentType=Contract');
    expect(html).not.toContain('JobsPage.employmentTypeScope');
  });

  it('renders page 2 next link when employmentType filter has more than one page of results', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        total: 25,
        jobs: Array.from({ length: 20 }, (_, i) => ({
          slug: `contract-job-${i + 1}`,
          companySlug: 'acme-works-1',
          companyName: 'Acme Works',
          title: `Contract Role ${i + 1}`,
          city: 'Pune',
          district: 'Pune',
          category: 'manufacturing',
          employmentType: 'Contract',
          createdAt: '2026-11-20T00:00:00.000Z',
        })),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const html = renderToStaticMarkup(
      await JobsListPage({ searchParams: Promise.resolve({ employmentType: 'Contract', page: '1' }) }),
    );

    expect(html).toContain('rel="next"');
    expect(html).toContain('href="/jobs?employmentType=Contract&amp;page=2"');
  });
});
