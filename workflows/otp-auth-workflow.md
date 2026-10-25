# Product Specification: Distributed OTP Authentication & Abuse Prevention Engine

- **Workflow ID**: `WORKFLOW-AUTH-OTP-01`
- **Spec Type**: Technical & Functional Specification (Loop Engineering Model)
- **Status**: Decision-Complete / Ready for Implementation
- **PRD Requirements**: `AUTH-01`, `AUTH-03`, `ADM-05`, `NOT-01`
- **Security Audit Remediation**: `STF-03` (Volatile in-memory OTP store & rate limiter)
- **Hard Invariants**: Hard Invariant #4 (OTP Abuse Prevention & Daily Cap)

---

## 1. Overview & Business Context

While telecom DLT templates are under verification by Indian cellular operators, the platform requires an **enterprise-grade, distributed OTP authentication subsystem**. This specification decouples the SMS delivery gateway from the core authentication engine.

All critical application security controls—distributed Redis session persistence, 3-tier rate limiting (Phone, IP, Turnstile), brute-force lockout, and daily spend monitoring—are designed to run immediately with a multi-driver gateway (`mock` | `sandbox` | `msg91`).

---

## 2. Core Loops Architecture (Loop Engineering)

The OTP lifecycle is modeled as four distinct, deterministic loops:

```
[ Loop 1: Request & Dispatch Loop ]
      │
      ▼
[ Loop 2: Abuse & Fraud Guard Loop ] ── (Per-IP / Per-Phone / Turnstile)
      │
      ▼
[ Loop 3: Verification & Session Issuance Loop ] ── (Redis Atomic Verification & Attempt Counter)
      │
      ▼
[ Loop 4: Daily Spend & Quota Monitoring Loop ] ── (Segment Cost Accumulator & Sentry Alert)
```

---

### Loop 1: Outbound Dispatch Loop

- **Trigger**: Client `POST /auth/send-otp` with `{ phone, turnstileToken, language }`.
- **Pre-Conditions**:
  1. Phone matches Indian 10-digit format (`^[6-9]\d{9}$`).
  2. Abuse Guard (Loop 2) evaluates `PASS`.
  3. Spend Guard (Loop 4) evaluates `WITHIN_BUDGET`.
- **Execution Steps**:
  1. Check if phone is in temporary lockout key: `auth:lockout:{phone}`. If present, throw `429 Too Many Requests` with remaining lockout seconds.
  2. Generate 6-digit cryptographic numeric OTP (`crypto.randomInt(100000, 1000000).toString()`).
  3. Store hashed OTP in Redis:
     - Key: `auth:otp:{phone}`
     - Hash: SHA-256 of OTP code + salt.
     - TTL: 600 seconds (10 minutes).
     - Field `attempts`: initialized to 0.
  4. Dispatch via Active Gateway Driver:
     - **QA Test Range** (`+919876543210` - `+919876543219`): Force OTP code `123456`, skip outbound HTTP.
     - **Sandbox Mode** (`SMS_GATEWAY_MODE=sandbox`): Log OTP to server logger (`[SMS Sandbox] +91{phone}: {otp}`), return simulated success.
     - **Live MSG91 Mode** (`SMS_GATEWAY_MODE=live`): Issue outbound POST to `https://control.msg91.com/api/v5/otp` with registered `template_id`.
  5. Set 60-second cooldown key in Redis: `auth:cooldown:{phone}` with TTL=60s.
  6. Increment daily request counter: `auth:daily_count:{phone}:{YYYY-MM-DD}` with TTL=86400s.
- **Output Brief**: `{ success: true, message: "OTP sent successfully", cooldownSeconds: 60 }`.

---

### Loop 2: Abuse & Fraud Guard Loop

