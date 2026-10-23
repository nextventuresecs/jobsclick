import { z } from 'zod';

export const enterpriseSizeEnum = z.enum(['micro', 'small', 'medium']);
export type EnterpriseSize = z.infer<typeof enterpriseSizeEnum>;

export const broadcastFilterSchema = z.object({
  district: z.string().trim().optional(),
  sector: z.string().trim().optional(),
  companySize: enterpriseSizeEnum.optional(),
});

export type BroadcastFilter = z.infer<typeof broadcastFilterSchema>;

export const costPreviewRequestSchema = z.object({
  filters: broadcastFilterSchema.default({}),
  templateId: z.string().min(1, 'DLT Template ID is required'),
  variables: z.record(z.string()).default({}),
});

export type CostPreviewRequest = z.infer<typeof costPreviewRequestSchema>;

export const costPreviewResponseSchema = z.object({
  recipientCount: z.number().int().nonnegative(),
  encoding: z.enum(['GSM-7', 'UCS-2']),
  segmentCount: z.number().int().positive(),
  costPerSmsPaise: z.number().int().positive(),
  totalCostPaise: z.number().int().nonnegative(),
  totalCostInr: z.number().nonnegative(),
  previewText: z.string(),
});

export type CostPreviewResponse = z.infer<typeof costPreviewResponseSchema>;

export const dispatchBroadcastSchema = z.object({
  filters: broadcastFilterSchema.default({}),
  templateId: z.string().min(1, 'DLT Template ID is required'),
  variables: z.record(z.string()).default({}),
  confirmationToken: z.string().min(8, 'Confirmation token required'),
});

export type DispatchBroadcast = z.infer<typeof dispatchBroadcastSchema>;

export const districtReportItemSchema = z.object({
  district: z.string(),
  onboardedMsmes: z.number().int().nonnegative(),
  activeJobs: z.number().int().nonnegative(),
  totalHires: z.number().int().nonnegative(),
});

export type DistrictReportItem = z.infer<typeof districtReportItemSchema>;

export const districtReportResponseSchema = z.array(districtReportItemSchema);
export type DistrictReportResponse = z.infer<typeof districtReportResponseSchema>;
