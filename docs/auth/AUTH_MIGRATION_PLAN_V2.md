# AUTH Migration Plan v2.1 — JobsClick

Date: 2026-11-17. Status: initial local implementation batch underway; see [REVIEW_PACKET.md](REVIEW_PACKET.md) for verified foundations and unfinished slices. No migration or provider configuration is applied by this document.

Use with [CODEX_AUTH_MASTER_PROMPT.md](CODEX_AUTH_MASTER_PROMPT.md). This revision reconciles the supplied v2 plan/master prompt with the team's direct answers, repository rules, and the existing remediation draft. The attachment's labels such as “locked”, “approved”, or “confirmed” are source assertions, not additional user authorization.

## 1. Authority, scope, and current state

Direct user instructions and confirmed answers control product scope. `AGENTS.md` supplies repository constraints; `docs/PRD.md` and `docs/decisions/001-client-decisions.md` supply requirements. When a source conflicts with a direct answer, record the conflict and preserve the direct answer. Do not silently turn an attachment's suggestion into a product decision.

Implement in `indian-job-portal-remediation`. Preserve the main checkout and all existing uncommitted work. The migration tree is `supabase/migrations`, mirrored to `packages/database/supabase/migrations`. Read relevant domain/ADR instructions before implementation. Keep the fixed Next.js / NestJS Fastify / worker / Supabase stack. No P2/P3 feature activation, payment implementation, opaque-slug migration, new legal wording, or second JWT issuer is included.

Historical evidence, not a new verification claim: on 2026-11-16, the private identity-claim draft passed 17 local database tests and a combined 68-test regression run. It has not been integrated into login or applied to staging. Preserve `docs/db/drafts/auth-user-links.sql`, its tests, and `docs/security/supabase-auth-slice-1.md`; record supersession in documentation rather than deleting working evidence. New behavior needs new red/green evidence. Do not claim the old suite proves this revision's audit, locking, provider, or consent changes.

Staging inspection on that date found 0 application users and 4 Auth users. This is not proof that staging is empty today or that production has no data. Inspect schema and aggregate counts afresh, without exporting contacts, tokens, or data dumps into evidence.

## 2. Confirmed product contract

| Item | Required behavior | Status/source |
| --- | --- | --- |
| Workspace verification | Verified Indian phone for every role; email optional for ordinary workspace actions. No global dual-verification gate. | Direct team answer |
| Import coordinators | Verified Indian phone and email before coordinating imports; role and uploader ownership remain required. A verified Google email counts only after secure association with the same application user. | Direct team answer |
| Individual/gig seekers | May self-register as job seekers. Institution-invited seekers claim their preserved invited account instead of creating a duplicate. | Direct team answer |
| Employers | No public employer registration. Claim an invited record or sign into an existing provisioned account; securely linked Google sign-in is allowed. | Direct team answer |
| Institutions | May self-register through the dedicated Google flow; verified phone is required, plus verified email for import coordination. This is the approved exception to the old intermediary-provisioning rule. | Direct team answer |
| MSME/platform admins | MSME admins are platform-admin provisioned; platform-admin provisioning remains controlled. No public path creates either role. Google sign-in to existing accounts must be explicitly linked and preserve server-assigned roles. | Direct team answers / existing provisioning constraint |
| Google | Included across the above account types. Google alone assigns no application role, proves no phone, and grants no institution affiliation. Invited seeker/employer claiming differs from signing into an active account. | Direct team answers |
| Imported contacts | A valid Indian phone OR email is required per row. Contacts remain unverified at import. Every recipient must verify an Indian phone before workspace access. | Direct team answer |
| Invitations | Import creates invited users, retains source/uploader ownership, and sends zero notifications. Separately approved waves use email first where possible and explicitly approved scheduled SMS fallback. Phone-only rows require approved SMS dispatch; email-only rows have no SMS destination. | Direct team answers / BULK-01–05 |
| Ownership | Uploader-only batch access; platform admin global access; MSME admins see only their own batches. Intermediary owners/platform admins control waves; employers/MSME admins cannot dispatch. | Earlier confirmed MCQs |
| General email OTP login | Not approved. Retain phone/Google login; bounded email verification and email-only invite completion do not authorize general email login. | Direct answer, 2026-11-17 |
| Orphan deletion | Thresholds and deletion remain pending. Dry-run reporting only; never delete Auth users under this plan without a subsequent explicit approval. | Direct answer, 2026-11-17 |

