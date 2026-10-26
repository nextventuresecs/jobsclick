# Comprehensive Quality & Architectural Audit Report
**Project:** Jobsclick (Job Portal Platform — JP)  
**Specification:** `docs/PRD.md` (v1.4 source of truth)  
**Date:** October 25, 2026  
**Auditor:** Staff & Principal Engineer Independent Audit Review  
**Repository State:** Monorepo (`apps/api`, `apps/web`, `apps/worker`, `packages/database`, `packages/ui`, `packages/validation`)  

---

## 1. Executive Summary

**Overall Verdict: Not launchable**

While the repository exhibits high compilation rigor (clean TypeScript compilation across all packages and 267 passing unit/e2e tests), critical architectural vulnerabilities and unverified simulations prevent immediate launch. Most notably, an active privilege escalation flaw in OTP verification allows arbitrary role assignment (including `admin`), while the OTP rate-limiter and database persistence rely on in-memory Node.js `Map` structures and synchronous local JSON file writes (`.scratch/db-persistence.json`), bypassing Supabase Row-Level Security (RLS) and failing multi-container concurrency. Bulk invitation dispatch is currently a simulated loop with zero outbound SMS calls, load testing and backup drills are mock scripts returning hardcoded success values, and live service secrets exist in local environment files.

### Top 5 Risks
1. **Critical Privilege Escalation in Auth Flow (P0):** `verifyOtp` accepts a client-provided `role` parameter on existing accounts (`apps/api/src/auth/auth.service.ts:151`), allowing any user to elevate their account to `admin` or `msme_admin` simply by logging in.
2. **In-Memory & Ephemeral Security Controls (P0):** OTP codes and rate limits are stored in Node.js in-memory `Map` instances rather than Upstash Redis, enabling trivial rate-limit bypass across container restarts or horizontal replicas.
3. **Simulated Production Readiness & Drills (P0):** The 50,000-user load test (`scripts/load-test.ts`) is a synchronous 1,000-iteration CPU loop, and the backup restore drill (`scripts/backup-restore.ts`) returns a static boolean without executing PostgreSQL dump/restore operations.
4. **Architectural Drift to HTTP Webhooks & Worker Bypassing (P1):** Bulk import processing has drifted from background BullMQ worker execution to QStash HTTP webhooks executed inside the Fastify API process (`apps/api/src/bulk/bulk.service.ts:364`), threatening API responsiveness during 50,000-row file processing.
5. **Database Migration Divergence & RLS Bypass (P1):** Two separate migration trees (`supabase/migrations` and `packages/database/supabase/migrations`) have diverged, while API repositories execute queries using `SUPABASE_SERVICE_ROLE_KEY`, bypassing PostgreSQL RLS policies during standard application operations.

---

## 2. Baseline Results

The following baseline validation commands were executed on the repository root on a clean working tree:

| Command | Working Directory | Exit Code | Result Summary |
| :--- | :--- | :---: | :--- |
| `pnpm --recursive run typecheck` | Root (all 6 workspace packages) | **0** | **PASS** — Zero TypeScript compiler diagnostics (`tsc --noEmit`). |
| `pnpm --recursive run lint` | Root (all 6 workspace packages) | **0** | **PASS** — Zero ESLint warnings or errors (`eslint .`). |
| `pnpm test` (`vitest run`) | Root | **0** | **PASS** — 43 test files passed, 1 skipped (`cluster.spec.ts`), 267 tests passed, 3 skipped (Duration: 76.21s). |
| `pnpm --recursive run build` | Root (all 6 workspace packages) | **0** | **PASS** — `@indian-job-portal/validation`, `database`, `ui`, `api`, `worker`, and `web` (Next.js 14.2.35 13 SSG/SSR routes) compiled cleanly. |
| `docker compose config` | Root | **0** | **PASS** (with security warning) — Valid compose YAML generated for `api`, `worker`, `web`, `postgres`, and `redis`. Interpolated environment variables reveal active secret keys from `.env.local`. |
| `pnpm audit` | Root | **1** | **FAIL** — 99 vulnerabilities detected (9 low, 49 moderate, 34 high, 7 critical), including `@fastify/middie` middleware authentication bypass (GHSA-72c6-fx6q-fr5w) in `@nestjs/platform-fastify`. |

---

## 3. Requirements Traceability Matrix

Evaluation status legend:
- ✅ **Implemented & Verified:** Verified in source code with passing tests.
- 🟡 **Partial:** Implemented partially or backed by synthetic fallbacks.
- ❌ **Missing:** Requirement not implemented.
- ⚠️ **Deviation:** Implemented but departs from PRD v1.4 locked specification.
- ➕ **Built Out-of-Scope:** Built early (Phase 2 / Phase 3 scope creep).
- `[Unverified]`: Cannot verify against live third-party infrastructure.

### Functional Requirements (PRD §6)