- **Trigger**: Sub-routine invoked synchronously prior to OTP generation in Loop 1.
- **Rules & Sliding Windows**:
  1. **Turnstile Bot Challenge**:
     - Mandatory in production and when `turnstileToken` is provided.
     - Verify against Cloudflare API `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
     - Fails with `400 Bad Request` if invalid or replayed.
  2. **Per-Phone Cooldown & Daily Cap**:
     - *Cooldown*: Key `auth:cooldown:{phone}` exists → `400 Bad Request` ("Please wait X seconds").
     - *Daily Cap*: Key `auth:daily_count:{phone}:{YYYY-MM-DD}` >= 10 → `429 Too Many Requests` ("Daily OTP request limit reached").
  3. **Per-IP Rate Limit (Sliding Window)**:
     - Key: `auth:ip_rate:{client_ip}`
     - Threshold: Max 20 OTP requests per rolling 60-minute window.
     - Exceeded → `429 Too Many Requests` ("Too many OTP requests from this network. Please try again later.").

---

### Loop 3: Verification & Session Issuance Loop

- **Trigger**: Client `POST /auth/verify-otp` with `{ phone, code, role }`.
- **Pre-Conditions**:
  1. Phone format valid.
  2. Key `auth:otp:{phone}` exists in Redis (not expired).
- **Execution Steps (Atomic Redis Verification)**:
  1. Read Redis record for `auth:otp:{phone}`. If missing → `400 Bad Request` ("OTP expired or not found").
  2. Check `attempts` count:
     - If `attempts >= 3`:
       - Delete key `auth:otp:{phone}`.
       - Set `auth:lockout:{phone}` with TTL=900s (15 minutes).
       - Throw `403 Forbidden` ("Maximum attempts exceeded. This phone number is locked for 15 minutes.").
  3. Verify code using timing-safe comparison (`crypto.timingSafeEqual`):
     - **If Match**:
       - Delete `auth:otp:{phone}` immediately (single-use burned).
       - Query user in database via `UserRepository.findByPhone(phone)`.
       - If user does not exist:
         - Prevent role escalation: if submitted `role` is `admin` or `msme_admin`, default to `job_seeker`.
         - Create user record with `status: 'active'`.
         - Auto-grant 10 starter credits for job seekers (`walletService.ensureStarterCredits(userId)`).
       - If user exists:
         - Keep existing role immutable (STF-01 compliance).
         - Update user `status: 'active'`.
       - Sign JWT access token with payload `{ sub: user.id, role: user.role, phone: user.phone, exp }`.
       - Return session object.
     - **If Mismatch**:
       - Increment `attempts` counter in Redis atomically.
       - Remaining attempts = `3 - attempts`.
       - Throw `400 Bad Request` ("Invalid OTP code. {remainingAttempts} attempts remaining.").

---

### Loop 4: Daily Spend & Quota Monitoring Loop

- **Trigger**: Executed upon every successful outbound SMS attempt.
- **Segment Math**:
  - English (`en`): 160 chars/segment (or 153 for concatenated).
  - Hindi Unicode (`hi`): 70 chars/segment (or 67 for concatenated).
  - Telecom pricing: ₹0.20 per segment.
- **Tracking Algorithm**:
  1. Calculate segment count for message. Cost = `segmentCount * 0.20`.
  2. Redis key: `spend:sms:daily:{YYYY-MM-DD}` (Float accumulator).
  3. Evaluate against `DAILY_SMS_BUDGET_INR` (default: 500):
     - **Warning Checkpoint (80%)**: Emit warning metric to Sentry / Logger.
     - **Hard Cap Checkpoint (100%)**:
       - Set circuit-breaker flag `spend:sms:blocked:{YYYY-MM-DD}`.
       - Subsequent non-whitelisted OTP requests reject with `503 Service Unavailable` ("Daily SMS dispatch budget reached. Platform security alert triggered.").
       - Trigger emergency alert brief to Sentry.

---

## 3. Redis Key Schema

| Key Format | Type | TTL | Purpose |
|---|---|---|---|
| `auth:otp:{phone}` | Hash | 600s (10m) | Stores `hash` and `attempts` counter. |
| `auth:cooldown:{phone}` | String | 60s | Enforces 1 request/min cooldown. |
| `auth:daily_count:{phone}:{YYYY-MM-DD}` | Integer | 86400s (24h) | Enforces 10 OTP requests/day limit. |
| `auth:lockout:{phone}` | String | 900s (15m) | Locked out after 3 failed verify attempts. |
| `auth:ip_rate:{client_ip}` | Sorted Set / ZSET | 3600s (1h) | Sliding window IP rate limiter (20/hour). |
| `spend:sms:daily:{YYYY-MM-DD}` | String (Float) | 172800s (48h) | Daily telecom spend accumulator in INR. |
| `spend:sms:blocked:{YYYY-MM-DD}` | Flag | 86400s | Emergency budget circuit breaker. |

---

## 4. Human-in-the-Loop Checkpoints (Push-Right)

1. **DLT Approval Cutover Checkpoint**:
   - *Trigger*: Telecom DLT registrar marks content templates as `APPROVED`.
   - *Brief*: Engineer populates `MSG91_OTP_TEMPLATE_ID_EN` and `MSG91_OTP_TEMPLATE_ID_HI` in `.env` and sets `SMS_GATEWAY_MODE=live`. Zero code changes or server redeployments required.
2. **Budget Threshold Alert Checkpoint**:
   - *Trigger*: Daily spend exceeds 80% of `DAILY_SMS_BUDGET_INR`.
   - *Brief*: Sentry alert contains:
     - Current spend in INR vs. Budget.
     - Total OTP volume dispatched.
     - Top 5 originating IPs.
     - Actionable decision: Acknowledge or adjust `DAILY_SMS_BUDGET_INR`.

---

## 5. Implementation Roadmap (Phases)

- **Phase 1: Redis Infrastructure & Service Layer**
  - Create Redis helper service wrapping `ioredis` with fallback in test environments.
  - Implement atomic OTP storage, attempt counting, and sliding window IP rate limiting.
- **Phase 2: Multi-Driver SMS Gateway Refactor**
  - Update `Msg91SmsService` with `mock`, `sandbox`, and `live` driver modes.
  - Wire QA whitelist numbers (`+919876543210`–`+919876543219`).
- **Phase 3: Controller & Service Hardening**
  - Extract client IP from Fastify request headers (`x-forwarded-for`).
  - Wire brute-force lockout (3 invalid attempts = 15m phone block).
  - Enforce spend tracking & daily budget circuit breaker.
- **Phase 4: Comprehensive TDD Test Suite**
  - Unit tests for sliding-window IP limits, attempt decrement, and lockout.
  - Mock MSG91 responses and DLT template fallback.
