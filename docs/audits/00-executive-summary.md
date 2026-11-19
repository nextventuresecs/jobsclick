# Master Technical Audit & Executive Summary Report

**Project:** Jobsclick (Indian Job Portal Platform)  
**Document Reference:** `docs/audits/00-executive-summary.md`  
**Specification Authority:** `docs/PRD.md` (v1.3/v1.4), `docs/decisions/001-client-decisions.md`, `AGENTS.md`, `ORIGINAL_REQUEST.md`  
**Statutory Frameworks:** Digital Personal Data Protection (DPDP) Act 2023, Central Goods and Services Tax (CGST) Act 2017 § 36, RBI Payment Aggregator Guidelines, OWASP Top 10 (2021)  
**Audit Date:** November 3, 2026  
**Auditing Team:** Principal & Staff Software Engineers, Senior Application Security Auditors, and Forensic System Testers (Workers M1–M5)  
**Scope:** Full-Stack Monorepo — Web Application (`apps/web`), Backend API (`apps/api`), Background Worker (`apps/worker`), Shared Database Migrations & Schemas (`packages/database`), Shared Validation Contracts (`packages/validation`), Shared Primitives (`packages/ui`)  
**Integrity Mode:** Production Readiness & Forensic Integrity Audit (Offline & Local Mock Verification — Zero Live External Production Calls)

---

## 1. Overall Audit Verdict & C-Level Executive Assessment

### Final Audit Verdict: **NOT PRODUCTION READY (Launch Blocking — Critical Security, Financial, and Architectural Defects)**

Following an exhaustive, line-by-line technical and forensic audit across the frontend, backend, background workers, database migrations, and operational verification scripts of the Indian Job Portal platform, the engineering audit team has issued a definitive **NOT PRODUCTION READY** assessment. 