| ID | Requirement (Short) | Status | Evidence (file:line / test) | Gap or Note |
| :--- | :--- | :---: | :--- | :--- |
| **AUTH-01** | Mobile OTP signup/login, no passwords | ⚠️ | `apps/api/src/auth/auth.service.ts:38`, `apps/web/src/components/auth/AuthModal.tsx:180` | Implemented via custom HMAC JWT & in-memory OTP rather than Supabase native phone auth specified in §8.7.1. |
| **AUTH-02** | 4 account roles (Employer, Intermediary, Seeker, Admin) + MSME Admin | ⚠️ | `packages/validation/src/auth.ts:11`, `apps/api/src/auth/auth.service.ts:121` | Roles defined in Zod, but vulnerable to self-escalation via `verifyOtp` input. |
| **AUTH-03** | OTP abuse protection (Turnstile, cool-down, rate limits, daily cap) | ⚠️ | `apps/api/src/auth/auth.service.ts:63`, `apps/api/test/sms-turnstile.spec.ts:15` | Implemented using in-memory `Map`; lacks `@upstash/ratelimit` Redis distributed store specified in PRD §8.1. |
| **AUTH-04** | Secondary email addition and verification | 🟡 | `apps/api/src/auth/auth.service.ts:193`, `apps/api/test/auth.e2e-spec.ts:40` | Generates token, but logs `[Resend Email]` to console instead of dispatching via Brevo adapter. |
| **AUTH-05** | Role-based access control (RBAC) on every request | 🟡 | `apps/api/src/auth/guards/jwt-auth.guard.ts:26`, `apps/api/src/auth/guards/roles.guard.ts:15` | RBAC enforced on `@Roles()` endpoints, but completely absent on `AdminController` (`apps/api/src/admin/admin.controller.ts:24`). |
| **AUTH-06** | Long-lived mobile session & sign out all devices | ✅ | `apps/api/src/auth/auth.service.ts:233`, `apps/api/test/auth.e2e-spec.ts:55` | Issues 30-day JWT; invalidates user tokens in cache and updates user timestamp. |
| **AUTH-07** | Bilingual English & Hindi interface (v1.4 launch requirement) | ✅ | `apps/web/messages/en.json`, `apps/web/messages/hi.json`, `apps/web/test/components.test.ts:45` | Verified 805 keys in English and 805 in Hindi with 100% key parity and dynamic Next.js locale routing. |
| **JS-01** | Student vs Individual seeker types | ✅ | `packages/validation/src/profiles.ts:10`, `apps/api/src/profiles/profiles.service.ts:183` | Strictly partitioned in Zod schema and profile models. |
| **JS-02** | Complete seeker profile (education, skills, preferred categories, location) | ✅ | `packages/validation/src/profiles.ts:5`, `apps/api/src/profiles/profiles.service.ts:140` | Verified in API and validation schemas. |
| **JS-03** | Premium vector profile PDF with clickable links & Devanagari | ✅ | `apps/worker/src/pdf/pdf-generator.ts:25`, `apps/worker/test/pdf.test.ts:18` | Rendered via `@react-pdf/renderer` with Noto Sans Devanagari font embedding (<500ms typical). |
| **JS-04** | Complete resume builder with templates | ➕ | `apps/api/src/admin/admin.service.ts:144`, `apps/web/src/components/resume/ResumeBuilderModal.tsx` | Full-phase feature built early; returns mock download URL. |
| **JS-05** | Strict privacy: phone/email hidden from employers | ✅ | `apps/api/src/jobs/jobs.service.ts:46`, `apps/api/src/profiles/profiles.service.ts:172` | Verified: `applicantProfile` responses explicitly strip phone and email across all employer views. |
| **JS-06** | Optional APAAR ID field | ✅ | `packages/validation/src/profiles.ts:13`, `apps/api/src/profiles/profiles.service.ts:148` | Optional in Zod schema; requires DPDP consent when supplied. |
| **JS-07** | Aadhaar handling: last 4 digits + verified flag only, DPDP consent | ✅ | `packages/validation/src/profiles.ts:14`, `apps/api/test/profiles.e2e-spec.ts:40` | Never accepts or stores full 12-digit number; enforces regex `^\d{4}$` and requires explicit consent flag. |
| **JS-08** | Short-term skill tags (Tally, Hindi typing, etc.) | ✅ | `packages/validation/src/profiles.ts:19`, `apps/web/src/data/sampleJobs.ts:32` | Supported in validation schemas and search filtering. |
| **EMP-01** | Business profile (name, ownership, size, sector, address, logo) | ✅ | `packages/validation/src/profiles.ts:55`, `apps/api/src/profiles/profiles.service.ts:192` | Full MSME classification attributes captured and validated. |
| **EMP-02** | Public company page, SSR & Google indexable | ✅ | `apps/web/src/app/company/[id]/page.tsx:15`, `apps/web/test/page.test.ts:45` | Next.js dynamic SSR page with Organization JSON-LD metadata. |
| **EMP-03** | Downloadable QR code for business profile | ✅ | `apps/api/src/profiles/profiles.service.ts:275`, `apps/web/src/components/profile/ProfileQrShareCard.tsx` | Generates standard DataURL QR code for instant download. |
| **EMP-04** | Embed social media posts on company page | ➕ | `apps/web/src/components/company/SocialMediaEmbed.tsx:10` | Full-phase feature built early with lazy iframe rendering. |
| **EMP-05** | Unified employer dashboard (profile, jobs, applicants, wallet) | ✅ | `apps/web/src/components/workspace/EmployerWorkspace.tsx:15` | Employer workspace tabbed interface managing active listings, applications, and wallet state. |
| **EMP-06** | Guided window for business email setup | ❌ | Not in codebase | Correctly deferred to Phase 3. |
| **EMP-07** | Simple reminders for audit and GST dates | ❌ | Not in codebase | Correctly deferred to Phase 3. |
| **JOB-01** | Job creation with category, collar, pay range, openings, skills | ✅ | `packages/validation/src/jobs.ts:12`, `apps/api/src/jobs/jobs.service.ts:120` | Full validation with blue/white/grey/open categories and pay ranges. |
| **JOB-02** | Fast search & filters with JobPosting JSON-LD | ✅ | `apps/web/src/app/jobs/page.tsx:47`, `apps/api/src/jobs/jobs.service.ts:70`, `supabase/migrations/20261025200000_jobs_full_text_search_and_ranking.sql` | Postgres full-text search procedure `search_jobs` with tsvector indexes and JobPosting JSON-LD. |
| **JOB-03** | One-click apply from profile, status tracking | ✅ | `apps/api/src/jobs/jobs.service.ts:195`, `apps/web/src/components/jobs/JobApplyButton.tsx:25` | 1-click application submission with status transitions (`applied`, `shortlisted`, `rejected`). |
| **JOB-04** | Job moderation (admin approve/hide/remove, abuse reporting) | ✅ | `apps/api/src/jobs/jobs.service.ts:340`, `packages/validation/src/jobs.ts:65` | Admin status toggling with audit logging. |
| **JOB-05** | Featured / promoted job listings at top | ➕ | `apps/api/src/jobs/jobs.service.ts:365`, `supabase/migrations/20261025100000_atomic_job_promotion_procedure.sql` | Phase 2 feature built early; implemented with atomic RPC promotion and credit deduction. |
| **JOB-06** | Job alerts by email/SMS for saved searches | ➕ | `apps/api/src/jobs/jobs.service.ts:380`, `apps/worker/src/processors/alerts.processor.ts:25` | Phase 2 feature built early; includes matching digest query and background dispatch. |
| **BULK-01** | Bulk upload CSV/Excel with downloadable template | ✅ | `apps/api/src/bulk/bulk.service.ts:82`, `docs/templates/msme_business_onboarding_template.csv` | Signed URL upload flow and downloadable CSV templates. |
| **BULK-02** | Row validation, deduplication, downloadable error report | ✅ | `apps/worker/src/processors/import.processor.ts:68`, `apps/api/src/bulk/bulk.service.ts:510` | Validates mobile numbers, dedupes against DB and file, generates downloadable error CSV. |
| **BULK-03** | Users created in `invited` state, ZERO SMS at import, wave scheduler | 🟡 | `apps/worker/src/processors/import.processor.ts:119`, `apps/worker/src/processors/invite.processor.ts:75` | Invariant verified (ZERO SMS at import; status='invited'). However, invite wave processor simulates delivery without real SMS API calls. |
| **BULK-04** | Background processing of 50k rows with progress bar & safe retry | ⚠️ | `apps/worker/src/processors/import.processor.ts:45`, `apps/api/src/bulk/bulk.service.ts:299` | Handled via dual BullMQ/QStash paths; downloads full CSV into memory (`fileData.text()`) rather than streaming via pipes. |
| **BULK-05** | Source tracked on every bulk record | ✅ | `apps/worker/src/processors/import.processor.ts:79`, `apps/api/src/bulk/bulk.service.ts:150` | `source` stored on `users` table and `bulk_import_batches`. |
| **BULK-06** | Team upload on behalf of institution/MSME | ✅ | `apps/api/src/bulk/bulk.controller.ts:33`, `apps/web/src/app/company/bulk-onboard/page.tsx` | Admin and intermediary role upload flow. |
| **INT-01** | Basic institution profile | ✅ | `packages/validation/src/profiles.ts:85`, `apps/api/src/profiles/profiles.service.ts:310` | Validates affiliation, type, contact person, and address. |
| **INT-02** | Public institution CMS page with standard tabs | ❌ | Not in codebase | Correctly deferred to Phase 2. |
| **INT-03** | Inquiry form on institution page | ❌ | Not in codebase | Correctly deferred to Phase 2. |
| **INT-04** | Placement (HR) cell candidate dashboard | ➕ | `apps/api/src/placement/placement.service.ts:20`, `apps/web/src/components/workspace/PlacementDashboard.tsx` | Phase 2 feature built early; includes corporate tie-ups and FSM pipeline. |
| **INT-05** | Mark students as sponsored | ➕ | `apps/api/src/wallet/sponsorship.service.ts:30` | Phase 2 feature built early; includes sponsorship billing engine. |
| **INT-06** | Agency tools for candidate management | ❌ | Not in codebase | Correctly deferred to Phase 2. |
| **INT-07** | Custom domains for institutions | ❌ | Not in codebase | Correctly deferred to Phase 3. |
| **MSME-01** | MSME Department admin role with bulk import console | ✅ | `apps/api/src/bulk/bulk.controller.ts:33`, `apps/web/src/components/workspace/MsmeWorkspace.tsx` | `msme_admin` role support with department-scoped view. |
| **MSME-02** | Classification fields on enterprise (ownership & size) | ✅ | `packages/validation/src/profiles.ts:58`, `packages/database/src/types.ts:45` | Micro/Small/Medium sizes and legal ownership structures captured. |
| **MSME-03** | Broadcast to selected businesses with cost preview | ➕ | `apps/api/src/admin/broadcast.service.ts:25`, `apps/web/src/components/admin/MsmeBroadcastConsole.tsx` | Phase 2 feature built early; includes cost estimation and multi-channel dispatch. |
| **MSME-04** | District employment reports | ➕ | `apps/api/src/admin/reports.service.ts:20`, `apps/web/src/components/admin/DistrictEmploymentReportView.tsx` | Phase 2 feature built early; district-level aggregation of jobs and hires. |
| **MSME-05** | Scheme & incentive eligibility flags | ❌ | Not in codebase | Correctly deferred to Phase 3. |
| **MSME-06** | Mandatory local hiring compliance tracking | ❌ | Not in codebase | Correctly deferred to Phase 3. |
| **WAL-01** | Credit ledger table (immutable, derived balances) | ➕ | `apps/api/src/wallet/wallet.service.ts:39`, `apps/api/src/database/repositories/credit-ledger.repository.ts:63` | Phase 2 logic built early; calculates balances in Node loop rather than SQL SUM aggregate. |
| **WAL-02** | 10 free job applications starter credits | ➕ | `apps/api/src/auth/auth.service.ts:141`, `apps/api/src/wallet/wallet.service.ts:105` | Phase 2 logic built early; starter credit granting on account creation. |
| **WAL-03** | Recharge through payment gateway (Razorpay) & GST invoice | ➕ | `apps/api/src/wallet/payment.service.ts:41`, `apps/api/test/payment.e2e-spec.ts:25` | Phase 2 logic built early; includes order creation, webhook verification, and invoice HTML. |
| **WAL-04** | Admin configurable action costs & tier settings | ➕ | `apps/api/src/wallet/wallet.service.ts:23` | Phase 2 logic built early; in-memory map of action costs. |
| **WAL-05** | Institution annual sponsorship tiers | ➕ | `apps/api/src/wallet/sponsorship.service.ts:20` | Phase 2 logic built early; Small/Medium/Large tier pricing calculation. |
| **WAL-06** | Refund and credit expiry policies | ❌ | Not in codebase | Correctly deferred to Phase 2. |
| **GEO-01-06**| Nearby GPS matching & radius search | ❌ | Tables present in `20261008000000_init_schema.sql` | Correctly deferred to Phase 3; no application logic built. |
| **JW-01-04** | Job Work task posting & payouts | ❌ | Tables present in `20261008000000_init_schema.sql` | Correctly deferred to Phase 3; no application logic built. |
| **ADM-01** | Basic admin: view/disable users, jobs, institutions | ⚠️ | `apps/api/src/admin/admin.service.ts:41`, `apps/api/src/admin/admin.controller.ts:32` | Endpoints implemented but completely unauthenticated (`AdminController` lacks guards). |
| **ADM-02** | Full admin analytics & reports | 🟡 | `apps/api/src/admin/admin.service.ts:154` | Returns hardcoded static statistics. |
| **ADM-03** | Immutable audit log (admin logins, imports, exports, credits) | ⚠️ | `supabase/migrations/20261016000000_audit_log_immutability.sql`, `apps/api/src/admin/admin.service.ts:48` | Trigger and REVOKE enforced in DB, but migration is missing from `packages/database/supabase/migrations`. |
| **ADM-04** | Data exports limited to admin and logged | ❌ | Not in `apps/api/src/admin/admin.controller.ts` | No export endpoint exists in `AdminController`. |
| **ADM-05** | SMS & OTP spend view with daily limit alert | 🟡 | `apps/api/src/admin/admin.service.ts:157`, `apps/api/src/auth/auth.service.ts:73` | Sentry exception logged on daily limit reach, but no dedicated spend view UI or notification webhook. |
| **NOT-01** | SMS for OTP/invitations via MSG91 with DLT templates | 🟡 | `apps/api/src/auth/sms.service.ts:25`, `apps/api/src/auth/sms-templates.ts:5` | Valid MSG91 OTP HTTP client exists; however, invite dispatch processor does not call MSG91. |
| **NOT-02** | Transactional email (PRD v1.4 requires Brevo behind adapter) | ⚠️ | `apps/worker/src/processors/alerts.processor.ts:35`, `apps/api/src/auth/auth.service.ts:209` | Brevo is completely absent; Resend is hardcoded with direct `fetch()` rather than a provider adapter. |
| **NOT-03** | In-app notification centre | ✅ | `apps/api/src/admin/admin.service.ts:102`, `apps/web/src/components/layout/Navbar.tsx:75` | In-app notification list and read-state management. |
| **NOT-04** | Web push notifications | ❌ | Not in codebase | Correctly deferred to Phase 3. |
| **NOT-05** | Broadcast notification cost & delivery tracking (v1.4) | ➕ | `apps/api/src/admin/broadcast.service.ts:30` | Phase 2 feature built early. |

