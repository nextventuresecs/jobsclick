import { describe, it, expect } from 'vitest';
import {
  canUserAccessRecord,
  canUserAccessApplication,
  canUserAccessInstitutionInquiry,
  canUserManageInstitutionSponsorship,
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

  it('permits only owning institution, intermediary creator, or platform admin to manage sponsorship (WAL-05 & Invariant #5)', () => {
    const ownerId = 'usr_inst_owner_111';
    const intermediaryCreatorId = 'usr_intermediary_222';
    const adminId = 'usr_platform_admin_333';
    const msmeAdminId = 'usr_msme_admin_444';
    const intruderId = 'usr_intruder_999';

    const institution = {
      id: 'inst_abc_123',
      user_id: ownerId,
      created_by: intermediaryCreatorId,
    };

    // Owner can manage
    expect(canUserManageInstitutionSponsorship(ownerId, 'institution', institution)).toBe(true);
    // Managing intermediary can manage
    expect(canUserManageInstitutionSponsorship(intermediaryCreatorId, 'intermediary', institution)).toBe(true);
    // Platform admins can manage
    expect(canUserManageInstitutionSponsorship(adminId, 'admin', institution)).toBe(true);
    expect(canUserManageInstitutionSponsorship(msmeAdminId, 'msme_admin', institution)).toBe(true);

    // Other institutions, different intermediaries, and unrelated users are denied
    expect(canUserManageInstitutionSponsorship(intruderId, 'institution', institution)).toBe(false);
    expect(canUserManageInstitutionSponsorship(intruderId, 'intermediary', institution)).toBe(false);
    expect(canUserManageInstitutionSponsorship(intruderId, 'job_seeker', institution)).toBe(false);
    expect(canUserManageInstitutionSponsorship(intruderId, 'employer', institution)).toBe(false);
  });
});
