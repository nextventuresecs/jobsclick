# Supabase Auth migration plan — AUTH-01 to AUTH-06, BULK-01 to BULK-05

> Execution sequence superseded on 2026-11-17 by [AUTH Migration Plan v2.1](../auth/AUTH_MIGRATION_PLAN_V2.md). This file preserves earlier decisions and evidence; use v2.1 plus its master prompt for new draft work. General email OTP login and orphan deletion remain pending.

Date: 2026-11-16. Status: product MCQs resolved; technical implementation/migration draft requires human review. This document replaces the proposed nine-slice sequence reviewed in the pasted plan. Confirmed product choices below do not authorize execution of a migration.

## 1. Decision gate before implementation

The initial and follow-up MCQ answers are recorded below and in `001-client-decisions.md`. The importer and CSV recipient have separate verification requirements. Product scope is now confirmed; technical design, failing tests, and the repository's human-review gates still apply before migration execution. These answers do not claim that the current implementation supports the chosen rules.

| ID | Question | Choices | Status |
| --- | --- | --- | --- |
| D1 | What unlocks workspace capabilities? | Verified Indian phone required; verified email optional generally. Import coordination has the additional D5 requirement. | Confirmed |
| D2 | Which accounts may use Google, and who may register? | Individual/gig job seekers may self-register. Invited seekers claim their existing account. Employers use existing accounts; Google must not create a new employer account. Institution admins may self-register through Google. MSME admins must be platform-admin provisioned. Google sign-in supports the confirmed account types with verified phone before workspace access and secure existing-account linking. Platform-admin creation remains controlled. | Confirmed |
| D3 | Which contacts may a bulk row contain? | A valid Indian phone OR email is sufficient; reject neither. Imported contacts remain unverified. The recipient must verify an Indian phone before workspace access. | Confirmed |
| D4 | How do approved invitation waves deliver? | Email first when available, with explicitly approved scheduled SMS fallback. | Confirmed |
| D5 | What must an import coordinator verify? | Register/authenticate first; verify both a valid Indian phone and email before coordinating imports. This is a capability gate in addition to role and ownership checks. | Confirmed for MSME/institution coordinators |

Do not impose a global dual-verification gate: D1 keeps email optional for ordinary workspace use. D5 blocks import coordination until both contacts are verified, including existing coordinators; do not retroactively delete their batches or change ownership. Existing batches and dispatched waves remain subject to their existing lifecycle; specify verification enforcement at import/wave command boundaries without adding an unconfirmed emergency stop to in-flight work. No platform-admin import bypass is granted by these answers; plan the same verified-contact gate for all import coordinators. Account recovery and second-channel verification need a narrow accessible onboarding path. Verifying two contacts does not by itself establish MFA. D3 authorizes an import shape, not unrestricted email-only authentication; email-only invite claiming needs the bounded ownership-proof flow in slice 4.

The latest D2 answer supersedes the earlier job-seeker-only Google proposal and the previous public employer signup rule. It explicitly permits institution-admin self-registration through Google; this changes the current `SelfSignupRoleSchema` and the previous requirement that intermediary roles are provisioned. Do not simply add all elevated roles to a public role selector. The server must implement the approved institution-registration path separately and continue to reject public MSME-admin/platform-admin provisioning.

| Account | Registration / first access | Workspace requirement |
| --- | --- | --- |
| Individual or gig job seeker without an invite | Self-register; server assigns job-seeker role | Verified Indian phone |
| Institution-invited job seeker | Prove the invited contact and atomically claim the preserved account, rather than creating a second account | Verified Indian phone |
| Employer | Claim an invited record or sign into an existing provisioned account; Google cannot create a new employer | Verified Indian phone |
| Institution admin / intermediary | Google self-registration through the dedicated server path; owns only its own workspace/batches | Verified Indian phone; verified email additionally required for import coordination |
| MSME admin | Platform-admin provisioned; existing-account Google sign-in only after secure linking | Verified Indian phone and email for import coordination |
| Platform admin | Existing controlled provisioning; no public signup; preserve prior requested Google sign-in only through secure linking | Verified Indian phone; reviewed privileged-session controls |

Institution self-registration verifies the person and contacts, not institution accreditation, affiliation, or ownership of an existing institution. A submitted institution name/domain grants no access to another institution's data. Preserve uploader ownership; do not auto-attach registrations to existing institution workspaces by matching names or email domains.

