# PR #97a Evidence Matrix & Deliverables Verification

**Target PR / Branch:** PR #97 / `fix/auth-api-lockdown` (`origin/fix/auth-api-lockdown` at commit `d891955`)  
**Base Commit:** `6ff404d` (`origin/main`)  
**Evaluation Standard:** Independent empirical verification with zero "unknown" entries.

---

## 1. Steps 0–7 Verification Matrix

| Step / Requirement | Status | Source Location (`file:line`) | Verification Proof / Test Name | Notes & Technical Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Step 0: Frozen lockfile in every Dockerfile** | **Verified** | `Dockerfile:11`<br>`apps/api/Dockerfile:11`<br>`apps/web/Dockerfile:11`<br>`apps/worker/Dockerfile:11` | Clean-room `pnpm install --frozen-lockfile` | All 4 production Dockerfiles execute `RUN pnpm install --frozen-lockfile`. |
| **Step 0: No `MINIMUM_RELEASE_AGE=0`** | **Not found** | `Dockerfile:5`<br>`apps/api/Dockerfile:5`<br>`apps/web/Dockerfile:5`<br>`apps/worker/Dockerfile:5` | Inspection of Dockerfile lines 5 | **Defect:** `ENV PNPM_CONFIG_MINIMUM_RELEASE_AGE=0` is still present across all 4 Dockerfiles in PR 97a. |
| **Step 0: `.dockerignore` exists** | **Verified** | `.dockerignore:1-25` | `git ls-files .dockerignore` | Contains rules for `node_modules`, `.next`, `dist`, `.env*`, etc. |
| **Step 0: No tracked `tsbuildinfo`** | **Not found** | `packages/database/tsconfig.tsbuildinfo`<br>`packages/ui/tsconfig.tsbuildinfo`<br>`packages/validation/tsconfig.tsbuildinfo` | `git ls-tree -r origin/fix/auth-api-lockdown` | **Defect:** Three `tsconfig.tsbuildinfo` build artifact files remain tracked in git tree. |
| **Step 0: Compose has no `container_name`** | **Not found** | `docker-compose.yml:4,22,38,62,80` | `git grep -n 'container_name' docker-compose.yml` | **Defect:** `container_name` remains defined (`jobsclick_postgres`, `jobsclick_redis`, `jobsclick_api`, etc.), breaking multi-tenant and parallel compose spins. |
| **Step 0: CI starts real services** | **Verified** | `.github/workflows/ci.yml:14-25, 62-66` | GitHub Actions workflow execution | Runs real Redis container service (`redis:7-alpine`) and boots local Supabase CLI stack (`supabase start`). |
| **Step 0: CI builds `apps/web`** | **Partial** | `.github/workflows/ci.yml:78` | `pnpm build` in CI `verify` job | CI `verify` runs `pnpm build` (which builds `apps/web`), but the `container-build` job (lines 80-108) only packages `apps/api` and `apps/worker` Docker images, omitting `apps/web`. |
| **Step 1: JWT_SECRET boot assertion** | **Verified** | `apps/api/src/config/env.ts:187-193` | `apps/api/src/config/env.spec.ts:44` (`rejects missing JWT_SECRET in production`) | Enforces ≥32 characters and rejects known placeholders in production/staging. |
| **Step 1: OTP_PEPPER distinct from JWT_SECRET** | **Verified** | `apps/api/src/config/env.ts:195-206` | `apps/api/src/config/env.spec.ts:60` (`rejects identical JWT_SECRET and OTP_PEPPER`) | Enforces distinct keys with ≥32 characters each. |
| **Step 1: SMS live mode boot assertion** | **Verified** | `apps/api/src/config/env.ts:208-211` | `apps/api/src/config/env.spec.ts:102` (`requires SMS_GATEWAY_MODE=live`) | Requires `SMS_GATEWAY_MODE=live` and valid `MSG91_AUTH_KEY` in production. |
| **Step 1: Turnstile secret not a test key** | **Verified** | `apps/api/src/config/env.ts:219-225` | `apps/api/src/config/env.spec.ts:145` (`rejects Cloudflare test keys for Turnstile`) | Rejects Cloudflare test keys (`1x0000...`, `2x0000...`, `3x0000...`) in production/staging. |
| **Step 1: Dev/test flags unset (`USE_JSON_STORE`, `USE_MOCK_REDIS`, `VITEST`)** | **Verified** | `apps/api/src/config/env.ts:233-242` | `apps/api/src/config/env.spec.ts:180` (`rejects test flags in production`) | Explicitly throws if `USE_MOCK_REDIS`, `VITEST`, or `USE_JSON_STORE` are present in production. |
| **Step 1: `rediss://` TLS URL enforced in production** | **Verified** | `apps/api/src/config/env.ts:173-178` | `apps/api/src/config/env.spec.ts:75` (`requires rediss:// unless REDIS_ALLOW_PLAINTEXT=1`) | Enforces encrypted TLS connection unless explicit plaintext override is enabled. |
| **Step 1: DB & Service role keys not dummy** | **Verified** | `apps/api/src/config/env.ts:227-231` | `apps/api/src/config/env.spec.ts:165` (`rejects placeholder SUPABASE_SERVICE_ROLE_KEY`) | Rejects dummy or placeholder strings in database credentials. |
| **Step 1: `SUPABASE_SECRET_KEY` no longer a JWT secret fallback** | **Verified** | `apps/api/src/config/env.ts:187-193` | `apps/api/src/config/env.spec.ts:496` (`no production file references SUPABASE_SECRET_KEY as JWT secret source`) | Direct decoupling complete; `SUPABASE_SECRET_KEY` is never used as fallback for `JWT_SECRET`. |
| **Step 1: No `rejectUnauthorized:false`** | **Not found** | `apps/worker/src/main.ts:68`<br>`scripts/execute-migration.ts:20` | `git grep -n 'rejectUnauthorized'` | **Defect:** `rejectUnauthorized: false` remains active in Worker Redis TLS setup and migration executor. |
| **Step 1: No hardcoded `'jobsclick-jwt-secret-key'`** | **Partial** | `apps/web/src/lib/auth-session.ts:57`<br>`apps/api/test/admin-rbac.spec.ts:16` | `git grep -n 'jobsclick-jwt-secret-key'` | Removed from `apps/api/src`, but still present in `apps/web/src/lib/auth-session.ts` fallback and test files. |
| **Step 1: `.env.example` has no real DSN or always-pass key** | **Verified** | `.env.example:1-45` | `apps/api/src/config/env.spec.ts:80` (`asserts .env.example fails production validation`) | Uses generic documentation placeholders (`example_jwt_secret_min_32_chars...`); zero real DSNs. |
| **Step 2: No `'123456'` or `'987654321'` in non-test src** | **Verified** | All `apps/*/src/` and `packages/*/src/` | `apps/api/test/otp-predictability.spec.ts:28` (`greps non-test source for static OTP patterns`) | Clean grep across all production source files; restricted strictly to test fixtures. |
| **Step 2: `OtpGenerator` injectable** | **Verified** | `apps/api/src/auth/otp-generator.service.ts:1-15`<br>`apps/api/src/auth/auth.service.ts:38` | `apps/api/test/otp-predictability.spec.ts:35` (`proves OtpGenerator can be mocked in test container`) | `@Inject(OtpGenerator)` injected into `AuthService` constructor. |
| **Step 2: OTP and full phone never logged** | **Verified** | `apps/api/src/common/mask.ts:1-25`<br>`apps/api/src/auth/auth.service.ts:114` | `apps/api/test/otp-predictability.spec.ts:55` (`asserts masked phone logged without OTP digits`) | Uses `maskPhone` (`98****3210`); zero plain OTPs logged. |
| **Step 2: Test proving 123456 returns 401** | **Verified** | `apps/api/test/otp-predictability.spec.ts:44` | `it('strictly rejects predictable static OTP 123456 with 401 Unauthorized when random OTP was dispatched')` | Confirmed passing; mutation spot-check confirms failure when static bypass was injected. |
| **Step 3: Role allowlist** | **Verified** | `packages/validation/src/auth.ts:39`<br>`apps/api/src/auth/auth.service.ts:193` | `packages/validation/test/auth.test.ts:70` (`strictly rejects non-self-signup roles in VerifyOtpSchema`) | Only `job_seeker` and `employer` permitted for self-signup. |
| **Step 3: Enum duplicates** | **Verified** | `packages/database/.../init_schema.sql:4`<br>`packages/validation/src/auth.ts:47,60` | `packages/validation/test/auth.test.ts:145` (`validates SelfSignupRoleSchema and UserRoleSchema`) | Explicit separation: `UserRole` (Postgres DB enum) and `ClientRole` (UI route enum) mapped cleanly via `CLIENT_TO_BACKEND_ROLE_MAP`. |
| **Step 3: Phone normalise-vs-reject behaviour** | **Verified** | `packages/validation/src/auth.ts:7-32` | `packages/validation/test/auth.test.ts:15` (`normalizes valid Indian phone formats`) | **Behaviour:** Normalises prefixes (`+91`, `91`, `0091`, `0`, spaces, hyphens) to 10 digits; strictly **rejects** numbers not starting with `[6-9]` or with invalid digit counts. |
| **Step 3: `AddEmail` max length** | **Verified** | `packages/validation/src/auth.ts:149-156` | `packages/validation/test/auth.test.ts:125` (`enforces max length 254 on AddEmailSchema`) | Strictly enforces `.max(254)` RFC 5321 length cap. |
| **Step 4: Guard claims (`exp`, `iss`, `aud`, `tv`, `jti`)** | **Verified** | `apps/api/src/auth/jwt.service.ts:35-85`<br>`apps/api/src/auth/guards/jwt-auth.guard.ts:55-90` | `apps/api/test/jwt-guard-hardening.spec.ts:30-100` (`validates all 5 mandatory claims`) | All 5 claims verified cryptographically on every authenticated request. |
| **Step 4: Cross-instance sign-out-all** | **Verified** | `apps/api/src/auth/auth.service.ts:380`<br>`apps/api/src/auth/guards/jwt-auth.guard.ts:104` | `apps/api/test/auth-server-state-lockdown.spec.ts:200` (`Cross-Instance Single Sign-Out`) | Increments `token_version` in DB and updates Redis auth state, invalidating active tokens across instances. |
| **Step 4: Disabled user cannot log back in via OTP** | **Verified** | `apps/api/src/auth/auth.service.ts:176-179` | `apps/api/test/auth-server-state-lockdown.spec.ts:330` (`Account Disabling across instances`) | Throws `UnauthorizedException('Account is disabled or suspended')` before issuing JWT. |
| **Step 4: Role change takes effect on next request** | **Verified** | `apps/api/src/auth/guards/jwt-auth.guard.ts:130-145` | `apps/api/test/auth-server-state-lockdown.spec.ts:440` (`Server-Side Dynamic Role Mutation`) | DB trigger increments `token_version` on role mutation; next request using old token fails with 401. |
| **Step 4: Redis auth:state refresh on role/status writes** | **Partial** | `apps/api/src/admin/admin.service.ts:95,118`<br>`apps/api/src/database/repositories/user.repository.ts:208,232` | `apps/api/test/auth-server-state-lockdown.spec.ts:458` | **Finding:** Code paths writing `users.role` or `users.status` do **NOT** proactively refresh/delete Redis `auth:state`. They rely on PostgreSQL trigger bumping `token_version` in DB and the 300s Redis cache TTL. Test line 458 explicitly had to invoke `await otpRedisA.deleteAuthState()` manually. |
| **Step 5: Lua atomic limiter** | **Verified** | `apps/api/src/auth/otp-redis.service.ts:8-50` (`CHECK_AND_INCREMENT_OTP_LIMITS_LUA`) | `apps/api/test/otp-ratelimit-concurrency.spec.ts:155` (`atomic Lua script strictly permits 1`) | Atomic Lua execution prevents check-then-set race conditions across multiple API instances. |
| **Step 5: Per-(ip,phone) limit** | **Verified** | `apps/api/src/auth/otp-redis.service.ts:30-35, 48-50` | `apps/api/test/otp-ratelimit-concurrency.spec.ts:240` (`per-(ip,phone) daily cap`) | Key `auth:ip_phone:${ip}:${phone}` caps SMS attempts per client-target pair. |
| **Step 5: Global throttler** | **Verified** | `apps/api/src/app.module.ts:55`<br>`apps/api/src/auth/auth.controller.ts:70` | `apps/api/test/rate-limit.spec.ts:45` | `@Throttle({ default: { limit: 10, ttl: 60000 } })` on public endpoints. |
| **Step 5: Turnstile required in prod** | **Verified** | `apps/api/src/auth/auth.service.ts:105-108` | `apps/api/test/sms-turnstile.spec.ts:60` (`rejects missing turnstileToken in production`) | Enforces Turnstile token validation whenever `NODE_ENV === 'production'`. |
| **Step 5: CF-Connecting-IP trusted only from trusted peers** | **Verified** | `apps/api/src/common/ip-normalizer.ts:15-45` | `apps/api/test/proxy-cidr-normalizer.spec.ts:25` (`ignores CF-Connecting-IP from untrusted peers`) | Validates socket remote address against `TRUSTED_PROXY_CIDRS` before trusting headers. |
| **Step 5: Upstash path removed** | **Verified** | `apps/api/src/auth/otp-redis.service.ts:3` | `apps/api/src/config/env.spec.ts:533` (`no production file imports @upstash/ratelimit`) | Swapped entirely to standard `ioredis` with Lua scripting; `@upstash/ratelimit` eliminated. |
| **Step 6: Atomic verify Lua** | **Verified** | `apps/api/src/auth/otp-redis.service.ts:52-85` (`VERIFY_AND_CONSUME_OTP_LUA`) | `apps/api/test/otp-parallel-guessing.spec.ts:70` (`proves atomic verify under concurrency`) | Atomic verify script locks out brute force at 3 failed attempts in single round-trip. |
| **Step 6: Phone-bound HMAC** | **Verified** | `apps/api/src/auth/otp-redis.service.ts:292-295` | `apps/api/test/otp-predictability.spec.ts:75` (`HMAC bound to pepper and phone`) | Hashes `${phone}:${otp}` with `OTP_PEPPER` preventing cross-phone OTP substitution. |
| **Step 6: Per-IP verify limiter** | **Verified** | `apps/api/src/auth/otp-redis.service.ts:65-70` | `apps/api/test/otp-parallel-guessing.spec.ts:100` (`per-IP verify attempt cap`) | Key `auth:verify_ip:${ip}` throttles brute-force guessing per IP address. |
| **Step 7: User repository has no fake-store branch** | **Verified** | `apps/api/src/database/repositories/user.repository.ts:1-260` | `apps/api/test/user-repository-contract.spec.ts:40` | Uses Supabase PostgreSQL client directly; zero `USE_JSON_STORE` branches. |
| **Step 7: `gen_random_uuid` IDs** | **Verified** | `packages/database/.../20261103000000_user_mutations.sql:15` | `packages/database/test/schema.spec.ts:20` | Database schema enforces `DEFAULT gen_random_uuid()` on primary key. |
| **Step 7: Invited-to-active grants starter credits once** | **Verified** | `packages/database/.../20261103000000_user_mutations.sql:45-75` | `apps/api/test/user-mutations-concurrency.spec.ts:85` (`concurrent activation grants exactly 1 starter credit`) | Enforced by PostgreSQL trigger `grant_starter_credits_on_activation()`; idempotent across concurrent calls. |
| **Step 7: Email verify flow** | **Verified** | `apps/api/src/auth/auth.service.ts:260-310`<br>`apps/api/src/auth/auth.controller.ts:59-67` | `apps/api/test/email-verification.spec.ts:40` (`adds pending email and verifies token`) | Validates `pending_email`, issues HMAC token, and updates `email_verified_at`. |
| **Step 7: No fabricated profile fallbacks** | **Verified** | `apps/api/src/database/repositories/profile.repository.ts:25-45` | `apps/api/test/profiles.spec.ts:50` (`returns 404 for unknown profile without mock fallback`) | Returns `null` / `NotFoundException` when profile does not exist. |