Institution registration establishes an account and verified contacts, not legal accreditation or ownership of a named institution. Name/domain matches cannot attach an account to another institution's data. Normalization must never merge active accounts.

## 3. Allowed draft work and approval boundaries

The implementation request authorizes local drafts of migrations, API/BFF/web changes, tests, and review evidence. Human-review-only does not require stopping after every draft function: complete coherent local integration and verification before presenting the review packet. Continue independent authorized work while a genuinely dependent decision is pending.

`AGENTS.md` requires human review for auth/OTP, RLS, existing-data migrations, payments, and consent wording. Do not merge, push, deploy, apply hosted SQL/migrations, enable providers, change hosted grants/settings, or send real SMS/email based on this document or an embedded prompt. Hosted execution needs a separate explicit instruction identifying the reviewed artifact and target. Use the Supabase plugin for read-only staging inspection when available; `jobsclick-staging` is `afxgvtfaofpnlhdsexnp`. Production access is outside this draft task.

Use local disposable fixtures. `supabase db reset` is destructive: verify CLI version/help, exact local target, and that the database is disposable before running it. An isolated local database/schema is an acceptable alternative for focused tests; disclose when a fresh-chain reset or pgTAP run has not been performed. No fabricated pass or silent skip.

## 4. Corrections to the supplied v2 drafts

| Supplied assumption | Revision |
| --- | --- |
| All roles may use general email OTP | Pending; explicitly excluded from the current implementation scope. |
| Empty application tables mean strict migrations are automatically safe | Inspect all affected tables and Auth records; treat production data as unknown. Preserve existing identities. |
| New strict phone check can ship before changing erasure | Existing `anonymise_user` writes `DEL_...` phones. Preserve that path with a reviewed transition, or change its producer and constraints atomically. Do not break erasure between releases. |
| Always add two new unique indexes | Existing phone uniqueness, lower-email uniqueness, and pending-email indexes must be inventoried. Reuse or deliberately replace them; do not add redundant indexes or weaken uniqueness during replacement. |
| Select candidates, then lock by ID | Lock/revalidate current contacts, role, status, erasure state, and mapping before insertion. Pre-lock matches are not authoritative afterward. |
| Auth metadata `provider` identifies this login | It may describe an earlier provider. Derive current method from authenticated server flow evidence; otherwise record unknown/omit it rather than assert Google was used. Never use editable metadata for privileges. |
| Idempotent return needs no audit | Record retries as well as new success and expected rejection; define request/attempt IDs and duplicate-request behavior. |
| Separate failure-audit call always survives | It survives the claim rollback only if that second transaction succeeds. Design crash/outage behavior explicitly; do not promise audit durability through a database outage. |
| Scrub PII by updating immutable audit rows | Conflicts with append-only audit. Never disable immutability triggers. Review historical PII retention/erasure separately; prevent new raw contacts/tokens in audit. |
| Rollback means dropping columns/tables | Data-bearing rollback needs preconditions and forward recovery. Preserve mappings, consent, audit, and revoked-session state; do not restore NOT NULL while phone-less rows exist. |
| Static OTP, expired fallback, payment holes are all current defects | Reproduce each claim before changing code. Current API source rejects EXPIRED OTP; JSON-LD escaping and several grants are already hardened. Payments/slugs are separate issues. |
| Every PR must contain SQL/rollback/pgTAP | Required for actual database changes; mark N/A for code-only slices. Do not invent empty migrations. |
| Stop for any schema difference or any RLS draft | Classify differences and update the draft safely. Stop only affected work for material unresolved conflicts or an actual execution approval gate. |

