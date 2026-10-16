import { z } from 'zod';

export const entityTypeSchema = z.enum(['student', 'employer']);

export const bulkUploadSchema = z.object({
  source: z.string().min(2, 'Source is required (e.g. MSME Department or College Name)'),
  entityType: entityTypeSchema.default('student'),
  csvContent: z.string().optional(),
  storagePath: z.string().optional(),
  fileName: z.string().optional(),
});

export const signedUrlSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  contentType: z.string().optional().default('text/csv'),
});

export const inviteWaveSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  waveSize: z.coerce.number().int().positive().max(10000, 'Max wave size is 10,000'),
  costPerSmsInr: z.coerce.number().positive().default(0.2),
});

export const updateWaveStatusSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
});

export type BulkUploadInput = z.infer<typeof bulkUploadSchema>;
export type SignedUrlInput = z.infer<typeof signedUrlSchema>;
export type InviteWaveInput = z.infer<typeof inviteWaveSchema>;
export type UpdateWaveStatusInput = z.infer<typeof updateWaveStatusSchema>;

