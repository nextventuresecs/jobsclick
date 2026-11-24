# RUN_LOG.md — Execution Log of Local Verification Commands

**Environment:** Windows (PowerShell), Node v22.14.0, pnpm v10.5.2, Docker Desktop (WSL2), Local PostgreSQL 17 (Supabase container on port 54322), Upstash/Local Redis on port 6379.  
**Execution Timestamp:** 2026-11-19T10:30:00+05:30 to 2026-11-19T10:35:00+05:30.  
**Active Workspace Directory:** `d:\Trun Dada\Projects\Products\Indian Job Portal\application\indian-job-portal`  
**Current Branch:** `feat/public-slugs-id-02` (at commit `00a5804`, 250 files changed vs `origin/main` at `6ff404d`)

---

## 1. Frozen Lockfile Installation (`pnpm install --frozen-lockfile`)

**Command:**
```powershell
pnpm install --frozen-lockfile
```
**Exit Code:** `0`  
**Duration:** `2.8s`  
**Real Trimmed Output:**
```text
Scope: all 6 workspace projects
Lockfile is up to date, resolution step is skipped
Packages: +0
Done in 2.8s
```

---

## 2. Monorepo Typecheck (`pnpm run typecheck`)

**Command:**
```powershell
pnpm run typecheck
```
**Exit Code:** `0`  
**Duration:** `6.9s`  
**Real Trimmed Output:**
```text
> indian-job-portal@1.0.0 typecheck D:\Trun Dada\Projects\Products\Indian Job Portal\application\indian-job-portal
> pnpm -r run typecheck

Scope: 6 of 6 workspace projects
packages/database typecheck: Done in 331ms
packages/validation typecheck: Done in 405ms
packages/ui typecheck: Done in 482ms
apps/worker typecheck: Done in 998ms
apps/api typecheck: Done in 2.1s
apps/web typecheck: Done in 4.7s
```
*Note: TypeScript strict mode passed across all packages with 0 compilation errors.*

---

## 3. Monorepo Linting (`pnpm run lint`)

**Command:**
```powershell
pnpm run lint
```
**Exit Code:** `0`  
**Duration:** `4.5s`  
**Real Trimmed Output:**
```text
> indian-job-portal@1.0.0 lint D:\Trun Dada\Projects\Products\Indian Job Portal\application\indian-job-portal
> pnpm -r run lint

Scope: 6 of 6 workspace projects
packages/database lint: Done in 180ms
packages/validation lint: Done in 210ms
packages/ui lint: Done in 290ms
apps/worker lint: Done in 550ms
apps/api lint: Done in 1.4s
apps/web lint: Done in 2.8s
```

---

## 4. Test Suite Execution (`pnpm test`)

**Command:**
```powershell
pnpm test
```
**Exit Code:** `1` (FAIL)  
**Duration:** `35.2s`  
**Real Trimmed Output:**
```text
> indian-job-portal@1.0.0 test D:\Trun Dada\Projects\Products\Indian Job Portal\application\indian-job-portal
> vitest run

 ❯ apps/web/test/ticket-t12-hindi-routing.test.ts (3 failures)
   × Ticket T-12 Hindi Routing Integration > redirects /jobs to /en/jobs on default locale
     → expected 'http://localhost:3000/en/jobs' to be 'http://localhost:3000/jobs'
   × Ticket T-12 Hindi Routing Integration > rewrites session headers for internal routing
   × Ticket T-12 Hindi Routing Integration > injects hreflang alternate links for SEO
 ❯ apps/web/test/ticket-t12-multilingual-routing.test.ts (3 failures)
   × Ticket T-12 Multilingual Routing > enforces hindi routing parity
   × Ticket T-12 Multilingual Routing > handles locale prefix normalization
   × Ticket T-12 Multilingual Routing > rewrites headers across locales
 ❯ apps/web/test/ticket-t10-workspace-wiring.test.ts (1 failure)
   × Ticket T-10 Workspace Wiring > hides candidate phone number in employer applicant view
     → AssertionError: expected '+91 ••••• •••••' to match /^\+91 ••••• ••\d{3}$/
 ❯ apps/web/test/ticket-t19-placement-dashboard.test.ts (2 failures)
   × Ticket T-19 Placement Dashboard > candidate table renders with masked email
     → AssertionError: expected '••••••@••••••' to match /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
   × Ticket T-19 Placement Dashboard > candidate export masks sensitive contact data
 ❯ apps/worker/test/email-sms.spec.ts (1 failure)
   × EmailSmsService > sends invitation sms with DLT template ID
     → AssertionError: expected '019318b7-6b45-7bc3-95d1-e6e768e7d21c' to include 'qa_whitelist_invite_'

 Test Files  5 failed | 90 passed | 1 skipped (96)
      Tests  10 failed | 864 passed | 3 skipped (877)
   Start at  10:30:15
   Duration  35.21s
```
*Analysis of Test Failures:*
1. **Hindi/Multilingual Routing:** Next.js middleware tests expect legacy routing behavior while PR #106 / i18n routing changed prefix rewrite logic.
2. **Masking Regex Mismatch in Tests:** PR #103 implemented full masking (`+91 ••••• •••••`), but older tests in `ticket-t10-workspace-wiring.test.ts` still assert the leaking partial mask (`+91 ••••• ••\d{3}`).
3. **Worker SMS Spec:** Test expected dummy mock message ID prefix `qa_whitelist_invite_` while generator returned a standard UUID.

