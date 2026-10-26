import { describe, it, expect } from 'vitest';
import { auditMigrationDirectories } from '../../../scripts/ci/audit-migrations.js';

describe('Zero-Downtime Migration Safety & Lock Auditing (CI Gate)', () => {
  it('enforces that all check constraints on live tables use NOT VALID', () => {
    const violations = auditMigrationDirectories();
    const checkConstraintViolations = violations.filter(
      (v) => v.rule === 'UNBUFFERED_CHECK_CONSTRAINT_ACQUIRES_ACCESS_EXCLUSIVE'
    );

    expect(checkConstraintViolations).toEqual([]);
  });

  it('enforces that high-traffic tables have explicit lock_timeout configured', () => {
    const violations = auditMigrationDirectories();
    const lockTimeoutViolations = violations.filter(
      (v) => v.rule === 'HIGH_TRAFFIC_TABLE_MISSING_LOCK_TIMEOUT'
    );

    expect(lockTimeoutViolations).toEqual([]);
  });
});
