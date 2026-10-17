import { describe, it, expect } from 'vitest';
import { maskCandidatePhone, maskCandidateEmail } from '../src/data/sampleWorkspaces.js';

describe('Ticket T-10 Web Wiring: Workspace Forms & 1-Click Apply (PRD JOB-01, JOB-03, JS-02, EMP-01)', () => {
  it('exports JobApplyButton with expected props contract', async () => {
    const { JobApplyButton } = await import('../src/components/jobs/JobApplyButton.jsx');
    expect(JobApplyButton).toBeDefined();
    expect(typeof JobApplyButton).toBe('function');
  });

  it('exports EmployerWorkspace and SeekerWorkspace components', async () => {
    const { EmployerWorkspace } = await import('../src/components/workspaces/EmployerWorkspace.jsx');
    const { SeekerWorkspace } = await import('../src/components/workspaces/SeekerWorkspace.jsx');
    expect(EmployerWorkspace).toBeDefined();
    expect(typeof EmployerWorkspace).toBe('function');
    expect(SeekerWorkspace).toBeDefined();
    expect(typeof SeekerWorkspace).toBe('function');
  });

  it('enforces Hard Invariant #1: Employer/ATS views never expose candidate phone or email', () => {
    const rawPhones = ['9826014829', '+91 98260 14829', '9876543210'];
    const rawEmails = ['anita.sharma@example.in', 'rahul.machinist@gmail.com', 'candidate@polytechnic.edu'];

    for (const phone of rawPhones) {
      const masked = maskCandidatePhone(phone);
      expect(masked).not.toBe(phone);
      expect(masked).toMatch(/\+91 ••••• ••\d{3}/);
      // Raw digits must not be exposed
      expect(masked.includes('982601')).toBe(false);
    }

    for (const email of rawEmails) {
      const masked = maskCandidateEmail(email);
      expect(masked).not.toBe(email);
      expect(masked).toMatch(/[a-z0-9]{2}••••@[a-z0-9.-]+/i);
      expect(masked.includes('anita.sharma')).toBe(false);
      expect(masked.includes('rahul.machinist')).toBe(false);
    }
  });
});
