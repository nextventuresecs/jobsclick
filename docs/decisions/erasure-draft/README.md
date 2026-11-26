# Invitation and private resume erasure draft

Human review required. The SQL sits outside the Supabase migration directory and the cleanup module has no runtime entry point.

## Scope

- Extend the existing service-role erasure transaction. Once it sets the account's erasure tombstone, scrub invitation rows matching the original phone or the original account email after trimming and lowercasing. Keep the invitation row and its batch reference. Pending email addresses and aliases are excluded. An invitation matched by phone has its stored email scrubbed as part of the same record.
- Record each affected seeker's private resume deletion in the transaction. The draft also backfills deletion work for profile IDs with both an existing erasure tombstone and the original erasure audit event. The immutable audit log remains the evidence of account anonymisation. A pending cleanup row means file erasure is incomplete.
- Delete the canonical `private/resumes/<seeker-id>.pdf` through the Supabase Storage API and record completion only after it returns success. Repeat deletion is allowed if the file is absent or the completion write previously failed. The recorded seeker ID determines the path.

## Review before integration

1. Validate the trigger with the applied staging schema in a disposable clone and confirm the existing erasure RPC owner can update invitations and insert deletion work. Confirm service-role access to the new table. This draft does not change the existing erasure RPC or introduce an account-deletion endpoint.
2. Agree how approved erasure processing will prevent PDF producers and workers from writing a stale file during or after cleanup. For a manual rollout, quiesce PDF producers and drain affected waiting, delayed, and active generation work before cleanup. Prevent retries of retained pre-erasure jobs for affected seekers before resuming generation. If this cannot be guaranteed, keep cleanup pending until an upload fence is in place.
3. After review and quiescence, an authorized operator can integrate `cleanupResumePdfs` with the service-role erasure runner. Continue until the eligible batch is empty. Treat any retry count as incomplete and verify that the object is absent before closing the request. No direct SQL changes to Storage metadata.
4. Review unresolved historical invitations separately. The old erasure already cleared source emails from user rows. Use an authoritative existing link if available for reconciliation. This draft contains no speculative address matching or historical invitation purge.

## Fixture coverage

`check-erasure.sql` exercises the draft SQL in a disposable PostgreSQL schema with a rollback. `cleanup-resume-pdfs.test.ts` exercises the Storage and database request order with mocked network responses.
