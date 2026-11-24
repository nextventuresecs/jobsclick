# Staging Environment Operational Runbook & Configuration Matrix

This runbook defines the architecture, environment variables, security tripwires, external service configurations, and verification procedures for the **JobsClick** staging environment.

---

## 1. Environment Architecture & Staging Facts

| Property | Staging Value | Production Value (Comparison) |
| :--- | :--- | :--- |
| **Web Host** | `https://staging.jobsclick.live` | `https://jobsclick.live` |
| **API Host** | `https://api-staging.jobsclick.live` | `https://api.jobsclick.live` |
| **Supabase Project Ref** | `afxgvtfaofpnlhdsexnp` | (Separate Production Ref) |
| **Forbidden Old Ref** | `aspahsnclunutwiqliau` (Strictly Blocked by Tripwire) | N/A |
| **Search Indexing** | Disabled (`noindex, nofollow`, empty sitemap). Crawling is allowed so search engines can read the header. | Enabled |

---

## 2. Supported Environment Variable Modes

Railway staging and server runners support **both** runtime environment configurations:

1. **Recommended Dual Mode:**
   ```bash
   NODE_ENV=production
   APP_ENV=staging
   ```
   *Benefit:* Enables V8 compiler and framework production optimizations while triggering staging strict safety gates and staging-specific configurations.

2. **Legacy Single Mode:**
   ```bash
   NODE_ENV=staging
   ```
   *Behavior:* Evaluated by `getAppEnv()` as `staging`. Strict safety gates, payment sandbox guards, and staging tripwires are fully active.

---

## 3. Environment Variable Matrix

> [!IMPORTANT]
> **Zero Secrets Policy**: Never commit real credentials or secret keys to source control. Values below describe formats, requirements, and acquisition instructions only.

### 3.1 Backend API (`apps/api`)

| Variable Name | Staging Requirement / Rule | Source / Where to Obtain |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` (with `APP_ENV=staging`) or `staging` | Set in Railway service variables |
| `APP_ENV` | `staging` | Set in Railway service variables |
| `PORT` | Optional (default: `3001` or provided by Railway `$PORT`) | Railway assigned |
| `WEB_URL` | Must be `https://staging.jobsclick.live` (Tripwire rejects prod or non-staging) | Monorepo config |
| `APP_URL` | Must be `https://staging.jobsclick.live` | Monorepo config |
| `API_URL` | Must be `https://api-staging.jobsclick.live` | Monorepo config |
| `DATABASE_URL` | Postgres pooled connection string containing staging ref `afxgvtfaofpnlhdsexnp` | Supabase Dashboard > Database > Connection Pooling |
| `DIRECT_URL` | Direct connection string containing staging ref `afxgvtfaofpnlhdsexnp` | Supabase Dashboard > Database > Direct Connection |
| `SUPABASE_URL` | `https://afxgvtfaofpnlhdsexnp.supabase.co` | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | JWT anon token for staging project | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT service role secret for staging project | Supabase Dashboard > Settings > API |
| `STAGING_PROJECT_REF` | `afxgvtfaofpnlhdsexnp` (defaults automatically) | Railway env |
| `JWT_SECRET` | Secure random string (min 32 chars) | Generated via `openssl rand -hex 32` |
| `OTP_PEPPER` | Secure random string (min 32 chars) | Generated via `openssl rand -hex 32` |
| `REDIS_URL` | Upstash / Redis connection string | Railway Redis service or Upstash console |
| `RAZORPAY_KEY_ID` | Must start with `rzp_test_` (Tripwire strictly blocks `rzp_live_*`) | Razorpay Dashboard (Test Mode) > API Keys |
| `RAZORPAY_KEY_SECRET` | Staging test key secret | Razorpay Dashboard (Test Mode) > API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Staging webhook signature secret | Razorpay Dashboard (Test Mode) > Webhooks |
| `SENTRY_DSN` | Mandatory in strict envs (Tripwire fails boot if empty) | Sentry.io Project Settings > Client Keys (DSN) |
| `SENTRY_ENVIRONMENT` | Optional (defaults automatically to `staging`) | Railway env |
| `EMAIL_FROM` | Staging sender address (e.g. `JobsClick Staging <notifications@staging.jobsclick.live>`) | Resend verified domain |
| `STORAGE_PUBLIC_URL` | Staging public asset storage URL | Supabase Storage Settings |
| `GOOGLE_CALLBACK_URL` | `https://afxgvtfaofpnlhdsexnp.supabase.co/auth/v1/callback` | Supabase Auth > Google Provider settings |
| `WALLET_ENABLED` | `false` (default: OFF in strict envs until explicitly enabled) | Monorepo rollout flag |
| `SPONSORSHIP_ENABLED` | `false` (default: OFF in strict envs until explicitly enabled) | Monorepo rollout flag |