---

### Non-Functional Requirements (PRD §7)

| Area | Requirement | Status | Evidence (file:line / command) | Gap or Note |
| :--- | :--- | :---: | :--- | :--- |
| **Speed** | Public pages < 2s on 4G, API p95 < 0.5s | 🟡 | `apps/web/src/app/jobs/page.tsx`, `scripts/load-test.ts:21` | [Unverified] Live network speed unverified. Script `load-test.ts` generates synthetic latency numbers (`Math.min(elapsedMs + 25, 180)`). |
| **Capacity** | 2,000 concurrent users | 🟡 | `scripts/load-test.ts:10` | [Unverified] Script performs a 1,000-iteration CPU loop without issuing network or DB requests. |
| **Bulk Import**| 50,000 rows in < 30 mins without site slowdown | 🟡 | `apps/worker/test/processors.spec.ts:35` | Unit test processes a synthetic 50k fixture in-memory (451ms); however, production worker downloads whole CSV into memory (`fileData.text()`). |
| **Availability**| 99.5% monthly uptime | 🟡 | `apps/api/src/health/health.controller.ts:10`, `apps/worker/src/health.ts:10` | Health check routes exist (`/health`); cloud uptime monitor setup requires client domain and deployment. |
| **Security** | HTTPS, encryption at rest, API RBAC, DB RLS, rate limits, no secrets in code | ⚠️ | `docker compose config`, `apps/api/src/auth/guards/jwt-auth.guard.ts:74`, `.env.local` | Failures: `.env.local` contains active credentials; API bypasses RLS via `service_role`; `AdminController` has no auth guard. |
| **Privacy** | DPDP Act 2023 principles (consent, minimal data, deletion, hidden PII) | ✅ | `packages/validation/src/profiles.ts:37`, `apps/api/src/admin/admin.service.ts:130` | Valid consent gates on Aadhaar/APAAR, account deletion request flow, and strict exclusion of phone/email from employer views. |
| **Backups** | Automated daily backups, tested restore drill | ❌ | `scripts/backup-restore.ts:8` | The restore drill is a mock function returning static `{ restoreSuccess: true }` without executing PostgreSQL backup/restore. |
| **Devices** | Mobile-first, low-cost Android, modern browsers | ✅ | `apps/web/tailwind.config.js`, `apps/web/src/components/layout/Navbar.tsx` | Responsive Tailwind layout with drawer navigation and lightweight client bundles (<150kB initial JS). |
| **Accessibility**| Readable fonts, contrast, keyboard navigable | ✅ | `apps/web/src/app/globals.css`, `packages/ui/src/button.tsx` | Standard shadcn/ui accessible primitives with focus rings and semantic HTML. |
| **Search Visibility**| Server-rendered + JobPosting JSON-LD | ✅ | `apps/web/src/app/jobs/[id]/page.tsx:120`, `apps/web/src/app/sitemap.ts` | Dynamic JobPosting JSON-LD and Next.js sitemap generator. |
| **Monitoring** | Sentry error tracking, spend alerts | 🟡 | `apps/api/src/config/sentry.ts:10`, `apps/worker/src/processors/alerts.processor.ts:20` | Sentry SDK initialized across apps; SMS spend alert fires Sentry exception, but lacks automated billing cut-off. |

