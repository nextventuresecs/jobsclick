# AUTH v2.1 corrective review packet

2026-11-17. Local drafts, human review required. Supabase migration/cutover is unfinished and disabled. Staging is unchanged. No push, merge, external issue/PR write, deployment or real notification occurred.

## Database identity and data provenance

The earlier test target was the persistent local Supabase project `indian-job-portal-local`: `127.0.0.1:54322/postgres`, container/volume `supabase_db_indian-job-portal-local`, API port 54321. It was an actual Docker Supabase stack, not bare PostgreSQL. Its `postgres` role is **not a superuser**; it has BYPASSRLS. `supabase_admin` is a superuser. [Read-only identity, roles, counts and reconciliation](evidence/review/database-readonly.json).

It contains 251,250 application users and one Auth user. Exactly 249,950 application rows have the source `Govt ITI Bhopal`, matching five runs of the 50k fixture that accepts 49,990 rows per run. The remaining 1,300 rows and the Auth user cannot be certified synthetic. Preserve them; no wipe is authorized or needed. The earlier 44-row exact-ID cleanup was a process violation because it used a persistent target. Historical outputs are retained for audit, not accepted as disposable verification.

[After-verification read-only counts](evidence/review/database-after-verification.json) remained 251,250 application users and one Auth user. Read-only reconciliation found zero noncanonical non-tombstone phones, email/pending-email formatting failures, missing contacts, duplicate phone/email groups or cross-column contact collisions. One legacy `DEL_` erasure tombstone exists. M1 preserves that producer; no persistent-data normalization or migration was run.

## Disposable verification

Docker Desktop 29.9.2 was already available. Supabase CLI 3.1.0 is pinned in package.json and the lockfile. No installation of Docker or hosted CLI linking was required. The runner creates a new project/database plus nonpersistent Redis per run, uses separate ports, replays all 35 migrations without seeds and proves both user counts are zero before fixtures. A private database marker and network fence reject dev/remote targets. Test JSON fixtures stay under the generated run directory and are removed on normal cleanup. Legacy standalone security/smoke drills now require the same marker; the bare-PostgreSQL drill with emulated Auth has been replaced by the real-stack runner.

Fresh combined verification ran from the stacked review checkout on **`jc-auth-test-ff9371a3`**:

| Verification | Observed result |
| --- | --- |
| Auth, workspace, application, bulk ownership, SQL races, session and F0 regression suites | **259 tests / 25 files passed**, including both 50k-row import tests. [Output](evidence/review/stack-verification.txt) |
| Native `supabase test db` for M1/M2 | **12 pgTAP assertions / 2 files passed**. [Output](evidence/review/stack-verification-pgtap.txt) |
| Real GoTrue credential, M2 RPC and provider ban | **2 tests passed**. [Output](evidence/review/stack-verification-native-auth.txt) |
| Target/filesystem/standalone CLI guards | **11 tests passed**. [Output](evidence/review/green-target-and-filesystem-guards.txt) |
| Per-commit package gates | Six-package `pnpm typecheck` and `pnpm lint` passed before each code commit. [Receipts](evidence/review/branches/) |
| Historical claim test integrity | All 17 cases' complete test declarations/inputs/assertions byte-identical. [Hashes](evidence/review/historical-assertions.json); [mutex-only M2 diff](evidence/review/historical-mutex-only.patch) |
| Scoped cleanup | Fresh runner destroyed only its own Supabase/Redis project. [Receipt](evidence/review/stack-cleanup.txt). Earlier manually provisioned disposable stack also [destroyed](evidence/review/initial-stack-cleanup.json). |

The real GoTrue tests use admin-seeded fixture credentials and confirmed phone to bootstrap identity; this does not enable password/email login in the product or prove phone OTP delivery. One test claims the existing invited UUID without accepting `user_metadata.role`; the other bans the real Auth user and rejects a copied credential at the provider adapter. An actual HTTP API guard recheck after the ban remains an S6 requirement. Existing authenticated workspace/job-application tests exercise the current browser/API flow; the new opaque-session cutover remains disabled.

The replacement owner-role spike also ran on an actual disposable Supabase stack with native roles. The limited owner lacked Auth-schema USAGE despite a table SELECT grant; it also failed independent app/audit RLS checks. This proves that exact limited grant set fails, not that every limited-owner design is impossible. The narrow private-function postgres-owner draft works locally. Hosted owner feasibility is still unverified. [Probe and result](evidence/review/owner-role/RESULT.md).