### 3.2 Frontend Web (`apps/web`)

| Variable Name | Staging Requirement / Rule | Source / Where to Obtain |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Docker runner default |
| `APP_ENV` | `staging` | Set in Railway service variables |
| `NEXT_PUBLIC_APP_URL` | `https://staging.jobsclick.live` | Monorepo config |
| `NEXT_PUBLIC_API_URL` | `https://api-staging.jobsclick.live` | Monorepo config |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://afxgvtfaofpnlhdsexnp.supabase.co` | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT anon token for staging project | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile staging widget sitekey | Cloudflare Dashboard > Turnstile Sites |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Optional (defaults to backend order creation keyId) | Razorpay Dashboard (Test Mode) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry client DSN | Sentry.io Project Settings |
| `NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN`| `true` or `false` (controls Google auth buttons) | Feature flag |
| `SENTRY_TEST_SECRET` | Optional shared secret for triggering `/api/sentry-test` | Shared developer secret |
| `ADMIN_DASHBOARD_SECRET` | Optional secret for `/api/sentry-test` bypass | Shared admin secret |

### 3.3 Background Worker (`apps/worker`)

| Variable Name | Staging Requirement / Rule | Source / Where to Obtain |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` (with `APP_ENV=staging`) or `staging` | Set in Railway service variables |
| `APP_ENV` | `staging` | Set in Railway service variables |
| `DATABASE_URL` | Postgres pooled connection string containing staging ref | Supabase Dashboard |
| `DIRECT_URL` | Direct connection string containing staging ref | Supabase Dashboard |
| `SUPABASE_URL` | `https://afxgvtfaofpnlhdsexnp.supabase.co` | Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role secret | Supabase Dashboard |
| `REDIS_URL` | BullMQ Redis connection string | Railway / Upstash |
| `SENTRY_DSN` | Mandatory (Tripwire fails boot if empty) | Sentry.io |
| `APP_URL` | `https://staging.jobsclick.live` | Monorepo config |
| `EMAIL_FROM` | Sender address for invoices and notifications | Resend verified sender |

---

## 4. External Services Configuration

### 4.1 Supabase Auth & Settings
1. **Site URL:**
   - Configure to `https://staging.jobsclick.live` in Supabase Dashboard > Authentication > URL Configuration.
2. **Redirect URLs (Allowlist):**
   - Add `https://staging.jobsclick.live/**`
   - Add `https://staging.jobsclick.live/auth/callback`
3. **Database & Storage:**
   - Staging project ref must be `afxgvtfaofpnlhdsexnp`.
   - Buckets required: `resumes` (private), `public-assets` (public).

### 4.2 Google OAuth Setup for Staging
1. **Google Cloud Console:**
   - Create a dedicated staging OAuth 2.0 Web Application client.
   - **Authorized JavaScript origins:** `https://staging.jobsclick.live`
   - **Authorized redirect URIs:**
     ```
     https://afxgvtfaofpnlhdsexnp.supabase.co/auth/v1/callback
     ```
   > [!NOTE]
   > `GOOGLE_CALLBACK_URL` is the Supabase authentication provider callback (`https://<STAGING_PROJECT_REF>.supabase.co/auth/v1/callback`), **not** an API route. Google redirects to Supabase Auth, which then redirects the user back to the web application at `/auth/callback`.
2. **Supabase Dashboard:**
   - Under Authentication > Providers > Google, toggle **Enable Google**.
   - Input Client ID and Client Secret from the staging Google Cloud OAuth client.
   - Set redirect URL allowlist to `https://staging.jobsclick.live/**`.

### 4.3 Razorpay Payment Gateway (Test Mode)
1. **Mode:** Strictly **Test Mode** (`rzp_test_*`).
2. **Webhook URL:**
   ```
   https://api-staging.jobsclick.live/webhooks/razorpay
   ```
3. **Active Events:**
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
4. **Webhook Secret:** Set in API as `RAZORPAY_WEBHOOK_SECRET`.

