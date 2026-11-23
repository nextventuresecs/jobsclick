import type { BulkUploadInput } from '@indian-job-portal/validation';

export async function uploadBulkRoster(source: string, entityType: BulkUploadInput['entityType'], file: File) {
  const body = new FormData();
  body.set('source', source.trim());
  body.set('entityType', entityType);
  body.set('file', file);
  const response = await fetch('/api/bulk/batches/file', { method: 'POST', body });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { code?: string } | null;
    throw new Error(error?.code ?? 'BULK_UPLOAD_FAILED');
  }
  return response.json() as Promise<{ id: string; source: string; totalRows: number }>;
}
