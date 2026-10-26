import { z } from 'zod';

export const adminUserStatusSchema = z.object({
  status: z.enum(['invited', 'active', 'disabled']),
});

export const auditLogSchema = z.object({
  action: z.string().min(2, 'Action name required'),
  meta: z.record(z.unknown()).default({}),
});

export const privacyRequestSchema = z.object({
  reason: z.string().optional(),
  confirmDeletion: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm account deletion request' }),
  }),
});

export const adminExportQuerySchema = z.object({
  entity: z.enum(['users', 'jobs', 'applications', 'institutions', 'audit_logs']).default('users'),
  format: z.enum(['json', 'csv']).default('json'),
});

export type AdminUserStatusInput = z.infer<typeof adminUserStatusSchema>;
export type AuditLogInput = z.infer<typeof auditLogSchema>;
export type PrivacyRequestInput = z.infer<typeof privacyRequestSchema>;
export type AdminExportQueryInput = z.infer<typeof adminExportQuerySchema>;