---

## 5. Migration Directory Sync Check (`pnpm ci:check-migrations`)

**Command:**
```powershell
pnpm ci:check-migrations
```
**Exit Code:** `1` (FAIL)  
**Real Trimmed Output:**
```text
> indian-job-portal@1.0.0 ci:check-migrations D:\Trun Dada\Projects\Products\Indian Job Portal\application\indian-job-portal
> node scripts/check-migration-sync.mjs

[ERROR] Migration directory drift detected!
Files in supabase/migrations/ missing from packages/database/supabase/migrations/:
  - 20261115000000_public_slugs.sql
  - 20261115100000_public_views_and_rpc_slugs.sql

Please ensure all migrations are mirrored between root supabase/ and packages/database/.
```
*Note: Drift caused by PR #106 adding slug migrations only to root `supabase/migrations/`.*

---

## 6. Live Database Catalog Security Assertion (`pnpm db:catalog:check`)

**Command:**
```powershell
pnpm db:catalog:check
```
**Exit Code:** `1` (FAIL)  
**Real Trimmed Output:**
```text
> indian-job-portal@1.0.0 db:catalog:check D:\Trun Dada\Projects\Products\Indian Job Portal\application\indian-job-portal
> ts-node scripts/db-catalog-check.ts

Connecting to PostgreSQL at 127.0.0.1:54322/postgres...
[CHECK] Verifying public schema permissions...
[FAIL] Function 'search_jobs(text, text, text, integer, integer, text, integer, integer)' has EXECUTE privilege granted to 'PUBLIC', 'anon', 'authenticated'.
Expected EXECUTE granted ONLY to 'service_role'.
Catalog check failed with 1 security policy violation.
```

---

## 7. Local Infrastructure Containers (`docker ps`)

**Command:**
```powershell
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```
**Exit Code:** `0`  
**Real Trimmed Output:**
```text
NAMES                       IMAGE                     STATUS         PORTS
supabase-db-indian-jobs     supabase/postgres:17.2    Up 4 hours     0.0.0.0:54322->5432/tcp
supabase-kong-indian-jobs   kong:2.8.1                Up 4 hours     0.0.0.0:54321->8000/tcp
redis-indian-jobs           redis:7.2-alpine          Up 4 hours     0.0.0.0:6379->6379/tcp
```

---

## 8. Git Log and Remote Status

**Commands:**
```powershell
git status
git log --oneline -n 10
git diff --shortstat origin/main..HEAD
```
**Exit Code:** `0`  
**Real Trimmed Output:**
```text
On branch feat/public-slugs-id-02
Your branch is up to date with 'origin/feat/public-slugs-id-02'.
Untracked files:
	docs/audits/

00a5804 feat(slugs): ID-02 recreate public views without IDs and wire owner slug links
3f32a33 feat(profiles): ID-02 public slugs for opaque profile and job URLs
63c8cab fix(api): eliminate composed IDs, enforce database UUID generation and lockdown webhook ID checks
a99b182 fix(web): P1-2 eliminate fake success fallbacks and wire real mutations (#102)
a867400 feat(web): P0-1 implement safeJsonLd escaping and safeHttpUrl validation
7b4277e fix(test): align test harness with turnstile and P2 flag contracts, resolve web build imports
28a9d47 chore: drop committed tsbuildinfo files from git tracking
ad83949 feat(web): secure session cookie resolution, layout hydration, and workspace routing
c2eae6a feat(db): database catalog sync and production migration scripts
9ac6c12 feat(worker): harden background worker env validation and TLS configuration

250 files changed, 27357 insertions(+), 4247 deletions(-) vs origin/main (6ff404d)
```
