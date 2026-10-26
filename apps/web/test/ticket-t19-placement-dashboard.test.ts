import { describe, it, expect } from 'vitest';
import {
  filterStudentsMultiSelect,
  maskContactNumber,
  maskEmailAddress,
} from '../src/components/workspaces/institution/studentUtils.js';
import type {
  StudentRecordData,
  CorporateTieUpData,
  PlacementApplicationRecord,
} from '../src/data/sampleWorkspaces.js';
import {
  INITIAL_STUDENTS,
  INITIAL_CORPORATE_TIEUPS,
  INITIAL_PLACEMENT_APPLICATIONS,
} from '../src/data/sampleWorkspaces.js';

describe('Ticket T-19: Placement Cell HR Dashboard & Institutional Placement Pipeline', () => {
  const sampleStudents: readonly StudentRecordData[] = [
    {
      id: 'stu-test-1',
      institutionId: 'inst-01',
      studentName: 'Amitesh Chouhan',
      rollNumber: '0801ME221045',
      phone: '+91 94251 88301',
      email: 'amitesh.c@iti.gov.in',
      stream: 'Mechanical Engineering (Diploma)',
      trade: 'CNC Machinist',
      passingYear: '2026',
      grade: 'Distinction (85%+)',
      skills: ['CNC Milling', 'MasterCAM', 'Blueprint Reading'],
      profileCompleted: true,
      placementStatus: 'Available',
      state: 'active',
    },
    {
      id: 'stu-test-2',
      institutionId: 'inst-01',
      studentName: 'Pooja Vishwakarma',
      rollNumber: '0801EC221089',
      phone: '+91 97530 22194',
      email: 'pooja.v@iti.gov.in',
      stream: 'Electronics & Instrumentation',
      trade: 'Electrician & Wireman',
      passingYear: '2026',
      grade: 'Grade A+',
      skills: ['Circuit Design', 'PLC Automation', 'Wiring Inspection'],
      profileCompleted: true,
      placementStatus: 'Placed',
      state: 'active',
    },
    {
      id: 'stu-test-3',
      institutionId: 'inst-01',
      studentName: 'Deepak Malviya',
      rollNumber: '0801CS221012',
      phone: '+91 91114 38290',
      email: 'deepak.m@iti.gov.in',
      stream: 'Computer Application (BCA)',
      trade: 'Computer Operator & Programming (COPA)',
      passingYear: '2025',
      grade: 'First Class (Grade A)',
      skills: ['Tally Prime', 'Python', 'Web Basics'],
      profileCompleted: false,
      placementStatus: 'Available',
      state: 'invited',
    },
    {
      id: 'stu-test-4',
      institutionId: 'inst-01',
      studentName: 'Gaurav Rathore',
      rollNumber: '0801CE221034',
      phone: '+91 93019 45678',
      email: 'gaurav.r@iti.gov.in',
      stream: 'Civil & Surveying (Diploma)',
      trade: 'Fitter & Turner',
      passingYear: '2025',
      grade: 'First Class (Grade B)',
      skills: ['Lathe Operation', 'Bench Work', 'Measurement Gauges'],
      profileCompleted: false,
      placementStatus: 'In Process',
      state: 'invited',
    },
  ];

  describe('Multi-Select Filtering Engine (studentUtils)', () => {
    it('filters students by multiple selected trades', () => {
      const filtered = filterStudentsMultiSelect(sampleStudents, {
        trades: ['CNC Machinist', 'Electrician & Wireman'],
        passingYears: [],
        grades: [],
        skills: [],
        readinessStatus: 'all',
        search: '',
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((s) => s.id)).toEqual(['stu-test-1', 'stu-test-2']);
    });

    it('filters students by passing year and academic grade simultaneously', () => {
      const filtered = filterStudentsMultiSelect(sampleStudents, {
        trades: [],
        passingYears: ['2026'],
        grades: ['Distinction (85%+)'],
        skills: [],
        readinessStatus: 'all',
        search: '',
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.studentName).toBe('Amitesh Chouhan');
    });

    it('filters students by technical skill tags', () => {
      const filtered = filterStudentsMultiSelect(sampleStudents, {
        trades: [],
        passingYears: [],
        grades: [],
        skills: ['PLC Automation'],
        readinessStatus: 'all',
        search: '',
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.studentName).toBe('Pooja Vishwakarma');
    });

    it('filters by profile readiness (Profile Complete vs Pending OTP Claim)', () => {
      const completed = filterStudentsMultiSelect(sampleStudents, {
        trades: [],
        passingYears: [],
        grades: [],
        skills: [],
        readinessStatus: 'profile_completed',
        search: '',
      });
      expect(completed).toHaveLength(2);
      expect(completed.every((s) => s.profileCompleted)).toBe(true);

      const pending = filterStudentsMultiSelect(sampleStudents, {
        trades: [],
        passingYears: [],
        grades: [],
        skills: [],
        readinessStatus: 'pending_otp',
        search: '',
      });
      expect(pending).toHaveLength(2);
      expect(pending.every((s) => s.state === 'invited')).toBe(true);
    });

    it('filters by search term matching name or roll number', () => {
      const byName = filterStudentsMultiSelect(sampleStudents, {
        trades: [],
        passingYears: [],
        grades: [],
        skills: [],
        readinessStatus: 'all',
        search: 'Malviya',
      });
      expect(byName).toHaveLength(1);
      expect(byName[0]?.id).toBe('stu-test-3');

      const byRoll = filterStudentsMultiSelect(sampleStudents, {
        trades: [],
        passingYears: [],
        grades: [],
        skills: [],
        readinessStatus: 'all',
        search: '0801ME',
      });
      expect(byRoll).toHaveLength(1);
      expect(byRoll[0]?.id).toBe('stu-test-1');
    });
  });

  describe('Hard Invariant #1: Strict PII Masking Engine', () => {
    it('masks phone numbers to prevent recruiter harvesting', () => {
      const masked = maskContactNumber('+91 94251 88301');
      expect(masked).toBe('+91 ••••• •••••');
      expect(masked).not.toContain('94251');
      expect(masked).not.toContain('88301');
    });

    it('masks email addresses preserving complete confidentiality', () => {
      const masked = maskEmailAddress('amitesh.c@iti.gov.in');
      expect(masked).toBe('•••••@••••.•••');
      expect(masked).not.toContain('amitesh.c');
      expect(masked).not.toContain('iti.gov.in');
    });

    it('handles empty or missing contact values gracefully', () => {
      expect(maskContactNumber('')).toBe('••••••••••');
      expect(maskEmailAddress('')).toBe('•••••@••••.•••');
    });
  });

  describe('Corporate Tie-Ups & Dual-Sided Placement Pipeline Data', () => {
    it('provides verified corporate tie-ups with active status and preferred trades', () => {
      expect(INITIAL_STUDENTS.length).toBeGreaterThan(0);
      expect(INITIAL_CORPORATE_TIEUPS.length).toBeGreaterThan(0);
      const tieUp = INITIAL_CORPORATE_TIEUPS[0] as CorporateTieUpData;
      expect(tieUp).toBeDefined();
      expect(tieUp.partnershipStatus).toMatch(/active|mou_signed|pending/);
      expect(tieUp.preferredTrades.length).toBeGreaterThan(0);
      expect(tieUp.companyName).toBeTruthy();
    });

    it('tracks student applications across the entire 5-stage recruitment funnel', () => {
      expect(INITIAL_PLACEMENT_APPLICATIONS.length).toBeGreaterThan(0);
      const stages = INITIAL_PLACEMENT_APPLICATIONS.map(
        (app: PlacementApplicationRecord) => app.stage,
      );
      expect(stages).toContain('applied');
      expect(stages).toContain('shortlisted');
      expect(stages).toContain('interview');
      expect(stages).toContain('offered');
      expect(stages).toContain('placed');
    });

    it('contains offer letter details for offered and placed candidates', () => {
      const offered = INITIAL_PLACEMENT_APPLICATIONS.find(
        (app: PlacementApplicationRecord) => app.stage === 'offered' || app.stage === 'placed',
      );
      expect(offered).toBeDefined();
      expect(offered?.offerPackage).toBeTruthy();
    });
  });

  describe('PlacementDashboard Component Export & Contract', () => {
    it('exports PlacementDashboard from institution workspace index', async () => {
      const module = await import('../src/components/workspaces/institution/index.js');
      expect(module.PlacementDashboard).toBeDefined();
      expect(typeof module.PlacementDashboard).toBe('function');
    });

    it('enforces exact key parity between English and Hindi for PlacementDashboard namespace (Hard Invariant #8a)', async () => {
      const en = (await import('../messages/en.json')).default;
      const hi = (await import('../messages/hi.json')).default;

      const enPlacement = en.PlacementDashboard;
      const hiPlacement = hi.PlacementDashboard;

      expect(enPlacement).toBeDefined();
      expect(hiPlacement).toBeDefined();

      const enKeys = Object.keys(enPlacement).sort();
      const hiKeys = Object.keys(hiPlacement).sort();

      expect(enKeys).toEqual(hiKeys);
      expect(enKeys.length).toBeGreaterThan(20);
    });

    it('returns all students when no multi-select filter criteria are passed', () => {
      const filtered = filterStudentsMultiSelect(sampleStudents, {});
      expect(filtered).toHaveLength(sampleStudents.length);
    });

    it('returns empty array when criteria match zero candidates', () => {
      const filtered = filterStudentsMultiSelect(sampleStudents, {
        trades: ['NonExistentTrade'],
      });
      expect(filtered).toHaveLength(0);
    });
  });
});
