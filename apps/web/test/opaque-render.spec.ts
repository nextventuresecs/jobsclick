import Workspace from '../src/app/workspace/page.jsx';
import Institution from '../src/app/institution/[id]/page.jsx';
import Directory from '../src/app/company/page.jsx';
import Company from '../src/app/company/[id]/page.jsx';
import Job from '../src/app/jobs/[id]/page.jsx';
import Jobs from '../src/app/jobs/page.jsx';
import Home from '../src/app/page.jsx';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudentRecordData, ApplicationData } from '../src/data/sampleWorkspaces.js';

const state = vi.hoisted(() => ({ role: 'employer', id: 'ae16e23b-af54-4058-a987-447ae59eaaae' }));
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../src/context/AppContext.js', () => {
  const useApp = () => ({ user: { id: state.id, role: state.role, name: 'Fixture Owner', phone: '9876543210', email: 'private@private-contact.invalid' },
    isAuthenticated: true, isLoadingSession: false, openAuthModal: vi.fn(), addToast: vi.fn(), logout: vi.fn() });
  return { useApp, useAppContext: useApp };
});

import { ProfileQrShareCard } from '../src/components/common/ProfileQrShareCard.js';
import { StudentDirectoryTable } from '../src/components/workspaces/institution/StudentDirectoryTable.js';
import { ApplicantDetailModal } from '../src/components/workspaces/employer/ApplicantDetailModal.js';
import { maskContactNumber, maskEmailAddress } from '../src/components/workspaces/institution/studentUtils.js';

const noLeak = (html: string) => {
  expect(html).not.toMatch(/usr_/i);
  expect(html).not.toContain('9876543210');
  expect(html).not.toContain('private-contact.invalid');
  expect(html).not.toMatch(/(?:\+91[ -]?)?[6-9][0-9]{9}(?![0-9a-f])/i);
};
afterEach(() => vi.unstubAllGlobals());

describe('F0-e AUTH-05 rendered identity boundary', () => {
  it('renders actual public home and jobs pages using opaque API fixture links', async () => {
    const id = randomUUID();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jobs: [{ id, title: 'Fixture Vacancy', employerId: randomUUID(), companyName: 'Fixture Company', city: 'Delhi', category: 'manufacturing' }] })));
    const home = renderToStaticMarkup(await Home()), jobs = renderToStaticMarkup(await Jobs({}));
    expect(home).toContain('/jobs/' + id); expect(jobs).toContain('/jobs/' + id);
    noLeak(home); noLeak(jobs);
  });
  it('renders real job, company and institution detail pages and company directory with opaque links and JSON-LD', async () => {
    const id = randomUUID(), employerId = randomUUID();
    const vacancy = { id, employerId, title: 'Fixture Vacancy', companyName: 'Fixture Company', city: 'Delhi', category: 'manufacturing', createdAt: '2026-11-17T00:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async input => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/cms')) return Response.json({ courses: [], subjects: [], feeStructure: [], departments: [], faculty: [], welcomeText: '' });
      if (path.startsWith('/profiles/institution/')) return Response.json({ institutionName: 'Fixture Institution', tradesOffered: [] });
      if (path === '/profiles/business') return Response.json([{ id: employerId, companyName: 'Fixture Company' }]);
      if (path.startsWith('/profiles/business/')) return Response.json({ companyName: 'Fixture Company' });
      return Response.json(path.startsWith('/jobs/') ? vacancy : { jobs: [vacancy] });
    }));
    for (const content of [await Job({ params: { id } }), await Company({ params: { id: employerId } }), await Directory({}), await Institution({ params: { id: randomUUID() } })]) {
      const html = renderToStaticMarkup(content); expect(html.length).toBeGreaterThan(100); noLeak(html);
    }
  });
  it.each(['job_seeker', 'employer', 'intermediary', 'msme_admin', 'admin'])('renders the actual authenticated %s workspace page without credential-derived identifiers', async role => {
    state.role = role; state.id = randomUUID();
    const html = renderToStaticMarkup(React.createElement(Workspace));
    expect(html.length).toBeGreaterThan(100); noLeak(html);
  });
  it('renders populated student and employer detail views without contacts, final phone digits or private email domain', () => {
    const student: StudentRecordData = { id: randomUUID(), institutionId: randomUUID(), studentName: 'Fixture Student', rollNumber: 'ROLL-A',
      phone: '9876543210', email: 'private@private-contact.invalid', stream: 'Fitter', passingYear: '2026', profileCompleted: true, placementStatus: 'Available' };
    const table = renderToStaticMarkup(React.createElement(StudentDirectoryTable, { students: [student], totalStudentsCount: 1, studentSearch: '',
      setStudentSearch: vi.fn(), streamFilter: 'all', setStreamFilter: vi.fn(), statusFilter: 'all', setStatusFilter: vi.fn(), isAddingStudent: false,
      onToggleAddStudent: vi.fn(), onOpenBulkImport: vi.fn(), onShareCandidate: vi.fn() }));
    const applicant: ApplicationData = { id: randomUUID(), jobId: randomUUID(), jobTitle: 'Fixture Vacancy', companyId: randomUUID(), companyName: 'Fixture Company',
      candidateId: student.id, candidateName: student.studentName, candidateEducation: 'ITI', candidateExperience: 'Fresher', candidateSkills: [], appliedDate: '2026-11-17', status: 'applied' };
    const detail = renderToStaticMarkup(React.createElement(ApplicantDetailModal, { applicant, onClose: vi.fn(), onUpdateStatus: vi.fn() }));
    expect(table).toContain('Fixture Student'); expect(detail).toContain('Fixture Student'); noLeak(table); noLeak(detail);
    expect(maskContactNumber(student.phone)).not.toContain('3210'); expect(maskEmailAddress(student.email)).not.toContain('private-contact.invalid');
  });
  it.each(['/company/usr_9876543210', '/institution/seeker_usr_9876543210', '/company/9876543210'])('refuses a phone-derived QR/share path %s', path => {
    noLeak(renderToStaticMarkup(React.createElement(ProfileQrShareCard, { title: 'Fixture Company', path, downloadFileName: 'fixture' })));
  });
  it('renders an opaque random UUID share link as a positive control', () => {
    const path = '/company/' + randomUUID();
    const html = renderToStaticMarkup(React.createElement(ProfileQrShareCard, { title: 'Fixture Company', path, downloadFileName: 'fixture' }));
    expect(html).toContain(path); noLeak(html);
  });
});
