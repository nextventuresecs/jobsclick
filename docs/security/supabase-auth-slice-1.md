# AUTH-01 migration slice 1 — identity-claim draft verification

Date: 2026-11-16. Worktree: `indian-job-portal-remediation`. Status: database foundation implemented and locally verified as a human-review draft. Provider integration and hosted migration have not started. This is not a completed Supabase Auth cutover.

## Scope and review artifacts

- [SQL draft](../db/drafts/auth-user-links.sql): private provider-user/application-user mapping and atomic bulk-invite claiming.
- [Regression tests](../../packages/database/test/auth-identity.local.test.ts): actual local PostgreSQL, unique disposable schema, synthetic provider/application records, and multiple connections for concurrency.
- [Confirmed migration plan](../decisions/002-supabase-auth-migration-plan.md): product rules and subsequent slices.

The draft is deliberately outside both automatic migration directories. No migration history entry, staging schema change, auth-provider configuration change, or real SMS/email send occurred. It must not be applied by deployment tooling before review. Existing bulk and browser-session work is preserved.

## Implemented behavior

`private_auth.auth_user_links` binds one provider user to one preserved application UUID with foreign keys and uniqueness constraints. The procedure reads confirmed contact timestamps from `auth.users`; it accepts no caller-supplied verified flag or role. An Indian provider phone is compared with the existing application phone format. Confirmed provider email can reserve the existing invitation, but the procedure does not activate the user, mark imported contacts verified, attach another phone, or change role/source/ownership.

Provider-row and candidate-account locks plus unique constraints serialize claims. Same-provider retries return the established mapping. Different providers cannot claim the same application account; verified contacts matching different accounts fail with a safe conflict code. Unlinked active/disabled accounts and invited elevated roles are not acquired through this bulk-claim path. Disabled linked accounts are rejected. Institution self-registration and administrator provisioning require their separate reviewed paths.

The function uses `SECURITY DEFINER` because local privilege inspection confirms `service_role` cannot SELECT `auth.users`. It has an empty search path, fully qualified tables, no dynamic SQL, and explicit backend-only execution permission. Mapping-table RLS is enabled with no user policies. Anonymous and authenticated roles cannot read the mapping or call the procedure. The backend role receives no mapping-write or general Auth-table read grant. Keep `private_auth` out of Data API exposed schemas.

The server must first authenticate a provider session before passing its subject. This procedure is not an authentication endpoint, and the provider ID is not proof by itself. There is no public RPC wrapper or API integration in this slice. No credentials or tokens were added to frontend code.

## TDD and verification evidence

The initial test failed because the claim procedure did not exist. Subsequent red tests demonstrated duplicate-key failures during retries, missing confirmed-email support, ambiguous split-contact claims, raw competing-claim errors, and acquisition of elevated invited roles. Each corresponding change was followed by a green focused run before adding the next behavior.

Final combined run: **68 tests passed in 9 files**, including all **17 identity-claim tests**, existing browser serialization/proxy tests, authenticated workspace/application bridge tests, uploader/recipient isolation tests, real local Supabase bulk checks, and both 50,000-row import fixtures.

The identity suite covers same-provider concurrent retries, competing phone/email claims, split-account contacts, unconfirmed contacts, active/disabled account rejection, denied elevated-role claiming, local database-role permissions, retry after transaction rollback, retained provider identity after failure, and mapping stability after separate activation. It preserves the invited status and source while claiming.

Commands used from the remediation root with `NODE_ENV=test`, `RUN_LOCAL_SUPABASE=1`, localhost Supabase at port 54321, PostgreSQL at 54322, and Redis at 6379:

```powershell
node node_modules/vitest/vitest.mjs run packages/database/test/auth-identity.local.test.ts apps/web/test/session-boundary.spec.ts apps/api/test/browser-auth-pipeline.spec.ts apps/api/test/authenticated-flows.spec.ts apps/api/test/bulk-ownership.e2e-spec.ts apps/worker/test/invite-isolation.spec.ts apps/api/test/bulk-local-supabase.spec.ts apps/worker/test/import.processor.spec.ts apps/worker/test/processors.spec.ts
```

All six packages passed their installed `tsc --noEmit -p <package>/tsconfig.json` checks. Repository `eslint apps packages` passed. `node --experimental-strip-types scripts/ci/check-migration-sync.ts` passed; the existing migration directories remain byte-identical. No commit or push was performed. Existing non-failing warnings include Bull Board sourcemaps and the PDF fixture's private-bucket MIME restriction; this slice does not establish PDF delivery readiness.

These tests seed provider confirmation state in local SQL. They do not exercise real OTP delivery, Google exchange, refresh rotation, or provider/application distributed reconciliation. The workspace/application bridge uses real controllers and guards with stubbed business services. Those limits remain acceptance work for later slices; local success is not a hosted-provider readiness claim.

## Staging inspection through the Supabase plugin

Only `jobsclick-staging` (`afxgvtfaofpnlhdsexnp`) was inspected. It is healthy, runs PostgreSQL 17, and records the existing 35 migrations through `20261110000007_reset_views_security_invoker`. Aggregate inspection found 0 application users, 4 provider users, and no mapping table. No provider contacts or tokens were retrieved. Preserve and reconcile those existing provider records during the later cutover; empty application tables do not imply an empty Auth service.

The security advisor reports default-deny RLS with no policies on 21 existing tables and a pre-existing leaked-password-protection warning. The former is consistent with the current service-role-only architecture; it does not establish the planned user-scoped RLS second lock. Review that transition in slice 3. Advisor references: [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No advisor setting was changed.

## Human-review gate and next work

Review the concrete SQL's mapping cardinality, ownership of the definer function, privilege grants, claim-versus-activation boundary, and foreign-key lifecycle. `ON DELETE RESTRICT` deliberately prevents silent loss of identity links; provider deletion/erasure reconciliation and forward recovery must be designed before cutover. The draft makes no changes to the existing erasure procedure or policies.

Repository `AGENTS.md` requires "Human-review-only (agent drafts, human approves)" for "RLS policies, auth/OTP flow, migrations touching existing data, anything with payments, DPDP consent text." This draft is ready for that review. Do not apply it to staging or wire it into login before the mapping/security design is approved. After approval, create the actual migration using the installed Supabase CLI's discovered commands, sync both migration directories, and verify it on disposable local data before an explicitly approved hosted apply. Next implementation slice is the request-scoped provider adapter and abuse-controlled delivery integration, followed by server sessions and the API/RLS identity transition.