## Local review stack

Review checkout: `indian-job-portal-remediation/.scratch/auth-review`. The original dirty `feat/bulk-onboarding` checkout and the main application checkout are preserved. Branches are stacked locally; nothing was pushed. The prerequisite preserves earlier bulk/session work so those changes are not silently included in an AUTH unit. It is a large baseline that needs separate review, not a merge-ready new feature.

| Unit | Branch | Commit |
| --- | --- | --- |
| Earlier remediation prerequisite | `codex/remediation-prerequisite` | `e91f5e2` |
| Disposable infrastructure and F0 inventory | `codex/auth-00-disposable-tests` | `0396c24` |
| AUTH contacts and literal lookup | `codex/auth-01-contacts` | `1e326f4` |
| M1/M2 contact reservations, atomic claims and audit | `codex/auth-02-identity-claims` | `b19f7ee` |
| Server-side Supabase identity adapter | `codex/auth-03-provider` | `46503b3` |
| Encrypted opaque session-store draft | `codex/auth-04-server-sessions` | `24a6455` |
| Standalone drill and JSON fixture safeguards | `codex/auth-05-test-safety` | `72cbaf4` |
| Corrective review packet | `codex/auth-06-review-packet` | `d5708af` |
| S4 hook authentication/replay foundation | `codex/auth-07-sms-hook` | this review unit |

Review each unit against its direct parent. The four requested AUTH units are branches 01 through 04; infrastructure and safety are explicit additional units. Evidence files increase line counts; source still requires focused review. The original assertion bodies were not weakened to resolve lock interference. The historical target-port retargeting belongs to infrastructure; the subsequent identity unit's harness change is only the shared FK-fixture mutex.

## Slice status and next gate

| Execution slice | Current status |
| --- | --- |
| F0-a/b/c | Existing OTP, privileged-RPC and ledger-denial regressions pass locally. Remaining evidence gaps are listed in [F0 gates and original-number crosswalk](F0-REVIEW-GATES.md). No hosted exploit-closure claim. |
| F0-d/e | Sponsorship amount/replay/expiry/name-association fix and rendered opaque-ID proof remain open; payment/P2 stays disabled. |
| S1/M1, S2, S3/M2 | Local draft SQL, contact tests, owner probe, concurrency and native pgTAP pass. No hosted application/migration. |
| S4 | Provider adapter plus disabled hook authentication/replay/+91 foundation verified: **13 hook tests passed**. [Evidence](evidence/S4-hook/README.md). Send authorization/budgets and native provider-direct abuse proof remain unfinished; finish these before S6. |
| S5 | Encrypted store/deadlines/refresh concurrency verified; cookie/BFF lifecycle and production operations incomplete. |
| S6 | Server-derived claim API and incomplete-onboarding guard not implemented. Start after S4 controls are verified. |
| S7-S14 | Remaining consent/activation/registration/method/erasure/bulk/RLS/integrated migration work is not complete. |

The [session ADR](../adr/0002-server-held-provider-sessions.md) records why the approved opaque store was chosen over simpler SSR cookies. Redis and authoritative identity failures explicitly fail closed for **all protected routes, including admin, payment and wallet**; public discovery may remain session-free. TLS/ACL, encryption-key rotation and durable provider sign-out/retry remain operational/cutover gates.

Supabase's signed SMS-hook payload does not carry trusted browser IP/device or a verified Turnstile result. Signature validity alone cannot prove application send authorization. The disabled hook foundation proves signature, timestamp/replay and Indian-number checks with fake delivery. Before S6/cutover, S4 must additionally demonstrate bounded gateway delivery, approved send authorization/caps and native provider-direct abuse denial without trusting user metadata or spoofed forwarding headers. Do not treat BFF-only limits as provider endpoint protection.

Google and nullable-phone CSV admission remain disabled until their denial/completion paths exist. Hosted automatic OAuth identity linking has not been tested; no assumption that matching-email auto-linking is disabled is allowed. General email OTP and orphan deletion remain unapproved. Auth/RLS/migration/payment drafts require the human review specified by AGENTS.md before merge or hosted enablement. This packet is reviewable evidence, not release sign-off.
