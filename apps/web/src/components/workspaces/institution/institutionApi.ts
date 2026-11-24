import type {
  InstitutionCmsInput,
  InstitutionInquiryLead,
  UpdateInquiryStatusInput,
} from '@indian-job-portal/validation';

export async function pollBatchStatus(batchId: string) {
  const res = await fetch(`/api/bulk/batches/${encodeURIComponent(batchId)}`);
  if (!res.ok) return null;
  return res.json() as Promise<{
    status: string;
    totalRows?: number;
    validRows?: number;
    errorRows?: number;
    failureReason?: string;
  }>;
}

export interface InvitePreview {
  waveSize: number;
  costPerSmsInr: number;
  totalCostInr: number;
}

export async function previewInviteWave(batchId: string, waveSize: number): Promise<InvitePreview> {
  const response = await fetch('/api/bulk/invites/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, waveSize }),
  });
  if (!response.ok) throw new Error('INVITE_PREVIEW_UNAVAILABLE');
  return response.json() as Promise<InvitePreview>;
}

export async function queueInviteWave(batchId: string, preview: InvitePreview): Promise<void> {
  const response = await fetch('/api/bulk/invites/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, waveSize: preview.waveSize, costPerSmsInr: preview.costPerSmsInr }),
  });
  if (!response.ok) throw new Error('INVITE_QUEUE_UNAVAILABLE');
}

export async function fetchInstitutionCms(
  apiUrl: string,
  slugOrId: string,
): Promise<InstitutionCmsInput | null> {
  try {
    const res = await fetch(`${apiUrl}/profiles/institution/${slugOrId}/cms`);
    if (!res.ok) return null;
    return (await res.json()) as InstitutionCmsInput;
  } catch {
    return null;
  }
}

export async function updateInstitutionCms(
  apiUrl: string,
  token: string,
  cmsData: InstitutionCmsInput,
): Promise<InstitutionCmsInput> {
  const res = await fetch(`${apiUrl}/profiles/institution/cms`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(cmsData),
  });
  if (!res.ok) throw new Error('Failed to update institution CMS content');
  return res.json() as Promise<InstitutionCmsInput>;
}

export async function fetchInstitutionInquiries(
  apiUrl: string,
  token: string,
): Promise<InstitutionInquiryLead[]> {
  try {
    const res = await fetch(`${apiUrl}/profiles/institution/inquiries`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return [];
    return (await res.json()) as InstitutionInquiryLead[];
  } catch {
    return [];
  }
}

export async function updateInquiryStatus(
  apiUrl: string,
  token: string,
  inquiryId: string,
  status: UpdateInquiryStatusInput['status'],
): Promise<InstitutionInquiryLead> {
  const res = await fetch(`${apiUrl}/profiles/institution/inquiries/${inquiryId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update inquiry status');
  return res.json() as Promise<InstitutionInquiryLead>;
}
