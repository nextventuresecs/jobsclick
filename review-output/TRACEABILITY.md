# TRACEABILITY.md — Requirement Traceability Matrix

**Specification Baseline:** `docs/PRD.md` (v1.3, 8 Oct 2026) + `docs/decisions/001-client-decisions.md`  
**Repository Branch:** `feat/public-slugs-id-02` (commit `00a5804`)  
**Status Legend:**
- **DONE-VERIFIED:** Implemented end-to-end, verified with concrete code citations.
- **PARTIAL:** Implemented partially; core gaps, missing edge cases, or test-mode dependencies exist.
- **STUBBED/FAKE:** UI or service logic exists as a facade, uses mock fallbacks, or does not persist to a real backend.
- **NOT STARTED:** No implementation exists in the codebase.
- **OUT OF PHASE:** Belongs to Phase 2/Phase 3; DB schema may exist per PRD mandate, but feature logic is either absent, stubbed, or gated behind feature flags.
- **UNVERIFIED:** Cannot be verified in the local offline test environment.

---

## Traceability Matrix (72 PRD §6 Requirements)

| ID | Phase | Priority | Status | Evidence (Path:Lines) | Gap / Note |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/auth/auth.controller.ts:40-75`<br>`apps/api/src/auth/auth.service.ts:40-200`<br>`apps/web/src/components/auth/AuthModal.tsx:120-250` | Passwordless phone OTP sign-up and login works end-to-end. Static OTP `123456` backdoor removed from production paths; uses `crypto.randomInt`. |
| **AUTH-02** | MVP | Must | **DONE-VERIFIED** | `packages/validation/src/auth.ts:4-15`<br>`apps/api/src/auth/auth.service.ts:140-165` | Roles: `employer`, `intermediary`, `job_seeker`, `admin`, `msme_admin`. `SelfSignupRoleSchema` restricts self-registration to seeker/employer only. |
| **AUTH-03** | MVP | Must | **PARTIAL** | `apps/api/src/auth/auth.service.ts:70-110`<br>`apps/api/src/auth/turnstile.service.ts:18-45` | Upstash rate limiting (20/hr IP, 5/day phone) and 60s cooldown enforced. Gaps: `FastifyAdapter` lacks `trustProxy` (IP limits apply to reverse proxy); Turnstile passes if secret is unset. |
| **AUTH-04** | MVP | Should | **DONE-VERIFIED** | `apps/api/src/auth/auth.controller.ts:108-132`<br>`apps/api/src/email/resend.service.ts:35-60` | Email addition and verification via Resend token implemented with `@UseGuards(JwtAuthGuard)` and `@CurrentUser()`. |
| **AUTH-05** | MVP | Must | **PARTIAL** | `apps/api/src/auth/guards/jwt-auth.guard.ts:34-36`<br>`packages/database/supabase/migrations/20261110000002_rls_pii_and_policy_fixes.sql:1-40` | API uses `JwtAuthGuard` and `RolesGuard`. Major gap: `JwtAuthGuard` injects optional `TEST_AUTH_GUARD` test backdoor; Supabase user RLS dropped and bypassed via `service_role`. |
| **AUTH-06** | MVP | Should | **DONE-VERIFIED** | `apps/api/src/auth/auth.service.ts:245-265`<br>`apps/api/src/auth/auth.controller.ts:100-107` | 30-day JWT sessions supported; `POST /auth/sign-out-all` increments `token_version` in DB; JWT guard asserts `token_version` matches DB. |
| **AUTH-07** | P2 (MVP by Decision) | Should | **PARTIAL** | `apps/web/src/i18n/routing.ts:1-25`<br>`apps/web/messages/en.json`<br>`apps/web/messages/hi.json` | `next-intl` integrated for English and Hindi. Gap: Vitest suite fails on `ticket-t12-hindi-routing.test.ts` (Next.js middleware redirect vs rewrite mismatch). |
| **JS-01** | MVP | Must | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:35-45`<br>`packages/validation/src/profile.ts:15-30` | `seeker_type` enum (`student`, `individual`) and foreign key `institution_id` implemented and validated. |
| **JS-02** | MVP | Must | **PARTIAL** | `apps/api/src/profiles/seeker-profile.service.ts:40-95`<br>`apps/web/src/components/seeker/SeekerProfileForm.tsx:50-180` | Name, education, skills, experience, languages, categories persisted. Gap: Photo upload lacks antivirus/MIME validation; earlier profile update bugs stripped DOB/gender. |
| **JS-03** | MVP | Must | **STUBBED/FAKE** | `apps/worker/src/pdf/pdf-generator.ts:1-131`<br>`apps/api/src/qstash/pdf-task.service.ts:13-35` | Worker contains `@react-pdf/renderer` vector template, but API endpoint is an orphaned QStash webhook; `apps/web` has no one-click download button wired to worker. |
| **JS-04** | Full | Should | **NOT STARTED** | N/A | Multi-template interactive resume builder is not implemented. |
| **JS-05** | MVP | Must | **PARTIAL** | `packages/validation/src/privacy.ts:10-35`<br>`apps/web/src/lib/masking.ts:1-40` | Seeker phone/email masked in employer views. Critical gap: Platform messaging module is completely absent, so employers have no mechanism to contact candidates. |
| **JS-06** | MVP | Should | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:42`<br>`packages/validation/src/profile.ts:28` | Optional APAAR ID column and zod validation schema present and persisted. |
| **JS-07** | MVP | Decision | **PARTIAL** | `packages/validation/src/profile.ts:25-27`<br>`packages/database/supabase/migrations/20261101000001_initial_schema.sql:43` | `aadhaar_last4` stored (no full Aadhaar in DB); DPDP consent checkbox present. Gap: Raw bulk CSVs with full Aadhaar are uploaded directly to Supabase Storage unscrubbed. |
| **JS-08** | MVP (tags) / P3 (match) | Should | **PARTIAL** | `packages/validation/src/profile.ts:22`<br>`packages/database/supabase/migrations/20261101000001_initial_schema.sql:44` | Short-term skill tags (Tally, Hindi typing, etc.) supported in seeker profile. Job Work matching algorithm is not implemented (P3). |
| **EMP-01** | MVP | Must | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:60-80`<br>`apps/api/src/profiles/employer-profile.service.ts:30-85`<br>`apps/web/src/components/employer/EmployerProfileForm.tsx:40-150` | Business profile fields (ownership type, size, sector, address, contact, about, logo) persisted and validated with zod. |
| **EMP-02** | MVP | Must | **DONE-VERIFIED** | `apps/web/src/app/[locale]/company/[slug]/page.tsx:1-80`<br>`supabase/migrations/20261115000000_public_slugs.sql:1-45` | Public company page server-rendered with clean slug URL (implemented on branch `feat/public-slugs-id-02`). |
| **EMP-03** | MVP | Should | **DONE-VERIFIED** | `apps/web/src/components/employer/ProfileQrShareCard.tsx:1-75` | Downloadable vector/canvas QR code generated using `qrcode`, linking to public company URL. |
| **EMP-04** | Full | Should | **STUBBED/FAKE** | `apps/web/src/components/common/SocialEmbed.tsx:1-55` | `SocialEmbed` component exists but is not rendered on public company page; protocol sanitization vulnerability noted in web audit. |
| **EMP-05** | MVP | Must | **PARTIAL** | `apps/web/src/app/[locale]/workspace/employer/page.tsx:1-120`<br>`apps/web/src/hooks/useEmployerWorkspace.ts:1-110` | Single dashboard for profile, jobs, applicants. Gap: Contact unlock button deducts credits but cannot reveal contact or open message thread. |
| **EMP-06** | P3 | Could | **OUT OF PHASE** | N/A | Guided window to set up business email is not started. |
| **EMP-07** | P3 | Could | **OUT OF PHASE** | N/A | Simple reminders for audit and GST dates are not started. |
| **JOB-01** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/jobs/jobs.controller.ts:35-65`<br>`apps/api/src/jobs/jobs.service.ts:40-90`<br>`apps/web/src/components/jobs/PostJobModal.tsx:40-160` | Job creation with title, description, category (blue, white, grey, open), pay range, location, openings, skills, expiry date works end-to-end. |
| **JOB-02** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/jobs/jobs.service.ts:100-160`<br>`packages/database/supabase/migrations/20261101000001_initial_schema.sql:220-255`<br>`apps/web/src/app/[locale]/jobs/[slug]/page.tsx:25-50` | Fast Postgres FTS search via `search_jobs` RPC; JobPosting JSON-LD rendered with `<` escaped (`\u003c`) to prevent stored XSS. |
| **JOB-03** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/applications/applications.controller.ts:30-75`<br>`apps/api/src/applications/applications.service.ts:35-110`<br>`apps/web/src/components/jobs/JobApplyButton.tsx:20-65` | One-click apply from profile; employer views/shortlists/rejects applicants; seeker tracks status in workspace. |
| **JOB-04** | MVP | Should | **DONE-VERIFIED** | `apps/api/src/admin/admin.controller.ts:70-95`<br>`apps/web/src/components/admin/AdminJobList.tsx:30-80`<br>`apps/web/src/components/jobs/ReportJobModal.tsx:20-60` | Admin can approve, hide or remove jobs; abuse report submission endpoint and modal operational. |
| **JOB-05** | P2 | Could | **OUT OF PHASE** | `apps/api/src/jobs/jobs.service.ts:170-195`<br>`packages/database/supabase/migrations/20261101000001_initial_schema.sql:260-280` | `promote_job_with_ledger` RPC exists in DB; feature is gated behind P2 feature flag (default OFF). |
| **JOB-06** | P2 | Could | **STUBBED/FAKE** | `apps/web/src/components/jobs/SaveSearchAlertModal.tsx:30-70` | Saves search alert to client `localStorage` only; backend API route and alert dispatch worker do not exist. |
| **BULK-01** | MVP | Must | **PARTIAL** | `apps/api/src/bulk/bulk.controller.ts:40-80`<br>`apps/web/src/app/[locale]/company/bulk-onboard/page.tsx:50-130` | Multipart CSV/XLSX upload endpoint and downloadable templates exist. Gap: Web `.xlsx` parser uses `readAsText`, which corrupts binary Excel files. |
| **BULK-02** | MVP | Must | **PARTIAL** | `apps/worker/src/processors/bulk-import.processor.ts:80-160`<br>`packages/validation/src/bulk.ts:20-65` | Worker validates phone format, duplicates, and uploads error CSV to Storage. Gap: Web client-side parser replaces blank names with 'Unnamed Company'. |
| **BULK-03** | MVP | Must | **PARTIAL** | `apps/worker/src/processors/invite.processor.ts:82-120`<br>`apps/api/src/bulk/bulk.service.ts:280-330` | Invariant #2 respected at import (users created as `invited` with 0 SMS). Critical gap: `invite.processor` is un-scoped to `batchId` (cross-tenant invite leak) and fakes 250 sends per 1 SMS. |
| **BULK-04** | MVP | Must | **PARTIAL** | `apps/worker/src/processors/bulk-import.processor.ts:40-120`<br>`apps/api/src/bulk/bulk.service.ts:230-245` | BullMQ background streaming parser handles bulk rows. Gaps: Dual-queue conflict (QStash called alongside BullMQ); 50k fixture never tested against real DB without test mode. |
| **BULK-05** | MVP | Must | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:38,125`<br>`apps/worker/src/processors/bulk-import.processor.ts:95` | Source attribution (`source` column) persisted on every imported user record and batch tracking row. |
| **BULK-06** | MVP | Should | **DONE-VERIFIED** | `apps/api/src/bulk/bulk.controller.ts:45-55` | Admin and MSME admin roles can upload CSVs on behalf of colleges/institutions with custom source tagging. |
| **INT-01** | MVP | Must | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:85-110`<br>`apps/api/src/profiles/institution-profile.service.ts:30-80`<br>`apps/web/src/components/institution/InstitutionWorkspace.tsx:40-110` | Institution profile (name, type, affiliation, address, logo, contact) created, updated, and persisted. |
| **INT-02** | P2 | Should | **OUT OF PHASE** | `apps/web/src/app/[locale]/institutions/[id]/page.tsx:30-95`<br>`apps/web/src/components/institution/InstitutionCmsEditor.tsx:40-120` | Public institution page with standard tabs exists. CMS editor attempts local state fallback; P2 feature. |
| **INT-03** | P2 | Should | **OUT OF PHASE** | `apps/web/src/components/institution/InstitutionInquiryModal.tsx:30-75`<br>`apps/api/src/institutions/inquiry.controller.ts:25-50` | Inquiry form captures prospective student inquiries and writes to `institution_inquiries` table; P2 feature. |
| **INT-04** | P2 | Must | **STUBBED/FAKE** | `apps/web/src/components/institution/PlacementDashboard.tsx:30-140`<br>`apps/api/src/placement/placement.service.ts:35-130` | Placement dashboard renders student list, but API fabricates student records (`ROLL-...`, `Candidate <id>`, `First Class`) if DB query returns empty. |
| **INT-05** | P2 | Must | **PARTIAL** | `apps/api/src/wallet/sponsorship.service.ts:188-215`<br>`packages/database/supabase/migrations/20261101000001_initial_schema.sql:47` | `is_sponsored` flag supported in DB. Critical defect: P0-7 free-money flaw (activation accepts any captured payment without amount check or reuse check). |
| **INT-06** | P2 | Should | **NOT STARTED** | N/A | Agency candidate list management and employer submission tools not started. |
| **INT-07** | P3 | Could | **OUT OF PHASE** | N/A | Custom domain mapping for institutions not started. |
| **MSME-01** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/bulk/bulk.controller.ts:42`<br>`packages/validation/src/auth.ts:9`<br>`apps/web/src/components/admin/AdminWorkspace.tsx:60-110` | `msme_admin` role configured to access bulk onboarding tool for state enterprise databases. |
| **MSME-02** | MVP | Must | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:63-65`<br>`packages/validation/src/employer.ts:12-25` | Ownership structure and enterprise size fields persisted on employer profiles and bulk rows. |
| **MSME-03** | P2 | Must | **STUBBED/FAKE** | `apps/api/src/admin/broadcast.service.ts:120-265`<br>`apps/web/src/components/admin/MsmeBroadcastConsole.tsx:40-150` | Broadcast console uses simulated audience numbers, static confirmation tokens, and mixes paise deduction with application credit ledger. |
| **MSME-04** | P2 | Should | **PARTIAL** | `apps/api/src/admin/reports.service.ts:40-135`<br>`apps/web/src/components/admin/DistrictReports.tsx:30-90` | District employment reports RPC `get_district_employment_reports` exists; API falls back to synthetic MP districts if empty. |
| **MSME-05** | P3 | Could | **OUT OF PHASE** | N/A | Scheme and startup-incentive eligibility rules engine not started. |
| **MSME-06** | P3 | Could | **OUT OF PHASE** | N/A | Hiring-compliance tracking for subsidized businesses not started. |
| **WAL-01** | P2 | Must | **PARTIAL** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:150-180`<br>`apps/api/src/wallet/wallet.service.ts:40-110` | Append-only `credit_ledgers` table present in schema; balance RPC exists. Gaps: Non-atomic payment capture and credit grant; P2 feature flag OFF. |
| **WAL-02** | P2 | Must | **PARTIAL** | `apps/api/src/wallet/wallet.service.ts:55-75` | 10 free applications granted upon seeker profile completion; P2 feature. |
| **WAL-03** | P2 | Must | **PARTIAL** | `apps/api/src/wallet/payment.service.ts:80-260`<br>`apps/api/src/wallet/invoice.service.ts:30-90` | Razorpay gateway integration and invoice generation exist. Gaps: Test mode automatically captures dummy payment IDs; static GSTIN `23AAAAA0000A1Z5`. |
| **WAL-04** | P2 | Must | **PARTIAL** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:185-215`<br>`apps/api/src/wallet/wallet.controller.ts:60-95` | `credit_action_costs` and `sponsorship_tiers` tables exist with admin CRUD endpoints; P2 feature. |
| **WAL-05** | P2 | Must | **PARTIAL** | `apps/api/src/wallet/sponsorship.service.ts:40-220` | Annual tiered per-student pricing calculated; blocked by P0-7 payment verification flaw. |
| **WAL-06** | P2 | Decision | **PARTIAL** | `apps/api/src/wallet/payment.service.ts:501-520` | Refund endpoint exists, but partial refund logic treats refund as full credit clawback; credit expiration date not enforced in balance calculation. |
| **GEO-01** | P3 | Must | **OUT OF PHASE** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:290-310` | `location_nodes` table present in DB schema; business node onboarding logic not started. |
| **GEO-02** | P3 | Must | **OUT OF PHASE** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:290-310` | DB table present; candidate relocation node updates not started. |
| **GEO-03** | P3 | Must | **NOT STARTED** | N/A | Radius search (20 km) with map view not started. |
| **GEO-04** | P3 | Must | **NOT STARTED** | N/A | In-platform intimation notifications not started. |
| **GEO-05** | P3 | Should | **NOT STARTED** | N/A | Candidate nearby business search and pinning not started. |
| **GEO-06** | P3 | Must | **OUT OF PHASE** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:320-345` | `audit_logs` table present; geo interaction audit trail not started. |
| **JW-01** | P3 | Must | **OUT OF PHASE** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:350-375` | `tasks` table present in DB schema; task creation logic not started. |
| **JW-02** | P3 | Must | **NOT STARTED** | N/A | Matching and first-to-accept task dispatch not started. |
| **JW-03** | P3 | Must | **OUT OF PHASE** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:352` | Task status enum (`posted`, `accepted`, `in_progress`, `completed`, `paid`) defined in DB; workflow logic not started. |
| **JW-04** | P3 | Must | **NOT STARTED** | N/A | Platform service fee (10%) and payment release logic not started. |
| **ADM-01** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/admin/admin.controller.ts:30-110`<br>`apps/web/src/components/admin/AdminWorkspace.tsx:40-160` | Admin can view/disable users, jobs, institutions, and inspect bulk imports. |
| **ADM-02** | Full | Should | **PARTIAL** | `apps/api/src/admin/reports.service.ts:40-120`<br>`apps/web/src/components/admin/DistrictReports.tsx:30-90` | Sign-ups, jobs, applications, imports, and SMS spend reporting endpoints exist; fallback synthetic data present if DB empty. |
| **ADM-03** | MVP | Must | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:320-345`<br>`apps/api/src/audit/audit.service.ts:25-70` | `audit_logs` table protected by PostgreSQL trigger (`trg_protect_audit_logs`) preventing UPDATE and DELETE; admin logins, imports, exports logged. |
| **ADM-04** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/admin/admin.controller.ts:115-145` | Data export restricted to `@Roles('admin', 'msme_admin')` and logged to audit trail. |
| **ADM-05** | MVP | Should | **DONE-VERIFIED** | `apps/api/src/sms/sms.service.ts:80-115`<br>`apps/api/src/admin/reports.service.ts:130-155` | Daily spend tracking with threshold alert check against configured budget. |
| **NOT-01** | MVP | Must | **PARTIAL** | `apps/api/src/sms/msg91.service.ts:25-85`<br>`apps/worker/src/sms/msg91.client.ts:20-70` | MSG91 provider client and DLT templates configured; invite processor has P0-6 defect (fakes 250 sends per 1 SMS); live credentials unset. |
| **NOT-02** | MVP | Must | **DONE-VERIFIED** | `apps/api/src/email/resend.service.ts:30-95`<br>`apps/worker/src/email/resend.client.ts:25-80` | Transactional email via Resend for welcome, application received, status update, and invite. |
| **NOT-03** | MVP | Should | **DONE-VERIFIED** | `packages/database/supabase/migrations/20261101000001_initial_schema.sql:270-285`<br>`apps/api/src/notifications/notifications.controller.ts:20-65`<br>`apps/web/src/components/notifications/NotificationBell.tsx:15-60` | In-app notification table, API endpoints, and header notification bell implemented. |
| **NOT-04** | P3 | Could | **NOT STARTED** | N/A | Web push notifications not started. |

---

## Phase Summary Counts

- **Total Requirements:** 72
- **MVP Requirements (33 total):**
  - **DONE-VERIFIED:** 19 (57.6%)
  - **PARTIAL:** 13 (39.4%)
  - **STUBBED/FAKE:** 1 (3.0% — JS-03 PDF download)
  - **NOT STARTED:** 0 (0.0%)
- **Full Phase Requirements (3 total):**
  - **DONE-VERIFIED:** 0 (0.0%)
  - **PARTIAL:** 1 (33.3% — ADM-02)
  - **STUBBED/FAKE:** 1 (33.3% — EMP-04)
  - **NOT STARTED:** 1 (33.3% — JS-04)
- **Phase 2 Requirements (18 total):**
  - **PARTIAL:** 10 (55.6%)
  - **STUBBED/FAKE:** 4 (22.2% — JOB-06, INT-04, MSME-03, WAL-03)
  - **OUT OF PHASE / NOT STARTED:** 4 (22.2% — JOB-05, INT-02, INT-03, INT-06)
- **Phase 3 Requirements (18 total):**
  - **OUT OF PHASE (Schema Only):** 8 (44.4%)
  - **NOT STARTED:** 10 (55.6%)