## 5. Data contracts and migration safety

### Contacts and erasure transition (M1)

Inventory columns, indexes, constraints, triggers, grants, existing erasure procedures, `pending_email`, and every phone/email producer and consumer. Include `users`, invitations, profiles, import workers, repositories, generated types, and Auth mappings. Phone-nullability support must reach consumers before admitting email-only rows; keep the feature disabled until compatible.

Application phones use normalized 10-digit Indian mobiles; provider requests use international format. Reuse the existing shared phone normalizer where correct. Add one shared email canonicalizer and use it consistently in validation, imports, registration, claiming, and add-method flows. Test formatting variants, blank-to-null behavior, control characters, length, case/trim policy, invalid countries, and collisions. A small database regex does not establish RFC correctness or ownership. Do not invent provider-specific dot/plus equivalence.

Target shape is at least one usable contact, except a disabled erased tombstone. Final tombstones may use NULL contacts plus an erasure marker, but the deployed `DEL_...` producer must remain compatible until the coordinated transition is ready. Clear pending contacts/verification state during reviewed erasure. Do not blanket-normalize existing records without collision checks and approval.

M1 down SQL must state whether returning to the old schema is possible. If NULL-phone users or new tombstones exist, fail rollback without modifying data and use the reviewed forward-recovery path. Never delete rows or invent phone numbers to satisfy a rollback.

### Mapping, claims, wrappers, and audit (M2)

Preserve a unique mapping between Supabase Auth user ID and application UUID. Phone/email/Google identities belonging to the same person should use the supported explicit add-method flow on the same Auth user. A second independent Auth user cannot silently acquire an already linked application account.

Backend verifies issuer, audience, allowed signing keys/algorithms, expiry, subject, and relevant session state. RPC subject comes only from that verified context. Never accept a body/header-supplied subject, role, verified flag, or proof provider. Reject deleted, banned, and anonymous Auth users. Validate UUID inputs, including NULL handling, before deriving lock keys.

Use a transaction advisory lock for the provider subject rather than `FOR UPDATE` on Supabase-managed Auth rows. Use ordered application-row locks and database uniqueness; revalidate after waiting. If contact-level locks are necessary, specify the common protocol for all application writers. An advisory lock does not synchronize the Auth service or make remote provider work and application writes one distributed transaction.

After locks, re-read eligible candidates and mapping: multiple account matches conflict; no match is a generic rejection; only invited job seekers/employers enter bulk claiming; active accounts require prior explicit linking. Check disabled/erased state even on retries. Claim changes the mapping only; activation is separate. Record confirmed proof channel without marking another imported contact verified.

Keep implementation functions in `private_auth`, outside exposed schemas. When Supabase RPC access is needed, use narrow `public` SECURITY INVOKER wrappers with EXECUTE restricted to `service_role`. Private definer functions use empty search paths, qualified names, minimal grants, and no dynamic input SQL. Inspect defaults and inherited privileges. Do not blanket-revoke unrelated discovery/utility functions. RLS stays enabled on private mapping tables; test actual role access. A local owner-role spike compares a limited owner with `postgres`; it cannot prove hosted privilege feasibility. Do not issue hosted role grants as a “spike”.

Expected business rejections are audited inside the claim transaction and returned as structured codes. The API exposes a generic rejection. Successful mapping and its audit commit together; audit failure rolls the claim back. There is no separate attempt-audit function or post-failure audit wrapper. An outer rollback removes that transaction's audit. A fresh committed RPC is a separate real attempt, not autonomous audit durability. Unexpected infrastructure errors produce one safe request-id/error-class log and a safe alert; they do not fabricate a committed claim audit while the database is unavailable.

