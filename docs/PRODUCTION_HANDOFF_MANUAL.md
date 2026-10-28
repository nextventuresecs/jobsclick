# Production Handoff & Developer Guide: Indian Job Portal

Welcome to the **Indian Job Portal Platform Developer Manual**. This document provides a clear, step-by-step guide for developers, project managers, and system administrators to configure external services, deploy to production, and implement post-MVP features.

---

## 1. Overview of the System

The codebase is structured as a single monorepo containing:
- **`apps/web`**: The public Next.js website for Job Seekers, Employers, and Institutions (supports English & Hindi).
- **`apps/api`**: The backend NestJS Fastify API handling authentication, job postings, profiles, and bulk imports.
- **`apps/worker`**: A Node.js background process managing bulk CSV processing, PDF resume rendering, and invitation scheduling.
- **`packages/database`**: PostgreSQL database migrations and Row-Level Security (RLS) policies.
- **`packages/validation`**: Shared Zod schemas ensuring consistent data rules between frontend and backend.

---

## 2. Step-by-Step Production Configuration

Before launching to live users, developers must configure 5 key external services.

### Step 2.1: SMS Service (MSG91 & DLT Registration)
*Why this is needed:* Under Indian Telecom regulations (DLT), SMS messages (like OTPs and batch invites) can only be delivered using approved SMS headers and templates.

**Action Steps:**
1. Register your business entity on an Indian DLT portal (e.g., Jio DLT, Airtel DLT, or Vodafone DLT).
2. Register your **Sender ID / Header** (e.g., `INDIAN`).
3. Submit the approved DLT template IDs for English and Hindi SMS messages into your MSG91 dashboard.
4. Update the following environment variables in `apps/api/.env`:
   ```env
   MSG91_AUTH_KEY=your_live_msg91_api_key
   MSG91_SENDER_ID=INDIAN
   ```

### Step 2.2: Bot & Abuse Protection (Cloudflare Turnstile)
*Why this is needed:* Protects the login and OTP endpoints from automated spam bots and fraudulent requests.

**Action Steps:**
1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Turnstile**.
2. Add your website domain (e.g., `indianjobportal.in`).
3. Copy the **Site Key** (used in `apps/web`) and **Secret Key** (used in `apps/api`).
4. Update `apps/api/.env`:
   ```env
   TURNSTILE_SECRET_KEY=your_live_turnstile_secret_key
   ```

### Step 2.3: Email Service (Resend)
*Why this is needed:* Delivers secondary contact verification emails and platform notifications.

**Action Steps:**
1. Create an account at [Resend.com](https://resend.com/).
2. Add and verify your domain (e.g., `indianjobportal.in`) by adding SPF and DKIM DNS records.
3. Generate an API Key and add it to `apps/api/.env`:
   ```env
   RESEND_API_KEY=re_your_live_resend_api_key
   ```

### Step 2.4: Production Database (Supabase PostgreSQL)
*Why this is needed:* Stores user profiles, jobs, applications, and audit logs with strict Row-Level Security (RLS).

**Action Steps:**
1. Log into your [Supabase Dashboard](https://supabase.com/).
2. Obtain your production database connection string (`DATABASE_URL`).
3. Run the SQL migration scripts in sequence from `packages/database/supabase/migrations/`:
   - `20261008000000_init_schema.sql`
   - `20261008000001_db_schema_v1_rls.sql`
4. Update `apps/api/.env` (Enforce Connection Pooler - PRN-08):
   ```env
   # Transaction Pooler (Port 6543 with pgbouncer=true) for runtime application queries
   DATABASE_URL=postgresql://postgres.your_supabase_ref:your_password@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
   # Direct Session Connection (Port 5432) strictly for running DDL migrations
   DIRECT_URL=postgresql://postgres.your_supabase_ref:your_password@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
   SUPABASE_URL=https://your_supabase_ref.supabase.co
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

### Step 2.5: Error Tracking, Distributed Tracing & Logging (Sentry v10+)
*Why this is needed:* Captures server crashes, unhandled errors, distributed request-to-worker traces, and application logs in real time while enforcing Indian Digital Personal Data Protection (DPDP) and Zero-PII invariants.

**Action Steps:**
1. Create 3 distinct projects in your [Sentry.io](https://sentry.io/) organization:
   - `indian-job-portal-web` (Platform: Next.js)
   - `indian-job-portal-api` (Platform: Node.js)
   - `indian-job-portal-worker` (Platform: Node.js)
2. Configure the corresponding DSNs in your environment variables:
   - In `apps/web/.env.local`:
     ```env
     NEXT_PUBLIC_SENTRY_DSN=https://your_web_key@o0.ingest.sentry.io/000001
     ```
   - In `apps/api/.env`:
     ```env
     SENTRY_DSN=https://your_api_key@o0.ingest.sentry.io/000002
     ```
   - In `apps/worker/.env`:
     ```env
     SENTRY_DSN=https://your_worker_key@o0.ingest.sentry.io/000003
     ```
3. **Sentry Logs & Console Capture Configuration:**
   - Both `apps/api` and `apps/worker` are initialized with `@sentry/node >= 10.77.0`, enabling Sentry Logs and `consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })`.
   - All captured logs flow through universal `beforeSendLog: (log) => sanitizeLogRecord(log)`, guaranteeing that Indian phone numbers (+91), 12-digit Aadhaar numbers, OTP verification codes, and auth tokens are scrubbed before transport.
   - For structured application logging:
     ```typescript
     import * as Sentry from '@sentry/node';
     Sentry.logger.info('User triggered test log', { action: 'test_log' });
     ```
4. **Verification Suite:**
   Run the dedicated Sentry telemetry and wire-scrubbing test suite:
   ```bash
   npx vitest run apps/web/test/sentry-observability.test.ts apps/api/test/sentry-telemetry.spec.ts apps/worker/test/sentry-worker-telemetry.spec.ts
   ```

---

## 3. How to Deploy the Application

Follow these steps to deploy to your production server or hosting platform.

### Quick Command Line Setup (Target: < 5 Commands)
```bash
# 1. Copy environment variables file
cp .env.example .env

