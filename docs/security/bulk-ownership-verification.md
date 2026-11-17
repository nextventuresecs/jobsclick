# BULK-01–03 ownership verification — 2026-11-16

Target: remediation worktree, `feat/bulk-onboarding`. Real local Supabase/PostgreSQL was exercised with temporary fixtures and cleanup. No hosted database, RLS policy, authentication, or deployment changes.

## Files

- `apps/api/src/bulk/bulk.controller.ts`: explicit schema pipes apply validation/defaults independently of decorator metadata; pass authenticated caller; restrict roles; set CSV response type only after successful authorization.
- `apps/api/src/bulk/bulk.service.ts`: persist uploader, check batch ownership before reports and wave controls, isolate upload namespaces, persist batch/wave before publishing matching IDs.
- `apps/worker/src/processors/invite.processor.ts`: verify wave/batch association; select only this batch's pending invitations; remove global-user and synthetic-recipient fallbacks.
- `apps/api/test/bulk-ownership.e2e-spec.ts`: seven new tests covering owner/admin access, cross-owner reads and invitation controls, role/entity restrictions, persisted/ownerless batches, persistence before publication, and storage namespace isolation.
- `apps/worker/test/invite-isolation.spec.ts`: two new cases covering empty and failed recipient lookups with no unrelated SMS.
- `apps/api/test/bulk.e2e-spec.ts`: existing upload fixture uses its uploader namespace.
- `apps/worker/test/processors.spec.ts`: imports use the existing injected ImportProcessor seam and a fresh database fixture per test; stored user/source/status and Aadhaar assertions cover persistence. Invitation metrics use explicit recipients.
- `apps/worker/test/fixtures/import-supabase.ts`: shared fixture extracted from import.processor.spec.ts; no change to production fallback behavior.
- `apps/api/test/bulk-local-supabase.spec.ts`: five opt-in real-local tests cover CSV upload/import, persisted ownership, cross-tenant API denial, invitation controls, anon/authenticated database denial, and enabled RLS. Unique test records and storage objects are cleaned up. Identity is supplied by TestAuthModule; PostgREST, Storage, and database operations are real.
- `docs/decisions/001-client-decisions.md`: confirmed team authorization rules.

## Red evidence

- Initial API isolation run: five tests failed on unauthorized success responses and unscoped upload paths.
- Initial worker recipient-isolation run: two tests failed (one synthetic SMS on an empty lookup; error lookup resolved as success).
- Production wave-persistence test failed because queue publication preceded persistence and IDs differed.
- Follow-up reproduced all four original import failures (fetch failed). Docker and HTTP checks established that local Supabase was running but sandbox connectivity was restricted. These processor unit tests also depended on an ambient client without seeded fixtures. They now inject the same stateful fixture already used by the hardened processor suite.
- Real-local owner scheduling failed with a null cost_per_sms_inr. The metadata-dependent Zod pipe was not applying defaults in the test build. Explicit endpoint schema pipes fixed the reproduced failure without changing database constraints.

## Final local checks

Commands run from the remediation root, using installed local tools because the pnpm launcher cannot resolve its pinned version through the available network.

```powershell
$env:NODE_ENV='test'
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$env:SUPABASE_URL='http://127.0.0.1:54321'
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:RUN_LOCAL_SUPABASE='1'
node node_modules/vitest/vitest.mjs run apps/api/test/bulk-local-supabase.spec.ts apps/api/test/bulk-ownership.e2e-spec.ts apps/api/test/bulk.e2e-spec.ts apps/worker/test/invite-isolation.spec.ts apps/worker/test/import.processor.spec.ts apps/worker/test/processors.spec.ts apps/web/test/bulk-onboard.spec.ts --maxWorkers=2 --minWorkers=1
```

Results: exit 0; 49 tests passed in seven files, zero failures or skips. Run outside the sandbox to reach local services. Both existing 50,000-row cases passed. No SMS was dispatched. The unit benchmark verifies stored row counts through an injected fixture; the real database case uses a small isolated CSV. The existing PDF test emitted a warning that the local private bucket does not support application/pdf; this is outside bulk isolation.

```powershell
$taskPackages = @('packages/database','packages/validation','packages/ui','apps/api','apps/web','apps/worker')
$taskFailed = $false
foreach ($taskPackage in $taskPackages) {
  node node_modules/typescript/bin/tsc --noEmit -p "$taskPackage/tsconfig.json"
  if ($LASTEXITCODE -ne 0) { $taskFailed = $true }
}
if ($taskFailed) { exit 1 }
node node_modules/eslint/bin/eslint.js apps packages
node --experimental-strip-types scripts/ci/check-migration-sync.ts
node node_modules/typescript/bin/tsc -b packages/database packages/validation packages/ui
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.build.json
node node_modules/typescript/bin/tsc -p apps/worker/tsconfig.json
git diff --check
```

Results: all passed. API and worker typechecks and ESLint were repeated after the final source edits.

## Limits and follow-up

- The four processor import failures are resolved. This is a green bulk-focused suite, not a claim that every repository test passes.
- No full Next.js build: the worktree contains real environment files that must not be read by this task. Frontend source was unchanged. No full frontend build, hosted-database, or actual SMS-delivery verification is claimed.
- GitHub issue retrieval failed because api.github.com was unreachable; the plan and decisions are recorded locally.
- Existing QStash/BullMQ scheduling coordination and pause/resume delivery semantics require a separate runtime review. This slice verifies authorization and recipient isolation, not end-to-end SMS delivery.
- Ownerless legacy batches are platform-admin-only; no backfill was performed. Existing migration revocations/RLS were left unchanged; real-local tests verified both bulk tables enable RLS and deny direct SELECT for anon and authenticated roles.
- Session-boundary work has not started. No commit, push, or deployment was performed.

The local database verification follows [Supabase testing guidance](https://supabase.com/docs/guides/local-development/testing/overview): separate application/database checks, negative authorization cases, isolated test data, and transaction rollback for database-role checks.
