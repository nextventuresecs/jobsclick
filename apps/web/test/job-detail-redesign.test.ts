import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JobDetailPage from '../src/app/jobs/[id]/page';

const { locale, applyButton } = vi.hoisted(() => ({
  locale: vi.fn(() => 'en'),
  applyButton: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: locale,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock('../src/components/layout/Navbar', () => ({ Navbar: () => null }));
vi.mock('../src/components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../src/components/jobs/JobApplyButton', () => ({
  JobApplyButton: (props: Record<string, unknown>) => {
    applyButton(props);
    return null;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

const jobSlug = '9b2c4d6f8h0j';
const job = {
  slug: jobSlug,
  companySlug: '3k8p4w2m7x1v',
  companyName: 'Precision Works',
  title: 'Tool and Die Maker',
  city: 'Indore',
  district: 'Dhar',
  description: 'Report to the machine supervisor and check finished work. '.repeat(8),
  requirements: ['Trade certificate'],
};

describe('Public job detail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    locale.mockReturnValue('en');
  });

  it('renders one Apply control, honest pay, and a disclosure with the full job description', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(job)));
    const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: jobSlug }) }));

    expect(html).toContain('id="apply"');
    expect(applyButton).toHaveBeenCalledTimes(1);
    expect(applyButton).toHaveBeenCalledWith(expect.objectContaining({
      jobId: jobSlug,
      label: 'JobDetail.apply',
    }));
    expect(html).toContain('JobDetail.payUnlisted');
    expect(html).not.toContain('₹0');
    expect(html).toMatch(/<details[\s\S]*?<summary[^>]*>JobDetail\.readMore<\/summary>[\s\S]*?machine supervisor/);
    expect(html).toContain('Trade certificate');
    expect(html).not.toContain('Udyam Registered');
    expect(html).toContain('"@type":"JobPosting"');
    expect(html).not.toContain('"baseSalary"');
  });

  it('preserves the Hindi locale on return, company, and share links', async () => {
    locale.mockReturnValue('hi');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(job)));
    const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: jobSlug }) }));

    expect(html).toContain('href="/hi/jobs"');
    expect(html).toContain(`href="/hi/company/${job.companySlug}"`);
    expect(html).toMatch(/href="https:\/\/wa\.me\/\?text=[^"]*%2Fhi%2Fjobs%2F9b2c4d6f8h0j"/);
  });

  it('does not advertise or offer applications for an explicitly closed posting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...job, isActive: false })));
    const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: jobSlug }) }));

    expect(html).toContain('JobDetail.closed');
    expect(html).not.toContain('"@type":"JobPosting"');
    expect(applyButton).not.toHaveBeenCalled();
  });

  it('offers a retry on service failure and keeps missing listings as 404s', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: jobSlug }) }));
    expect(html).toContain('JobDetail.unavailableTitle');
    expect(html).toContain(`href="/jobs/${jobSlug}"`);
    expect(applyButton).not.toHaveBeenCalled();
    await expect(JobDetailPage({ params: Promise.resolve({ id: jobSlug }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