---

### Traceability Summary

- **Total MVP Requirements Evaluated:** 39
  - ✅ **Implemented & Verified:** 20 (51.3%)
  - 🟡 **Partial:** 6 (15.4%)
  - ⚠️ **Deviation / Flawed Implementation:** 6 (15.4%)
  - ❌ **Missing:** 7 (17.9%)
- **Built Out-of-Scope (P2/P3 Scope Creep):** 11 major features implemented early (WAL-01/02/03/04/05, INT-04/05, MSME-03/04, JOB-05/06).

---

## 4. Lens A: Staff Engineer Review (Implementation Quality)

### 4.1 Invariant Verdicts

1. **PII-Hiding Rule (Hard Invariant #1): PASS (Implementation Verified)**  
   *Verdict:* Employer and public application views strictly strip phone and email (`apps/api/src/jobs/jobs.service.ts:46,233,266` and `apps/api/src/profiles/profiles.service.ts:172`). Job seeker contact information is never serialized to employers.
2. **Bulk Import Zero-SMS Rule (Hard Invariant #2): PASS (Implementation Verified)**  
   *Verdict:* `ImportProcessor` (`apps/worker/src/processors/import.processor.ts:121`) creates candidate users strictly with status `'invited'`. No SMS service is injected or called during import.
3. **Audit Log Immutability (Hard Invariant #6): PASS (with Migration Sync Warning)**  
   *Verdict:* PostgreSQL trigger `prevent_audit_log_modification()` raises exceptions on UPDATE and DELETE, and permissions are revoked from all roles (`supabase/migrations/20261016000000_audit_log_immutability.sql`). However, this migration is missing from `packages/database/supabase/migrations/`.
4. **OTP Abuse Protection (Hard Invariant #4): FAIL (Critical Design Flaw)**  
   *Verdict:* Rate limiting is stored in a volatile in-memory Node.js `Map` (`apps/api/src/auth/auth.service.ts:28`), failing across container restarts and horizontal replicas.

---

### 4.2 Staff Engineer Findings

| ID | Severity | Lens | Evidence | Impact | Recommended Fix | Effort |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| **STF-01** | **P0** | Staff | `apps/api/src/auth/auth.service.ts:151` | **Privilege Escalation:** Existing user calling `verifyOtp` with `{ role: 'admin' }` gets updated to `admin` in database. | Delete `if (role) updates.role = role;`. Role must be immutable post-creation and modifiable only by superadmins. | S |
| **STF-02** | **P0** | Staff | `apps/api/src/admin/admin.controller.ts:24-100` | **Unauthenticated Admin Endpoints:** `AdminController` lacks `@UseGuards(JwtAuthGuard, RolesGuard)`. Anyone can update user status, fetch audit logs, or dispatch broadcasts. | Add `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('admin', 'msme_admin')` to `AdminController`. | S |
| **STF-03** | **P0** | Staff | `apps/api/src/auth/auth.service.ts:28,63` | **Volatile Rate Limiting:** In-memory `Map` OTP store allows attackers to bypass limits by waiting for container restart or distributing across replicas. | Replace in-memory map with `@upstash/ratelimit` on Redis as specified in PRD §8.7.1. | M |
| **STF-04** | **P0** | Staff | `scripts/load-test.ts:10-25`, `scripts/backup-restore.ts:8-19` | **Fictitious Production Drills:** Acceptance tests assert against synthetic for-loops and hardcoded return values rather than actual stress testing and `pg_dump`/`pg_restore`. | Replace with realistic k6 load test script and automated bash/SQL backup restore drill. | M |
| **STF-05** | **P1** | Staff | `apps/api/src/database/supabase.provider.ts:25-132` | **Synchronous JSON Persistence Layer:** Every DB repository writes to `.scratch/db-persistence.json` via `fs.writeFileSync`, blocking the Node event loop and risking corrupt state. | Remove `PersistentDatabaseStore` completely. Standardize on direct Supabase client calls with proper NestJS dependency injection. | M |
| **STF-06** | **P1** | Staff | `apps/worker/src/processors/invite.processor.ts:73-89` | **Simulated Invite SMS Dispatch:** Invitation wave processing runs a dummy counter loop without issuing MSG91 HTTP requests. | Connect `InviteProcessor` to `Msg91SmsService` with batching, exponential backoff, and DLQ tracking. | M |
| **STF-07** | **P1** | Staff | `apps/worker/src/processors/alerts.processor.ts:35` | **Hardcoded Resend Calls Without Adapter:** Worker calls `https://api.resend.com/emails` directly via `fetch()` instead of using an injectable email adapter (Brevo per PRD v1.4). | Implement `EmailProvider` interface and Brevo adapter with separate transactional and broadcast subdomains. | M |
| **STF-08** | **P1** | Staff | `supabase/migrations/` vs `packages/database/supabase/migrations/` | **Migration Drift:** Root `supabase/migrations` contains audit log immutability; `packages/database` contains corporate tieups and msme broadcast migrations. | Consolidate migrations into a single canonical source of truth and symlink or sync in build script. | S |
| **STF-09** | **P2** | Staff | `apps/worker/src/pdf/pdf-generator.ts:68-71` | **Flawed Concurrency Control:** When active PDF generation exceeds 10, the code calls `setTimeout(50)` once without queuing or looping, allowing unbound concurrent jobs. | Use a proper semaphore or BullMQ queue with `concurrency: 10` for PDF generation. | S |
| **STF-10** | **P2** | Staff | `apps/api/src/database/repositories/credit-ledger.repository.ts:63-75` | **Unscalable Balance Calculation:** `calculateBalance` fetches all ledger rows for a user and sums them in JavaScript rather than using `SELECT SUM(amount)`. | Use PostgreSQL aggregate query `SELECT COALESCE(SUM(amount), 0) FROM credit_ledgers WHERE user_id = $1`. | S |
| **STF-11** | **P2** | Staff | `apps/api/src/jobs/jobs.service.ts:229-232` | **Hardcoded Fallback Data:** Missing applicant profiles return hardcoded data (`'Anita Sharma'`, `'Indore'`, `['Tally']`) instead of throwing or logging an error. | Throw `NotFoundException` or handle orphaned applications gracefully without returning fake profile data. | S |
| **STF-12** | **P3** | Staff | `apps/api/src/auth/guards/jwt-auth.guard.ts:34` | **Insecure Dev/Test Header Bypass:** `x-user-id` header allows user impersonation whenever `NODE_ENV === 'development'`. | Restrict header bypass strictly to `NODE_ENV === 'test'` and never permit in staging or development environments. | S |

---

## 5. Lens B: Principal Engineer Review (Architecture, Scale, Risk)

### 5.1 Principal Engineer Findings

| ID | Severity | Lens | Evidence | Impact | Recommended Fix | Effort |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| **PRN-01** | **P0** | Principal | `.env.local` & `docker compose config` | **Committed Active Credentials:** Live connection strings, Razorpay test keys, Sentry DSN, and service keys exist in working directory and interpolate into containers. | Revoke and rotate all credentials immediately. Add pre-commit git-secret hooks and remove `.env.local`. | S |
| **PRN-02** | **P1** | Principal | `apps/api/src/bulk/bulk.service.ts:282,364` | **Architecture Drift to API Webhooks:** Migrating BullMQ tasks to QStash webhooks runs heavy 50k CSV parsing inside the Fastify API process, risking API thread starvation and violating PRD §8.1. | Revert background task execution to `apps/worker` via BullMQ Redis queue. Keep API purely for request handling. | L |
| **PRN-03** | **P1** | Principal | `apps/api/src/database/supabase.provider.ts:139` | **RLS Completely Bypassed in API:** API connects to Supabase exclusively via `SUPABASE_SERVICE_ROLE_KEY`. PostgreSQL RLS policies are never evaluated during API operations. | Configure API client with user JWT context (`supabase.auth.setSession` or PostgREST `Authorization: Bearer <jwt>`) so RLS acts as a true second lock. | L |
| **PRN-04** | **P1** | Principal | PRD v1.4 vs `apps/worker/src/processors/alerts.processor.ts` | **Vendor Lock & Protocol Mismatch:** Code uses Resend instead of Brevo, without an abstraction layer, preventing transactional/broadcast subdomain separation required by PRD v1.4. | Introduce `EmailService` port with Brevo adapter implementing transactional (`mail.jobsclick.live`) and broadcast subdomains. | M |
| **PRN-05** | **P1** | Principal | `pnpm audit` output | **Vulnerable Runtime Dependencies:** 7 critical vulnerabilities including Fastify middleware authentication bypass (`@fastify/middie <= 9.3.1`). | Upgrade `@nestjs/platform-fastify` and lock Fastify dependencies to patched releases. | M |
| **PRN-06** | **P2** | Principal | Commits `4fd288a` to `e1479f7` | **Premature Feature Scope Creep (P2 Features in MVP):** Building wallet recharge, Razorpay, placement CRM, and job promotions bloated the 3-week timeline and created technical debt. | Feature-flag or isolate P2 modules behind configuration toggles. Focus QA exclusively on MVP core onboarding and job matching. | M |
| **PRN-07** | **P2** | Principal | `apps/api/src/bulk/bulk.service.ts:49-63` | **Fragile In-Memory CSV Parsing:** Naive regex/split parsing of entire CSV files in memory crashes on commas within quoted strings and consumes excessive RAM on 50,000 rows. | Use Node.js streaming `csv-parse` pipelines with backpressure directly from storage streams. | M |
| **PRN-08** | **P2** | Principal | `.env.example:13,16` | **Connection Pooling Port Misconfiguration:** Port 6543 (transaction pooler) must be used with `?pgbouncer=true` for application traffic; port 5432 should only be used for migrations. | Document and enforce Supabase connection pooling guidelines in deployment manifests. | S |

---

## 6. Deviations & Scope Creep

The following table documents all components that deviate from PRD v1.4 or represent features built ahead of their designated phase:

| Feature / Component | Classification | PRD Reference | Code Evidence | Recommendation | Rationale |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Upstash QStash Webhooks for Worker Tasks** | Deviation | PRD §8.1 (Locked BullMQ worker) | `apps/api/src/qstash/`, `apps/api/src/bulk/bulk.service.ts:282` | **Defer / Revert** | PRD specifies a separate framework-free container with BullMQ to avoid running background processing inside web containers. |
| **Resend Email Instead of Brevo** | Deviation | PRD v1.4 (Locked Architecture) | `apps/worker/src/processors/alerts.processor.ts:35` | **Replace** | PRD v1.4 mandates Brevo with separate transactional and broadcast subdomains. |
| **In-Memory OTP & Rate Limiter** | Deviation | PRD §8.1, §8.7.1 (`@upstash/ratelimit`) | `apps/api/src/auth/auth.service.ts:28` | **Replace** | In-memory `Map` cannot support multi-instance deployments or survive container restarts. |
| **Local JSON Database Persistence (`.scratch/`)** | Deviation | PRD §8.1 (Supabase PostgreSQL) | `apps/api/src/database/supabase.provider.ts:25` | **Remove** | Synchronous disk writes of full state files are inappropriate for a production backend and mask database errors. |
| **Credit Wallet Logic & Balance Engine (WAL-01, 02, 04)** | Scope Creep (P2) | PRD §6.8 (Tables in MVP, logic in P2) | `apps/api/src/wallet/wallet.service.ts` | **Keep behind Flag** | Database tables are required for MVP schema stability; disable UI checkout until Phase 2. |
| **Razorpay Payments & GST Invoicing (WAL-03)** | Scope Creep (P2) | PRD §6.8, §11.2 (Phase 2 scope) | `apps/api/src/wallet/payment.service.ts` | **Defer** | Payment gateway contracts and compliance review should occur before P2 go-live. |
| **Institutional Placement Pipeline (INT-04)** | Scope Creep (P2) | PRD §6.6 (Phase 2 scope) | `apps/api/src/placement/placement.service.ts` | **Defer** | Diverts testing focus from student/employer bulk onboarding. |
| **MSME Broadcast Engine & District Reports (MSME-03, 04)** | Scope Creep (P2) | PRD §6.7 (Phase 2 scope) | `apps/api/src/admin/broadcast.service.ts`, `reports.service.ts` | **Defer** | Broadcasts without verified DLT templates risk SMS account suspension. |
| **Featured Jobs & Search Alert Digests (JOB-05, 06)** | Scope Creep (P2) | PRD §6.4 (Phase 2 scope) | `apps/api/src/jobs/jobs.service.ts:365` | **Keep** | Stored procedure ranking is solid and enhances MVP search value. |
| **Resume Builder with Templates (JS-04)** | Scope Creep (Full) | PRD §6.2 (Full version extra) | `apps/api/src/admin/admin.service.ts:144` | **Defer** | Basic profile PDF (JS-03) is sufficient for MVP launch. |
| **Social Media Embeds (EMP-04)** | Scope Creep (Full) | PRD §6.3 (Full version extra) | `apps/web/src/components/company/SocialMediaEmbed.tsx` | **Keep** | Zero-dependency client component with minimal maintenance footprint. |

---

## 7. Prioritised Remediation Plan

### 7.1 Remediation Tasks by Phase & Dependency

```
[STF-01: Fix Role Escalation] ──► [STF-02: Secure AdminController] ──► [PRN-01: Rotate Secrets]
              │
              ▼
[STF-03: Upstash Redis Limiter] ──► [STF-06: Connect MSG91 Invites] ──► [PRN-02: Restore BullMQ Worker]
              │
              ▼
[STF-08: Unify Migrations] ──► [PRN-03: Enforce RLS Context] ──► [STF-04: Real Load & Backup Drills]
```

#### Phase 1: Immediate Launch Blockers (P0) — Days 1–3
1. **Remediate Role Escalation (STF-01):** Remove `updates.role = role` in `apps/api/src/auth/auth.service.ts:151`. Roles must be assigned only during user creation and never updated through `verifyOtp`.
2. **Secure Admin Routes (STF-02):** Add `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('admin', 'msme_admin')` to `apps/api/src/admin/admin.controller.ts`.
3. **Rotate Secrets & Scrub Working Tree (PRN-01):** Revoke exposed Supabase and Razorpay credentials. Remove `.env.local` and enforce pre-commit secret detection.
4. **Implement Redis OTP Rate Limiting (STF-03):** Replace `Map<string, OtpRecord>` with `@upstash/ratelimit` connected to Upstash Redis as specified in PRD §8.7.1.
5. **Execute Real Load & Backup Drills (STF-04):** Replace synthetic loop scripts with a valid k6/autocannon load test targeting 2,000 virtual users, and execute an actual PostgreSQL dump and restore test against a staging database.

#### Phase 2: Architectural Stabilization (P1) — Days 4–7
1. **Unify Database Migrations (STF-08):** Merge `supabase/migrations` and `packages/database/supabase/migrations` into a single canonical migration directory.
2. **Wire Real SMS to Invite Processor (STF-06):** Connect `apps/worker/src/processors/invite.processor.ts` to `Msg91SmsService` with rate limiting and DLT template verification.
3. **Remove Synchronous JSON Database Store (STF-05):** Remove `PersistentDatabaseStore` from all repositories in `apps/api/src/database/repositories/` and rely on direct Supabase client calls.
4. **Adopt Brevo Email Adapter (PRN-04 / NOT-02):** Implement the Brevo provider adapter per PRD v1.4, replacing hardcoded Resend calls.
5. **Patch Vulnerable Dependencies (PRN-05):** Update `@nestjs/platform-fastify` and Fastify packages to eliminate the critical middleware bypass vulnerability.

---

### 7.2 PRD §14.1 Acceptance Criteria Verification Status

| PRD Acceptance Test (§14.1) | Current Status | Findings & Evidence |
| :--- | :---: | :--- |
| **1. Mobile OTP signup/login < 60s, cannot request unlimited OTPs** | **Pass (with Caveat)** | Passing e2e test in `apps/api/test/sms-turnstile.spec.ts`. *Caveat:* Rate limit is in-memory only and fails across multi-container instances. |
| **2. Employer profile, QR download, job posting appears in search < 1 min** | **Pass** | Verified in `apps/api/test/profiles.e2e-spec.ts` and `apps/api/test/jobs.e2e-spec.ts`. QR code downloads and job indexing verified via full-text search procedure. |
| **3. Seeker profile, job apply, employer sees applicant but NOT phone/email** | **Pass** | Verified in `apps/api/test/jobs.e2e-spec.ts:60` and `apps/api/test/acceptance-walkthrough.e2e-spec.ts:98`. PII is strictly stripped. |
| **4. Seeker downloads premium PDF, all links clickable** | **Pass** | Verified in `apps/worker/test/pdf.test.ts:18`. Generates vector PDF with clickable links and embedded Noto Sans Devanagari in < 500ms. |
| **5. 50k-row bulk import; clear errors; invited users finish OTP; site stays fast** | **Untested (Live)** | Synthetic unit test passes (`apps/worker/test/processors.spec.ts:35`), but live 50k streaming through storage and worker is untested against real database. |
| **6. Load test with 2,000 concurrent users passes speed targets (<2s, p95 <0.5s)** | **Fail** | `scripts/load-test.ts` is a mock loop that does not send network traffic. Live concurrency remains untested. |
| **7. MSME Dept & Institution roles import own data and see only own records** | **Pass** | Scoped queries and role validation verified in `apps/api/test/bulk.e2e-spec.ts` and `apps/api/test/placement.e2e-spec.ts`. |
| **8. Audit log records admin logins, imports, and exports** | **Pass** | Immutability triggers and audit records verified in `apps/api/test/audit-log-persistence.e2e-spec.ts`. Export endpoint itself is missing. |
| **9. Database backup successfully restored in a test** | **Fail** | `scripts/backup-restore.ts` returns a mock boolean. No real restore drill has been executed. |
| **10. SMS templates DLT-approved and emails reach inbox** | **Untested (Live)** | MSG91 DLT template constants are configured, but delivery to live inboxes requires registered client sender IDs and credentials. |

---

### Audit Sign-off

| Role | Review Lens | Status | Date |
| :--- | :--- | :---: | :--- |
| **Staff Software Engineer** | Implementation, Correctness, Invariants | Complete | October 25, 2026 |
| **Principal Software Engineer** | Architecture, Scale, Risk & Threat Model | Complete | October 25, 2026 |
