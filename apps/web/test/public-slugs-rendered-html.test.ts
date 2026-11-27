import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/jobs',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('../src/context/AppContext.js', () => ({
  useApp: () => ({ addToast: vi.fn() }),
  useAppContext: () => ({ addToast: vi.fn() }),
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import PublicCompanyPage from '../src/app/company/[id]/page';
import JobDetailPage from '../src/app/jobs/[id]/page';
import { WalkInQrCard } from '../src/components/workspaces/employer/WalkInQrCard';
import { CampusQrCard } from '../src/components/workspaces/institution/CampusQrCard';
import type { CompanyItem } from '../src/data/sampleCompanies';
import type { InstitutionProfileData } from '../src/data/sampleWorkspaces';

describe('Public Pages ID-02 HTML Verification: Zero Internal UUIDs in Rendered HTML', () => {
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  const SAMPLE_INTERNAL_UUID = 'e82b7123-4567-4890-a123-456789abcdef';
  const SAMPLE_COMPANY_SLUG = '3k8p4w2m7x1v';
  const SAMPLE_JOB_SLUG = '9b2c4d6f8h0j';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders PublicCompanyPage with public_slug and contains ZERO internal UUIDs anywhere in HTML', async () => {
    const mockCompanyApiResponse = {
      slug: SAMPLE_COMPANY_SLUG,
      companyName: 'Indore Precision Die Casting Pvt Ltd',
      sector: 'Automotive Components',
      companySize: 'Small',
      ownershipType: 'Private Limited',
      address: 'Plot 45, Sector 1, Pithampur Industrial Area',
      city: 'Indore',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      description: 'High-pressure die casting manufacturer supplying Tier-1 automotive OEMs.',
      verified: true,
      activeJobsCount: 3,
    };

    const mockJobsResponse = {
      jobs: [
        {
          slug: SAMPLE_JOB_SLUG,
          companySlug: SAMPLE_COMPANY_SLUG,
          title: 'Tool & Die Maker',
          city: 'Indore',
          district: 'Dhar',
          minPay: 22000,
          maxPay: 28000,
        },
      ],
      total: 1,
    };

    // Global fetch mock returning public API responses
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/profiles/business/')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockCompanyApiResponse,
        } as Response;
      }
      if (url.includes('/jobs')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockJobsResponse,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }));

    // Render the server component
    const pageComponent = await PublicCompanyPage({
      params: Promise.resolve({ id: SAMPLE_COMPANY_SLUG }),
    });
    const html = renderToString(pageComponent);

    // 1. Assert NO internal UUID exists anywhere in the rendered HTML output
    expect(
      UUID_REGEX.test(html),
      `Found internal UUID in rendered PublicCompanyPage HTML! Must only use opaque public slugs.`,
    ).toBe(false);
    expect(html).not.toContain(SAMPLE_INTERNAL_UUID);

    // 2. Assert public slug IS present in the rendered HTML (links, QR section, JSON-LD)
    expect(html).toContain(SAMPLE_COMPANY_SLUG);
    expect(html).toContain(`/company/${SAMPLE_COMPANY_SLUG}`);
  });

  it('rejects old internal UUID URLs with 404 (notFound) on PublicCompanyPage (no redirect)', async () => {
    await expect(
      PublicCompanyPage({ params: Promise.resolve({ id: SAMPLE_INTERNAL_UUID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('renders JobDetailPage with public_slug and contains ZERO internal UUIDs anywhere in HTML', async () => {
    const mockJobApiResponse = {
      slug: SAMPLE_JOB_SLUG,
      companySlug: SAMPLE_COMPANY_SLUG,
      title: 'CNC Machine Operator (2nd Shift)',
      description: 'Setup and operate 3-axis CNC vertical machining centers.',
      category: 'manufacturing',
      employmentType: 'Full-time',
      experienceLevel: 'Experienced',
      minPay: 20000,
      maxPay: 26000,
      city: 'Pithampur',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      openings: 4,
      skills: ['CNC Programming', 'Tool Offset', 'Vernier Caliper'],
      createdAt: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/jobs/')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockJobApiResponse,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }));

    const pageComponent = await JobDetailPage({
      params: Promise.resolve({ id: SAMPLE_JOB_SLUG }),
    });
    const html = renderToString(pageComponent);

    // 1. Assert NO internal UUID exists in rendered HTML
    expect(
      UUID_REGEX.test(html),
      `Found internal UUID in rendered JobDetailPage HTML! Must only use opaque public slugs.`,
    ).toBe(false);
    expect(html).not.toContain(SAMPLE_INTERNAL_UUID);

    // 2. Assert public slug is in JSON-LD and action URLs
    expect(html).toContain(SAMPLE_JOB_SLUG);
    expect(html).toContain(`/jobs/${SAMPLE_JOB_SLUG}`);
    expect(html).toContain(`/company/${SAMPLE_COMPANY_SLUG}`);
  });

  it('rejects old internal UUID URLs with 404 (notFound) on JobDetailPage (no redirect)', async () => {
    await expect(
      JobDetailPage({ params: Promise.resolve({ id: SAMPLE_INTERNAL_UUID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('renders WalkInQrCard and CampusQrCard with opaque public slugs and zero UUIDs', () => {
    const mockCompany: CompanyItem = {
      id: SAMPLE_COMPANY_SLUG,
      slug: SAMPLE_COMPANY_SLUG,
      name: 'Pithampur Precision Gears Pvt Ltd',
      sector: 'Automobile Engineering',
      enterpriseSize: 'Small',
      ownershipType: 'Private Limited',
      address: 'Plot 102, Industrial Area',
      city: 'Pithampur',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      description: 'Manufacturer of high precision gears.',
      udyamNumber: 'UDYAM-MP-21-0012345',
      verified: true,
      activeJobsCount: 2,
    };

    const walkInHtml = renderToString(React.createElement(WalkInQrCard, { company: mockCompany }));
    expect(UUID_REGEX.test(walkInHtml)).toBe(false);
    expect(walkInHtml).toContain(`/company/${SAMPLE_COMPANY_SLUG}`);

    const mockInstitution: InstitutionProfileData = {
      id: 'inst-slug-1234',
      slug: 'inst-slug-1234',
      institutionName: 'Government ITI Dhar',
      institutionType: 'iti',
      affiliation: 'NCVT DGT',
      affiliationCode: 'ITI-MP-NCVT-401',
      establishmentYear: 1988,
      principalName: 'R. K. Sharma',
      contactPerson: 'Admissions Desk',
      contactDesignation: 'Placement Coordinator',
      contactEmail: 'iti-dhar@mp.gov.in',
      contactPhone: '9826012345',
      website: 'https://iti-dhar.mp.gov.in',
      address: 'Industrial Training Campus',
      city: 'Dhar',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      pincode: '454001',
      tradesOffered: ['Electrician', 'Fitter'],
      annualCapacity: 120,
      about: 'Accredited vocational trade training center.',
      isVerified: true,
      isOnboardingComplete: true,
    };

    const campusHtml = renderToString(React.createElement(CampusQrCard, { institution: mockInstitution }));
    expect(UUID_REGEX.test(campusHtml)).toBe(false);
    expect(campusHtml).toContain('/institution/inst-slug-1234');
  });
});
