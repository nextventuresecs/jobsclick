import type {
  InstitutionCmsInput,
  InstitutionInquiryLead,
  UpdateInquiryStatusInput,
} from '@indian-job-portal/validation';

export async function requestSignedUploadUrl(apiUrl: string, fileName: string) {
  const res = await fetch(`${apiUrl}/bulk/signed-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType: 'text/csv' }),
  });
  if (!res.ok) throw new Error('Failed to obtain signed upload URL');
  return res.json() as Promise<{ signedUrl: string; storagePath: string }>;
}

export async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  try {
    await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/csv' },
      body: file,
    });
  } catch (uploadErr) {
    console.warn('Storage upload notice:', uploadErr);
  }
}

export async function registerBatchJob(
  apiUrl: string,
  source: string,
  storagePath: string,
  fileName: string,
) {
  const res = await fetch(`${apiUrl}/bulk/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source,
      entityType: 'student',
      storagePath,
      fileName,
    }),
  });
  if (!res.ok) throw new Error('Failed to create batch job');
  return res.json() as Promise<{ id: string }>;
}

export async function pollBatchStatus(apiUrl: string, batchId: string) {
  const res = await fetch(`${apiUrl}/bulk/batches/${batchId}`);
  if (!res.ok) return null;
  return res.json() as Promise<{
    status: string;
    totalRows?: number;
    validRows?: number;
    errorRows?: number;
    failureReason?: string;
  }>;
}

export async function fetchInstitutionCms(
  apiUrl: string,
  institutionId: string,
): Promise<InstitutionCmsInput | null> {
  try {
    const res = await fetch(`${apiUrl}/profiles/institution/${institutionId}/cms`);
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