Audit uses allowlisted fields and explicit NOT NULL/allowlist checks; SQL NULL must not bypass validation. Do not accept free-text error strings. Record retries, success, rejection, and infrastructure outcome without raw contacts, OTP, JWT, refresh token, or victim-supplied actor IDs. Provider UUIDs are pseudonymous identifiers, not automatically non-personal data; retention and their presence in failure meta require review. Client business rejections use one code and localized copy; invalid authentication, throttling, and dependency outages retain appropriate 401/429/503 handling without account-existence details.

### Activation, registration, and add-method (M3/M6/M7)

Activation requires a valid mapping, current eligible provider/application state, verified Indian phone, and any approved required notice/consent record. Set a previously missing phone only from confirmed provider evidence and only if unclaimed. A reserved phone mismatch is rejected pending a separately reviewed phone-change flow. Lock and revalidate before idempotent return; “already active” does not bypass disable, erasure, phone, or session checks.

Registration follows section 2 exactly. A dedicated server endpoint selects individual/gig job-seeker or Google institution registration intent; client metadata cannot select a privileged role. Preserve existing invite UUIDs. Employer, MSME-admin, and platform-admin creation through public signup is forbidden.

Adding a method requires a valid authenticated session for the established account and proof of the new channel. Use supported Auth APIs (`updateUser`/verification and explicit Google linking) after verifying SDK behavior. Reject contacts owned elsewhere and keep the same application UUID. An email verification flow does not enable general email OTP login. Changed contacts must not silently bypass the approved phone-mismatch rule.

### Consent and erasure (M4/M5)

Treat the supplied account privacy notice/optional Aadhaar-APAAR contract as a proposed storage design. Product/privacy reviewers must establish purposes, lawful basis, required roles, immutable versions, English/Hindi content, activation requirements, retention, and withdrawal consequences. A privacy notice is not automatically a consent requirement, and withdrawal must not automatically erase an account without an approved policy.

Local fixtures can test append-only notices, acceptances, and withdrawals without inventing legal copy. Keep notice content/version records immutable; publishing or revoking a notice needs an event/version model rather than updating an “append-only” status row. Bind acceptance to a server-known approved version and locale/text hash. Placeholder notices must never render as approved production text or satisfy production activation. Keep optional Aadhaar/APAAR separate; never store full Aadhaar. Do not repurpose the existing seeker-only boolean as versioned account-wide consent.

Erasure first establishes a durable application access-denial barrier and session invalidation. Revoke provider refresh sessions, scrub mutable PII, unlink under a narrow procedure, retain the application tombstone and RESTRICT ledger/audit references, and delete Auth identity only through a reviewed retryable process. Retain the deletion job's protected provider reference until deletion succeeds; no lost retry target after unlinking. Provider outage must not restore access, and copied access JWTs must be rejected by API/session checks. Do not mutate immutable historical audit records; resolve legacy PII via a separate approved retention design.

Orphan cleanup under this revision produces dry-run counts only. The 48-hour/7-day thresholds and actual deletion are pending. Linked users, existing unreconciled provider accounts, in-flight claims, and recent attempts are excluded. Any future deletion needs race-safe coordination and fresh rechecks immediately before deletion; a reporting query alone is not a deletion authorization.

## 6. Provider, session, API, and RLS contracts

Follow-up 2 section 15 controls: claim audits are transaction-local; no separate attempt wrapper. Unexpected API/claim failures log only a server-generated request ID and an allowlisted error class, emit a scoped safe alert and return generic codes. Never return or log raw database errors, URLs/query credentials or upstream objects. This is not a promise of audit or alert delivery during an infrastructure outage.

Supabase owns OTP generation/verification and refresh rotation. Phone delivery uses the authenticated MSG91 hook; email verification/invitations use the appropriate Resend integration. No parallel custom OTP or JWT issuer. Verify hook signatures, replay policy, timeouts, safe retries, language/DLT templates, and provider-direct request paths. Turnstile and number/device/IP limits, cooldown, daily caps, global spend breaker, and alert tests remain release requirements. A BFF-only limiter cannot protect a directly callable provider endpoint.

