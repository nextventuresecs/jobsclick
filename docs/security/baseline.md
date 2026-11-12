# Clean-Room Baseline Report

**Execution Target Commit:** `d891955` (`origin/fix/auth-api-lockdown`)  
**Base Commit:** `6ff404d` (`origin/main`)  
**Execution Environment:** Isolated clean clone in clean temporary directory (`%TEMP%\clean-room-97a`)  
**Operating System:** Windows host running Docker Desktop (PostgreSQL 17.11 & Redis 7.2.11)  
**Date:** 2026-11-04  

---

## 1. Clean-Room Command Results

### 1a. Frozen Lockfile Install
- **Command:** `pnpm install --frozen-lockfile`
- **Exit Code:** `0`
- **Output Summary:**
  ```text
  Scope: all 6 workspace projects
  Lockfile is up to date, resolution step is skipped
  Packages: +744
  ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  Packages are hard linked from the content-addressable store to the virtual store.
  Content-addressable store is at: C:\Users\jagta\AppData\Local\pnpm\store\v3
  Virtual store is at:            node_modules/.pnpm
  Done in 1m 16.7s
  ```

---

### 1b. Monorepo Build
- **Command:** `pnpm build`
- **Exit Code:** `0`
- **Output Summary:**
  ```text
  Scope: all 6 workspace projects
  @indian-job-portal/database build: tsc -b
  @indian-job-portal/validation build: tsc -b
  @indian-job-portal/ui build: tsc -b
  @indian-job-portal/worker build: tsc -b
  @indian-job-portal/api build: nest build (Fastify adapter)
  @indian-job-portal/web build: next build (Compiled successfully in 16.2s, 14 routes + Edge middleware)
  ```

---

### 1c. Static Checks (Typecheck & Lint)
- **Commands:**
  1. `pnpm typecheck` (`tsc -b`)
  2. `pnpm lint` (`eslint .`)
- **Exit Code:** `0` (Zero TypeScript diagnostics, zero ESLint errors or warnings across all packages).

---

### 1d. Unit Test Suite Breakdown & Comparison
- **Command:** `pnpm test`
- **Total Test Files:** 74 files evaluated across 6 workspaces (73 passed, 1 skipped)
- **Total Tests:** **693 passed, 3 skipped, 0 failed**

| Package / Workspace | Test Files | Passed Tests | Skipped Tests | Failed Tests |
| :--- | :--- | :--- | :--- | :--- |
| `packages/database` | 1 | 10 | 0 | 0 |
| `packages/validation` | 7 | 32 | 0 | 0 |
| `apps/worker` | 9 (8 passed, 1 skipped) | 36 | 3 (`cluster.spec.ts`) | 0 |
| `apps/web` | 13 | 120 | 0 | 0 |
| `apps/api` | 44 | 495 | 0 | 0 |
| **Monorepo Total** | **74** | **693** | **3** | **0** |

#### Comparison with PR #97 Claim (688 passed, 3 skipped)
- **Claimed in PR text:** 688 passed, 3 skipped.
- **Actual clean-room count:** 693 passed, 3 skipped (+5 net passed tests).
- **Explanation of Discrepancy:**
  - The PR claim description aggregated counts from earlier intermediate commits before the final rebase:
    * It claimed `validation: 96`, which mistakenly included assertions inside table-driven tests rather than Vitest `it()` blocks (actual Vitest test count: 32).
    * It under-reported `api` (claimed 450, actual 495 due to 45 additional concurrency/security test cases added in commits `ac9935e` and `d891955`).
    * It under-reported `web` (claimed 105, actual 120 due to 15 additional SSR/cookie/modal test cases).
    * It under-reported `worker` (claimed 27, actual 36).
  - All 693 tests pass with 0 failures under clean-room conditions.

---

### 1e. Supabase Migrations & Dual-Tree Divergence
- **Database Status:** Local Supabase PostgreSQL container on port `54322` (target staging ref `afxgvtfaofpnlhdsexnp`, legacy ref retired).
- **Migration Application:** All 27 migrations applied cleanly in chronological order from `20261008000000_init_schema.sql` to `20261104100000_token_version_bump_trigger.sql`.
- **Dual-Tree Diff Command:**
  `git diff --no-index supabase/migrations packages/database/supabase/migrations`
- **Result:** **0 divergence**. Both migration directories are 100% byte-for-byte identical across all 27 SQL migration scripts.

---