While the platform demonstrates exemplary architectural execution in several isolated domains—specifically dynamic ledger-derived credit accounting (Hard Invariant #7), constant-time HMAC SHA-256 Razorpay webhook validation, applicant contact stripping in employer views (Hard Invariant #1), strict 4-digit Aadhaar truncation (Hard Invariant #8), and Devanagari Hindi font rendering in vector PDF resumes (Hard Invariant #8a)—the system is compromised by **systemic, launch-blocking vulnerabilities and deceptive testing facades**.

### Critical Threat Landscape Summary

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                AUDIT FINDINGS AT A GLANCE                              │
├────────────────────────────────┬───────────────────────────┬───────────────────────────┤
│ Total Defect Items Evaluated:  │ 59 System Evaluations     │ 45 Confirmed Defect Items │
│ P0 Critical Launch Blockers:   │ 12 System-Critical Bugs   │ Immediate Service Failure │
│ P1 High Priority Defects:      │ 14 Severe Vulnerabilities │ Financial & Legal Risk    │
│ P2 Medium Priority Defects:    │ 16 Operational Flaws      │ Performance / Data Drift  │
│ P3 Low Priority Hygiene Gaps:  │ 3 Incomplete Scaffolds    │ Code Debt & Unwired UI    │
│ Software Supply Chain (CVEs):  │ 93 Total Vulnerabilities  │ 5 Critical / 33 High CVEs │
│ Hard Invariants Violated:      │ Invariants #1, #5, #7, #8a│ Core Rules Compromised    │
└────────────────────────────────┴───────────────────────────┴───────────────────────────┘
```

The most alarming architectural discoveries include:
1. **Permanent 503 Total Outage on Redis Network Drop:** The backend Redis client configures `retryStrategy() { return null; }`. A 100-millisecond network blip or Upstash maintenance restart permanently terminates the Redis socket, immediately failing all authentication, session verification, and protected endpoints with `503 Service Unavailable` indefinitely until the Node.js API process is manually rebooted.
2. **Deceptive Synthetic Testing & Disaster Recovery Facades:** Platform assurance scripts (`load-test.ts`, `backup-restore.ts`, and `security-scan.ts`) are **synthetic dummy implementations**. `load-test.ts` executes an in-memory FNV-1a hash loop with an arbitrary `+24.5ms` hardcoded delay; `backup-restore.ts` writes a dummy 40-line string and verifies restore by testing `dumpContent.includes('BEGIN;')`; and `security-scan.ts` returns static `true` booleans with zero actual AST or schema scanning.
3. **Simulated Bulk SMS Delivery Skipping 99.6% of Candidates:** The background invitation worker loops through candidate chunks of 250, extracts **only 1 sample candidate** per chunk, and advances `sentCount` by 250. In a batch of 10,000 candidates, exactly 40 SMS messages are dispatched while 9,960 candidates (99.6%) are skipped and never contacted, while the client is billed ₹2,000 for ₹8 of SMS delivery.
4. **Stored Cross-Site Scripting (XSS) in Public SEO Pages:** Every public dynamic page (`/jobs/[id]`, `/company/[id]`, `/institution/[id]`) embeds unescaped user input directly into inline `<script type="application/ld+json">` tags using standard `JSON.stringify(...)`. Under HTML5 parser specifications, any candidate or recruiter submitting text containing `</script><script>...` breaks the script context and executes arbitrary JavaScript in the browsers of viewing users.
5. **Universal Client-Side Auth Disconnect & Fake Token Generation:** The web application hardcodes `accessToken = null` in React context. Consequently, all workspace actions (candidate job applications, employer vacancy posting, admin audit log inspection) fall back to synthesizing fake tokens formatted as `Bearer jwt_session_${user?.id}_${Date.now()}` and injecting unauthenticated `x-user-id` headers, failing 401 on verified backends or permitting identity spoofing.
6. **Severe Cross-Tenant PII Data Breach (Hard Invariant #1 Violation):** The endpoint `GET /bulk/batches/:id/error-report` omits tenant authorization checks, allowing any authenticated employer or intermediary to download raw CSV error logs containing the unredacted phone numbers, names, and qualifications of candidates uploaded by competing employers or colleges.
7. **Checkout Verification IDOR & Customer GST Tax Invoice Disclosure:** The endpoint `POST /wallet/recharge/verify` verifies Razorpay signatures and returns full GST tax invoices containing customer legal names, addresses, GSTINs, emails, and phone numbers without validating that the authenticated user owns the underlying order.
8. **Statutory Non-Compliance with India's DPDP Act 2023:** Statutory account erasure requests submitted under India's Digital Personal Data Protection Act are pushed into an ephemeral, in-memory JavaScript array (`this.privacyRequests = []`) that is destroyed upon container restart. The "Submit Account Erasure Request" button on `/privacy` is a non-functional static HTML button without an event handler, and zero background erasure workers exist.
9. **Fatal SQL UUID Crash on Job Promotion:** The endpoint `POST /wallet/feature-job` calls a PostgreSQL stored procedure passing the string literal `'generic_deduction'` as `p_job_id`. In PostgreSQL, `p_job_id` is typed as `UUID`, causing an immediate fatal SQL syntax error (22P02) in production.
10. **Non-Atomic Payment Capture & Permanent Financial Ledger Loss:** Payment capture state updates and credit ledger additions are executed as separate, non-transactional database calls. If the database drops connection during ledger addition, the payment remains committed as `'captured'`. Subsequent retries exit immediately via idempotency guards, leaving the customer debited by Razorpay with zero credits granted.

---

## 2. Consolidated Master Defect Matrix

The following matrix consolidates all 45 defect items discovered across the four independent audit tracks (`docs/audits/01-frontend-security-integrity.md` through `04-battle-testing-resilience.md`).

### Defect Classification Taxonomy
- **P0 — Critical Blocker:** System crashes, service outages, unauthenticated RCE/XSS, catastrophic financial loss, data breaches, or complete core feature failure.
- **P1 — High Priority:** Financial reconciliation gaps, statutory privacy non-compliance, race conditions, auth session drops, or major user deception.
- **P2 — Medium Priority:** Unprotected monitoring interfaces, PostgREST query injection, worker retry corruption, missing i18n copy, or UI error masking.
- **P3 — Low Priority / Hygiene:** Incomplete UI prototypes, missing Next.js proxy routes, single-recipient vendor bottlenecks, or missing linter rules.

---

### Priority 0: Critical Launch Blockers (P0)

| Defect ID | Track Ref | Title | Impacted File(s) & Lines | Subsystem | Core Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | BUG-M4-01<br>R5-12 | Redis Disconnect Permanent Failure Lockup | `apps/api/src/auth/otp-redis.service.ts`<br>Lines 205–207 | Auth / Redis | `retryStrategy() { return null; }` kills Redis client on transient blip; 100% of auth and protected routes fail with 503 until manual API reboot. |
| **DEF-02** | CORE-01<br>R3-01 | Simulated Candidate Batch SMS Loop | `apps/worker/src/processors/invite.processor.ts`<br>Lines 79–129 | Worker / SMS | Worker sends 1 SMS per 250 candidates and skips 249; 99.6% of candidates never receive invitations; DB status never updated. |
| **DEF-03** | CORE-02<br>R3-07 | Fatal PostgreSQL UUID Cast Failure | `apps/api/src/database/repositories/credit-ledger.repository.ts`<br>Lines 304–320 | Wallet / DB | `atomicDeduct` passes string `'generic_deduction'` to RPC expecting UUID; crashes with fatal PostgreSQL error 22P02. |
| **DEF-04** | SEC-02<br>R2-20<br>BUG-M4-03 | Stored XSS via Public JSON-LD Structured Data | `apps/web/src/app/jobs/[id]/page.tsx:117-120`<br>`apps/web/src/app/company/[id]/page.tsx:121-124`<br>`apps/web/src/app/institution/[id]/page.tsx:251-254` | Web / SEO | Raw `JSON.stringify` inside `<script type="application/ld+json">` allows `</script><script>` tag breakout and arbitrary script execution in viewer browsers. |
| **DEF-05** | SEC-03<br>R2-21<br>R2-22 | Stored DOM XSS via Unvalidated `javascript:` URIs | `apps/web/src/app/institution/[id]/page.tsx:353-360`<br>`InstitutionProfileCard.tsx:122-131`<br>`packages/validation/src/profiles.ts:111, 119` | Web / Validation | Zod schema permits `javascript:` URIs; bound directly to `<a href="...">`; clicking official website or brochure executes arbitrary JavaScript. |
| **DEF-06** | AUTH-01<br>R2-01 to R2-05 | Client-Side Fake Token Synthesis & Identity Spoofing | `JobApplyButton.tsx:61-72`<br>`AdminWorkspace.tsx:42-49`<br>`useEmployerWorkspace.ts:64-66`<br>`useSeekerWorkspace.ts:67-69` | Web / Auth | React context hardcodes `accessToken = null`; UI generates `Bearer jwt_session_*` and passes `x-user-id: admin_root`; fails 401 on API or permits spoofing. |
| **DEF-07** | PRIV-01<br>R4-07 | Cross-Tenant Candidate PII Leak in Error CSV | `apps/api/src/bulk/bulk.controller.ts:59-64`<br>`apps/api/src/bulk/bulk.service.ts:470-492` | Bulk / Privacy | `GET /bulk/batches/:id/error-report` lacks tenant ownership check; any employer can download raw CSV containing mobile numbers of other institutions' candidates. |
| **DEF-08** | PAY-01<br>R4-02 | Checkout Verification IDOR & Customer PII Leak | `apps/api/src/wallet/wallet.controller.ts:77-105`<br>`apps/api/src/wallet/payment.service.ts:325-360` | Payments / Privacy | `POST /wallet/recharge/verify` omits user ownership validation; any authenticated user can claim orders and extract full GST customer tax invoices and PII. |
| **DEF-09** | PRIV-02<br>R3-14<br>R4-05 | Total Absence of DPDP Data Erasure Pipeline | `apps/api/src/admin/admin.service.ts:51-52, 296-308`<br>`apps/web/src/app/privacy/page.tsx:30-38` | Admin / DPDP | Statutory erasure requests stored in volatile in-memory array; UI button lacks `onClick` handler; zero background purge workers exist. |
| **DEF-10** | PAY-02<br>R4-03 | Non-Atomic Payment Capture & Ledger Loss | `apps/api/src/wallet/payment.service.ts`<br>Lines 344–348, 367–401 | Payments / Ledger | Payment status update and credit ledger insertion are not wrapped in a PostgreSQL transaction; ledger failure leads to permanent credit loss on retry. |
| **DEF-11** | SUP-01<br>R5-01<br>BUG-M4-10 | Critical Supply Chain Vulnerabilities (93 CVEs) | `pnpm-lock.yaml`<br>`apps/web` (Next.js), `apps/api` (Fastify Middie) | Security / Deps | Next.js RCE on Windows (GHSA-p293-qw3h-jr36) & Image AVIF/SVG RCEs; Fastify Middie Middleware Auth Bypass (GHSA-72c6-fx6q-fr5w). |
| **DEF-12** | RES-01<br>BUG-M4-02<br>BUG-M4-04<br>BUG-M4-05 | Deceptive Synthetic Testing & Recovery Scripts | `scripts/load-test.ts:14-51`<br>`scripts/backup-restore.ts:30-86`<br>`scripts/security-scan.ts:9-19` | DevOps / QA | Benchmark runs single-threaded CPU loop with hardcoded `+24.5ms`; backup script outputs dummy table string; security scan returns hardcoded `true`. |

---

### Priority 1: High Priority Defects (P1)

| Defect ID | Track Ref | Title | Impacted File(s) & Lines | Subsystem | Core Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-13** | CORE-03<br>R3-09 | Permanent Free Application Leak | `20261026100000_atomic_application_deduction_procedure.sql:24-42`<br>`apps/api/src/wallet/wallet.service.ts:116-131` | Wallet / DB | Application stored procedure checks only `is_sponsored = TRUE`; never checks if sponsoring institution's 1-year contract has expired. |
| **DEF-14** | CORE-04<br>R3-06 | TOCTOU Concurrency Race in Credit Promotion | `apps/api/src/wallet/wallet.service.ts`<br>Lines 204–231 | Wallet / Ledger | `deductForFeaturedPromotion` performs un-locked read followed by separate write; concurrent requests allow negative balance overdrafts. |
| **DEF-15** | RES-02<br>BUG-M4-07 | Non-Atomic Application Submission Two-Phase Saga | `apps/api/src/jobs/jobs.service.ts`<br>Lines 200–234 | Jobs / Ledger | Credit debit and application insert are separate calls; connection loss leaves user charged without application; compensatory refund fails silently. |
| **DEF-16** | PAY-03<br>R4-04 | In-Memory Concurrency Mutex in Multi-Node | `apps/api/src/wallet/payment.service.ts:331-334`<br>`apps/api/src/database/supabase.provider.ts:77-94` | Payments / Infra | Concurrency mutex uses local Node.js process `Map`; segregated across horizontally scaled containers; concurrent webhooks bypass lock. |
| **DEF-17** | CORE-05<br>R3-08 | Multi-Container Mutex Bypass in Sponsorship | `apps/api/src/wallet/sponsorship.service.ts:238-349`<br>`apps/api/src/database/repositories/profile.repository.ts:329-331` | Sponsorship / Infra | In-memory `withLock` is bypassed across multi-pod deployments; allows concurrent double-activation of annual student sponsorships. |
| **DEF-18** | PRIV-03<br>R4-06 | FK Cascade vs Statutory 8-Year GST Tax Retention | `20261008000000_init_schema.sql:108, 116`<br>`20261024000000_msme_broadcast_and_district_reports.sql:8` | Database / Compliance | `payments` cascades on delete, destroying required 8-year tax invoices (CGST Act § 36); `broadcast_campaigns` uses `RESTRICT`, crashing user deletion. |
| **DEF-19** | AUTH-02<br>R4-11 | 30-Minute JWT Expiry Without Refresh Token Flow | `apps/api/src/auth/jwt.service.ts:23-50`<br>`apps/web/src/context/AppContext.tsx:87-116` | Auth / Session | Fixed 30-minute JWT with no refresh token issuance, no `/auth/refresh` route, and no client retry interceptor; triggers sudden user logout. |
| **DEF-20** | UI-01<br>R2-10 | SponsorshipCard Simulates 1-Year Success on Error | `apps/web/src/components/workspaces/institution/SponsorshipCard.tsx:115-137` | Web / UI | Explicit `else` and `catch` blocks simulate a 1-year active institutional tier and green banner when backend returns 4xx/5xx or drops. |
| **DEF-21** | UI-02<br>R2-12 | Employer Workspace Publishes Fake Vacancy on Error | `apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts:96-115`<br>`employerApi.ts:81-92` | Web / UI | `postNewJobApi` swallows errors; UI synthesizes `id: job-${Date.now()}`, adds to React state, and toasts success; job vanishes on reload. |
| **DEF-22** | UI-03<br>R2-13 | Seeker Profile False Success & Client Aadhaar Bypass | `apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts:178-217`<br>`seekerApi.ts:108-126` | Web / UI | Disregards `saveResult.success: false`, updates local state, marks onboarding complete, self-certifies `aadhaarVerified: Boolean(...)`, and toasts success. |
| **DEF-23** | CORE-06<br>R3-12 | PersistentDatabaseStore Disk Writes Bypassing RLS | `apps/api/src/database/supabase.provider.ts`<br>Lines 29–209 | Database / Infra | Local JSON store (`.scratch/db-persistence.json`) used by repositories in non-production, bypassing RLS and causing split-brain across containers. |
| **DEF-24** | CORE-07<br>R3-13 | Active `InMemoryUserRepository` Bypassing Postgres | `apps/api/src/database/database.module.ts:36-41`<br>`in-memory-user.repository.ts:12-247` | Database / Auth | `InMemoryUserRepository` conditionally injected via `USE_JSON_STORE=1`, bypassing Supabase PostgreSQL constraints and triggers entirely. |
| **DEF-25** | CORE-08<br>R3-02 | Simulated Mock Loop in QStash Webhook Handler | `apps/api/src/bulk/bulk.service.ts`<br>Lines 561–615 | Bulk / Webhooks | Webhook `/webhooks/qstash/send-invite-wave` performs zero SMS dispatches and blindly marks `invite_waves` as `completed` with full `sent_count`. |
| **DEF-26** | CORE-09<br>R3-03 | Dual Queue Scheduling Race Condition | `apps/api/src/bulk/bulk.service.ts`<br>Lines 509–523 | Bulk / Queues | `scheduleInviteWave` simultaneously schedules both QStash HTTP webhook and BullMQ Redis queue, leading to concurrent race conditions and metrics corruption. |

---

### Priority 2: Medium Priority Defects (P2)

| Defect ID | Track Ref | Title | Impacted File(s) & Lines | Subsystem | Core Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-27** | PRIV-04<br>R4-08 | Plain-Text Phone Numbers in Queues & UI | `apps/api/src/queue/queue.service.ts:235-256`<br>`apps/api/src/main.ts:68-78` | Queue / Privacy | Plain-text phone numbers enqueued in Redis BullMQ broadcast payload; exposed in cleartext on unauthenticated Bull-Board (`/admin/queues/ui`). |
| **DEF-28** | SEC-04<br>BUG-M4-06 | PostgREST Query Parameter Injection in JobRepository | `apps/api/src/database/repositories/job.repository.ts`<br>Lines 127–131 | Database / API | Direct string interpolation into `.or(...)` allows attackers to inject commas and parentheses to inject arbitrary PostgREST filter clauses. |
| **DEF-29** | I18N-01<br>R4-12 | Extensive Hardcoded English Copy (Hard Invariant #8a) | `apps/web/src/app/jobs/page.tsx:100-156`<br>`apps/web/src/app/privacy/page.tsx:6-38` (and 6 others) | Web / i18n | Eight major public App Router pages contain static English strings in JSX without `next-intl` integration, violating Hard Invariant #8a. |
| **DEF-30** | RES-03<br>BUG-M4-08 | Bulk Import Worker Retry State Inconsistency | `apps/worker/src/processors/import.processor.ts`<br>Lines 178, 203–217 | Worker / Bulk | Retried job checks DB for already-imported rows and marks them as duplicate errors, corrupting batch metrics and error CSVs. |
| **DEF-31** | RES-04<br>BUG-M4-09 | Resume PDF Generation Latency SLA Spike | `apps/worker/test/pdf.test.ts:21`<br>`apps/worker/src/pdf/` | Worker / PDF | Initial PDF generation takes 12,843 ms, failing the <10,000 ms SLA and saturating the single-threaded Node.js event loop. |
| **DEF-32** | AUTH-03<br>R2-06 | Phantom LocalStorage Token Reads | `InstitutionCmsEditor.tsx:139, 169`<br>`SponsorshipCard.tsx:89, 95` | Web / Auth | Reads `localStorage.getItem('token')` or `'access_token'`; localStorage is empty, causing requests to be dispatched unauthenticated. |
| **DEF-33** | PAY-04<br>R2-07 | Unauthenticated Wallet Recharge Order API | `apps/web/src/components/wallet/RechargeModal.tsx`<br>Lines 112–126, 167–177 | Web / Payments | `fetch('/wallet/recharge/create-order')` omits `Authorization` header and `credentials: 'include'`; orders fail 401 or orphan. |
| **DEF-34** | UI-04<br>R2-11 | SaveSearchAlertModal Displays False Success | `apps/web/src/components/jobs/SaveSearchAlertModal.tsx`<br>Lines 52–76 | Web / UI | Next.js route `/api/jobs/alerts` returns 404; modal catches error, writes to `localStorage`, and displays green "Alert Created Successfully!". |
| **DEF-35** | UI-05<br>R2-14 | Public Admission Inquiry Fake Success | `apps/web/src/components/workspaces/institution/PublicInstitutionTabs.tsx`<br>Lines 92–95 | Web / UI | In `catch` block on network failure or 500 error, explicitly sets `setInquirySuccess(true)` simulating successful capture to the prospective student. |
| **DEF-36** | UI-06<br>R2-15 | Institution CMS Mutation Without Rollback | `apps/web/src/components/workspaces/institution/InstitutionCmsEditor.tsx`<br>Lines 180–191, 262–279 | Web / UI | Inquiry status update fails in `catch`, yet mutates local UI state to `newStatus` without rollback. CMS save displays deceptive "saved locally" toast. |
| **DEF-37** | UI-07<br>R2-16 | Employer Fire-and-Forget Mutations | `useEmployerWorkspace.ts:118-139`<br>`employerApi.ts:101-108, 115-132` | Web / UI | `handleSaveProfile` calls `updateBusinessProfileApi` without `await`, immediately toasting success. API functions swallow all errors in empty `catch {}`. |
| **DEF-38** | UI-08<br>R2-17 | MSME Broadcast Console Fake Campaign Dispatch | `apps/web/src/components/workspaces/admin/MsmeBroadcastConsole.tsx`<br>Lines 184–215, 235–245 | Web / UI | Backend route returns 404/500; both `else` and `catch` blocks synthesize fake `camp_${Date.now()}` and display green banner: "Queued to BullMQ". |
| **DEF-39** | CORE-10<br>R3-10 | Refund Reconciliation Overdraft and Sponsorship Orphan | `apps/api/src/wallet/payment.service.ts`<br>Lines 500–510 | Payments / Refunds | Payment refunds debit credits even if already spent (dropping balance < 0), and never revoke active institution sponsorships. |
| **DEF-40** | CORE-11<br>R3-15 | In-Memory Bulk Import Batch Maps in BulkService | `apps/api/src/bulk/bulk.service.ts`<br>Lines 80–81, 524–539 | Bulk / Storage | Bulk import batches and invite waves stored in JavaScript `Map` structures during test/dev modes, bypassing DB validation and RLS. |
| **DEF-41** | CORE-12<br>R3-16 | Worker Alerts Local JSON Fallback and Static Sets | `apps/worker/src/processors/alerts.processor.ts`<br>Lines 35–55 | Worker / Alerts | Alerts processor reads/writes `.scratch/db-persistence.json` and static in-memory sets, losing state on worker restart and duplicating alerts. |
| **DEF-42** | SEC-05<br>BUG-M4-11 | Missing Security ESLint Plugins | `eslint.config.mjs`<br>Lines 1–26 | Tooling / Lint | Only 2 rules configured; completely lacks security AST linters (`eslint-plugin-security`, `eslint-plugin-no-unsanitized`). |

---

### Priority 3: Low Priority / Code Hygiene & Incomplete Features (P3)

| Defect ID | Track Ref | Title | Impacted File(s) & Lines | Subsystem | Core Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-43** | FEAT-01<br>R2-18 | Pure In-Memory Student Enrolment & Profile Save | `useInstitutionWorkspace.ts`<br>Lines 242–260, 262–330 | Web / Institution | `handleQuickAddStudent` and `handleSaveProfile` perform pure in-memory React state mutations without any HTTP fetch calls. Data is lost on refresh. |
| **DEF-44** | FEAT-02<br>R2-19 | Missing Next.js BFF Route for Job Promotion | `apps/web/src/components/workspaces/employer/PromoteJobModal.tsx`<br>Lines 35–59 | Web / BFF | Posts to `/api/jobs/${jobId}/promote`, which does not exist in Next.js (returns 404). While error state is displayed, feature is completely inoperable. |
| **DEF-45** | FEAT-03<br>R3-04 | Single-Recipient MSG91 Client Bottleneck | `apps/worker/src/sms/sms.service.ts`<br>Lines 63–82 | Worker / SMS | Worker MSG91 client passes a single mobile number per HTTP request, lacking batch array integration for high-throughput dispatches (25 min for 10k). |

---

## 3. Deep Dive into Top 10 Systemic Architectural Vulnerabilities

### 3.1 Redis Connection Drop Permanent API Failure (`retryStrategy() { return null; }`)
- **System Impact:** Total Platform Service Outage (`503 Service Unavailable`)
- **Files Impacted:** `apps/api/src/auth/otp-redis.service.ts`, lines 205–207
- **Root Cause Analysis:**  
  When instantiating `ioredis`, line 205 defines:
  ```typescript
  retryStrategy() {
    return null;
  }
  ```
  In the `ioredis` protocol engine, returning `null` or `undefined` tells the client to immediately abort reconnection logic and transition the internal connection state to `'end'`. When Upstash Redis undergoes an ephemeral TLS renegotiation, a network blip occurs, or a local Redis container restarts, the API client permanently dies.
- **Blast Radius & Threat Model:**  
  `JwtAuthGuard` executes on every authenticated endpoint, calling `loadUserState`, which queries Redis. Furthermore, every OTP request calls `checkAndIncrementOtpLimits`. Once the Redis client transitions to `'end'`, every single API call throws an unhandled connection exception, returning `503 Service Unavailable` for 100% of candidate, employer, and administrative users across the entire platform. The application never recovers until a developer manually restarts the Node.js API process.
- **Architectural Remediation:**  
  Replace `return null;` with an exponential backoff reconnect strategy bounded by a maximum delay:
  ```typescript
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  }
  ```

---

### 3.2 Deceptive Synthetic Testing & Disaster Recovery Scripts
- **System Impact:** False Quality & Compliance Assurance in CI/CD Pipelines
- **Files Impacted:** `scripts/load-test.ts` (lines 14–51), `scripts/backup-restore.ts` (lines 30–86), `scripts/security-scan.ts` (lines 9–19)
- **Root Cause Analysis:**  
  All three infrastructure verification scripts in `scripts/` are facade implementations:
  1. `load-test.ts` executes an in-memory 32-bit FNV-1a integer hash loop inside a single-threaded CPU loop, caps the loop to 5,000 iterations, and artificially adds `+24.5ms` to the timer (`const p95LatencyMs = Number((measuredP95 + 24.5).toFixed(2))`). It binds to zero network ports and executes zero HTTP requests, yet prints "Throughput: 613,911 req/s, Status: PASSED".
  2. `backup-restore.ts` generates a 40-line string containing dummy 2-column tables `CREATE TABLE IF NOT EXISTS public.${tbl} (id text primary key, created_at timestamptz default now());` and evaluates restore validity by checking `dumpContent.includes('BEGIN;') && dumpContent.includes('COMMIT;') && stat.size > 0`. Zero PostgreSQL commands (`pg_dump` / `pg_restore`) are executed.
  3. `security-scan.ts` returns static boolean literals (`{ noSecretsInCode: true, aadhaarFullNumberNotStored: true, ... }`) without executing any AST inspection or file reads.
- **Blast Radius & Threat Model:**  
  CI/CD pipelines and compliance audits are presented with false affirmative signals, concealing critical bottlenecks, database corruption, and security regressions from engineering leadership.
- **Architectural Remediation:**  
  Replace all synthetic scripts with genuine operational harnesses: Fastify `app.inject` load drills, authentic `pg_dump`/`pg_restore` Docker pipelines, and AST-driven static security linters.

---

### 3.3 Candidate Bulk Invitation Worker Skipping 99.6% of Candidates
- **System Impact:** Complete Failure of Bulk Hiring Drives & Customer Billing Fraud
- **Files Impacted:** `apps/worker/src/processors/invite.processor.ts`, lines 79–129
- **Root Cause Analysis:**  
  In `invite.processor.ts`, the batch processing loop divides `waveSize` into chunks of 250 (`chunkSize = 250`):
  ```typescript
  for (let i = 0; i < iterations; i++) {
    const currentBatchCount = Math.min(chunkSize, waveSize - sentCount);
    const sampleCandidate = invitedCandidates[sentCount] || { phone: '9876543210', language: 'en' };
    const smsResult = await this.smsService.sendInviteSms({ phone: sampleCandidate.phone, language: sampleCandidate.language });
    if (smsResult.success) {
      sentCount += currentBatchCount; // <--- Jumps forward by 250!
    }
  }
  ```
  For each 250-candidate chunk, the code extracts **only 1 candidate** (`sampleCandidate = invitedCandidates[sentCount]`) and dispatches a single SMS. When that single SMS succeeds, line 117 executes `sentCount += currentBatchCount`, jumping `sentCount` forward by 250! The remaining 249 candidates in that chunk are completely skipped. Furthermore, candidate records in `users` are never updated to indicate that an invite was sent.
- **Blast Radius & Threat Model:**  
  In a bulk import of 10,000 candidates:
  - Total iterations = 40.
  - Exactly 40 SMS messages are sent.
  - 9,960 candidates (99.6%) are never notified.
  - The client is charged ₹2,000 (10,000 × ₹0.20/SMS), but only ₹8 worth of SMS is delivered.
  - Every subsequent wave queries the exact same first N rows in PostgreSQL, repeatedly spamming the same 40 candidates while starving all other imported candidates.
- **Architectural Remediation:**  
  Iterate through every candidate in `invitedCandidates`, use controlled concurrency (`p-limit(10)`), update candidate records in PostgreSQL (`status = 'invite_sent'`, `invited_at = NOW()`), and scope candidate selection by `batch_id`.

---

### 3.4 Stored XSS in Public SEO JSON-LD Script Tags & Stored DOM XSS in URLs
- **System Impact:** Account Hijacking, Session Theft, Credential Harvesting
- **Files Impacted:** 
  - `apps/web/src/app/jobs/[id]/page.tsx`, lines 117–120
  - `apps/web/src/app/company/[id]/page.tsx`, lines 121–124
  - `apps/web/src/app/institution/[id]/page.tsx`, lines 251–254, lines 353–360
  - `apps/web/src/components/workspaces/institution/InstitutionProfileCard.tsx`, lines 122–131
  - `packages/validation/src/profiles.ts`, lines 111, 119
- **Root Cause Analysis:**  
  1. Dynamic public pages inject user-controlled fields (`job.description`, `company.name`, `institution.about`) into inline `<script type="application/ld+json">` elements via `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`. Standard `JSON.stringify` does not escape `<`. Under HTML5 tokenizer rules (§13.2.5.3), encountering `</script>` immediately terminates the script block, allowing an attacker to inject `</script><script>alert(document.cookie)</script>`.
  2. In `packages/validation/src/profiles.ts`, `website` and `placementBrochureUrl` use Zod's `z.string().url()`. According to the WHATWG URL Standard, `javascript:alert(1)` is a valid URL. When bound to `<a href={institution.website}>`, clicking the link executes arbitrary JavaScript in the victim's session.
- **Blast Radius & Threat Model:**  
  Any employer or institution recruiter can inject malicious stored payloads into public vacancy and profile pages. When candidates, recruiters, or platform administrators view the vacancy, the payload executes in their browser context, enabling full session compromise.
- **Architectural Remediation:**  
  1. In JSON-LD blocks, escape all `<` characters to Unicode `\u003c`: `JSON.stringify(jsonLd).replace(/</g, '\\u003c')`.
  2. In `packages/validation/src/profiles.ts`, enforce `^https?://` regex validation on all URL fields.

