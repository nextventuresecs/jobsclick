# REVIEW_SUMMARY.md — Independent Principal Review

**Project:** Indian Jobs (Job Portal Platform / JobsClick)  
**Evaluator:** Independent Principal Reviewer  
**Date:** 2026-11-19  
**Target Baseline:** `docs/PRD.md` (v1.3) + `docs/decisions/001-client-decisions.md`  
**Current Branch:** `feat/public-slugs-id-02` (commit `00a5804`, 250 files changed vs `origin/main` at `6ff404d`)

---

## 1. Executive Verdict: NOT LAUNCHABLE

The codebase demonstrates solid foundational TypeScript scaffolding, clean Zod validation contracts, and responsive Next.js/NestJS architecture. Several critical P0 security issues from the prior audit have been resolved (static OTP `123456` eliminated, `AuthController` IDOR patched, client-side fake logins removed, stored XSS mitigated, and public slugs implemented).

**However, the platform is strictly NOT LAUNCHABLE in its current state.** Critical flaws in background bulk invite processing, financial sponsorship activation, rate-limiting IP resolution, and test backdoors remain unpatched. Furthermore, core non-functional acceptance gates (2,000-VU load test, pg_restore drill) exist only as synthetic facades.

---

## 2. Claimed vs. Verified Completion by Phase

*Scoring Formula: Weighted by Priority (Must = 3, Should = 2, Could = 1, Decision = 2). Status weights: Verified = 1.0, Partial = 0.5, Stubbed/Fake = 0.1, Not Started = 0.0.*

| Phase | Total Requirements | Max Weighted Score | Earned Score | **Verified %** | **Claimed %** | Delta / Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MVP** | 33 | 103.0 | 79.3 | **77.0%** | **100.0%** | Core flows work, but bulk dispatch leaks cross-tenant data, PDF download is disconnected, and messaging is absent. |
| **Full** | 3 | 6.0 | 1.2 | **20.0%** | **65.0%** | Resume builder not started; social embeds stubbed; admin analytics reports rely on fallback data. |
| **Phase 2 (P2)** | 18 | 44.0 | 16.5 | **37.5%** | **70.0%** | Database tables exist, but payments are non-atomic, sponsorship is vulnerable to free reuse, and broadcast console simulates success. |
| **Phase 3 (P3)** | 18 | 42.0 | 2.4 | **5.7%** | **15.0%** | Schemas present per PRD mandate; application logic and geolocation matching not started. |

---

## 3. Top 5 Blockers (Must Fix Before Launch)

1. **P0-6 Cross-Tenant Invite Leakage & Fake Dispatch (`apps/worker/src/processors/invite.processor.ts:82-86, 104-120`)**  
   Worker queries `users WHERE status='invited' LIMIT waveSize` without `batchId` scoping. An invitation wave triggered by one college dispatches invites to candidates from unrelated colleges/enterprises. Furthermore, lines 104-120 send 1 SMS per 250 candidates while incrementing sent count by 250.
2. **`JwtAuthGuard` Test Backdoor & RLS Invalidation (`apps/api/src/auth/guards/jwt-auth.guard.ts:34-36`)**  
   Guard injects an optional `TEST_AUTH_GUARD` that completely bypasses signature checks, trusts caller-supplied headers, and fabricates roles. In addition, user-level RLS policies were dropped in migration `20261110000002`; all backend queries run via `service_role`, eliminating RLS as a second lock.
3. **P0-7 Sponsorship Free-Money Flaw (`apps/api/src/wallet/sponsorship.service.ts:188-212`)**  
   `activateSponsorship` accepts any captured payment without verifying `payment.amount >= quote.totalAnnualFeeInr` and without verifying that the payment was not previously used. A single ₹590 starter pack can activate unlimited annual institution sponsorships worth lakhs.
