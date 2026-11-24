# Module 1 (Authentication & Ingress Security) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a hardened, production-ready multi-channel authentication system supporting Phone OTP (MSG91 DLT), Email OTP (Resend), Google OAuth (Supabase Auth), mandatory phone linking for Google/Email users, and zero test-backdoor ingress security.

**Architecture:** Fastify backend with `{ trustProxy: true }` verifies Cloudflare Turnstile tokens, enforces Upstash Redis rate limits (IP and phone/email caps), issues cryptographic 6-digit OTPs, exchanges Supabase Google tokens, and sets `HttpOnly __Host-` session cookies. Web client features a role-segregated `AuthModal` (Seeker / Employer tabs) with seamless phone-linking enforcement.

**Tech Stack:** NestJS, Fastify, Supabase Auth / PostgreSQL, Upstash Redis, MSG91, Resend, Next.js 15 App Router, Zod.

**Spec:** [docs/superpowers/specs/2026-11-19-module-1-auth-design.md](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/docs/superpowers/specs/2026-11-19-module-1-auth-design.md)

---

## Global Constraints

- **PRD AUTH-01:** Passwordless mobile OTP authentication. No passwords permitted anywhere in the system.
- **PRD Invariant #1:** Candidate and employer phone numbers and emails must never be exposed across public or employer-facing responses.
- **PRD Invariant #4:** Upstash rate limit of 20 requests/hour per client IP, 5 OTPs/day per phone or email, 60-second cooldown between OTP sends.
- **AGENTS.md Constraint #10:** Zero secrets in code; environment variables validated at startup.
- **AGENTS.md Constraint #11:** Zero TypeScript errors (`tsc --noEmit`) and zero ESLint errors (`pnpm lint`) before any commit.

---

## Review Focus

1. **Proxy IP Resolution:** When behind Railway or Cloudflare reverse proxies, requests must not share a single container IP for rate limiting.
2. **Backdoor Elimination:** `JwtAuthGuard` must reject unauthenticated requests even if `x-user-id` or mock tokens are present.
3. **Identity Unification:** A user signing in with Google or Email who has an existing phone record must link to that user rather than creating a duplicate.
4. **Mandatory Phone Enactment:** Users without a verified phone number must be blocked from workspace queries until phone OTP verification completes.
5. **Token Revocation:** `POST /auth/sign-out-all` must increment `token_version` in PostgreSQL, immediately invalidating all active sessions across devices.

---

### Task 1: Ingress Hardening & Guard Backdoor Elimination

**Files:**
- Modify: `apps/api/src/main.ts:20-40`
- Modify: `apps/api/src/auth/guards/jwt-auth.guard.ts:25-50`
- Test: `apps/api/test/auth-guard-hardening.spec.ts`