---

### 3.5 Client-Side Fake Token Synthesis (`jwt_session_*`) & Spoofable `x-user-id` Headers
- **System Impact:** Production Authentication Failure & Privilege Escalation
- **Files Impacted:** `JobApplyButton.tsx` (lines 61–72), `AdminWorkspace.tsx` (lines 42–49), `useEmployerWorkspace.ts` (lines 64–66), `useSeekerWorkspace.ts` (lines 67–69), `useInstitutionWorkspace.ts` (lines 86–90)
- **Root Cause Analysis:**  
  In `apps/web/src/context/AppContext.tsx:175`, `const accessToken = null;` is hardcoded because genuine authentication tokens reside exclusively in HttpOnly cookies (`auth_token`). Because `accessToken` is always `null` in React context, every workspace component falls back to:
  ```typescript
  const authHeader = accessToken
    ? `Bearer ${accessToken}`
    : `Bearer jwt_session_${user?.id || 'usr_seeker_77'}_${Date.now()}`;
  ```
  The client fabricates an unverified pseudo-JWT `jwt_session_*` and passes unauthenticated `x-user-id` headers (`admin_root`, `usr_seeker_77`, `usr_employer_55`).
- **Blast Radius & Threat Model:**  
  - On the production backend, `auth-session.ts:131` hard-rejects `jwt_session_*` tokens with 401 Unauthorized, breaking core functionality (job applications, job posting, profile saves).
  - In development or test environments where controllers read `@Headers('x-user-id')`, an unauthenticated attacker can inspect immutable audit logs, download applicant lists, and manipulate vacancies simply by passing `x-user-id: admin_root`.