4. **Fastify Reverse-Proxy Rate-Limiting Flaw (`apps/api/src/main.ts:25-35`)**  
   `FastifyAdapter` is instantiated without `{ trustProxy: true }`. Under Railway/Cloudflare ingress, all client requests share the container/proxy IP, causing the 20/hr IP rate limit to become platform-wide and block all legitimate users.
5. **Verification Theater & Acceptance Gate Failures**  
   Load test (`scripts/synthetic/load-test.ts:46`), backup restore (`scripts/synthetic/backup-restore.ts:79`), and security scan scripts are synthetic facades. PRD §14.1 criteria #6 and #9 have never been verified. Vitest suite currently fails 10 tests across 5 test files (`pnpm test` exit code 1).

---

## 4. Top 10 Architectural & Operational Risks

1. **Cross-Tenant SMS Leakage:** Un-scoped bulk invite waves sending candidate invitations to wrong phone numbers.
2. **Financial Exploit in Wallet:** Reusable payment references allowing unauthorized sponsorship activations.
3. **Platform-Wide DoS:** Missing `trustProxy` triggering Upstash rate limits for all users on proxy IP.
4. **Permanent Credit Loss:** Non-atomic payment capture and credit granting causing lost credits during gateway retries.
5. **Unauthenticated Bulk Onboarding:** `company/bulk-onboard` accessible without authentication, polluting enterprise directory.
6. **Product Contradiction on Contact Unlock:** Employers pay credits to unlock contacts, but Invariant #1 hides phone/email and no in-platform chat exists.
7. **Massive Unmerged Git Diff:** 250 files changed (27,357 LOC) across PRs #97–#106 sitting outside `main`.
8. **PII Persistence in Storage:** Raw CSVs containing full Aadhaar numbers stored unscrubbed in Supabase Storage.
9. **Dual-Queue Race Conditions:** API dispatches bulk jobs to both BullMQ and QStash simultaneously.
10. **Data Loss Risk:** No verified database disaster recovery or `pg_restore` drill ever conducted.

---

## 5. Effort Estimate to Launch Readiness

| Workstream | Scope / Deliverables | Estimate (Days) | Confidence |
| :--- | :--- | :--- | :--- |
| **1. Fix P0 Blockers** | Scope `invite.processor` to `batchId`; remove fake 250-chunk SMS logic; patch sponsorship amount and reuse validation; enable `trustProxy` in Fastify; remove `TEST_AUTH_GUARD` from production code. | **3 – 5** | High (95%) |
| **2. Finish MVP Scope** | Fix 10 failing Vitest tests; connect web PDF download to worker renderer; resolve employer-to-candidate contact flow (SMS notification or in-app chat); resolve migration sync drift. | **5 – 8** | High (90%) |
| **3. Launch Readiness Pack** | Execute real k6 2,000-VU load test on Railway; perform real `pg_restore` backup drill; verify MSG91 DLT templates and live webhook signatures; configure automated CI deploy. | **4 – 6** | Medium (85%) |
| **Total Remaining Effort** | **Full readiness for production go-live** | **12 – 19 engineer-days** | **Overall: 90%** |

---

## 6. Recommended Next 5 Immediate Actions

1. **Gate Phase 2 Features OFF:** Set `FLAGS_P2_ENABLED=false` and enforce route guards to block access to `/wallet`, `/payments`, `/sponsorship`, and `/broadcast` until MVP is stable.
2. **Remediate `invite.processor.ts`:** Merge the scoped batch query and 1:1 candidate SMS dispatch logic from the remediation branch.
3. **Harden Ingress & Auth Guard:** Add `{ trustProxy: true }` to `FastifyAdapter` in `apps/api/src/main.ts` and eliminate `TEST_AUTH_GUARD` test injection from `JwtAuthGuard`.
4. **Resolve Test Suite & Migration Drift:** Copy missing slug migrations to `packages/database/supabase/migrations/` and fix the 10 failing tests in Vitest.
5. **Execute Real Load & Backup Drills:** Run a genuine 2,000-VU load test with k6 and perform a complete PostgreSQL database backup/restore cycle on staging.
