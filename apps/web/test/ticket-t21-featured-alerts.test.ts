import { describe, it, expect } from 'vitest';
import {
  promoteJobSchema,
  createJobAlertSchema,
  FEATURED_PROMOTION_PRICING,
} from '@indian-job-portal/validation';

describe('Ticket T-21 Web Components: Featured Promotions & Search Alerts', () => {
  describe('Component Exports & Module Contract', () => {
    it('exports SaveSearchAlertModal component', async () => {
      const modal = await import('../src/components/jobs/SaveSearchAlertModal.js');
      expect(modal.SaveSearchAlertModal).toBeDefined();
      expect(typeof modal.SaveSearchAlertModal).toBe('function');
    });

    it('exports PromoteJobModal component', async () => {
      const modal = await import('../src/components/workspaces/employer/PromoteJobModal.js');
      expect(modal.PromoteJobModal).toBeDefined();
      expect(typeof modal.PromoteJobModal).toBe('function');
    });

    it('exports EmployerJobList component with promote capability', async () => {
      const list = await import('../src/components/workspaces/employer/EmployerJobList.js');
      expect(list.EmployerJobList).toBeDefined();
      expect(typeof list.EmployerJobList).toBe('function');
    });
  });

  describe('Hard Invariant #8a: Exact i18n Key Parity (English & Hindi)', () => {
    it('enforces exact key parity for JobsPage translation namespace', async () => {
      const en = (await import('../messages/en.json')).default;
      const hi = (await import('../messages/hi.json')).default;

      expect(en.JobsPage).toBeDefined();
      expect(hi.JobsPage).toBeDefined();

      const enKeys = Object.keys(en.JobsPage).sort();
      const hiKeys = Object.keys(hi.JobsPage).sort();

      expect(enKeys).toEqual(hiKeys);
      expect(enKeys).toContain('featuredBadge');
      expect(enKeys).toContain('saveAlert');
      expect(enKeys).toContain('btnSaveAlert');
    });

    it('enforces exact key parity for EmployerWorkspace translation namespace including promotion keys', async () => {
      const en = (await import('../messages/en.json')).default;
      const hi = (await import('../messages/hi.json')).default;

      expect(en.EmployerWorkspace).toBeDefined();
      expect(hi.EmployerWorkspace).toBeDefined();

      const enKeys = Object.keys(en.EmployerWorkspace).sort();
      const hiKeys = Object.keys(hi.EmployerWorkspace).sort();

      expect(enKeys).toEqual(hiKeys);
      expect(enKeys).toContain('btnPromoteJob');
      expect(enKeys).toContain('promotedBadge');
      expect(enKeys).toContain('btnConfirmPromote');
      expect(enKeys).toContain('insufficientCredits');
    });
  });

  describe('Validation Schemas & Promotion Pricing Contract', () => {
    it('validates promotion duration days and enforces strict pricing mapping', () => {
      expect(promoteJobSchema.safeParse({ durationDays: 7 }).success).toBe(true);
      expect(promoteJobSchema.safeParse({ durationDays: 14 }).success).toBe(true);
      expect(promoteJobSchema.safeParse({ durationDays: 30 }).success).toBe(true);
      expect(promoteJobSchema.safeParse({ durationDays: 10 }).success).toBe(false);

      expect(FEATURED_PROMOTION_PRICING[7]).toBe(50);
      expect(FEATURED_PROMOTION_PRICING[14]).toBe(90);
      expect(FEATURED_PROMOTION_PRICING[30]).toBe(160);
    });

    it('validates job alert schema with required title and defaults', () => {
      const result = createJobAlertSchema.safeParse({
        title: 'CNC Machinist Indore',
        filters: { city: 'Indore', category: 'manufacturing' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.frequency).toBe('daily');
        expect(result.data.title).toBe('CNC Machinist Indore');
      }

      // Reject blank or short title
      expect(createJobAlertSchema.safeParse({ title: '   ' }).success).toBe(false);
      expect(createJobAlertSchema.safeParse({ title: 'A' }).success).toBe(false);
    });
  });

  describe('Featured Job Search Boosting Simulation', () => {
    it('ensures promoted jobs are ranked above older or standard organic listings', () => {
      const jobs = [
        { id: '1', title: 'Organic Job A', isPromoted: false, createdAt: '2026-10-23T10:00:00Z' },
        { id: '2', title: 'Featured Job B', isPromoted: true, createdAt: '2026-10-22T10:00:00Z' },
        { id: '3', title: 'Organic Job C', isPromoted: false, createdAt: '2026-10-23T12:00:00Z' },
      ];

      const sorted = [...jobs].sort((a, b) => {
        const aPromoted = Boolean(a.isPromoted);
        const bPromoted = Boolean(b.isPromoted);
        if (aPromoted !== bPromoted) return aPromoted ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      expect(sorted[0]?.id).toBe('2');
      expect(sorted[1]?.id).toBe('3');
      expect(sorted[2]?.id).toBe('1');
    });
  });
});