- **Architectural Remediation:**  
  Eliminate all client-side token fabrication and fallback IDs. Route workspace API mutations through Next.js Route Handlers (BFF proxy pattern) that read the verified HttpOnly cookie and forward the genuine JWT to NestJS.

---

### 3.6 Cross-Tenant Candidate PII Leakage via Bulk Error CSV Endpoint
- **System Impact:** Mass Data Breach & Direct Violation of Hard Invariant #1
- **Files Impacted:** `apps/api/src/bulk/bulk.controller.ts`, lines 59–64; `apps/api/src/bulk/bulk.service.ts`, lines 470–492
- **Root Cause Analysis:**  
  The endpoint `GET /bulk/batches/:id/error-report` is guarded only by `@Roles('admin', 'intermediary', 'employer')`. It accepts `@Param('id') id: string` and downloads the CSV from private storage without checking whether the authenticated user or organization created the batch.
- **Blast Radius & Threat Model:**  
  Any employer registered on the platform can enumerate or brute-force batch IDs and download raw CSV error logs containing the unredacted phone numbers, full names, and vocational qualifications of candidates uploaded by other enterprises, ITI colleges, or polytechnic institutions. This directly violates Hard Invariant #1 ("Employer/anyone never sees a job seeker's phone or email").
- **Architectural Remediation:**  
  Inject `@CurrentUser() user: AuthUser` and enforce tenant ownership validation (`if (user.role !== 'admin' && batch.created_by !== user.id) throw new ForbiddenException(...)`).

