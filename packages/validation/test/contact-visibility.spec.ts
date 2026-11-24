import { describe, it, expect } from 'vitest';
import {
  redactCandidateContact,
  redactCandidateContactsBatch,
  type ViewerContext,
  type CandidateContactRecord,
  type ContactViewerRole,
} from '../src/contact-visibility.js';

describe('packages/validation - Candidate Contact Visibility Matrix (Hard Invariant #1 & DPDP Act)', () => {
  const ownInstitutionId = 'inst-alpha-123';
  const otherInstitutionId = 'inst-beta-456';

  const ownStudent: CandidateContactRecord = {
    id: 'cand-student-1',
    userId: 'user-cand-1',
    phone: '+919826014829',
    email: 'student.alpha@example.edu',
    institutionId: ownInstitutionId,
  };

  const otherStudent: CandidateContactRecord = {
    id: 'cand-student-2',
    userId: 'user-cand-2',
    phone: '+919826099999',
    email: 'student.beta@example.edu',
    institutionId: otherInstitutionId,
  };

  const candidateSelf: CandidateContactRecord = {
    id: 'user-seeker-self',
    userId: 'user-seeker-self',
    phone: '+919826011111',
    email: 'seeker.self@example.com',
    institutionId: null,
  };

  const candidateOther: CandidateContactRecord = {
    id: 'user-seeker-other',
    userId: 'user-seeker-other',
    phone: '+919826022222',
    email: 'seeker.other@example.com',
    institutionId: null,
  };

  // Matrix: every role x own/other/self x auditConfirmed true/false
  const allRoles: ContactViewerRole[] = [
    'employer',
    'institution',
    'intermediary',
    'admin',
    'msme_admin',
    'job_seeker',
    'public',
  ];

  describe('Full Permutation Matrix', () => {
    for (const role of allRoles) {
      for (const auditConfirmed of [true, false]) {
        describe(`Role: ${role} | auditConfirmed: ${auditConfirmed}`, () => {
          // 1. Own student test
          it(`evaluates own-institution student correctly`, () => {
            const viewer: ViewerContext = {
              role,
              id: 'viewer-test-id',
              institutionId: ownInstitutionId,
              auditConfirmed,
            };
            const result = redactCandidateContact(viewer, ownStudent);

            if (role === 'institution' || role === 'intermediary') {
              if (auditConfirmed) {
                expect(result.contactVisible).toBe(true);
                expect(result.phone).toBe(ownStudent.phone);
                expect(result.email).toBe(ownStudent.email);
              } else {
                expect(result.contactVisible).toBe(false);
                expect(result.phone).toBeNull();
                expect(result.email).toBeNull();
              }
            } else if (role === 'admin') {
              // Admin normal view without includeContacts
              if (auditConfirmed) {
                expect(result.contactVisible).toBe(true);
                expect(result.phone).toBe(ownStudent.phone);
                expect(result.email).toBe(ownStudent.email);
              } else {
                expect(result.contactVisible).toBe(false);
                expect(result.email).toBeNull();
              }
            } else {
              // employer, msme_admin, public, job_seeker (viewing someone else)
              expect(result.contactVisible).toBe(false);
              expect(result.phone).toBeNull();
              expect(result.email).toBeNull();
            }
          });

          // 2. Cross-institution / other student test
          it(`evaluates other-institution student correctly`, () => {
            const viewer: ViewerContext = {
              role,
              id: 'viewer-test-id',
              institutionId: ownInstitutionId,
              auditConfirmed,
            };
            const result = redactCandidateContact(viewer, otherStudent);

            if (role === 'admin') {
              if (auditConfirmed) {
                expect(result.contactVisible).toBe(true);
                expect(result.phone).toBe(otherStudent.phone);
                expect(result.email).toBe(otherStudent.email);
              } else {
                expect(result.contactVisible).toBe(false);
                expect(result.email).toBeNull();
              }
            } else {
              // All others (including institution B viewing institution A's students) are REDACTED
              expect(result.contactVisible).toBe(false);
              expect(result.phone).toBeNull();
              expect(result.email).toBeNull();
            }
          });

          // 3. Self candidate test
          it(`evaluates self vs other seeker correctly`, () => {
            const selfViewer: ViewerContext = {
              role,
              id: candidateSelf.id,
              auditConfirmed,
            };
            const otherViewer: ViewerContext = {
              role,
              id: 'unrelated-id',
              auditConfirmed,
            };

            const selfResult = redactCandidateContact(selfViewer, candidateSelf);
            const otherResult = redactCandidateContact(otherViewer, candidateOther);

            if (role === 'job_seeker') {
              // Seeker sees OWN profile unconditionally (no audit required)
              expect(selfResult.contactVisible).toBe(true);
              expect(selfResult.phone).toBe(candidateSelf.phone);
              expect(selfResult.email).toBe(candidateSelf.email);

              // But CANNOT see other seekers
              expect(otherResult.contactVisible).toBe(false);
              expect(otherResult.phone).toBeNull();
              expect(otherResult.email).toBeNull();
            } else if (role === 'admin') {
              if (auditConfirmed) {
                expect(selfResult.contactVisible).toBe(true);
                expect(otherResult.contactVisible).toBe(true);
              } else {
                expect(selfResult.contactVisible).toBe(false);
                expect(otherResult.contactVisible).toBe(false);
              }
            } else {
              expect(selfResult.contactVisible).toBe(false);
              expect(selfResult.phone).toBeNull();
              expect(selfResult.email).toBeNull();
              expect(otherResult.contactVisible).toBe(false);
              expect(otherResult.phone).toBeNull();
              expect(otherResult.email).toBeNull();
            }
          });
        });
      }
    }
  });

  describe('Platform Admin Export Specifics', () => {
    it('masks contacts by default when includeContacts is not true', () => {
      const viewer: ViewerContext = {
        role: 'admin',
        id: 'admin-1',
        includeContacts: false,
        auditConfirmed: true,
      };
      const result = redactCandidateContact(viewer, ownStudent);
      expect(result.contactVisible).toBe(false);
      expect(result.phone).toMatch(/\+91\*{6}\d{2}/);
      expect(result.email).toBeNull();
    });

    it('unmasks contacts when includeContacts is true AND auditConfirmed is true', () => {
      const viewer: ViewerContext = {
        role: 'admin',
        id: 'admin-1',
        includeContacts: true,
        auditConfirmed: true,
      };
      const result = redactCandidateContact(viewer, ownStudent);
      expect(result.contactVisible).toBe(true);
      expect(result.phone).toBe(ownStudent.phone);
      expect(result.email).toBe(ownStudent.email);
    });

    it('fails closed and redacts when includeContacts is true but auditConfirmed is false', () => {
      const viewer: ViewerContext = {
        role: 'admin',
        id: 'admin-1',
        includeContacts: true,
        auditConfirmed: false,
      };
      const result = redactCandidateContact(viewer, ownStudent);
      expect(result.contactVisible).toBe(false);
      expect(result.phone).toBeNull();
      expect(result.email).toBeNull();
    });
  });

  describe('Batch Redaction Functionality (redactCandidateContactsBatch)', () => {
    it('redacts array of records and returns aggregated totals', () => {
      const viewer: ViewerContext = {
        role: 'institution',
        id: 'inst-user-1',
        institutionId: ownInstitutionId,
        auditConfirmed: true,
      };

      const records = [ownStudent, otherStudent];
      const batchResult = redactCandidateContactsBatch(viewer, records);

      expect(batchResult.totalCount).toBe(2);
      expect(batchResult.unmaskedCount).toBe(1);
      expect(batchResult.records).toHaveLength(2);

      // Record 0 (own student) -> unmasked
      expect(batchResult.records[0]?.contactVisible).toBe(true);
      expect(batchResult.records[0]?.phone).toBe(ownStudent.phone);

      // Record 1 (other student) -> redacted
      expect(batchResult.records[1]?.contactVisible).toBe(false);
      expect(batchResult.records[1]?.phone).toBeNull();
    });
  });
});