### 4.4 Cloudflare Turnstile
1. Add `staging.jobsclick.live` to the Turnstile Widget Allowed Domains.
2. For testing/previews, include localhost or development origins if necessary.

### 4.5 Resend Email Gateway
1. Ensure sender domain (e.g. `staging.jobsclick.live` or `jobsclick.live`) has verified SPF, DKIM, and DMARC records.
2. `EMAIL_FROM` configured to e.g. `JobsClick Staging <notifications@staging.jobsclick.live>`.

### 4.6 Cloudflare Access / WAF
If staging is protected behind Cloudflare Access or Zero Trust:
- Bypass or allow service-to-service calls on webhook endpoints (e.g. `/webhooks/razorpay`).
- Ensure webhook requests pass without Cloudflare Access login interstitial.

---

## 5. Security Gates & Safety Tripwires

The codebase enforces strict fail-closed safety tripwires via `packages/validation/src/staging-tripwire.ts`:

1. **Database Project Isolation:**
   - Fails boot if `DATABASE_URL`, `DIRECT_URL`, or `SUPABASE_URL` contains `aspahsnclunutwiqliau` (the forbidden legacy production reference).
   - Fails boot if any database URL does not contain the staging project ref (`afxgvtfaofpnlhdsexnp`).
2. **Domain Isolation:**
   - Fails boot if `WEB_URL`, `APP_URL`, or `API_URL` host equals `jobsclick.live` or any subdomain not starting with `staging.` or `api-staging.`.
3. **Payment Sandbox Guard:**
   - Fails boot if `RAZORPAY_KEY_ID` starts with `rzp_live_` in staging.
4. **Observability Tripwire:**
   - Fails boot if `SENTRY_DSN` is empty in staging.
5. **Google Callback Tripwire:**
   - Fails boot if `GOOGLE_CALLBACK_URL` contains `aspahsnclunutwiqliau`, a different project ref, or an API host instead of the Supabase auth callback URL.
6. **Zero-PII Wire Invariant:**
   - All error logs, Sentry events, and breadcrumbs are filtered through PII scrubbers (Aadhaar, Indian phones, emails, tokens redacted).

---

## 6. Verification Checklist

Before deploying or promoting changes to staging, perform this verification:

- [ ] **Typecheck & Lint:**
  ```bash
  pnpm lint && pnpm typecheck
  ```
- [ ] **Test Suite Green:**
  ```bash
  pnpm test
  ```
- [ ] **Tripwire Negative Boot Checks:**
  - Boot API with `DATABASE_URL` containing `aspahsnclunutwiqliau` -> Boot must abort with clear error.
  - Boot API with `RAZORPAY_KEY_ID=rzp_live_xxx` -> Boot must abort with `RAZORPAY_KEY_ID must start with rzp_test_ in staging`.
  - Boot API with `WEB_URL=https://jobsclick.live` -> Boot must abort with domain tripwire error.
- [ ] **SEO & Indexing Prevention:**
  - `curl -I https://staging.jobsclick.live/` returns `X-Robots-Tag: noindex, nofollow`.
  - `curl https://staging.jobsclick.live/robots.txt` returns `Allow: /` for `User-agent: *` and omits the sitemap directive.
  - `curl https://staging.jobsclick.live/sitemap.xml` returns empty sitemap.
- [ ] **Sentry Telemetry:**
  - Verify events in Sentry console display tag `environment: staging`.
  - Access `/api/sentry-test` without credentials -> Returns HTTP 401 Unauthorized.

## 7. Railway release

Confirm the approved application and database migrations are in place, Railway GitHub auto-deploy is disabled, and the staging API and web HTTPS origins are configured. The release workflow does not apply migrations to staging or production.

For an authorized staging-only run, select **CI/CD Pipeline → Run workflow** on `main` and leave **Request production approval after staging passes** unchecked. The workflow runs tests, database gates, and Docker builds before uploading the exact Git commit to Railway. The API, web, and worker must pass two consecutive health checks for their exact deployment IDs. The worker probe reads its Redis and BullMQ readiness heartbeat from deployment logs.

After the staging-only run, verify Google sign-in and page hydration, OTP and phone linking, Excel onboarding, private resume generation, and notification provider acknowledgements. Verify Upstash Redis and QStash through the staging flows. To request production promotion later, start a separately authorized run for the reviewed `main` commit with the production option checked. That run checks staging again and waits for the GitHub `production` approval.
