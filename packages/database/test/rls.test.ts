import { describe, it, expect } from 'vitest';
import { canUserAccessRecord, isAuditLogImmutable } from '../src/rls-helper.js';

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

  it('allows any user to read public job postings', () => {
    const userA = 'usr_11111111-1111-1111-1111-111111111111';
    const publicJobRecord = {
      id: 'job_200',
      user_id: 'usr_employer_999',
      is_public: true,
    };

    expect(canUserAccessRecord(userA, publicJobRecord)).toBe(true);
  });

  it('enforces audit logs immutability (UPDATE and DELETE prohibited)', () => {
    expect(isAuditLogImmutable('INSERT')).toBe(true);
    expect(isAuditLogImmutable('UPDATE')).toBe(false);
    expect(isAuditLogImmutable('DELETE')).toBe(false);
  });
});
