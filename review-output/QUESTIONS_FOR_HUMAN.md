# QUESTIONS_FOR_HUMAN.md — Governance, Architectural & Unverified Items

**Author:** Independent Principal Reviewer  
**Context:** Job Portal Platform (JP / JobsClick)  
**Date:** 2026-11-19

This document outlines critical decisions, architectural conflicts, and unverified assumptions that require human review and executive decisions before any deployment or launch.

---

## 1. Branch Strategy and Massive Unmerged Diff (PRs #97 – #114)

### Context & Evidence
- `origin/main` is pinned at commit `6ff404d` (PR #96, merged 2026-11-04).
- The current branch (`feat/public-slugs-id-02` / PR #106) contains **250 files changed (27,357 insertions, 4,247 deletions)** relative to `origin/main`.
- None of the PRs (#97 through #106) have been merged into `main`.
- A parallel git worktree (`indian-job-portal-remediation`) contains unmerged draft PRs #107 through #114 with unstaged, untested changes.
- **AGENTS.md Hard Rule:** Changes to Authentication, RLS policies, and Payments mandate human review before merging.

### Decision Needed from Human
1. Is PR #106 intended to be squash-merged into `main`, or should the changes be reviewed and merged in smaller, atomic PRs?
2. Has a human reviewed the security and payment changes in commits `a413d85`, `63c8cab`, `3f32a33`, and `00a5804`?
3. Should the unmerged draft remediation PRs (#107-#114) in the secondary worktree be abandoned, or integrated into the main pipeline?

---

## 2. Database RLS as "Second Lock" vs Single-Layer Guard Authorization

### Context & Evidence
- **PRD Hard Invariant #5:** *"Authz enforced in API guards AND RLS. A user sees only own data unless explicitly allowed."*
- **Actual Implementation:** Migration `20261110000002_rls_pii_and_policy_fixes.sql` revoked all direct table access from `anon` and `authenticated` roles and dropped all user-level RLS policies.
- Every NestJS repository connects to Supabase using `SUPABASE_SERVICE_ROLE_KEY` (`apps/api/src/database/supabase.provider.ts:215-240`), which unconditionally bypasses RLS.
- While a helper `createUserScopedSupabaseClient` exists in code, it is never injected or used by any service.
- Therefore, database-level isolation is **100% non-functional**. All security relies solely on NestJS route guards.

### Decision Needed from Human
1. Does the client accept single-layer authorization at the NestJS API layer (industry standard for server-side Node backends)?
2. If genuine RLS is required as a second lock, this requires issuing Supabase JWTs with `auth.uid()`, creating user-scoped PostgREST clients for every request, and re-writing RLS policies for all 18 tables. (Estimated effort: 6–8 engineer-days).

---

## 3. P0-6 Invite Processor Defect & SMS Delivery Integrity

### Context & Evidence
- In `apps/worker/src/processors/invite.processor.ts:82-86`, the invite processor queries:
  ```typescript
  from('users').select('phone, language').eq('status', 'invited').limit(waveSize)
  ```
  It does **NOT** filter by `batch_id` or institution. If Institution A uploads 500 students and triggers an invite wave, the worker selects and invites uninvited candidates belonging to Enterprise B or College C.
- In `invite.processor.ts:104-120`, the worker sends exactly 1 SMS per 250 candidates to `sampleCandidate.phone` but increments `sentCount += 250`.
- In addition, dual-queue dispatch in `apps/api/src/bulk/bulk.service.ts:232,241` fires both BullMQ and QStash, creating race conditions and memory spikes.

### Decision Needed from Human
1. Will bulk onboarding invitation waves be temporarily halted in production until the scoped batch processing logic from the remediation branch is reviewed, merged, and verified with live SMS tests?

---

## 4. Financial & Sponsorship Vulnerabilities (P0-7 & Non-Atomic Payments)

### Context & Evidence
- **Sponsorship Flaw:** `apps/api/src/wallet/sponsorship.service.ts:188-212` verifies `payment.status === 'captured'`, but **never checks `payment.amount >= quote.totalAnnualFeeInr`** and **never records that the payment was consumed**. A single ₹590 payment can activate unlimited annual institution sponsorships worth lakhs.
- **Payment / Wallet Non-Atomicity:** `apps/api/src/wallet/payment.service.ts:367-400` executes payment capture and credit grants as separate database calls without a PostgreSQL transaction or Redis distributed lock.
- **PRD Scope:** Credits, Wallet, and Sponsorship are defined as **Phase 2 (P2)** features in PRD §6.8 and §6.6.

### Decision Needed from Human
1. Can the entire `/wallet`, `/payments`, and `/sponsorship` route tree be completely disabled (or blocked via feature flag `FLAGS_P2_ENABLED=false`) for MVP launch?
2. If the client requires wallet or payments at launch, who will sign off on the required database-level transactional rewrite?

---

## 5. Product Contradiction: Employer Candidate Contact & Messaging

### Context & Evidence
- **PRD Hard Invariant #1:** *"Employer/anyone never sees a job seeker's phone or email. Contact only via platform message."*
- **Current State:**
  - Phone and email masking is enforced across the API and frontend (`+91 ••••• •••••`).
  - `POST /profiles/seeker/:id/unlock-contact` deducts credits.
  - However, **there is NO in-platform messaging module** in either `apps/api` or `apps/web`.
  - Employers who view shortlisted applicants have no mechanism to contact candidates through the platform.

### Decision Needed from Human
1. What is the intended candidate contact mechanism for MVP?
   - Option A: In-platform text chat/messaging module (requires new schema, sockets/polling, UI; ~5 engineer-days).
   - Option B: Platform-mediated SMS notification ("Employer X has shortlisted you, click here to respond").
   - Option C: Masked email relay (similar to Craigslist / Indeed relay addresses).

---

## 6. Verification Theater & Launch Acceptance Sign-Off

### Context & Evidence
- Acceptance tests in `test/e2e` assert that load tests, backup restore, and security scans pass.
- However, `scripts/synthetic/load-test.ts`, `scripts/synthetic/backup-restore.ts`, and `scripts/synthetic/security-scan.ts` are synthetic scripts that do not run real drills.
- PRD §14.1 Acceptance Criteria #6 (2,000-VU load test) and #9 (backup restore drill) have **never been executed against real infrastructure**.

### Decision Needed from Human
1. Does the human sponsor require real k6 load testing (2,000 VUs) against a staging instance on Railway before go-live?
2. Who will conduct and certify the PostgreSQL `pg_dump` and `pg_restore` disaster recovery test on the production database?

---

## 7. Third-Party Vendor Registrations & Telephony Compliance

### Items Unverified in Local Sandbox
1. **TRAI DLT Registration:** Has the client registered the Entity ID, Sender Headers (e.g., `INDJOB`), and DLT Content Template IDs with Indian telecom operators for MSG91?
2. **Razorpay Production Account:** Are KYC, webhooks, and GSTIN registration verified for the operating entity?
3. **Turnstile Production Keys:** The repo currently ships Cloudflare's dummy test keys (`1x00000000000000000000AA`) in `.env.example`. Live keys must be provisioned.
