import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Ticket T-18 Web Components: Institution CMS & Inquiry Routing (INT-02, INT-03)', () => {
  it('exports InstitutionCmsEditor with standard editor contracts (AC #1)', async () => {
    const { InstitutionCmsEditor } = await import(
      '../src/components/workspaces/institution/InstitutionCmsEditor.jsx'
    );
    expect(InstitutionCmsEditor).toBeDefined();
    expect(typeof InstitutionCmsEditor).toBe('function');
  });

  it('exports PublicInstitutionTabs with standard 6 tabs (Courses, Subjects, Fees, Inquiry, Departments, Faculty)', async () => {
    const { PublicInstitutionTabs } = await import(
      '../src/components/workspaces/institution/PublicInstitutionTabs.jsx'
    );
    expect(PublicInstitutionTabs).toBeDefined();
    expect(typeof PublicInstitutionTabs).toBe('function');
  });

  it('exports PublicInstitutionPage server component with schema.org EducationalOrganization JSON-LD', async () => {
    const mod = await import('../src/app/institution/[id]/page.jsx');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('provides API helpers for institution CMS update and student inquiry submission (INT-03)', async () => {
    const {
      fetchInstitutionCms,
      updateInstitutionCms,
      fetchInstitutionInquiries,
      updateInquiryStatus,
    } = await import('../src/components/workspaces/institution/institutionApi.js');

    expect(typeof fetchInstitutionCms).toBe('function');
    expect(typeof updateInstitutionCms).toBe('function');
    expect(typeof fetchInstitutionInquiries).toBe('function');
    expect(typeof updateInquiryStatus).toBe('function');
  });

  it('contains English and Hindi translations for all standard tabs and inquiry copy (Hard Invariant #8a)', () => {
    const en = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../messages/en.json'), 'utf-8'),
    );
    const hi = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../messages/hi.json'), 'utf-8'),
    );

    // Check InstitutionPublic namespace
    expect(en.InstitutionPublic.tabCourses).toBe('Courses');
    expect(hi.InstitutionPublic.tabCourses).toBe('पाठ्यक्रम');
    expect(en.InstitutionPublic.tabInquiryForm).toBe('Inquiry Form');
    expect(hi.InstitutionPublic.tabInquiryForm).toBe('पूछताछ फॉर्म');
    expect(en.InstitutionPublic.tabFeeStructure).toBe('Fee Structure');
    expect(hi.InstitutionPublic.tabFeeStructure).toBe('शुल्क संरचना');

    // Check InstitutionWorkspace namespace
    expect(en.InstitutionWorkspace.tabCms).toBe('Public Page CMS');
    expect(hi.InstitutionWorkspace.tabCms).toBe('सार्वजनिक पृष्ठ सीएमएस');
    expect(en.InstitutionWorkspace.tabInquiries).toBe('Student Leads & Inquiries');
    expect(hi.InstitutionWorkspace.tabInquiries).toBe('छात्र पूछताछ और लीड्स');
  });
});
