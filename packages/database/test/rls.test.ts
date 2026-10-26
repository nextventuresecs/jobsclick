import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  canUserAccessRecord,
  canUserAccessApplication,
  canUserAccessInstitutionInquiry,
  canUserManageInstitutionSponsorship,
  isAuditLogImmutable,
  isAlertDeliveryImmutable,
  canUserAccessAlertDelivery,
  canUserManageJobAlert,
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
      id: 'job_100',
      user_id: 'usr_employer_99',
      is_public: true,
    };

    expect(canUserAccessRecord(userA, publicJobRecord)).toBe(true);
  });

  it('ensures application is only visible to applicant and job employer', () => {
    const applicantId = 'usr_candidate_1';
    const employerId = 'usr_employer_1';
    const strangerId = 'usr_stranger_1';

    const application = {
      id: 'app_1',
      applicant_id: applicantId,
      job_employer_id: employerId,
    };

    expect(canUserAccessApplication(applicantId, application)).toBe(true);
    expect(canUserAccessApplication(employerId, application)).toBe(true);
    expect(canUserAccessApplication(strangerId, application)).toBe(false);
  });

  it('enforces institution inquiry privacy - only institution owner can view inquiries (INT-03 & Invariant #1)', () => {
    const ownerId = 'usr_inst_owner_111';
    const otherUser = 'usr_other_222';
    expect(canUserAccessInstitutionInquiry(ownerId, ownerId)).toBe(true);
    expect(canUserAccessInstitutionInquiry(otherUser, ownerId)).toBe(false);
  });

  it('prohibits UPDATE and DELETE on audit logs (Hard Invariant #6: Append-only)', () => {
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

  it('enforces alert delivery ledger immutability and tenant isolation (Hard Invariants #5 & #6)', () => {
    const candidateA = 'usr_candidate_aaa';
    const candidateB = 'usr_candidate_bbb';
    const adminId = 'usr_admin_999';

    const deliveryRecord = {
      id: 'deliv_123',
      user_id: candidateA,
      alert_id: 'alert_1',
      job_id: 'job_1',
    };

    // Immutability: only INSERT is allowed, UPDATE and DELETE are strictly prohibited
    expect(isAlertDeliveryImmutable('INSERT')).toBe(true);
    expect(isAlertDeliveryImmutable('UPDATE')).toBe(false);
    expect(isAlertDeliveryImmutable('DELETE')).toBe(false);

    // Candidate A can insert their own delivery, but cannot UPDATE or DELETE
    expect(canUserAccessAlertDelivery(candidateA, 'job_seeker', deliveryRecord, 'INSERT')).toBe(true);
    expect(canUserAccessAlertDelivery(candidateA, 'job_seeker', deliveryRecord, 'UPDATE')).toBe(false);
    expect(canUserAccessAlertDelivery(candidateA, 'job_seeker', deliveryRecord, 'DELETE')).toBe(false);

    // Candidate B cannot insert a delivery record belonging to Candidate A
    expect(canUserAccessAlertDelivery(candidateB, 'job_seeker', deliveryRecord, 'INSERT')).toBe(false);

    // Admin can insert for Candidate A
    expect(canUserAccessAlertDelivery(adminId, 'admin', deliveryRecord, 'INSERT')).toBe(true);
    // But admin still cannot UPDATE or DELETE immutable delivery records
    expect(canUserAccessAlertDelivery(adminId, 'admin', deliveryRecord, 'UPDATE')).toBe(false);
    expect(canUserAccessAlertDelivery(adminId, 'admin', deliveryRecord, 'DELETE')).toBe(false);
  });

  it('enforces job alert tenant isolation and ownership integrity', () => {
    const userA = 'usr_user_aaa';
    const userB = 'usr_user_bbb';
    const adminId = 'usr_admin_999';

    const alert = {
      id: 'alert_100',
      user_id: userA,
      title: 'Software Developer Alerts',
    };

    // User A can manage their own alert
    expect(canUserManageJobAlert(userA, 'job_seeker', alert)).toBe(true);

    // User B cannot manage User A's alert
    expect(canUserManageJobAlert(userB, 'job_seeker', alert)).toBe(false);

    // User A cannot re-assign their alert to User B (tampering prevention)
    expect(canUserManageJobAlert(userA, 'job_seeker', alert, userB)).toBe(false);

    // Admin can manage User A's alert
    expect(canUserManageJobAlert(adminId, 'admin', alert)).toBe(true);
  });

  describe('Ticket 02: Audit Remediation Performance Indexes Migration', () => {
    it('defines foreign key and lookup indexes in migration DDL', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../supabase/migrations/20261026000000_audit_remediation_indexes.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      expect(sql).toContain('idx_jobs_employer_id ON jobs(employer_id)');
      expect(sql).toContain('idx_audit_logs_created_at ON audit_logs(created_at DESC)');
      expect(sql).toContain('idx_audit_logs_actor_id ON audit_logs(actor_id)');
      expect(sql).toContain('idx_invitations_batch_id ON invitations(batch_id)');
      expect(sql).toContain('idx_invitations_phone ON invitations(phone)');
    });
  });

  describe('Ticket 04: Atomic Contact Unlock Procedure Migration', () => {
    it('defines unlock_contact_with_ledger with advisory lock and dynamic balance check', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../supabase/migrations/20261026200000_atomic_contact_unlock_procedure.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      expect(sql).toContain('CREATE OR REPLACE FUNCTION unlock_contact_with_ledger');
      expect(sql).toContain("pg_advisory_xact_lock(hashtext('wallet_' || p_employer_id::text))");
      expect(sql).toContain('COALESCE(SUM(amount), 0) INTO v_current_balance');
      expect(sql).toContain('INSUFFICIENT_CREDITS');
    });
  });
});