---

### 3.7 Checkout Verification IDOR Leaking Customer GST Tax Invoices
- **System Impact:** Insecure Direct Object Reference (IDOR) & Customer PII / Financial Leak
- **Files Impacted:** `apps/api/src/wallet/wallet.controller.ts`, lines 77–105; `apps/api/src/wallet/payment.service.ts`, lines 325–360
- **Root Cause Analysis:**  
  In `wallet.controller.ts`, `POST /wallet/recharge/verify` receives `@CurrentUser() user: AuthUser` and forwards `validated.razorpayOrderId` to `paymentService.processPaymentSuccess`. However, `processPaymentSuccess` locates the payment strictly by `gateway_order_id` and **never verifies** that `payment.user_id === user.id`. The method then formats and returns the full `invoice` object in the HTTP response.
- **Blast Radius & Threat Model:**  
  Any authenticated user who intercepts or guesses a Razorpay order ID can verify the transaction and retrieve the victim's official GST tax invoice, disclosing customer legal entity names, GSTINs, billing addresses, emails, phone numbers, and financial purchase amounts.
- **Architectural Remediation:**  
  Validate that `payment.user_id === user.id` (or user is admin) before returning the invoice.

---

### 3.8 Complete Absence of DPDP Data Erasure Pipeline
- **System Impact:** Statutory Violation of DPDP Act 2023 (§ 12) & Severe Regulatory Penalties
- **Files Impacted:** `apps/api/src/admin/admin.service.ts` (lines 51–52, 296–308), `apps/web/src/app/privacy/page.tsx` (lines 30–38), `apps/worker/src/processors/`
- **Root Cause Analysis:**  
  1. In `admin.service.ts`, statutory account deletion requests are pushed into an ephemeral in-memory array (`this.privacyRequests: PrivacyDeletionRequestRecord[] = []`). On pod restart or auto-scale event, all pending erasure requests are destroyed without an audit trail.
  2. On `apps/web/src/app/privacy/page.tsx`, the "Submit Account Erasure Request" button is a static HTML button with no `onClick` handler or form binding.
  3. No background worker, queue processor, or scheduled task exists to scrub database records, revoke tokens, or delete uploaded resume PDFs from Supabase Storage.
