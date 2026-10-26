# Project Notes & Domain Vocabulary

## Domain & Context: SMS & OTP Architecture (AUTH-01, AUTH-03, ADM-05)

### Regulatory Context (TRAI / DLT India)
- **DLT (Distributed Ledger Technology)**: Telecom regulatory mandate in India. Outbound SMS requires:
  1. Principal Entity Registration (Entity ID)
  2. Sender ID / Header Approval (e.g., `INDIAN`, 6 characters alphabetic)
  3. Content Template Registration with static text and `{#var#}` placeholders (e.g., `DLT_1001_OTP_EN`, `DLT_1002_OTP_HI`).
- **Current Status**:
  - `MSG91_AUTH_KEY`: Acquired and valid.
  - `MSG91_SENDER_ID`: Acquired and approved.
  - **DLT Content Templates**: Pending carrier verification.
  - **Operational Requirement**: The entire auth, rate limiting, and verification system must be functional in staging/dev and resilient in production before DLT templates complete carrier propagation.

### Architecture & Engine Decisions (Settled via `/loop-me` & `/grilling`)
- **State & Rate-Limit Store**: `ioredis` (installed in `apps/api`), compatible with local Redis and Upstash Redis. Remediates security finding **STF-03** (volatile in-memory `Map`).
- **DLT Pending Sandbox Mode**:
  - Reserved QA/test phone range (`+919876543210` through `+919876543219`) always uses static test OTP `123456`.
  - In non-production or when templates are unverified (`SMS_GATEWAY_MODE=sandbox`), live calls log the generated OTP to secure server logs without rejecting the request.
  - Live mode (`SMS_GATEWAY_MODE=live`) dispatches to MSG91 HTTP API only when template IDs are approved.
- **Brute-Force Protection**: Maximum 3 invalid verification attempts per 10-minute OTP window. 3rd failure burns the code and locks the phone number for 15 minutes.
- **Three-Layer Abuse Rate Limiting**:
  1. *Per-Phone*: 60s cooldown between requests, 10 OTP requests/day maximum.
  2. *Per-IP*: Max 20 OTP requests/hour via sliding window.
  3. *Per-Device*: Cloudflare Turnstile bot verification required before dispatch.
- **Spend & Quota Guard**:
  - Configurable via `DAILY_SMS_BUDGET_INR` (default: ₹500/day, ~2,500 segments at ₹0.20/segment).
  - Checkpoint alerts emitted to Sentry / Admin log at 80% and 100% threshold.