**Interfaces:**
- Consumes: Fastify `FastifyAdapter`, NestJS `CanActivate`
- Produces: Hardened `JwtAuthGuard` rejecting all mock auth headers; Fastify configured with `trustProxy: true`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/test/auth-guard-hardening.spec.ts
import { describe, it, expect } from 'vitest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('JwtAuthGuard Hardening', () => {
  it('rejects x-user-id header and mock tokens without valid JWT signature', async () => {
    const guard = new JwtAuthGuard({} as any, {} as any);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-user-id': 'usr_attacker', authorization: 'Bearer jwt_session_forged' },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/api test test/auth-guard-hardening.spec.ts`  
Expected: FAIL (guard permits mock auth or testAuthGuard).

- [ ] **Step 3: Implement `trustProxy: true` in `main.ts` and remove test guard injection in `jwt-auth.guard.ts`**

In `apps/api/src/main.ts`:
```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy: true }),
);
```

In `apps/api/src/auth/guards/jwt-auth.guard.ts`:
Remove `@Optional() @Inject(TEST_AUTH_GUARD) private readonly testAuthGuard?: CanActivate`. Ensure `canActivate()` strictly validates the JWT against `authService.verifyJwtSession(token)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/api test test/auth-guard-hardening.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/auth/guards/jwt-auth.guard.ts apps/api/test/auth-guard-hardening.spec.ts
git commit -m "fix(auth): AUTH-05 enable Fastify trustProxy and remove JwtAuthGuard test bypass"
```

---

### Task 2: Email OTP Service & Validation Schemas

**Files:**
- Modify: `packages/validation/src/auth.ts:1-60`
- Create: `apps/api/src/auth/email-otp.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts:15-45`
- Test: `apps/api/test/email-otp.spec.ts`

**Interfaces:**
- Consumes: `ResendService`, `@upstash/ratelimit`, `packages/validation`
- Produces: `SendEmailOtpSchema`, `VerifyEmailOtpSchema`, `EmailOtpService.sendOtp(email)`, `EmailOtpService.verifyOtp(email, code)`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/test/email-otp.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { EmailOtpService } from '../src/auth/email-otp.service.js';

describe('EmailOtpService', () => {
  it('generates cryptographic 6-digit OTP and verifies valid code', async () => {
    const mockEmailService = { sendEmail: vi.fn().mockResolvedValue({ id: 'msg_123' }) };
    const mockRedis = new Map<string, string>();
    const service = new EmailOtpService(mockEmailService as any, mockRedis as any);

    const sendRes = await service.sendOtp('candidate@example.com');
    expect(sendRes.success).toBe(true);
    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'candidate@example.com' })
    );

    const verifyRes = await service.verifyOtp('candidate@example.com', sendRes.codeForTest);
    expect(verifyRes.verified).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/api test test/email-otp.spec.ts`  
Expected: FAIL (module or service not found).

- [ ] **Step 3: Implement Zod schemas and `EmailOtpService`**

In `packages/validation/src/auth.ts`:
Add:
```typescript
export const SendEmailOtpSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: SelfSignupRoleSchema.optional(),
  turnstileToken: z.string().optional(),
});
export const VerifyEmailOtpSchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  role: SelfSignupRoleSchema.optional(),
});
export const LinkPhoneSchema = z.object({
  phone: IndianPhoneSchema,
  turnstileToken: z.string().optional(),
});
```

In `apps/api/src/auth/email-otp.service.ts`:
Implement cryptographic OTP generation, storage in Redis with 300s TTL, and rate limiting (5 per 24 hours).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/api test test/email-otp.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/auth.ts apps/api/src/auth/email-otp.service.ts apps/api/src/auth/auth.module.ts apps/api/test/email-otp.spec.ts
git commit -m "feat(auth): AUTH-04 add EmailOtpService with cryptographic 6-digit codes and Zod schemas"
```

---

### Task 3: Backend Multi-Channel Auth Endpoints & Phone Linking

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts:40-140`
- Modify: `apps/api/src/auth/auth.service.ts:50-250`
- Test: `apps/api/test/auth-multichannel.e2e-spec.ts`

**Interfaces:**
- Consumes: `EmailOtpService`, `SmsService`, `SupabaseClient`
- Produces: `POST /auth/email/send-otp`, `POST /auth/email/verify-otp`, `POST /auth/oauth/exchange`, `POST /auth/link-phone/send`, `POST /auth/link-phone/verify`

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/api/test/auth-multichannel.e2e-spec.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';

describe('Auth Endpoints (Email & OAuth Exchange)', () => {
  it('POST /auth/email/send-otp validates email and dispatches OTP', async () => {
    const res = await request(globalThis.app.getHttpServer())
      .post('/auth/email/send-otp')
      .send({ email: 'test.seeker@example.com', role: 'job_seeker' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /auth/oauth/exchange returns session with requires_phone_link flag', async () => {
    const res = await request(globalThis.app.getHttpServer())
      .post('/auth/oauth/exchange')
      .send({ providerToken: 'valid_mock_token', role: 'job_seeker' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toHaveProperty('requiresPhoneLink', true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/api test test/auth-multichannel.e2e-spec.ts`  
Expected: FAIL (endpoints return 404).

- [ ] **Step 3: Implement endpoints in `auth.controller.ts` and `auth.service.ts`**

