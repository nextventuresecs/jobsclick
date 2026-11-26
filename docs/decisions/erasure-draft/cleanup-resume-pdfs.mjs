/**
 * Process one batch after the affected accounts' PDF jobs have been quiesced.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service-role client
 */
export async function cleanupResumePdfs(supabase) {
  const { data: pending, error: readError } = await supabase
    .from('resume_pdf_erasure')
    .select('seeker_id')
    .is('completed_at', null)
    .order('queued_at')
    .order('seeker_id')
    .limit(100);
  if (readError || !pending) throw new Error('RESUME_ERASURE_LOOKUP_FAILED');

  let completed = 0;
  let pendingRetry = 0;
  for (const { seeker_id: seekerId } of pending) {
    if (typeof seekerId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(seekerId)) {
      pendingRetry++;
      continue;
    }
    try {
      const { error: storageError } = await supabase.storage
        .from('private')
        .remove([`resumes/${seekerId}.pdf`]);
      if (storageError) {
        pendingRetry++;
        continue;
      }
      const { error: writeError } = await supabase
        .from('resume_pdf_erasure')
        .update({ completed_at: new Date().toISOString() })
        .eq('seeker_id', seekerId)
        .is('completed_at', null);
      if (writeError) pendingRetry++;
      else completed++;
    } catch {
      pendingRetry++;
    }
  }
  return { completed, pendingRetry };
}