Supabase can automatically link identities with matching email. “Turn automatic merge off” is not an established configuration control. Test the actual provider behavior, including direct Auth paths. Authorization must require an explicitly approved application login method and canonical account mapping, not simply an Auth user containing a Google identity. If protected explicit linking cannot be enforced, keep that provider feature disabled and report the unmet requirement. Do not bypass the binding rule to make OAuth work.

Keep provider credentials out of client props, browser storage, JSON, URLs, logs, and analytics. Preserve the BFF design with server-only Auth clients and production HttpOnly/Secure cookie handling; browser code calls same-origin endpoints and receives safe metadata. Do not instantiate a browser Auth client merely because a tutorial uses one. The team selected an opaque HttpOnly browser cookie with provider access/refresh credentials kept in a protected server-side Redis store for the local draft. Cookie installation remains server-controlled; do not add another application JWT issuer.

Server sessions must handle concurrent refresh across instances, stale responses, replay, local/global logout, disable/role changes, and provider/Redis outages. Token-version changes alone do not revoke Supabase refresh sessions. A new access JWT must not reset the application's absolute session start/deadline. Cookie max-age alone does not enforce session lifetime. The team approved 15-minute provider access tokens and absolute limits of 7 days for ordinary accounts and 12 hours for admin/MSME-admin accounts, followed by reauthentication, for the local draft. This does not authorize hosted configuration changes.

Use the observed project's signing configuration; migrate legacy verifier assumptions deliberately, with an explicit bounded cutoff. Do not require custom `tv`/`jti` fields on provider JWTs or confuse Supabase's PostgREST `role` with the application's business role. Canonical role/status come from server-controlled records. Current-provider keys and any rotation are human-configured; do not infer availability from plan tier or create keys automatically.

Define endpoint classes explicitly: public discovery/auth initiation; authenticated but unlinked claim/registration/session/logout; linked but incomplete onboarding; active workspace capabilities; worker/provider webhooks. Public pages and verified webhooks do not require a user link. Known incomplete users may reach only the documented onboarding/session actions. All workspace actions require phone eligibility; import commands additionally require email verification and approved coordinator role. Do not deadlock completion with the current active-only guard.

For the BFF, restrict method/path pairs, normalize paths consistently, reject traversal/encoded-slash ambiguity, enforce same-origin writes, cap bodies, bound upstream timeouts, disable private caching, and remove spoofable identity/hop-by-hop headers. Inspect existing implementation before changing it. Establish trusted ingress/client-IP handling at deployment; a signed forwarding header, if selected, requires authenticated provenance, freshness, replay handling, and key management. Do not introduce custom crypto without a concrete trust-boundary need.

The service-role client/private-definer pattern protects privileged operations, but it does not provide per-user RLS on every query. Inventory user-facing repositories and design scoped reads/writes, identity mapping, narrow grants, and policies together. Test direct API/database cross-tenant denial with real provider identity. Do not claim the API + RLS “second lock” is complete while all reads bypass RLS. Restrict service-role use to explicitly reviewed internal operations.

## 7. Bulk migration completeness

Phone/email support spans CSV validation and templates, streaming import, nullable-phone invitations/users, deduplication across both channels, error reports, private storage, generated types, and every consumer. Keep 50k-row streaming/retry checks. Reject ambiguous collisions instead of overwriting active accounts. Preserve source and uploader attribution on every accepted row.

Invitation delivery must exclude already linked/claimed recipients even when status remains `invited`. Recheck before send/fallback, and define a durable dispatch lease/state transition to narrow claim-versus-send races; an already in-flight external send cannot be recalled. Do not advertise exactly-once delivery without provider support. Cancellation/activation/claim must stop unsent fallback. Preview approved recipient counts, channels, schedule, budget, and server-derived estimates. Delivery retries and provider-outcome persistence failures must not silently duplicate charges. Queue messages should reference private records/storage, not raw contact lists, CSV PII, or tokens.

## 8. Dependency-ordered draft slices