- `POST /auth/email/send-otp`: validates Turnstile, checks rate limit, calls `emailOtpService.sendOtp`.
- `POST /auth/email/verify-otp`: verifies code, finds or creates user record in `users` table with `email` and `email_verified: true`. If `phone` is empty, sets `requiresPhoneLink: true` in payload.
- `POST /auth/oauth/exchange`: verifies Supabase token, extracts email and name, creates user if missing, returns JWT with role and `requiresPhoneLink` flag.
- `POST /auth/link-phone/send` and `POST /auth/link-phone/verify`: protected by `@UseGuards(JwtAuthGuard)`, verifies SMS OTP and sets `phone = :phone, phone_verified = true` on the current user row.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/api test test/auth-multichannel.e2e-spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.service.ts apps/api/test/auth-multichannel.e2e-spec.ts
git commit -m "feat(auth): AUTH-01 AUTH-02 add email OTP, Google OAuth exchange, and phone linking endpoints"
```

---

### Task 4: Web Frontend AuthModal, Google Sign-In & LinkPhoneModal

**Files:**
- Modify: `apps/web/src/components/auth/AuthModal.tsx:40-200`
- Create: `apps/web/src/components/auth/LinkPhoneModal.tsx`
- Modify: `apps/web/src/app/auth/callback/page.tsx:20-75`
- Modify: `apps/web/src/context/AppContext.tsx:30-100`
- Test: `apps/web/test/auth-modal.test.tsx`

**Interfaces:**
- Consumes: Next.js router, Supabase client (`supabase.auth.signInWithOAuth`), backend API endpoints.
- Produces: Seamless modal UI with Phone OTP, Email OTP, Role-specific Google button, and non-dismissible Phone Linking modal.

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/web/test/auth-modal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthModal } from '../src/components/auth/AuthModal';
import { describe, it, expect, vi } from 'vitest';

describe('AuthModal Multi-Channel UI', () => {
  it('renders Phone OTP, Email OTP, and role-anchored Google button on Seeker tab', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Continue with Google/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter 10-digit mobile number/i)).toBeInTheDocument();
    
    // Switch to Email tab
    fireEvent.click(screen.getByRole('button', { name: /Use Email/i }));
    expect(screen.getByPlaceholderText(/Enter your email address/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/web test test/auth-modal.test.tsx`  
Expected: FAIL (Email tab not present).

- [ ] **Step 3: Implement `AuthModal.tsx`, `LinkPhoneModal.tsx`, and `AppContext.tsx`**

- In `AuthModal.tsx`:
  - Add channel switcher: "Mobile OTP" | "Email OTP".
  - Add role-anchored Google Sign-In button: initiates `supabase.auth.signInWithOAuth({ provider: 'google', options: { queryParams: { role: activeTab } } })`.
- In `auth/callback/page.tsx`:
  - Exchange code on `${apiBaseUrl}/auth/oauth/exchange`.
  - Set `__Host-` session cookie via `/api/auth/session`.
  - If response indicates `user.requiresPhoneLink === true`, trigger `openLinkPhoneModal()`.
- In `LinkPhoneModal.tsx`:
  - Non-dismissible dialog prompting the user for their Indian mobile number and OTP before redirecting to workspace.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/web test test/auth-modal.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/auth/AuthModal.tsx apps/web/src/components/auth/LinkPhoneModal.tsx apps/web/src/app/auth/callback/page.tsx apps/web/src/context/AppContext.tsx apps/web/test/auth-modal.test.tsx
git commit -m "feat(web): AUTH-01 AUTH-02 implement multi-channel AuthModal and LinkPhoneModal"
```

---

### Task 5: Full Module 1 Verification & Quality Gate

**Files:**
- Test: `apps/api/test/auth-production-verification.e2e-spec.ts`
- Script: `scripts/verify-module-1.ts`

**Interfaces:**
- Consumes: Live local Supabase Postgres, Redis, Fastify server
- Produces: 100% clean test suite, typecheck, and lint verification.

- [ ] **Step 1: Write the end-to-end multi-channel verification suite**

Verify:
1. Mobile Phone + OTP: Sign up, verify OTP, verify DB row creation, inspect `__Host-` cookie.
2. Email + OTP: Request code, verify code, link mobile phone via OTP, inspect final active user record.
3. Google OAuth exchange: Verify Supabase token exchange, role validation, phone linking gate.
4. Proxy rate limit: Send 21 requests with `x-forwarded-for: 203.0.113.1` and assert request 21 returns HTTP 429 Too Many Requests.
5. Sign-out-all: Call `/auth/sign-out-all`, assert existing token returns HTTP 401.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`  
Expected: ALL Module 1 tests pass.

- [ ] **Step 3: Run monorepo typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`  
Expected: 0 TypeScript errors, 0 ESLint errors across all packages.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/auth-production-verification.e2e-spec.ts
git commit -m "test(auth): AUTH-01 AUTH-03 verify complete multi-channel authentication gate"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-19-module-1-auth.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend Native**, because the tasks are tightly coupled around shared auth session cookies and Fastify adapter configuration, and executing them in a single coordinated session with immediate local verification is the fastest path toward hitting your 3-day deadline. Does the plan capture what you want, and which approach should we use?