- **Blast Radius & Threat Model:**  
  Under Section 12 of the Indian Digital Personal Data Protection Act 2023, Data Fiduciaries must erase personal data upon withdrawal of consent. Storing requests in volatile memory guarantees compliance failure, exposing the platform to penalties of up to ₹250 crore from the Data Protection Board of India.
- **Architectural Remediation:**  
  Create a persistent `privacy_deletion_requests` database table, wire the frontend privacy button to submit requests, and implement an asynchronous worker (`erasure.processor.ts`) to scrub profiles, purge storage objects, and log anonymized audit entries.

---

### 3.9 Fatal PostgreSQL SQL UUID Cast Crash in `atomicDeduct` (`generic_deduction`)
- **System Impact:** Production Endpoint Failure (HTTP 500) & Broken Promotion Feature
- **Files Impacted:** `apps/api/src/database/repositories/credit-ledger.repository.ts`, lines 304–320; `packages/database/supabase/migrations/20261026100000_atomic_application_deduction_procedure.sql`, line 7
- **Root Cause Analysis:**  
  `WalletController.featureJob` (`POST /wallet/feature-job`) delegates to `creditLedgerRepository.atomicDeduct`. In production (`!this.isTestMode`), `atomicDeduct` calls PostgreSQL stored procedure `deduct_application_credit_with_ledger`, passing the string literal `'generic_deduction'` as `p_job_id`. In PostgreSQL, `p_job_id` is defined as type `UUID`. PostgreSQL immediately raises a fatal type cast error: `invalid input syntax for type uuid: "generic_deduction"` (error code `22P02`).
- **Blast Radius & Threat Model:**  
  Any employer attempting to promote a job via `POST /wallet/feature-job` in production receives an immediate HTTP 500 error. The feature is completely unusable in production.
- **Architectural Remediation:**  
  Deprecate `POST /wallet/feature-job` and require employers to use `POST /jobs/:id/promote`, which invokes `promote_job_with_ledger` with authentic job UUIDs.

---

### 3.10 Non-Atomic Payment Capture and Silent Financial Credit Ledger Loss
- **System Impact:** Customer Monetary Debit with Zero Credit Grant (Financial Invariant Breach)
- **Files Impacted:** `apps/api/src/wallet/payment.service.ts`, lines 344–348, lines 367–401
- **Root Cause Analysis:**  
  In `PaymentService.processPaymentSuccess`, line 367 executes `paymentRepository.transitionToCaptured` (an independent SQL `UPDATE payments SET status = 'captured' ...`). Line 394 then executes `walletService.grantCredits` (an independent SQL `INSERT INTO credit_ledgers ...`). These operations are not wrapped in a PostgreSQL transaction (`BEGIN ... COMMIT`). If a database connection timeout or process restart occurs after line 367 but before line 394:
  1. The payment row remains committed as `'captured'`.
  2. Zero rows are inserted into `credit_ledgers`.
  3. When Razorpay retries the webhook or the user refreshes, line 345 checks:
     ```typescript
     if (payment.status === 'captured') {
       const invoice = this.formatInvoice(payment);
       return { payment, invoice, alreadyProcessed: true };
     }
     ```
  4. The idempotency guard assumes credits were granted, exiting cleanly without ever crediting the user's ledger!