F0-a through F0-e are explicit legacy exploit gates before cutover. See [F0-REVIEW-GATES.md](F0-REVIEW-GATES.md) for status and the original S-number crosswalk. Run tests only through [the disposable-stack runner](DISPOSABLE_TESTS.md). Complete S4 hook authentication/replay/+91/provider-direct abuse before S6 wiring; keep Google and nullable-phone CSV disabled.

One behavior/slice per reviewable change; roughly 400 changed lines is a reviewability target, not permission to split an inseparable safety transition. Existing dirty worktree changes must not be silently committed into a new slice. Use `codex/` branch prefixes when creating new branches, subject to repository/user instructions. Prepare branch/PR text locally; create commits, pushes, external PRs, or new worktrees only within the user's actual authorization.

| Slice | Deliverable | Dependencies / red-first evidence |
| --- | --- | --- |
| S0 | Baseline, schema/privilege/trigger inventory, reconciliation and producer/consumer map | Read-only schema evidence, disposable-target checks, previous tests classified as historical |
| S1 / M1 | Contact normalization, nullable-phone compatibility, safe erasure transition | S0; malformed contacts, uniqueness, pending-email collisions, legacy tombstone producer, safe down/forward recovery |
| S2 | Owner-role feasibility spike | S0; actual local Auth grants, public-table RLS, audit INSERT, rollback; no hosted mutations |
| S3 / M2 | Mapping, locking/revalidation, audit contract, private functions/public wrappers | S1/S2; 17 prior claim tests plus new race, retry-audit, NULL-input, wrapper, erased/banned-user and outage cases |
| S4 | Request-scoped provider adapter and delivery-abuse controls | S0; signature/issuer/audience/key handling, unverified/anonymous/banned users, fake hook delivery and direct-provider bypass |
| S5 | Server session lifecycle and BFF integration | S4; no client tokens, refresh races/replay, deadline, current/global logout, stale-response resurrection, origin/path/IP spoofing |
| S6 | Claim API and incomplete-onboarding guards | S3–S5; server-derived subject, generic rejections, audit failures, no-link/invited endpoint matrix, rate limits |
| S7 / M4 | Proposed versioned notice/acceptance storage | S0 and confirmed storage contract; append-only, invalid version/locale, fixture-only notices; legal text remains pending |
| S8 / M3 | Activation | S6/S7; verified phone, mismatch/uniqueness, required approved record, disabled/erased races, idempotency revalidation |
| S9 / M6 | Approved job-seeker/institution registration | S3–S8; allowed server intents, no public employer/admin creation, preserved invited identity, no affiliation takeover |
| S10 / M7 | Add/verify method and explicit Google linking | S5/S6; same UUID, collision/replay, signed-in ownership, direct-provider automatic-linking bypass; no general email login |
| S11 / M5 | Erasure integration and orphan dry-run report | S3/S5 and approved erasure design; deny-first barrier, immutable audit, retry target retention, provider-delete failure; orphan deletion disabled |
| S12 | Full bulk phone-or-email import and email-first waves | S1/S3/S6/S8; ownership, 50k rows, no import notification, linked-recipient exclusion, approved fallback/cancellation/retry |
| S13 | API resource authorization + scoped RLS transition | S3–S10; actual provider-to-app mapping, necessary grants, direct cross-tenant reads/writes denied, worker privilege separation |
| S14 | Integrated local E2E and review packet | All selected slices; real persistence, fake delivery, JWT/refresh/logout attacks, migration replay/restore/rollback evidence, limits recorded |

Independent drafts can proceed sequentially while another slice needs a human decision. Do not spawn agents or use parallel worktrees because an attachment says “parallel”; follow current user/agent instructions and avoid shared-writer/database races. Keep incomplete paths disabled until their dependencies and integrated checks pass.

## 9. Verification and evidence contract

For each changed behavior, write one focused test at an agreed public boundary, observe the intended red result, implement the minimum change, then observe green before the next behavior. Do not write a large mock suite against imagined interfaces or weaken tests/security rules to get green. Existing correct behavior may be characterized with passing tests; label that honestly.