---

## 2. Inventory of Commits NOT Part of Steps 0–7

The following 5 commits in PR #97a (`origin/fix/auth-api-lockdown`) contain work outside the strict scope of Steps 0–7 (belonging to Step 97b, web frontend, or admin management):

### Commit 1: `ec38ea2` — Web Session Cookie Resolution & Workspace Routing
- **Files Modified:**
  - `apps/web/src/lib/auth-session.ts`
  - `apps/web/src/middleware.ts`
  - `apps/web/src/app/(portal)/layout.tsx`
  - `apps/web/src/components/auth/user-nav.tsx`
- **Scope Alignment:** Belongs to **PR 97b** (Web session hydration & edge middleware).

### Commit 2: `a6aad17` — DPDP Client Consent Checkbox & Modal
- **Files Modified:**
  - `apps/web/src/components/auth/AuthModal.tsx`
  - `apps/web/src/components/auth/OtpVerifyStep.tsx`
- **Scope Alignment:** Belongs to **PR 97b** (Web frontend consent flow).

### Commit 3: `07ae149` — Google Sign-In Feature Flag UI Gate
- **Files Modified:**
  - `apps/web/src/components/auth/AuthModal.tsx`
- **Scope Alignment:** Belongs to **PR 97b** (Web frontend auth modal).

### Commit 4: `bfd6a98` — Admin User Role Update Endpoint
- **Files Modified:**
  - `apps/api/src/admin/admin.controller.ts`
  - `apps/api/src/admin/admin.service.ts`
  - `apps/api/src/admin/dto/admin-user.dto.ts`
- **Scope Alignment:** Belongs to **Admin Management Feature / Post-97a**.

### Commit 5: `d891955` — Admin Role Updates Hardening & Migration Cycle Script
- **Files Modified:**
  - `apps/api/src/admin/admin.service.ts`
  - `scripts/test-migration-cycle.sh`
- **Scope Alignment:** Admin logic belongs to Admin Management; `scripts/test-migration-cycle.sh` belongs to Tooling/CI.