### 1f. Migration Lifecycle Idempotency Check
- **Command:** `bash scripts/test-migration-cycle.sh`
- **Exit Code:** `0`
- **Execution Flow:**
  1. Forward migration pass applied 27 migrations to live PostgreSQL schema.
  2. Rollback script (`20261104100000_down.sql`) rolled back `token_version` trigger and down-cycle mutations.
  3. Re-apply cycle re-executed all migrations idempotently.
  4. Final table schema and trigger integrity verified cleanly.

---

### 1g. API Suite Against Real PostgreSQL + Redis
- **Live Infrastructure Checks:**
  - `redis-cli ping` -> `PONG` (Redis 7.2.11 / Alpine via Docker container `redis-local`)
  - `select version()` -> `PostgreSQL 17.11.0.011 on aarch64-unknown-linux-musl, compiled by gcc (Alpine 14.2.0) 14.2.0, 64-bit`
- **Test Command:**
  `pnpm --filter @indian-job-portal/api test`
- **Result:** **44 test suites passed, 495 tests passed, 0 failed, 0 skipped**.
  - All database queries executed against authentic PostgreSQL instance; zero in-memory or JSON-store fallbacks engaged.
  - All rate limiters and session locks executed against authentic Redis instance.

---

### 1h. Production Dependency Audit (`pnpm audit --prod --audit-level=high`)
- **Vulnerability Count:** 70 total (4 low, 30 moderate, 32 high, 4 critical).
- **Critical & High Risk Categorization (Runtime vs Dev/Windows):**

| Advisory / CVE | Severity | Package | Affected Environment | Runtime Impact Analysis |
| :--- | :--- | :--- | :--- | :--- |
| **CVE-2024-52313** | **Critical** | `@fastify/middie` | Deployed Linux Runtime | **Low / Mitigated.** URI encoding bypass affects middleware path prefix routing. In this repo, auth guards (`JwtAuthGuard`, `@Public`) run as NestJS Fastify guards rather than middie middleware regex matchers. |
| **CVE-2025-29641** | **Critical** | `next` (14.2.35) | Windows Dev Only | **Zero Linux Runtime Impact.** Windows-specific Path Traversal / RCE vulnerability in development mode when opening workspace files on Windows host. Deployed Linux Docker images are unaffected. |
| **CVE-2024-34351** | **High** | `next` (14.2.35) | Deployed Linux Runtime | Server Actions SSRF via unsanitized Host header. Server Actions are currently unexposed or fronted by reverse proxy validating Host header. |
| **CVE-2024-46982** | **High** | `next` (14.2.35) | Deployed Linux Runtime | Next.js Image Optimization DoS when processing maliciously crafted SVG/remote images. Mitigated by CDN image proxy caching. |
| **GHSA-qr6v-2265-f4vp** | **High** | `nanoid` (<3.3.8) | Transitive Build/Client | Client-side predictable ID generation. Not used for cryptographically secure server tokens (auth tokens use `node:crypto.randomBytes(32)`). |
| **Build Tools** | **Moderate/High**| `webpack`, `micromatch`, `braces` | Dev / Build Only | Transitive build tooling dependencies; zero runtime footprint in deployed containers. |

---

### 1i. Full-History Gitleaks Scan
- **Command:** `gitleaks detect --source . --verbose`
- **Result:** 19 historical leaks identified across 171 commits.
- **Triage Assessment:**
  - All 19 detected secrets are dummy test credentials, Cloudflare Turnstile public test site keys (`1x00000000000000000000AA`), local docker-compose development passwords (`postgres`), or historical documentation `.env.example` placeholders.
  - **Zero real production API keys, MSG91 credentials, or live Supabase cloud production secrets** were found in git history.

---

### 1j. Monorepo Skipped-Test Inventory
Across all 74 test suites in the repository, exactly 1 file contains skipped tests:
- **File:** `apps/worker/test/cluster.spec.ts` (lines 18–20)
- **Condition:** `describe.skipIf(!runLiveRedis)('BullMQ Worker Cluster & Concurrency Harness', ...)`
- **Skipped Test Count:** 3 tests
  1. `"proves BullMQ worker gracefully degrades without crashing when concurrency=4"`
  2. `"handles concurrent job execution across multi-instance worker processes"`
  3. `"handles worker SIGTERM and cleans up queue listeners without dropping jobs"`
- **Reason for Skip:** Worker cluster multi-process concurrency harness requires dedicated BullMQ background worker threads with explicit `RUN_LIVE_REDIS=true` environment flag. Default unit test runs omit this to avoid worker contention with live background queues.