- **Blast Radius & Threat Model:**  
  The employer's bank account is debited by Razorpay, the transaction is marked captured, but the customer receives 0 credits. Violates Hard Invariant #7 ("Credit balances derive from ledger only. Never store mutable balance as truth").
- **Architectural Remediation:**  
  Encapsulate status transition and ledger credit issuance within an atomic PostgreSQL stored procedure (`capture_payment_and_grant_credits`).

---

## 4. Software Supply Chain & Dependency Vulnerability Summary

A complete forensic audit of `pnpm-lock.yaml` using `pnpm audit --audit-level=moderate` revealed **93 total vulnerabilities**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  DEPENDENCY VULNERABILITY SEVERITY PROFILE                   │
├──────────────────────────┬──────────────────────────┬────────────────────────┤
│ Severity Level           │ Count                    │ % of Total             │
├──────────────────────────┼──────────────────────────┼────────────────────────┤
│ CRITICAL                 │ 5 Vulnerabilities        │ 5.4%                   │
│ HIGH                     │ 33 Vulnerabilities       │ 35.5%                  │
│ MODERATE                 │ 50 Vulnerabilities       │ 53.8%                  │
│ LOW                      │ 5 Vulnerabilities        │ 5.3%                   │
├──────────────────────────┼──────────────────────────┼────────────────────────┤
│ TOTAL                    │ 93 Vulnerabilities       │ 100.0%                 │
└──────────────────────────┴──────────────────────────┴────────────────────────┘
```

### Critical CVE Deep Dive

1. **`@fastify/middie` Middleware Scope Authentication Bypass (GHSA-72c6-fx6q-fr5w)**
   - **Severity:** Critical (CVSS 9.8)
   - **Installed Version:** `8.3.3` (via `@nestjs/platform-fastify@10.4.22`)
   - **Vulnerable Range:** `<= 9.3.1`
   - **Impact:** Middleware mounted within child plugin scopes fails to bind properly under specific route prefix configurations, allowing unauthenticated attackers to bypass global authentication guards.
   - **Remediation:** Upgrade to `@fastify/middie@>=9.3.2` via `pnpm.overrides`.

2. **Next.js Unauthenticated Remote Code Execution on Windows (GHSA-p293-qw3h-jr36)**
   - **Severity:** Critical (CVSS 9.8)
   - **Installed Version:** `14.2.35` (in `apps/web`)
   - **Vulnerable Range:** `>= 13.4.0 < 15.5.24`
   - **Impact:** Path canonicalization flaws on Windows runtimes permit directory traversal outside the application bundle, allowing unauthenticated remote code execution.
   - **Remediation:** Upgrade `apps/web` to Next.js `>=15.5.28` (or patched `14.2.36+`).

3. **Next.js Image Optimizer AVIF & SVG Heap Buffer Overflow RCE (GHSA-2xp9-vwfh-vxw4 & GHSA-2464-fhr4-w9xw)**
   - **Severity:** Critical (CVSS 9.8)
   - **Installed Version:** `14.2.35`
   - **Impact:** Maliciously crafted SVG and AVIF images requested through `/_next/image?url=...` trigger heap buffer overflows and arbitrary code execution in the Node.js process.
   - **Remediation:** Enforce strict `images.remotePatterns` in `next.config.mjs` and patch Next.js.

---

## 5. Real-World Concurrency & Performance Benchmarks Summary

Because the existing script (`scripts/load-test.ts`) was proven to be a synthetic CPU loop with hardcoded latency, an authentic offline load drill was executed using NestJS and Fastify's native `app.inject` pipeline (`scratch/genuine_concurrency_benchmark.ts`).

### Empirical Fastify Concurrency Profiling Results

```
┌──────────────────────────────────────────────┬─────────┬──────────────┬──────────┬──────────┬──────────┬────────────┐
│ Scenario & Target Endpoint                   │ Concurr.│ Throughput   │ p50 Lat. │ p95 Lat. │ p99 Lat. │ Error Rate │
├──────────────────────────────────────────────┼─────────┼──────────────┼──────────┼──────────┼──────────┼────────────┤
│ Public Job Discovery (GET /jobs)             │ 100 req │ 797 req/s    │ 76.91 ms │ 77.76 ms │ 125.2 ms │ 0.0%       │
│ Authentication Burst (POST /auth/send-otp)   │ 50 req  │ 136 req/s    │ 261.7 ms │ 357.7 ms │ 366.6 ms │ 0.0%       │
│ Wallet Lock Contention (Serialized 50x)      │ 50 req  │ 4,914 ops/s  │ 8.60 ms  │ 9.18 ms  │ 9.22 ms  │ 98.0%*     │
│ Webhook Delivery Idempotency (10x)           │ 10 req  │ 221 req/s    │ 4.20 ms  │ 4.80 ms  │ 4.95 ms  │ 0.0%       │
└──────────────────────────────────────────────┴─────────┴──────────────┴──────────┴──────────┴──────────┴────────────┘
```
*\*Note: In the wallet contention drill on a balance of 1 credit, exactly 1 winner succeeded and 49 requests were correctly rejected with HTTP 400 `INSUFFICIENT_CREDITS`, demonstrating 0 overdrafts.*

### Key Performance Insights
1. **Discovery Performance:** Read-heavy job search achieves **797 req/s** with **p95 latency of 77.76 ms**, well within the PRD SLA target (<2000 ms).
2. **Authentication Bottleneck:** Burst OTP ingestion degrades to **136 req/s** with **p95 latency of 357.71 ms** and a **+24.19 MB heap spike** due to multi-step cryptographic normalization, hashing, and Redis rate limit checks. Dedicated connection pooling is required for high-volume recruitment drives.
3. **PDF Generation Latency Failure:** Background PDF compilation via `@react-pdf/renderer` takes **12,843 ms** on cold start, failing the <10,000 ms SLA and saturating the single-threaded Node.js worker event loop.

---

## 6. Repository Hard Invariants & Statutory Compliance Audit

```
┌────────────────────────────────────────────────────────┬────────────┬──────────────────────────────────────────────────────┐
│ Invariant / Statutory Requirement                      │ Status     │ Verified Audit Evidence & File References            │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #1. Employer never sees seeker phone or email          │ VIOLATED   │ Compliant in job/profile views, but VIOLATED in      │
│                                                        │            │ GET /bulk/batches/:id/error-report (leaks phone/name)│
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #2. Bulk import creates invited users; no SMS at import│ COMPLIANT  │ CSV parser sets status = 'invited'; zero SMS sent.   │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #3. Every bulk import row keeps source                 │ COMPLIANT  │ Populates source metadata on all imported rows.      │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #4. OTP: Turnstile before send, limits, cool-down      │ COMPLIANT  │ Verified Turnstile guard, 60s phone cool-down.       │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #5. Authz enforced in API guards AND RLS               │ VIOLATED   │ PersistentDatabaseStore & bulk error CSV bypass RLS. │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #6. Audit log append-only, not editable by admins      │ COMPLIANT  │ SQL triggers block UPDATE and DELETE on audit_logs.  │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #7. Credit balances derive from ledger only            │ VIOLATED   │ DB schema compliant, but non-atomic payment capture   │
│                                                        │ (API Level)│ and TOCTOU races in wallet service create drift.     │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #8. Aadhaar: Never store full number; last 4 only      │ COMPLIANT  │ Validated /^\d{4}$/ regex; worker slices last 4.     │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #8a. i18n: English + Hindi; no hardcoded strings       │ VIOLATED   │ 8 public pages contain hardcoded English JSX copy.   │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #9. Public pages SSR + JobPosting JSON-LD              │ COMPLIANT  │ Next.js App Router SSR + Schema.org metadata.        │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ #10. No secrets in code; never read/write real keys    │ COMPLIANT  │ Config via env, validated at boot; no hardcoded keys.│
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ DPDP Act 2023 (Section 12: Data Erasure Mandate)       │ NON-       │ Erasure requests stored in volatile in-memory array; │
│                                                        │ COMPLIANT  │ UI button is dead; zero background purge workers.    │
├────────────────────────────────────────────────────────┼────────────┼──────────────────────────────────────────────────────┤
│ CGST Act 2017 (Section 36: 8-Year Tax Invoice Record)  │ NON-       │ ON DELETE CASCADE purges tax records on user delete. │
│                                                        │ COMPLIANT  │ Foreign keys must be altered to ON DELETE SET NULL.  │
└────────────────────────────────────────────────────────┴────────────┴──────────────────────────────────────────────────────┘
```

---

## 7. Verified Architectural Strengths & Resilient Subsystems

The audit confirmed several areas of high engineering rigor that should be preserved:
1. **Dynamic Ledger-Derived Balance Computation (Hard Invariant #7):** In `20261017000000_credit_ledgers_and_rls.sql`, credit balances are derived via `COALESCE(SUM(amount), 0)` with PostgreSQL triggers prohibiting UPDATE and DELETE operations.
2. **Cryptographic Webhook HMAC Signature Validation:** In `apps/api/src/wallet/payment.service.ts`, Razorpay webhooks use `crypto.timingSafeEqual` over raw request body buffers with buffer length pre-checks, eliminating timing attacks.
3. **Devanagari Font Embedding in Vector PDF Resumes (Hard Invariant #8a):** In `apps/worker/src/pdf/pdf-generator.ts`, Noto Sans Devanagari WOFF fonts are embedded directly via `@react-pdf/renderer`, rendering Hindi characters without glyph corruption or tofu boxes.
4. **Applicant Contact Masking in Employer Views:** In `apps/api/src/jobs/jobs.service.ts:351` and `profiles.service.ts:163`, phone numbers and emails are strictly omitted from applicant profile projections.
5. **Aadhaar Data Minimization & Logging Scrubber:** In `packages/validation/src/profiles.ts`, Zod strictly enforces 4-digit numeric regex, and Sentry configuration scrubs 12-digit numeric sequences from error reports.

---

## 8. Unified Phased Remediation Roadmap

To transition the platform from **NOT PRODUCTION READY** to an enterprise-grade, launch-ready state, engineering efforts must follow this strictly sequenced, three-phase remediation blueprint:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PHASED REMEDIATION BLUEPRINT                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: IMMEDIATE LAUNCH BLOCKERS (P0) — Days 1–5                                     │
│  ├── Fix Redis reconnect lockup in otp-redis.service.ts (exponential backoff)          │
│  ├── Refactor invite.processor.ts to iterate all candidates & update DB state          │
│  ├── Escape JSON-LD structured data (< to \u003c) across all public dynamic pages      │
│  ├── Enforce ^https?:// validation on website and brochure URLs in validation schemas  │
│  ├── Remove client-side jwt_session_* synthesis; route requests through Next.js BFF    │
│  ├── Add tenant ownership validation in GET /bulk/batches/:id/error-report             │
│  ├── Enforce user ownership validation in POST /wallet/recharge/verify                 │
│  ├── Wrap payment capture & ledger grant in atomic PostgreSQL procedure                │
│  ├── Patch critical supply chain CVEs (Next.js >=15.5.28, @fastify/middie >=9.3.2)     │
│  └── Fix fatal SQL UUID cast in atomicDeduct; deprecate POST /wallet/feature-job       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: HIGH PRIORITY SECURITY & PRIVACY (P1) — Days 6–10                             │
│  ├── Implement persistent privacy_deletion_requests table & async erasure worker       │
│  ├── Alter payments & credit_ledgers FKs to ON DELETE SET NULL for CGST Act compliance │
│  ├── Enforce sponsorship contract expiry in deduct_application_credit_with_ledger     │
│  ├── Implement dual-token JWT refresh architecture (15-min access + 30-day refresh)   │
│  ├── Remove false-positive UI success masking in SponsorshipCard & SaveSearchAlert     │
│  ├── Eliminate dual queue race in BulkService (standardize exclusively on BullMQ)      │
│  ├── Eradicate PersistentDatabaseStore & InMemoryUserRepository (standardize on PG)    │
│  └── Replace in-memory withLock with Redis Redlock or Postgres advisory locks          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: INFRASTRUCTURE & PRODUCTION HARDENING (P2 & P3) — Days 11–15                   │
│  ├── Mask phone numbers in BullMQ broadcast queues; secure /admin/queues/ui with auth  │
│  ├── Sanitize keyword parameter in JobRepository.findAll to prevent PostgREST injection│
│  ├── Extract hardcoded JSX copy across 8 public pages into messages/en.json and hi.json│
│  ├── Implement checkpointing/cursor resumption in bulk import worker                   │
│  ├── Pre-warm fonts or offload vector PDF generation to worker thread pool             │
│  ├── Replace synthetic load-test.ts and backup-restore.ts with genuine tooling         │
│  └── Install security ESLint plugins (eslint-plugin-security, no-unsanitized)          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Forensic Attestation & Sign-Off

This Master Executive Summary represents the synthesized, cross-verified consensus of all audit tracks executed under the authoritative audit specification. Every claim, finding, line number reference, and performance metric is directly grounded in verified source code and reproducible test executions.

**Audit Verification Summary:**
- **Web Security & Integrity Audit:** Documented in `docs/audits/01-frontend-security-integrity.md`
- **Core Features & Infrastructure Audit:** Documented in `docs/audits/02-core-features-infrastructure.md`
- **Payments, Privacy & Compliance Audit:** Documented in `docs/audits/03-payments-privacy-compliance.md`
- **Battle Testing & Resilience Audit:** Documented in `docs/audits/04-battle-testing-resilience.md`

**Master Deliverable Approved by:**  
*Principal Systems Architect & Lead Forensic Auditor (Worker M5)*  
*Jobsclick Platform Audit Deliverable — November 3, 2026*
