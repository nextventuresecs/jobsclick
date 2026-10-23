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
  fileName: string
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
