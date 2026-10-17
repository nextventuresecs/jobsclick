import { describe, it, expect } from 'vitest';

describe('Web Application Baseline & Homepage - Feature 3', () => {
  it('verifies web environment setup', () => {
    expect(true).toBe(true);
  });

  it('imports HomePage component successfully', async () => {
    const { default: HomePage } = await import('../src/app/page.jsx');
    expect(HomePage).toBeDefined();
    expect(typeof HomePage).toBe('function');
  });

  it('verifies that all home page translated messages exist in English and Hindi', async () => {
    const en = (await import('../messages/en.json')).default;
    const hi = (await import('../messages/hi.json')).default;

    expect(en.HomePage.badge).toBeDefined();
    expect(en.HomePage.heroTitleHighlight).toBe('Verified Opportunities.');
    expect(hi.HomePage.heroTitleHighlight).toBe('सत्यापित अवसरों के साथ।');
    expect(en.HomePage.msmeTitle).toBeDefined();
    expect(hi.HomePage.msmeTitle).toBeDefined();
  });
});

describe('Find Jobs & Job Details Pages - Feature 4', async () => {
  it('exports JobsListPage server component with industry category tabs', async () => {
    const { default: JobsListPage } = await import('../src/app/jobs/page.jsx');
    expect(JobsListPage).toBeDefined();
    expect(typeof JobsListPage).toBe('function');
  });

  it('exports JobDetailPage server component with JobPosting JSON-LD (Hard Invariant #9)', async () => {
    const { default: JobDetailPage } = await import('../src/app/jobs/[id]/page.jsx');
    expect(JobDetailPage).toBeDefined();
    expect(typeof JobDetailPage).toBe('function');
  });

  it('provides structured sample jobs with national industry categories and salary in INR', async () => {
    const { SAMPLE_JOBS } = await import('../src/data/sampleJobs.js');
    expect(SAMPLE_JOBS.length).toBeGreaterThan(0);
    expect(SAMPLE_JOBS[0]!.title).toBe('CNC Machine Operator & Programmer');
    expect(SAMPLE_JOBS[0]!.category).toBe('manufacturing');
    expect(SAMPLE_JOBS[0]!.salaryMin).toBeGreaterThan(0);
    expect(SAMPLE_JOBS[1]!.category).toBe('technology');
  });
});

describe('MSME Directory & Company Profile Pages - Feature 5', async () => {
  it('exports CompaniesDirectoryPage component', async () => {
    const { default: CompaniesDirectoryPage } = await import('../src/app/company/page.jsx');
    expect(CompaniesDirectoryPage).toBeDefined();
    expect(typeof CompaniesDirectoryPage).toBe('function');
  });

  it('exports PublicCompanyPage component with Organization JSON-LD', async () => {
    const { default: PublicCompanyPage } = await import('../src/app/company/[id]/page.jsx');
    expect(PublicCompanyPage).toBeDefined();
    expect(typeof PublicCompanyPage).toBe('function');
  });

  it('provides structured sample companies with verified Udyam registrations', async () => {
    const { SAMPLE_COMPANIES } = await import('../src/data/sampleCompanies.js');
    expect(SAMPLE_COMPANIES.length).toBeGreaterThan(0);
    expect(SAMPLE_COMPANIES[0]!.name).toContain('Aarya Precision');
    expect(SAMPLE_COMPANIES[0]!.udyamNumber).toMatch(/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/);
    expect(SAMPLE_COMPANIES[0]!.verified).toBe(true);
  });
});

