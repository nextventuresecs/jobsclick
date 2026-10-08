import { describe, it, expect } from 'vitest';
import { adminUserStatusSchema, auditLogSchema, privacyRequestSchema } from '../src/admin.js';

describe('Admin & Trust Schemas - Epic 5', () => {
  it('validates adminUserStatusSchema', () => {
    const valid = adminUserStatusSchema.parse({ status: 'disabled' });
    expect(valid.status).toBe('disabled');
  });

  it('validates auditLogSchema', () => {
    const valid = auditLogSchema.parse({ action: 'BULK_IMPORT_COMPLETED', meta: { rows: 500 } });
    expect(valid.action).toBe('BULK_IMPORT_COMPLETED');
  });

  it('validates privacyRequestSchema', () => {
    expect(() => privacyRequestSchema.parse({ confirmDeletion: false })).toThrow();
    const valid = privacyRequestSchema.parse({ confirmDeletion: true, reason: 'No longer needed' });
    expect(valid.confirmDeletion).toBe(true);
  });
});