For active accounts, a Google email match must never grant application access by itself. Require explicit authenticated linking and proof of the new channel. For invited accounts, separately validate provider proof of the reserved contact in the reviewed atomic claim flow, then require phone verification before workspace access. A product answer cannot establish that the provider configuration enforces these rules: the provider-linking proof in slice 2 remains mandatory. If that proof fails, keep Google disabled and return the conflict to the team rather than weaken the rule.

Session policy also needs an engineering/human review before slice 3: the pasted 15-minute access token, 7-day standard session, and 12-hour admin session are proposals. Specify absolute versus inactivity limits, privileged-role coverage, and reauthentication behavior. Cookie lifetime must not be treated as provider-session lifetime.

## 2. Guarantees retained in every option

- Supabase owns authentication OTP generation, verification, and refresh-token rotation. Use the MSG91 Send SMS hook. If email verification is included, use Supabase-managed verification with Resend delivery through supported SMTP or the Send Email hook. Do not add a parallel Redis email-OTP engine or custom refresh-token issuer.
- Credentials stay out of browser JavaScript, client props, JSON responses, local/session storage, URLs, and logs. Preserve the existing BFF boundary and HttpOnly, Secure production cookies, same-origin write checks, no-store responses, and fixed upstream destination. Only user metadata reaches client providers.
- Preserve application user UUIDs, profiles, applications, roles, source, consent records, batch ownership, and invitation state. Imported contact values are unverified until proven by the provider. No blanket verification backfill or rewriting of foreign keys.
- Import creates invited records and sends zero notifications; it does not schedule an invitation wave. Dispatch is a later explicit action. Source labels never grant access. Platform admins retain global access; coordinators retain uploader-only access. Intermediary owners and platform admins retain invitation controls; MSME admins and employers cannot dispatch.
- API authorization and database authorization must both enforce current identity, role, account status, verification eligibility, and resource ownership. User-editable metadata never grants a role or a verified flag. Job-seeker phone/email remain private.
- No live data migration, provider enablement, real SMS/email send, deployment, or secret-file access is part of this planning change.

## 3. Ordered implementation slices and failing tests

Each slice begins with a regression or acceptance test that fails for the intended missing behavior, followed by the smallest implementation and focused verification. Preserve passing boundary tests. Split work into reviewable PRs under the repository workflow; do not combine all slices into one implementation diff.

### Slice 0 — Confirm decisions and establish the baseline

Review confirmed D1–D5 against the resulting requirements before writing implementation code. Inventory schema constraints, actual provider/SDK/CLI versions, test seams, legacy token issuance, and every consumer of phone/email. Reuse existing `email_verified_at` and pending-email behavior; determine whether any additional verification fields are needed. D3 requires nullable-phone changes to be assessed in users, invitations, repositories, generated types, worker deduplication, and templates. Include current employer self-signup and intermediary provisioning contracts/tests in the changed surface; retire the contradictory behavior through failing tests, not silent schema changes.

Acceptance: a requirement-to-test matrix covers all chosen options; existing auth, workspace/application, bulk ownership, and 50k-row import tests have a recorded baseline. Identify mocks and real infrastructure separately. No claim of provider readiness from stubbed OTP tests.

### Slice 1 — Identity mapping, atomic claims, and recoverability

Draft a server-owned, unique mapping from the Supabase Auth user ID to the preserved application user ID. Supabase remains the authority for provider identities; do not duplicate its identity store without a demonstrated application need. Any application mapping stores stable provider subjects, not Google email as the identity key.

Define an invited-account claim transaction using verified provider evidence, appropriate unique constraints, a conditional state transition, and row/advisory locking where necessary. Every claim path and import path must respect the same uniqueness rules. Do not trust request-supplied verification flags or claim an active/disabled account by an alternate unlinked method. An imported phone/email pair may belong to different people; proving one does not verify or attach the other. Resolve conflicting matches without account merging or contact disclosure.

The provider API call and application transaction are separate boundaries. Specify idempotency, a recoverable incomplete-link state, and reconciliation for provider success followed by database failure. Never automatically delete an established provider identity during compensation. Draft migration, rollback/forward-recovery, and reconciliation checks for review before touching existing data.

Tests first: simultaneous phone/email claims produce one preserved application account; retries return a consistent result or safe conflict; conflicting active accounts and unverified claims are rejected; disable-versus-claim races stay disabled; injected failure between provider creation and database mapping recovers without duplicate users, changed roles, or lost ownership. Repeated successful login should be idempotent, not fail merely because another request completed the claim.

### Slice 2 — Provider integration and abuse controls

