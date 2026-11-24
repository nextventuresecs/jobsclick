import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmployerHeader } from '../src/components/workspaces/employer/EmployerHeader';
import { EmployerJobList } from '../src/components/workspaces/employer/EmployerJobList';
import { InstitutionHeader } from '../src/components/workspaces/institution/InstitutionHeader';
import { SeekerOverviewTab } from '../src/components/workspaces/seeker/SeekerOverviewTab';
import { fetchInstitutionCms } from '../src/components/workspaces/institution/institutionApi';
import { mapApiJobToJobItem } from '../src/lib/job-mapper';
import * as Sentry from '@sentry/nextjs';
import type { CompanyItem } from '../src/data/sampleCompanies';
import type { JobItem } from '../src/data/sampleJobs';
import type { InstitutionProfileData } from '../src/data/sampleWorkspaces';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockAppContextValue = {
  user: null,
  currentUserRole: null,
  accessToken: null,
  isAuthenticated: false,
  isLoadingSession: false,
  isAuthModalOpen: false,
  authModalDefaultRole: 'employer',
  isRoleSwitcherOpen: false,
  addToast: vi.fn(),
  showAuthModal: vi.fn(),
  hideAuthModal: vi.fn(),
  showRoleSwitcher: vi.fn(),
  hideRoleSwitcher: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
};

