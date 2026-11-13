# Platform Feature Flags & Default-OFF Configuration

This document specifies the authoritative feature-flag inventory, security defaults, gated endpoints/surfaces, and the owner implementation step responsible for re-enabling each feature during staged launch.

## 1. Feature Flag Inventory

| Flag Name | Default | Guarded Routes / Surfaces | Module Scope | Owner Step for Re-enabling |
| :--- | :---: | :--- | :--- | :--- |
| `ENABLE_P2_PAYMENTS` | `false` | `POST /wallet/recharge/create-order`<br>`POST /wallet/recharge/verify`<br>`POST /webhooks/razorpay`<br>`GET /wallet/invoice/:id`<br>`POST /institutions/:id/sponsorship/activate` | Razorpay Gateway, Payment Webhooks & Sponsorship | Step 16 (Razorpay Integration) & Step 17 (Institution Sponsorship) |
| `ENABLE_P2_WALLET_RECHARGE` | `false` | `GET /wallet/packs`<br>Web: `RechargeModal.tsx` | FinTech Wallet Recharge & Credit Packs Catalog | Step 15 (Wallet & Credit Packs) |
| `ENABLE_P2_PLACEMENT_PIPELINE` | `false` | `GET /placement/tie-ups`<br>`POST /placement/tie-ups`<br>`GET /placement/pipeline`<br>`POST /placement/batch-share`<br>`PATCH /placement/pipeline/:id/stage` | Institutional Placement Cell Multi-Tenancy | Step 19 (Corporate Tie-ups & Pipeline) |
| `ENABLE_P2_FEATURED_PROMOTIONS` | `false` | `POST /jobs/:id/promote`<br>`POST /wallet/feature-job`<br>Web: `PromoteJobModal.tsx` | Featured Job Boosts & Ranking Algorithmic Promotions | Step 21 (Featured Job Promotions) |
| `ENABLE_P2_JOB_ALERTS` | `false` | `POST /jobs/alerts`<br>`GET /jobs/alerts`<br>Web: `SaveSearchAlertModal.tsx` | Job Search Alert Subscriptions & Notifications | Step 21 (Search Alerts & Digest Engine) |
| `ENABLE_P2_MSME_BROADCAST` | `false` | `POST /admin/broadcast/preview`<br>`POST /admin/broadcast/dispatch`<br>Web: `MsmeBroadcastConsole.tsx` | MSME Bulk SMS Outreach & District Quota Dispatch | Step 20 (MSME Department Broadcast) |
| `NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN` | `false` | Web: Google Sign-in button in `AuthModal.tsx` | Social OAuth Authentication | Step 97b (Social Auth Web Client) |

---

## 2. Ungated Core Workflows (Hard Invariants)

The following core MVP workflows are intentionally **NOT** disabled and must never be gated behind P2 flags:
1. **Candidate & Employer Signup / Login (`POST /auth/send-otp`, `POST /auth/verify-otp`)**: Core authentication is always operational.
2. **Job Application (`POST /jobs/:id/apply`)**: Basic candidate job application is the foundational value proposition of the MVP.
3. **Starter-Credit Grant**: Free initial credit grants (for job posting and applying) are required for MVP functionality and remain enabled.
4. **Candidate Profiles (`/profiles/seeker/*`)** and **Employer Profiles (`/profiles/business/*`)**: Fully active.

---

## 3. Enforcement & Verification

- **API Boundary**: Enforced via NestJS global `FeatureFlagGuard` (`apps/api/src/auth/guards/feature-flag.guard.ts`). When a flag is false or unset in the environment, the guard immediately rejects the request with `HTTP 404 Not Found` and response body:
  ```json
  {
    "statusCode": 404,
    "code": "FEATURE_DISABLED",
    "message": "Endpoint disabled: Feature flag '<FLAG_NAME>' is inactive."
  }
  ```
- **Web UI**: Components evaluate flags (`process.env.NEXT_PUBLIC_* === 'true'`). When disabled, UI modals and action buttons are suppressed or display inactive notices.
- **Automated Verification**:
  - API: `apps/api/test/p2-feature-flags-defaults.spec.ts` proves that all P2 routes return 404 `FEATURE_DISABLED` by default, while MVP apply and signup succeed.
  - Web: `apps/web/test/feature-flags-defaults.test.ts` proves that UI features default to inactive.