Integrate Supabase phone OTP with a request-scoped server client and authenticated MSG91 hook. Preserve Turnstile-before-send, number/device/IP limits, cooldown, daily caps, spend accounting/alerts, bounded provider timeouts, and safe retry behavior. Verify trusted ingress sanitizes forwarded IP headers. Ensure direct Supabase requests cannot bypass required abuse controls; BFF checks alone do not protect the provider endpoint.

Implement email verification delivery for D5 import coordination and optional AUTH-04 email verification. Normalize phones consistently between existing 10-digit application storage and provider international format. Use one reviewed email canonicalization policy consistently across lookup, uniqueness, and provider behavior; do not invent Gmail dot/plus equivalence or claim RFC syntax establishes ownership. A provider-confirmed Google email may satisfy the email requirement only when securely linked to the same canonical application user; it does not prove their phone.

For confirmed D2, use the supported provider flow with PKCE, state/nonce protections appropriate to that flow, fixed callback/redirect allowlists, and server-side exchange. Supabase documents automatic same-email identity linking. Prove the chosen configuration and server policy prevent implicit application-account takeover and unauthorized elevated-role provisioning, including direct provider routes; callback-only role assignment is insufficient. Explicit linking to an active account requires an authenticated session and verification of the new channel. Test permitted institution self-registration separately from Google sign-in to existing employer/MSME-admin/admin accounts. A client role parameter cannot turn a new registration into an employer or privileged administrator.

Tests first: valid/invalid/expired/replayed OTP, throttling and spend cap under concurrency, challenge/hook rejection, hook retry without duplicate send, timeout/outage, spoofed IP, provider-direct bypass, and zero delivery during import. Google tests cover matching-but-unlinked active accounts, legitimate linked-account sign-in, invited-contact claims, institution self-registration, denied employer self-registration through every public path, denied MSME-admin/admin self-registration, forged role metadata, state/code replay, and wrong issuer/audience. An institution name/domain match must not expose existing institution records. Use fake delivery locally; enable no hosted provider as a test side effect.

### Slice 3 — Server sessions and API/RLS identity transition

Replace assumptions about the legacy `jobsclick-api` issuer and mandatory `tv`/`jti` claims with a verified provider-token contract, including issuer, audience, allowed signing algorithms/keys, expiry, subject mapping, and provider session identity. Do not merely pass provider tokens into the existing custom verifier.

Keep Supabase usage server-side; a default browser Auth client that reads tokens would violate this project's boundary. Propagate refreshed cookies from writable server routes, serialize concurrent refreshes across instances where needed, and prevent stale responses from restoring revoked credentials. Define session deadlines independently of cookies and enforce them on API access and refresh, including role changes to privileged roles.

Logout must invalidate the relevant provider refresh sessions and application session eligibility. A token-version bump alone cannot revoke provider refresh tokens; expired or signed-out access JWTs must not regain access through refresh. Preserve prompt account-disable and role-change enforcement with an explicit cache/invalidation contract. Use provider session validation or a reviewed server-owned session/version binding for immediate access revocation; do not invent unsupported JWT claims.

Design the RLS identity transition alongside the mapping. Existing policies using `auth.uid() = application_user_id` cannot assume that distinct provider IDs equal preserved application IDs. Existing service-role repositories bypass RLS, and current authenticated grants are restricted. Review scoped repositories, necessary grants, ownership policies, and narrowly privileged worker operations together. Keep mapping/contact tables private; review function privileges, search paths, views, and UPDATE ownership checks. Do not broadly grant table access to make a failing query pass.

Tests first: real provider JWT validation and key rotation, mismatched subject, current role/status, direct database cross-tenant reads/writes, multi-instance refresh races, refresh replay, local/global logout, logout racing refresh, revoked access after refresh, deadline expiry, role change, Redis/provider outage, and no token serialization. Verify authenticated workspace reads and actual job application persistence/ownership, not only mocked service responses.

### Slice 4 — Chosen verification policy and bulk extensions

Preserve verified-phone eligibility and optional email for ordinary workspace actions (D1). Add the additional phone-and-email gate only to import-coordination capabilities (D5), alongside existing role/ownership guards. Authenticated coordinators missing email verification receive `403` with `DUAL_VERIFICATION_REQUIRED` when requesting those capabilities; unauthenticated requests remain `401`. Identify upload authorization, batch registration, and invitation-control command boundaries explicitly. Do not globally block applications or vacancy creation because email is unverified.