vi.mock('../src/context/AppContext', () => ({
  useAppContext: () => mockAppContextValue,
  useApp: () => mockAppContextValue,
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

describe('Owner-Side Slug Links & Job Mapper Security (ID-02 Task 2 & Task 3)', () => {
  const CROCKFORD_LINK_REGEX = /^\/(company|institution|jobs)\/[0-9a-hj-km-np-tv-z]{12}$/;
  const mockCompanySlug = '0123456789ab';
  const mockInstitutionSlug = '0123456789cd';
  const mockJobSlug = '0123456789ef';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Task 2: Owner-side Component Slug Links', () => {
    it('EmployerHeader links to public company page using 12-char Crockford slug', () => {
      const mockCompany: CompanyItem = {
        id: '2726f1df-29bb-42ee-8e68-bb9bc73ea890',
        slug: mockCompanySlug,
        name: 'Madhya Bharat Automation',
        sector: 'Manufacturing',
        enterpriseSize: 'Small',
        ownershipType: 'Private Limited',
        address: 'Sector 3, Pithampur',
        city: 'Dhar',
        district: 'Dhar',
        state: 'Madhya Pradesh',
        description: 'Auto component manufacturer',
        udyamNumber: 'UDYAM-MP-08-0012345',
        verified: true,
        activeJobsCount: 3,
      };

      const html = renderToStaticMarkup(
        React.createElement(EmployerHeader, {
          company: mockCompany,
          isOnboardingComplete: true,
          onOpenProfileEdit: () => {},
          onOpenPostJob: () => {},
          onOpenQrPoster: () => {},
        }),
      );

      const hrefMatches = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
      const companyLinks = hrefMatches.filter((h) => h?.startsWith('/company/'));
      expect(companyLinks.length).toBeGreaterThan(0);

      for (const link of companyLinks) {
        expect(link).toMatch(CROCKFORD_LINK_REGEX);
        expect(link).toBe(`/company/${mockCompanySlug}`);
        expect(link).not.toContain(mockCompany.id);
      }
    });

    it('EmployerJobList links to public job pages using 12-char Crockford slug', () => {
      const mockJobs: JobItem[] = [
        {
          id: 'b6f68532-6a69-42b7-8495-9ff7266a2fbe',
          slug: mockJobSlug,
          title: 'CNC Turner Specialist',
          companyName: 'Madhya Bharat Automation',
          companyId: mockCompanySlug,
          location: 'Dhar, MP',
          district: 'Dhar',
          state: 'Madhya Pradesh',
          category: 'manufacturing',
          employmentType: 'Full-time',
          salaryMin: 20000,
          salaryMax: 28000,
          openings: 2,
          experienceLevel: '1-2 Years',
          skills: ['CNC', 'Lathe'],
          description: 'CNC lathe operations',
          requirements: ['10th + ITI'],
          postedDate: '2026-11-14',
          expiryDate: '2026-12-14',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(EmployerJobList, {
          jobs: mockJobs,
          onPostNewJob: () => {},
          onReviewApplicants: () => {},
        }),
      );

      const hrefMatches = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
      const jobLinks = hrefMatches.filter((h) => h?.startsWith('/jobs/'));
      expect(jobLinks.length).toBeGreaterThan(0);

      for (const link of jobLinks) {
        expect(link).toMatch(CROCKFORD_LINK_REGEX);
        expect(link).toBe(`/jobs/${mockJobSlug}`);
        expect(link).not.toContain(mockJobs[0]!.id);
      }
    });

    it('InstitutionHeader links to public institution page using 12-char Crockford slug', () => {
      const mockInstitution: InstitutionProfileData = {
        id: '2726f1df-29bb-42ee-8e68-bb9bc73ea890',
        slug: mockInstitutionSlug,
        institutionName: 'Government ITI Bhopal',
        institutionType: 'iti',
        affiliation: 'NCVT / DGT',
        affiliationCode: 'ITI-BPL-2024',
        establishmentYear: 1985,
        principalName: 'Dr. Anand Saxena',
        contactPerson: 'Er. Rajesh Kumar',
        contactDesignation: 'TPO Head',
        contactEmail: 'tpo@iti.edu.in',
        contactPhone: '+919876543210',
        website: 'https://iti-bhopal.edu.in',
        address: 'Govindpura',
        city: 'Bhopal',
        district: 'Bhopal',
        state: 'Madhya Pradesh',
        pincode: '462023',
        tradesOffered: ['Electrician', 'Fitter'],
        annualCapacity: 480,
        about: 'Premier ITI',
        isVerified: true,
        isOnboardingComplete: true,
      };

      const html = renderToStaticMarkup(
        React.createElement(InstitutionHeader, {
          institution: mockInstitution,
          isOnboardingComplete: true,
          onOpenProfileEdit: () => {},
          onOpenBulkImport: () => {},
          onOpenQrCode: () => {},
        }),
      );

      const hrefMatches = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
      const instLinks = hrefMatches.filter((h) => h?.startsWith('/institution/'));
      expect(instLinks.length).toBeGreaterThan(0);

      for (const link of instLinks) {
        expect(link).toMatch(CROCKFORD_LINK_REGEX);
        expect(link).toBe(`/institution/${mockInstitutionSlug}`);
        expect(link).not.toContain(mockInstitution.id);
      }
    });

    it('SeekerOverviewTab links recommended jobs using 12-char Crockford slug', () => {
      const mockJobs: JobItem[] = [
        {
          id: 'b6f68532-6a69-42b7-8495-9ff7266a2fbe',
          slug: mockJobSlug,
          title: 'Junior Electrician',
          companyName: 'Power Grid Systems',
          companyId: mockCompanySlug,
          location: 'Bhopal, MP',
          district: 'Bhopal',
          state: 'Madhya Pradesh',
          category: 'manufacturing',
          employmentType: 'Full-time',
          salaryMin: 18000,
          salaryMax: 24000,
          openings: 3,
          experienceLevel: 'Fresher',
          skills: ['Wiring', 'Transformers'],
          description: 'Substation maintenance',
          requirements: ['10th + ITI Electrician'],
          postedDate: '2026-11-14',
          expiryDate: '2026-12-14',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(SeekerOverviewTab, {
          myApplications: [],
          recommendedJobs: mockJobs,
          onNavigateToApplications: () => {},
        }),
      );

      const hrefMatches = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
      const jobLinks = hrefMatches.filter((h) => h?.startsWith('/jobs/'));
      expect(jobLinks.length).toBeGreaterThan(0);

      for (const link of jobLinks) {
        expect(link).toMatch(CROCKFORD_LINK_REGEX);
        expect(link).toBe(`/jobs/${mockJobSlug}`);
        expect(link).not.toContain(mockJobs[0]!.id);
      }
    });

    it('institutionApi fetchInstitutionCms requests endpoint with 12-char Crockford slug', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ courses: [] }),
      });
      global.fetch = fetchMock;

      await fetchInstitutionCms('http://localhost:3001', mockInstitutionSlug);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestedUrl = fetchMock.mock.calls[0]![0];
      expect(requestedUrl).toBe(`http://localhost:3001/profiles/institution/${mockInstitutionSlug}/cms`);
      expect(requestedUrl).toMatch(/\/profiles\/institution\/[0-9a-hj-km-np-tv-z]{12}\/cms$/);
    });
  });

  describe('Task 3: job-mapper.ts Security & Sentry Alerting', () => {
    it('sets companyId to companySlug when companySlug is provided', () => {
      const jobItem = mapApiJobToJobItem({
        id: '2726f1df-29bb-42ee-8e68-bb9bc73ea890',
        slug: mockJobSlug,
        companySlug: mockCompanySlug,
        employerId: '762a4d0f-48d6-44ea-831e-450fdf1ea009',
        companyId: '762a4d0f-48d6-44ea-831e-450fdf1ea009',
        title: 'CNC Operator',
      });

      expect(jobItem.companyId).toBe(mockCompanySlug);
      expect(jobItem.companySlug).toBe(mockCompanySlug);
      expect(jobItem.slug).toBe(mockJobSlug);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('never falls back to employerId or companyId when companySlug is missing, and captures Sentry warning', () => {
      const internalEmployerId = '762a4d0f-48d6-44ea-831e-450fdf1ea009';
      const internalCompanyId = '891b4d0f-48d6-44ea-831e-450fdf1ea010';

      const jobItem = mapApiJobToJobItem({
        id: '2726f1df-29bb-42ee-8e68-bb9bc73ea890',
        slug: mockJobSlug,
        companySlug: undefined, // Missing companySlug
        employerId: internalEmployerId,
        companyId: internalCompanyId,
        title: 'CNC Operator',
      });

      // Must NOT fallback to internal IDs
      expect(jobItem.companyId).toBe('');
      expect(jobItem.companySlug).toBeUndefined();
      expect(jobItem.companyId).not.toContain(internalEmployerId);
      expect(jobItem.companyId).not.toContain(internalCompanyId);

      // Must capture warning to Sentry
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        `Job mapping missing companySlug for job: ${mockJobSlug}`,
        'warning',
      );
    });
  });
});
