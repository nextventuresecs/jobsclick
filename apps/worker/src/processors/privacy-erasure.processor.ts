import { Job, UnrecoverableError } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isTestEnv } from '@indian-job-portal/validation';

export interface PrivacyErasureJobData {
  requestId: string;
  userId: string;
}

export interface PrivacyErasureJobResult {
  requestId: string;
  status: 'done';
  resumePdfsDeleted: number;
}

function createServiceClient(): SupabaseClient | null {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (isTestEnv() || !url || !key || key === 'dummy-service-role-key') return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function setStatus(
  db: SupabaseClient,
  requestId: string,
  patch: { status: 'processing' | 'done' | 'failed'; error_code?: string | null; processed_at?: string },
): Promise<void> {
  const { error } = await db
    .from('privacy_erasure_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw new Error('ERASURE_STATUS_WRITE_FAILED');
}

/** Deletes the user's private resume PDFs queued by the erasure trigger (see erasure-draft). */
async function deleteResumePdfs(db: SupabaseClient, userId: string): Promise<number> {
  const { data: profiles, error: profileError } = await db
    .from('job_seeker_profiles')
    .select('id')
    .eq('user_id', userId);
  if (profileError) throw new Error('RESUME_ERASURE_LOOKUP_FAILED');

  let deleted = 0;
  for (const { id: seekerId } of (profiles ?? []) as { id: string }[]) {
    // Absent objects are not an error, so retries are safe.
    const { error: storageError } = await db.storage.from('private').remove([`resumes/${seekerId}.pdf`]);
    if (storageError) throw new Error('RESUME_PDF_DELETE_FAILED');
    const { error: writeError } = await db
      .from('resume_pdf_erasure')
      .update({ completed_at: new Date().toISOString() })
      .eq('seeker_id', seekerId)
      .is('completed_at', null);
    if (writeError) throw new Error('RESUME_ERASURE_COMPLETE_FAILED');
    deleted++;
  }
  return deleted;
}

export async function privacyErasureProcessor(
  job: Job<PrivacyErasureJobData>,
  db: SupabaseClient | null = createServiceClient(),
): Promise<PrivacyErasureJobResult> {
  if (!db) throw new Error('ERASURE_DB_UNAVAILABLE');
  const { requestId, userId } = job.data;

  const { data: request, error: lookupError } = await db
    .from('privacy_erasure_requests')
    .select('id, user_id, status')
    .eq('id', requestId)
    .single();
  if (lookupError || !request) throw new Error('ERASURE_REQUEST_LOOKUP_FAILED');
  if (request.user_id !== userId) throw new UnrecoverableError('ERASURE_REQUEST_USER_MISMATCH');
  if (request.status === 'done') return { requestId, status: 'done', resumePdfsDeleted: 0 };

  await setStatus(db, requestId, { status: 'processing' });
  try {
    // anonymise_user scrubs PII in one transaction; payments are kept with metadata cleared (GST retention).
    const { error: rpcError } = await db.rpc('anonymise_user', { p_user_id: userId });
    if (rpcError) throw new Error('ANONYMISE_FAILED');
    const resumePdfsDeleted = await deleteResumePdfs(db, userId);
    await setStatus(db, requestId, { status: 'done', error_code: null, processed_at: new Date().toISOString() });
    return { requestId, status: 'done', resumePdfsDeleted };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'ERASURE_FAILED';
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await setStatus(db, requestId, isLastAttempt ? { status: 'failed', error_code: code } : { status: 'processing', error_code: code });
    throw err;
  }
}