Separate authenticated-but-incomplete onboarding from capability eligibility. Allow the narrowly defined verification/session/logout endpoints so that active-only guards do not deadlock completion. Cache invalidation must reflect verified-channel changes. Provide English/Hindi messages and reviewed recovery behavior. Test preservation of existing owned batches when a coordinator must complete verification.

Implement D3 phone-or-email import handling through shared validation, schema/types, repositories, and streaming workers. Deduplicate across channels, files, and existing records while preserving source and ownership; define conflict reporting instead of overwriting active users. Imported email remains unverified. Draft the first-login flow for email-only invites: prove ownership of the reserved email through provider verification (including a securely validated Google identity where eligible), enter restricted onboarding, verify a previously unclaimed Indian phone, and atomically reconcile the same invited application account. Do not enable workspace access from an invitation link, a raw email match, or email proof alone. If the phone already belongs to a different account, stop with a safe conflict; do not merge accounts. This bounded invite-completion flow does not authorize general email-only workspace authentication.

Implement D4 email-first invitation dispatch as a separate worker capability: use email when available and valid, and schedule SMS fallback only when that wave's approval explicitly covers it. For phone-only rows, require approved SMS dispatch rather than inventing an email address or silently excluding the recipient; define its scheduling in the wave preview. For email-only rows, no SMS fallback is possible until a phone is legitimately associated with that account. Missing or bounced email is not independent permission to send SMS.

Capture approved channel/recipient count, server-derived estimated cost, fallback timing and budget, and sender limits in the wave. Do not treat client prices or fixed historical rates as billing truth. Stop fallback after cancellation or completed activation; define provider-outcome deduplication and recovery when delivery succeeds but recording its result fails. Do not promise exactly-once external delivery without provider support.

Tests first: every role's eligible/incomplete/disabled workspace access, permitted onboarding endpoints, second-channel collision/replay, existing-user policy, and bilingual UI behavior. For bulk, use mixed-channel cases if selected plus the mandatory 50k-row fixture, retry and duplicate cases, cross-owner status/report/dispatch denial, zero import notifications, no automatic SMS fallback without recorded approval, cancellation, and delivery-result persistence failures.

### Slice 5 — Staging proof, cutover, and rollback review

Run disposable local provider/database integration tests before staging. Rehearse migration on representative disposable data, compare user/profile/application/batch counts and ownership, inspect constraint violations, and test repeated execution. Review advisors and policy tests. Verify append-only admin-login/import audit behavior, PII scrubbing, alert delivery, trusted ingress, and the secondary-email callback. Publish exact commands, versions, results, and remaining limits.

Define a bounded legacy-token cutoff and approved rollout flag. Do not accept two issuers indefinitely or allow rollback to re-enable revoked sessions. If account mappings or policy changes fail, pause rollout and preserve data for reconciliation. Recovery must not rewrite user IDs or discard application/batch records. Obtain human approval of the concrete auth/RLS/migration draft before applying it or enabling production providers.

Acceptance: all chosen requirement tests pass; all packages typecheck and lint with zero errors; affected builds and migration consistency pass; staging workspace and job-application flows pass with provider sessions; both tenant locks deny hostile access; restore/rollback rehearsal uses real checks rather than synthetic script output. Commit/push only under the existing repository gates and explicit task scope.

## 4. Scope removed or separated from the original plan

- JSON-LD escaping already uses `safeJsonLd` on the named pages and has passing XSS tests. Preserve that behavior; do not reopen it as unimplemented migration work.
- Existing synthetic scripts are labelled and relocated. Audit whether CI or release claims incorrectly depend on them; blanket deletion is not an authentication dependency.
- Redis reconnect currently uses capped linear backoff. A reconnect defect needs its own reproduction and focused change; exponential backoff with a particular cap is not itself a migration guarantee. Availability/fail-closed recovery tests remain relevant.
- Do not re-add `email_verified_at`, rebuild the existing BFF, or replace tests that intentionally assert rejection of synthetic tokens merely because their fixtures contain legacy strings.
- Opaque public slugs, redirects, and broader public-page changes are a separate issue. Preserve current contact privacy and test it; changing URL identifiers does not enforce authorization.
- MFA, SSO, P2/P3 logic, payments, and new consent wording are outside this migration plan.

## 5. Evidence and human review

Implementation progress: slice 0 baseline/staging inspection and the slice 1 database foundation are recorded in [the first-slice verification report](../security/supabase-auth-slice-1.md). The private identity-link/claim SQL is a locally tested review draft, not an applied migration or an integrated login path. Its 17 new database tests and the combined 68-test regression run pass. Provider integration, refresh sessions, new registration rules, email-only import processing, and email-first dispatch remain unimplemented.

