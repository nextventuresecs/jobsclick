# Client Decisions & Architectural Directives

This document records confirmed client decisions and deployment targets that override or refine `docs/PRD.md`.

## 1. Deployment Platform: Railway
- **Primary Deployment Target:** **Railway** (`https://railway.app`).
- **Architecture on Railway:**
  - **Service 1 (`apps/web`):** Next.js App Router frontend, public domain mapped, internal reverse proxy for telemetry (`/monitoring`).
  - **Service 2 (`apps/api`):** NestJS on Fastify adapter, internal networking connection to Redis and Supabase.
  - **Service 3 (`apps/worker`):** Plain Node background process executing BullMQ queues, connected to Railway Redis.
  - **Redis Plugin / Service:** Managed Redis running on Railway for BullMQ queue state and Upstash rate-limit fallbacks.
- **Environment & Ingress:**
  - Services communicate via Railway private networking (`.railway.internal`).
  - Public ingress is exposed only for `apps/web` and `apps/api`.
  - Background worker `apps/worker` has no public HTTP port.

## 2. Scope & Features
- **MVP + Full Extras + Hindi:** All user-facing copy in English and Hindi (`next-intl`), with Hindi rendering support in PDF resumes (`@fontsource/noto-sans-devanagari`).
- **Database:** Supabase / PostgreSQL with Row-Level Security (RLS) as second lock.
- **Observability:** Sentry with DPDP-compliant Zero-PII scrubbing and distributed trace propagation (`web` -> `api` -> `worker`).

## 3. Bulk import ownership (BULK-01, BULK-02, BULK-03; confirmed 2026-11-16)
- Institutions/intermediaries import students. MSME coordinators import employers. Platform admins may import either. Employer accounts cannot coordinate imports.
- The authenticated uploader owns each batch; ownership is persisted in created_by, never accepted from request JSON. Sharing a source label does not grant access.
- Only the uploader and platform admins can read batch status and error reports. MSME admins have no global access. Unknown and other-uploaders' IDs return 404.
- Upload URLs use an uploader-specific private storage namespace. Batch submissions cannot refer to another uploader's namespace or traversal paths.
- Invitation cost previews, scheduling, pause, resume, and cancellation require an institution/intermediary owner or a platform admin. MSME admins and employers cannot dispatch.
- Import creates invited accounts, retains source, and sends no SMS. Workers select pending invitations by batch only; missing database state or recipient errors must never fall back to unrelated users or invented phone numbers.
- Existing ownerless batches remain platform-admin-only. No ownership backfill or live database change is included; any later backfill requires human review.
- Existing database migration revokes direct anon/authenticated access to bulk tables and enables RLS. This slice adds API ownership checks to privileged service operations; it does not change RLS policies or the authentication architecture.
- Verification: API isolation and production-persistence tests live in apps/api/test/bulk-ownership.e2e-spec.ts; recipient-isolation tests live in apps/worker/test/invite-isolation.spec.ts. Unit tests use isolated test providers; apps/api/test/bulk-local-supabase.spec.ts verifies the real local PostgREST/Storage and database-role boundaries with disposable fixtures. These checks do not establish hosted deployment or SMS delivery readiness.

## 4. Browser session boundary and provider direction (AUTH-01, AUTH-03, AUTH-06; draft 2026-11-16)
- The production target remains Supabase native phone OTP with a custom MSG91 SMS hook, as specified in the PRD and fixed stack. The user requested production-standard practices; this does not authorize replacing the fixed provider with another custom refresh system.
- Browser JavaScript receives authenticated user metadata only. Authentication credentials are carried by HttpOnly cookies and attached to API calls server-side. Private responses are not cached; mutating browser requests require the configured same origin.
- API guards enforce current account state, role, token version, and revocation. Current-device logout revokes the current JWT; all-device logout invalidates the user's token version.
- The current implementation draft hardens the existing custom provider. Supabase provider migration and long-lived refresh sessions are still outstanding; AUTH-06 is not complete. Preserve existing user UUIDs, invited states, sources, and batch ownership during a separately reviewed migration.
- Full workflow findings, verification limits, production gates, and the proposed migration sequence are recorded in [the authentication review](../security/auth-session-review.md). Auth/OTP changes remain subject to the repository's mandatory human review before merge/deployment.
- The [revised Supabase migration plan](002-supabase-auth-migration-plan.md) records the resolved team MCQs and supersedes earlier slice outlines. Product scope is confirmed; auth/RLS/migration drafts still require technical verification and human review before execution.

## 5. Migration product scope (AUTH-01, AUTH-04, AUTH-05; BULK-01 to BULK-05; team answers 2026-11-16)
- Verified Indian phone is required for workspace actions. Verified email remains optional generally; a global dual-verification gate is not approved.
- MSME and institution import coordinators must register/authenticate and verify both Indian phone and email before coordinating imports. This uploader requirement is distinct from recipient CSV fields.
- Each imported student/employer row must contain a valid Indian phone OR email; neither is invalid. Imported contacts remain unverified. Recipients must verify an Indian phone before workspace access, including email-only invite recipients. Preserve source, ownership, and the existing application UUID when claiming an invite.
- Google sign-in is included across account types, subject to secure existing-account linking and verified phone before workspace access. Matching an email alone must not authenticate an existing active application account or grant a role.
- Only non-invited individual/gig job seekers use direct job-seeker registration; institution-invited seekers claim their existing account instead of duplicating it. Employers do not self-register; they claim invited or sign into existing provisioned accounts and may use securely linked Google sign-in. This supersedes the current public employer self-signup behavior.
- Institution admins may self-register through Google and must verify their Indian phone. Verified email is additionally required before import coordination. This is an explicit exception to the previous intermediary/admin-provisioning restriction; implement it through a dedicated server-controlled path, not arbitrary public role selection. Registration does not verify institution affiliation or grant access to another institution's records.
- MSME-admin accounts must be provisioned by a platform admin. Platform-admin creation remains controlled. No public signup path may create either role. Google sign-in to existing provisioned accounts must preserve their server-assigned roles.
- Invitation waves use email first where available and allow explicitly approved scheduled SMS fallback. Import still creates invited accounts, preserves source/uploader ownership, and sends zero notifications. Existing role restrictions on dispatch remain in force. Delivery changes are planned, not implemented.

## 6. AUTH v2.1 execution scope (confirmed 2026-11-17)
- General email OTP login remains pending. Retain confirmed phone/Google flows; bounded email verification and email-only invite completion do not authorize general email login.
- Orphan-user deletion thresholds and deletion remain pending. Only dry-run reporting is in scope until a subsequent explicit approval; do not delete existing unlinked Auth users using the attached 48-hour/7-day proposal.
- Use [AUTH Migration Plan v2.1](../auth/AUTH_MIGRATION_PLAN_V2.md) and [the revised master prompt](../auth/CODEX_AUTH_MASTER_PROMPT.md) for future local draft work. They reconcile the supplied documents with direct team answers; labels inside attachments do not constitute deployment or policy approval.
- Existing role-specific registration, verified-phone workspace access, coordinator email verification, phone-or-email bulk rows, ownership, and approved email-first/SMS-fallback requirements remain in force. This documentation update changes no application behavior or hosted configuration.
