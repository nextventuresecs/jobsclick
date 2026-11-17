> Historical outputs from the earlier persistent dev target are retained for audit only and are not acceptable disposable-run evidence. See docs/auth/evidence/review/ for the replacement fresh Supabase runs.

# S3 / M2 - Atomic claims and audit

PASS locally. [verification.txt](verification.txt) covers 61 tests: 30 new claim tests, 17 retained historical claim tests, 13 contact tests and the separate-connection reservation race. pgTAP assertions run within those tests. Final combined results are [here](../integration/verification.txt).

SQL: [M2](../../../db/drafts/auth-user-links-v21.sql) and [down](../../../db/drafts/auth-user-links-v21.down.sql). The historical draft remains unchanged. New claims use a provider-subject advisory lock and ordered application-row locks. Provider proof is re-read after acquiring application locks, including retries. A concurrent ban, loss of confirmation or contact change rejects the claim. READ COMMITTED is explicitly required; snapshot isolation cannot provide this post-wait revalidation contract. This narrows a race; it does not make Auth and application writes one distributed transaction.

Expected rejections/retries return internal structured results after an allowlisted audit INSERT in the same transaction. Successful mapping and audit commit together. Failed audit insertion rolls back the mapping. API generic translation and server-derived subject integration remain S6. Unlinked rejected matches are not recorded as victim actors; audit meta omits raw contacts, credentials and provider UUIDs.

Private mapping RLS is enabled; backend has SELECT only. Public wrappers are thin invokers with backend-only EXECUTE. Direct anon/authenticated RPC/private/helper calls are denied, as is backend audit-helper fabrication. Owner feasibility is documented in [S2](../S2/RESULT.md); hosted ownership/grants remain unverified.

[red-provider-mutation-race.txt](red-provider-mutation-race.txt) records seven genuine pre-fix failures. [failed-fk-ddl-interference.txt](failed-fk-ddl-interference.txt) retains a later fixture timeout. [fk-ddl-lock-diagnosis.json](fk-ddl-lock-diagnosis.json) proves that FK teardown queues an exclusive lock on `auth.users`, blocking a competing Auth update. A shared suite-fixture mutex now isolates the historical/new FK fixtures; independent clients inside the race tests still run concurrently. No assertion or runtime timeout was weakened.

Down refuses populated mappings and preserves audit evidence. Empty rollback removes only M2 objects and leaves M1 reservations intact. No hosted SQL or real account was changed.
