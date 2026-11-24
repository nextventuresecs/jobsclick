# Module 1 (Authentication & Ingress Security) Design Document

**Date:** 2026-11-19  
**Status:** Approved by Human Sponsor (Option A for all three recommendations)  
**Spec Baseline:** `docs/PRD.md` (v1.3 §6.1 AUTH-01 – AUTH-07) + `docs/decisions/001-client-decisions.md`

---

## 1. Intent & The Why

Authentication is the front door of the Indian Job Portal. In the target market (Madhya Pradesh MSMEs, colleges, blue/grey/white-collar job seekers), mobile phone numbers are the primary sovereign identity, but employers and urban job seekers also expect friction-free Google Sign-In and Email OTP login.

This module delivers a hardened, production-ready, multi-channel authentication system supporting:
1. **Phone Number + OTP** (MSG91 DLT-approved transactional SMS)
2. **Email Address + OTP** (Resend transactional email)
3. **Google Sign-In** (Supabase Auth OAuth)
4. **Mandatory Mobile Linking** for Google/Email accounts to guarantee platform-wide phone masking (PRD Invariant #1) and SMS notifications.
5. **Zero-Backdoor Security:** Elimination of mock guards, strict IP rate limiting via Upstash, and `HttpOnly __Host-` session cookies.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Multi-Channel Login:** Support Phone OTP, Email OTP, and Google OAuth with seamless session unification.
- **Strict Role Isolation:** Enforce `job_seeker` or `employer` role selection upfront; block self-signup as `admin`, `msme_admin`, or `intermediary`.
- **Phone-Anchored Identity:** Ensure every authenticated user record in PostgreSQL has a verified Indian mobile number (`+91XXXXXXXXXX`) before workspace access is granted.
- **Production Hardening:**
  - `FastifyAdapter({ trustProxy: true })` so Upstash rate limiting reads real client IPs behind Railway/Cloudflare reverse proxies.
  - Delete `TEST_AUTH_GUARD` injection from `JwtAuthGuard`.
  - Issue cryptographically secure 6-digit OTPs (`crypto.randomInt(100000, 1000000)`) with 5-minute TTL.

### Non-Goals
- Passwords or username logins (PRD explicitly mandates passwordless).
- WhatsApp OTP (explicitly out of scope for launch per `AGENTS.md`).
- Multi-factor authentication (MFA/TOTP) beyond single-channel OTP.

### Anti-Goals
- **No Split Identities:** An email user and a phone user belonging to the same person must not create duplicate conflicting profiles.
- **No Client-Side Role Trust:** Role claims must never be accepted from client headers or query parameters (`?role=`).
- **No Phone Leaks:** Phone numbers must remain completely hidden from employers and public endpoints under all circumstances.

---

## 3. Approved Architectural Choices (The Decisions)

### Decision 1: Mandatory Phone Linking (Option A)
- Users signing in via Google or Email OTP are authenticated with a temporary session state (`requires_phone_link: true`) if they lack a verified phone number.
- They are presented with a non-dismissible modal to enter and verify their mobile number via MSG91 OTP.
- Workspace routes reject access until `phone_verified` is true.

### Decision 2: Upfront Role Selection (Option A)
- `AuthModal` provides distinct tabs: **Job Seeker** and **Employer**.
- Google Sign-In button on the Seeker tab initiates OAuth with `role: 'job_seeker'`.
- Google Sign-In button on the Employer tab initiates OAuth with `role: 'employer'`.
- Role is passed securely via OAuth state and verified on the server during code exchange.

### Decision 3: Supabase Auth for Google OAuth (Option A)
- Next.js web client calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`.
- `/auth/callback` receives the provider token/session from Supabase and calls `POST /auth/oauth/exchange` on Fastify.
- Fastify verifies the Supabase token, ensures user record exists in `users` table, and sets the production `__Host-jobsclick-session` cookie.

---

## 4. System Components & Interfaces

```
                                  AUTH GATEWAY
                                       │
     ┌─────────────────────────────────┼─────────────────────────────────┐
     ▼                                 ▼                                 ▼
[Phone OTP]                      [Email OTP]                      [Google OAuth]
 • MSG91 DLT                      • Resend OTP                     • Supabase OAuth
 • E.164 (+91)                    • 6-digit cryptographic          • Role in state
 • 5/day limit                    • 5/day limit                    • Exchange API
     │                                 │                                 │
     └─────────────────────────────────┼─────────────────────────────────┘
                                       ▼
                       [Account Linking & Verification]
                        • Check if phone exists
                        • Prompt link if missing
                                       ▼
                       [Session Issuance (__Host- Cookie)]
                        • Fastify trustProxy
                        • Upstash Rate Limiter
                        • Zero Test Backdoors
```

### Endpoints (API)
1. `POST /auth/otp/send`: `{ phone: string, role?: SelfSignupRole, turnstileToken?: string }`
2. `POST /auth/otp/verify`: `{ phone: string, code: string, role?: SelfSignupRole }`
3. `POST /auth/email/send-otp`: `{ email: string, role?: SelfSignupRole, turnstileToken?: string }`
4. `POST /auth/email/verify-otp`: `{ email: string, code: string, role?: SelfSignupRole }`
5. `POST /auth/oauth/exchange`: `{ providerToken: string, role: SelfSignupRole }`
6. `POST /auth/link-phone/send`: `{ phone: string, turnstileToken?: string }` (Requires Auth Guard)
7. `POST /auth/link-phone/verify`: `{ phone: string, code: string }` (Requires Auth Guard)
8. `POST /auth/sign-out-all`: Revokes all sessions by incrementing `token_version`.
9. `GET /auth/me`: Returns current user identity `{ id, role, phone, email, phoneVerified, status }`.

---

## 5. Security & Invariant Checklist
- [x] Fastify `trustProxy: true` enabled in `apps/api/src/main.ts`.
- [x] Upstash IP rate limit: 20 requests/hour per client IP.
- [x] Phone & Email rate limit: 5 requests/day per identifier.
- [x] 60-second cooldown between consecutive OTP requests.
- [x] `TEST_AUTH_GUARD` removed from `JwtAuthGuard`.
- [x] `__Host-jobsclick-session` cookie configured with `HttpOnly`, `SameSite=Lax`, `Secure`.
- [x] Invariant #1: Phone and email never exposed in public or employer-facing responses.
