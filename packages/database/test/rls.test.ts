import { describe, it, expect } from 'vitest';
import {
  canUserAccessRecord,
  canUserAccessApplication,
  canUserAccessInstitutionInquiry,
  isAuditLogImmutable,
} from '../src/rls-helper.js';

describe('Database Row Level Security (RLS) & Audit Policies', () => {
  it('prevents User A from reading User B private record', () => {
    const userA = 'usr_11111111-1111-1111-1111-111111111111';
    const userB = 'usr_22222222-2222-2222-2222-222222222222';

    const recordUserB = {
      id: 'rec_100',
      user_id: userB,
      is_public: false,
    };

    expect(canUserAccessRecord(userA, recordUserB)).toBe(false);
    expect(canUserAccessRecord(userB, recordUserB)).toBe(true);
  });

  it('allows any user to read public job postings, employer profiles, and institution profiles', () => {
    const userA = 'usr_11111111-1111-1111-1111-111111111111';
    const publicJobRecord = {
      id: 'job_200',
      user_id: 'usr_employer_999',
      is_public: true,
    };
    const publicCompanyRecord = {
      id: 'comp_01',
      user_id: 'usr_employer_999',
      is_public: true,
    };
    const publicInstitutionRecord = {
      id: 'inst_01',
      user_id: 'usr_inst_888',
      is_public: true,
    };

    expect(canUserAccessRecord(userA, publicJobRecord)).toBe(true);
    expect(canUserAccessRecord(userA, publicCompanyRecord)).toBe(true);
    expect(canUserAccessRecord(userA, publicInstitutionRecord)).toBe(true);
  });

  it('allows both applicant and hiring employer to access vacancy application while denying third parties', () => {
    const applicantId = 'usr_applicant_111';
    const employerId = 'usr_employer_222';
    const thirdPartyId = 'usr_random_333';

    const applicationRecord = {
      id: 'app_555',
      applicant_id: applicantId,
      job_employer_id: employerId,
    };

    expect(canUserAccessApplication(applicantId, applicationRecord)).toBe(true);
    expect(canUserAccessApplication(employerId, applicationRecord)).toBe(true);
    expect(canUserAccessApplication(thirdPartyId, applicationRecord)).toBe(false);
  });

  it('restricts student inquiry leads to the owning institution only (INT-03 & Invariant #1/#5)', () => {
    const institutionOwnerId = 'usr_inst_888';
    const competitorInstitutionId = 'usr_inst_999';

    expect(canUserAccessInstitutionInquiry(institutionOwnerId, institutionOwnerId)).toBe(true);
    expect(canUserAccessInstitutionInquiry(competitorInstitutionId, institutionOwnerId)).toBe(false);
  });

  it('enforces audit logs immutability (UPDATE and DELETE prohibited)', () => {
    expect(isAuditLogImmutable('INSERT')).toBe(true);
    expect(isAuditLogImmutable('UPDATE')).toBe(false);
    expect(isAuditLogImmutable('DELETE')).toBe(false);
  });
});