# 2. Install dependencies across all packages
pnpm install

# 3. Compile and build all applications
pnpm build

# 4. Verify test suite
pnpm test

# 5. Start production services with Docker
docker compose up -d
```

### Production Service Ports
| Application | Service Name | Default Port | Health Check Endpoint |
| :--- | :--- | :--- | :--- |
| **Next.js Web** | `apps/web` | `3000` | `GET /` |
| **Fastify API** | `apps/api` | `3001` | `GET /health` |
| **Node Worker** | `apps/worker` | - | `GET /health/uptime` |
| **PostgreSQL** | `postgres` | `5432` | `pg_isready` |
| **Redis** | `redis` | `6379` | `redis-cli ping` |

---

## 4. Next Features Roadmap (Post-MVP Phase)

The database schema and architectural foundation for next-phase features are already created in the repository. Developers can follow the steps below to enable them.

### Feature 4.1: Ledger-Based Credit Wallet System (Phase P2)
*Goal:* Charge employers or agencies credits when unlocking candidate contact details or highlighting featured job posts.

- **Existing Database Table:** `credit_ledgers` (created in `20261008000000_init_schema.sql`).
- **Implementation Steps:**
  1. Create `apps/api/src/credits/credits.service.ts`.
  2. Implement credit deduction and balance computation (`balance = SUM(amount)` from `credit_ledgers`).
  3. *Rule:* Never store a mutable balance field as ground truth; derive balances strictly from the ledger entries.

### Feature 4.2: Institution & Placement Roster Dashboard (Phase P2)
*Goal:* Allow colleges and universities to monitor student profile activations and job placements.

- **Existing Database Table:** `institution_profiles`.
- **Implementation Steps:**
  1. Add `GET /institution/students` endpoint in `apps/api/src/profiles/profiles.controller.ts`.
  2. Filter job seekers linked to the institution's ID.
  3. Render student roster in `apps/web/src/app/institution/dashboard/page.tsx`.

### Feature 4.3: Task & Short-Term Gig Module (Phase P3)
*Goal:* Allow local businesses to post short-term daily-wage tasks (e.g., event helper, driver for 2 days).

- **Existing Database Table:** `tasks` (created in `20261008000000_init_schema.sql`).
- **Implementation Steps:**
  1. Build Task CRUD controller (`POST /tasks`, `GET /tasks`).
  2. Add task application & completion payout status flow.

---

## 5. Important Rules & Safety Invariants

Developers working on this repository **must never violate** these hard security rules:

1. **Zero Contact Exposure:** Employers or public users must **never** receive candidate phone numbers or email addresses in API responses. Contact happens strictly through platform messaging.
2. **Aadhaar Privacy:** Never request or store a 12-digit Aadhaar number. Store only the **last 4 digits** alongside the user's explicit DPDP consent flag (`dpdpConsentGiven: true`).
3. **Append-Only Audit Logs:** The `audit_logs` table has a database trigger prohibiting `UPDATE` and `DELETE` queries. Never alter audit records.
4. **No Direct SMS at Import:** Bulk CSV imports create accounts in the `invited` state. SMS invitations must only be sent in controlled, scheduled waves with cost previews.

---

## 6. Verification & Quality Commands

Always run the full quality check before submitting any Pull Request:

```bash
# 1. Run ESLint code checks
pnpm lint

# 2. Run TypeScript strict type verification
pnpm typecheck

# 3. Run full Vitest test suite
pnpm test

# 4. Build all workspaces
pnpm build
```