The prior review ran 70 existing tests successfully across focused runs after resolving sandbox-blocked localhost Redis access. This is baseline evidence only; the proposed provider migration and conditional features are not implemented or verified. Earlier hardening evidence and its mock/infrastructure limits remain in [the authentication review](../security/auth-session-review.md).

The repository requires: "Human-review-only (agent drafts, human approves)" for "RLS policies, auth/OTP flow, migrations touching existing data, anything with payments, DPDP consent text." Team MCQ answers confirm product scope; they do not substitute for review of concrete SQL, auth code, provider configuration, or a rollout.

Provider references checked on 2026-11-16: [changelog](https://supabase.com/changelog.md), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [sessions](https://supabase.com/docs/guides/auth/sessions), [sign-out](https://supabase.com/docs/guides/auth/signout), [Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), and [server-side guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide). Recheck pinned SDK/CLI behavior before implementation; no provider configuration is inferred from documentation alone.

## 2026-11-17 local follow-up review draft (AUTH-01/03/05/06, BULK-01/03, WAL-05)

Implementation is authorised only as local drafts, with staging unchanged. See [review packet](../auth/REVIEW_PACKET.md). Disposable CLI-generated migrations and CI target guards replace persistent-target test execution. Human selected reviewed dev backup/reset planning; actual reset is pending backup/ownership confirmation.

Native evidence justified a narrow draft correction: permit at most two seconds of provider issue-clock skew while enforcing signed exp-iat <=900 seconds and no expired-token grace. The 7-day ordinary/12-hour admin absolute deadlines and opaque server-held Redis credential direction stay unchanged. No Google/general-email/nullable-CSV admission is enabled by provider-proof fixtures.

WAL-05 drafts reject insufficient INR captured amount, use institution UUID association exclusively and read current sponsorship expiry/grants in API and native SQL. Payment consumption and capture/grant atomicity require a reviewed schema/reconciliation contract; two attacker tests remain failing. The existing payment flag stays OFF. Public profile QR paths accept only existing route UUIDs, never contact-derived IDs. No new product pricing or legal copy was introduced.

S6 remains not started because S4/F0 gates are incomplete. Three native advisor ERROR findings on existing public projection views also require reviewed access/RLS design. This update does not approve auth/RLS/payment drafts for merge or hosted application.

## 2026-11-18 local financial corrective draft (WAL-03/05, INT-04)

The user explicitly authorised fixing the remaining payment reuse and crash-atomicity failures before S6. This supersedes the 2026-11-17 stopped payment schema item for local implementation only. Canonical immutable payment receipts, trusted wallet/sponsorship purpose and target binding, and service-only transaction RPCs now make database captured status, ledger or sponsorship grant, receipt and mandatory audit atomic. Exact retries return the original result; conflicting reuse fails closed. Non-finite monetary values are denied. External gateway capture remains outside the PostgreSQL transaction.

The original seven attacker test bodies remain byte-identical. The selected disposable regression passes 382 tests across 41 files, plus 12 pgTAP and 2 native Auth checks; it includes bulk isolation and existing authenticated workspace/application flows. Native fault injection and backend termination verify rollback/retry. Six-package typecheck and lint passed before source commits. [Review packet](../auth/REVIEW_PACKET.md), [recovery limits](../auth/PAYMENT_TRANSACTION_PLAN.md).

Captured legacy rows without receipts require separately reviewed reconciliation; no automatic backfill or reconciler was added. Payment enablement, public sponsorship checkout, real gateway operations and hosted changes remain excluded. The flag stays OFF, staging stays unchanged, and no persistent dev data was modified. Independent human payment/migration/RLS review and other S4/auth gates remain; S6 is not started. This does not expand the product's P2/P3 payment scope or approve deployment.

## 2026-11-18 AUTH-07 locale regression correction (local review)

The broad regression found Hindi routes no longer rewrote to existing page routes and English-prefixed URLs no longer canonicalized. The middleware restores whole-segment locale routing, server-selected locale headers/cookies and EN/HI alternate links. Query strings survive navigation; SEO alternatives omit them. The existing configured-origin mutation checks and identity-header stripping remain; normalized page paths retain the session gate, including the localized bulk workspace. Localized API aliases are rejected rather than rewritten. This touches shared middleware and needs human auth review before merge; it does not integrate the new provider session or start S6.
