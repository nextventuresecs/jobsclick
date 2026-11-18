# Disposable Supabase tests

Use `pnpm test -- <test paths>` from the review checkout. Supabase CLI is pinned to 3.1.0; Docker Desktop was already installed (29.9.2). The runner creates an unlinked `jc-auth-test-<random>` project, allocates separate local ports, replays migrations without seed data, creates a private run-identity marker and starts its own nonpersistent Redis. On normal completion or handled failure, cleanup stops only its generated project with `--no-backup` and removes only its own Redis container. It never uses `stop --all`, a linked project or the dev database.

Vitest requires the generated manifest, exact provisioned endpoints and a matching database marker before tests. A network backstop rejects the persistent dev ports 5432/54321/54322/6379 and remote connections, including accidental hardcoded targets. `RUN_LOCAL_SUPABASE=1` alone grants no permission. Run the pure safety checks with `pnpm test:target-guard`.

Add `--auth-contracts` to run M1/M2 SQL and native `supabase test db` after the baseline tests. The drafts are applied only inside that disposable stack. Constraints/grants are tested with real Supabase schemas and roles, not an emulated Auth schema. Admin-seeded test credentials may bootstrap a real GoTrue identity test; this does not enable email/password or other unapproved login methods in the application.

## Corrected database provenance

The earlier target was `127.0.0.1:54322/postgres`, container/volume `supabase_db_indian-job-portal-local`, project `indian-job-portal-local`. It is a persistent Supabase Docker stack, not a standalone PostgreSQL container. Its `postgres` role is non-superuser with BYPASSRLS; `supabase_admin` is the superuser. The same distinction must be checked on hosted targets rather than assumed.

Its 251,250 application users predate the AUTH run. Of these, 249,950 have the exact `Govt ITI Bhopal` benchmark source: five times the fixture's 49,990 accepted rows. That supports repeated fixture provenance for this dominant group. The remaining 1,300 rows are not certified synthetic. The one Auth identity's real-world ownership is unknown. No rows are exported, wiped or normalized by this review. The read-only reconciliation found zero malformed non-tombstone phones, noncanonical emails/pending emails, duplicate groups or cross-column collisions, and one legacy erasure tombstone. See [read-only evidence](evidence/review/database-readonly.json).

The prior writes/44-row cleanup occurred in a persistent database and should not have been allowed under the disposable-only rule. Exact-ID cleanup reduced risk but does not make that process acceptable. The new runner and guard replace it. Keep the persistent stack preserved and outside all test commands.

The first disposable stack replayed all 35 migrations and passed 199 tests. A separately generated-and-destroyed run passed 109 focused tests plus all 12 native pgTAP assertions. Evidence is under `docs/auth/evidence/review/`. None establishes hosted ownership/provider/OAuth behavior. Historical claim assertions remain unchanged; target-guard retargeting is a separate infrastructure change from the M2 FK-fixture mutex.

The runner also isolates test-mode JSON fixtures under the generated run directory. Standalone security and PostgREST smoke scripts refuse absent/mismatched run markers before connecting or sending requests. The old bare-PostgreSQL fresh drill now delegates to this real Supabase runner. `pnpm test:target-guard` checks target refusal, filesystem boundaries and standalone CLI refusal. Forced process termination can interrupt cleanup: inspect the printed run ID and remove only that generated project/Redis container, never the developer project or `--all`.

## 2026-11-18 child environment isolation (AUTH-05)

The runner inherits only explicit OS/tool-discovery, locale and CI variables. Parent application/provider credentials, unknown future secrets, NODE_OPTIONS, remote Docker host/context overrides and application flags are excluded. Fresh per-run credentials and endpoints are added after provisioning; fixtures still require the exact disposable marker and network fence. Two offline tests execute the first real child-process boundary with synthetic parent settings, without creating files or services. This does not inspect or change Docker credentials/default contexts stored outside environment variables.

Legacy user-repository/mutation contract fixtures now take the runner's exact generated API keys, JWT secret and database URL. No test contains a writable persistent fallback. The bootstrap dry-run proof creates a unique empty child database only inside that marked throwaway cluster, confirms zero schema/table writes, then removes exactly its own child database. Guard refusal tests assert the stronger disposable-marker error. All original user mutation/repository business assertions are preserved; the focused four-file run passes 53 checks.