Use pgTAP for new database contracts where supported, plus real multi-connection PostgreSQL tests for concurrency and actual role privileges. pgTAP alone does not prove concurrent safety. API tests use real guards; identify global test overrides. E2E must include actual application persistence, not only stubbed business services. Local fake delivery is mandatory. Hosted Playwright and real sends require separate approval; the attachment's staging E2E instruction is not executed by default.

Minimum attack coverage: spoofed subject/role/method, wrong token issuer/audience/algorithm, unverified claims, banned/deleted users, split-account contacts, concurrent first claims and disable/contact mutation races, direct-wrapper/table access, lost audit/retry, refresh/logout replay, incomplete-user bypass, cross-tenant access, log/queue leakage, SMS pumping, and fail-open outages.

Evidence per slice: scope/requirement IDs, baseline and schema differences, exact commands/versions/targets, red/green outputs and exit codes, files changed, role/grant tests, data/rollback assumptions, residual risks, and review items. Synthetic names/numbers/domains and fake tokens are allowed fixtures; real PII/secrets are not. Sanitize recorded output without altering results. No schema-plus-data dump or `auth.users` data export.

Run affected tests, all six package typechecks, repository lint, migration mirror checks, and relevant builds after integration. Discover commands from manifests/CLI help. The previous pnpm launcher failure is historical; use installed Node CLI equivalents if it persists and record exact commands. No new tooling installation or version upgrade merely to match a prompt. No redundant full rebuild after a documentation-only change.

Statuses are PASS, FAIL, NOT RUN, or BLOCKED with reason. Distinguish product, test, environment, and unrelated baseline failures. Reassess after repeated failed hypotheses; do not silently mark failed tests skipped or claim completion from old output. Confirm fixture cleanup. Local reset/build claims require a fresh successful run.

## 10. Review packet and remaining decisions

Create `docs/auth/REVIEW_PACKET.md` during implementation, with slice status, PR text, evidence links, SQL/grant diffs, rollback/recovery limits, threat findings, and explicit approval actions. Migration/rollback/pgTAP apply to database slices; code-only artifacts are N/A with a reason.

Still pending: general email OTP login; orphan deletion thresholds/enablement; legal purposes/wording/withdrawal/retention; hosted session-policy enablement; function owner after spike; pseudonymous audit-subject retention; independent reviewer assignment; actual project tier/backup configuration and hosted OAuth/linking proof. Local draft work can continue where these do not determine behavior. Unapproved notices and cleanup policies cannot enable production actions.

Auth/RLS/data-change human sign-off is mandatory under `AGENTS.md`. Prefer an independent reviewer. The supplied 24-hour cooling-period rule is a proposed team process, not a universally required security control; do not add timers or block local drafting on it. No author/agent self-approval, and a checklist does not establish independent review.

Before release, verify approved provider settings, ingress, session controls, backup/restore (including Storage objects, not only database metadata), alerts, erasure reconciliation, and all selected user journeys. Do not infer free-tier status, asymmetric-key availability, or production readiness from the attachments. Finish the concrete review packet before requesting a narrowly scoped hosted action. No deployment occurs as part of draft completion.

## 11. Primary references checked 2026-11-17

- [Supabase changelog](https://supabase.com/changelog.md): discover relevant SDK/CLI changes before running commands.
- [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking): same-email automatic linking exists; verify the application's explicit-linking guarantee rather than assume a disable switch.
- [Sessions](https://supabase.com/docs/guides/auth/sessions): rotation, session identity, logout implications, and paid session controls differ from cookie expiry.
- [Server-side guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide): adapt to this server-only BFF contract; do not copy browser token handling.
- [JWTs](https://supabase.com/docs/guides/auth/jwts): verify the actual signing/claims contract and business-role separation.
- [Backups](https://supabase.com/docs/guides/platform/backups): managed backup availability and Storage recovery require explicit operational evidence.

These references guide design; they are not evidence that the staging settings, SQL, or new implementation have been verified.
