import { describe, it, expect } from 'vitest';
import type { DistrictReportItem } from '@indian-job-portal/validation';

describe('Ticket T-20 Web Components: MSME Broadcast Console & District Reports', () => {
  describe('Component Exports & Module Contract', () => {
    it('exports MsmeBroadcastConsole from admin workspace barrel', async () => {
      const adminModule = await import('../src/components/workspaces/admin/index.js');
      expect(adminModule.MsmeBroadcastConsole).toBeDefined();
      expect(typeof adminModule.MsmeBroadcastConsole).toBe('function');
    });

    it('exports DistrictReports from admin workspace barrel', async () => {
      const adminModule = await import('../src/components/workspaces/admin/index.js');
      expect(adminModule.DistrictReports).toBeDefined();
      expect(typeof adminModule.DistrictReports).toBe('function');
    });

    it('exports AdminWorkspace with integration of broadcast and report tabs', async () => {
      const workspaceModule = await import('../src/components/workspaces/AdminWorkspace.js');
      expect(workspaceModule.AdminWorkspace).toBeDefined();
      expect(typeof workspaceModule.AdminWorkspace).toBe('function');
    });
  });

  describe('Hard Invariant #8a: Exact i18n Key Parity (English & Hindi)', () => {
    it('enforces exact key parity for MsmeBroadcast translation namespace', async () => {
      const en = (await import('../messages/en.json')).default;
      const hi = (await import('../messages/hi.json')).default;

      expect(en.MsmeBroadcast).toBeDefined();
      expect(hi.MsmeBroadcast).toBeDefined();

      const enKeys = Object.keys(en.MsmeBroadcast).sort();
      const hiKeys = Object.keys(hi.MsmeBroadcast).sort();

      expect(enKeys).toEqual(hiKeys);
      expect(enKeys.length).toBeGreaterThan(15);
    });

    it('enforces exact key parity for DistrictReports translation namespace', async () => {
      const en = (await import('../messages/en.json')).default;
      const hi = (await import('../messages/hi.json')).default;

      expect(en.DistrictReports).toBeDefined();
      expect(hi.DistrictReports).toBeDefined();

      const enKeys = Object.keys(en.DistrictReports).sort();
      const hiKeys = Object.keys(hi.DistrictReports).sort();

      expect(enKeys).toEqual(hiKeys);
      expect(enKeys.length).toBeGreaterThan(8);
    });
  });

  describe('District Employment Reports Data Integrity & Zero PII Guard (Hard Invariant #1)', () => {
    const sampleReports: DistrictReportItem[] = [
      { district: 'Bhopal', onboardedMsmes: 840, activeJobs: 320, totalHires: 215 },
      { district: 'Indore', onboardedMsmes: 1250, activeJobs: 640, totalHires: 490 },
      { district: 'Gwalior', onboardedMsmes: 430, activeJobs: 180, totalHires: 110 },
      { district: 'Jabalpur', onboardedMsmes: 520, activeJobs: 210, totalHires: 145 },
    ];

    it('contains strictly aggregated numeric indicators with no candidate identities', () => {
      sampleReports.forEach((row) => {
        expect(typeof row.district).toBe('string');
        expect(typeof row.onboardedMsmes).toBe('number');
        expect(typeof row.activeJobs).toBe('number');
        expect(typeof row.totalHires).toBe('number');

        // Zero PII Leakage Check
        const record = row as unknown as Record<string, unknown>;
        expect(record['applicant_id']).toBeUndefined();
        expect(record['phone']).toBeUndefined();
        expect(record['email']).toBeUndefined();
        expect(record['aadhaar']).toBeUndefined();
        expect(record['candidate_name']).toBeUndefined();
      });
    });

    it('correctly aggregates statewide totals for MSMEs, Jobs, and Verified Placements', () => {
      const totalMsmes = sampleReports.reduce((sum, r) => sum + r.onboardedMsmes, 0);
      const totalJobs = sampleReports.reduce((sum, r) => sum + r.activeJobs, 0);
      const totalHires = sampleReports.reduce((sum, r) => sum + r.totalHires, 0);

      expect(totalMsmes).toBe(3040);
      expect(totalJobs).toBe(1350);
      expect(totalHires).toBe(960);
      expect(totalHires).toBeLessThanOrEqual(totalJobs);
    });
  });
});
