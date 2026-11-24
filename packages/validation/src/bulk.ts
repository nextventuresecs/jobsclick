import { z } from 'zod';

export const entityTypeSchema = z.enum(['student', 'employer']);

export const bulkRosterMetadataSchema = z.object({
  source: z.string().min(2, 'Source is required (e.g. MSME Department or College Name)'),
  entityType: entityTypeSchema.default('student'),
});

export const bulkUploadSchema = bulkRosterMetadataSchema.extend({
  csvContent: z.string().optional(),
  storagePath: z.never().optional(),
  fileName: z.string().optional(),
});

export const inviteWaveSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  waveSize: z.coerce.number().int().positive().max(10000, 'Max wave size is 10,000'),
  costPerSmsInr: z.coerce.number().positive().default(0.2),
});

export const updateWaveStatusSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
});

export const bulkContactRowSchema = z
  .object({
    email: z.string().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
    company_name: z.string().optional(),
  })
  .refine(
    (row) => Boolean(row.email?.trim() || row.phone?.trim()),
    'At least one contact identifier (email or phone) is required',
  );

export type BulkUploadInput = z.infer<typeof bulkUploadSchema>;
export type InviteWaveInput = z.infer<typeof inviteWaveSchema>;
export type UpdateWaveStatusInput = z.infer<typeof updateWaveStatusSchema>;
export type BulkContactRowInput = z.infer<typeof bulkContactRowSchema>;

