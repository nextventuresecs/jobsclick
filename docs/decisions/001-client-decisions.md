# Client Decisions & Architectural Directives

This document records confirmed client decisions and deployment targets that override or refine `docs/PRD.md`.

## 1. Deployment Platform: Railway
- **Primary Deployment Target:** **Railway** (`https://railway.app`).
- **Architecture on Railway:**
  - **Service 1 (`apps/web`):** Next.js App Router frontend, public domain mapped, internal reverse proxy for telemetry (`/monitoring`).
  - **Service 2 (`apps/api`):** NestJS on Fastify adapter, internal networking connection to Redis and Supabase.
  - **Service 3 (`apps/worker`):** Plain Node background process executing BullMQ queues, connected to Railway Redis.
  - **Redis Plugin / Service:** Managed Redis running on Railway for BullMQ queue state and Upstash rate-limit fallbacks.
- **Environment & Ingress:**
  - Services communicate via Railway private networking (`.railway.internal`).
  - Public ingress is exposed only for `apps/web` and `apps/api`.
  - Background worker `apps/worker` has no public HTTP port.

## 2. Scope & Features
- **Release verification:** GitHub Actions runs CI on pushes and pull requests. An authorized manual run on `main` verifies staging deployment identities before production can request approval. The [staging runbook](../runbooks/staging-environment.md#7-railway-release) covers the staging-only test and promotion.
- **Web fonts:** Builds use locked Inter and Noto Sans Devanagari packages for English and Hindi without a Google Fonts request at build time.
- **Queue and privacy checks (BULK-02/03, JS-03, INT-03):** Live queue publication must be acknowledged, and pending resume jobs coalesce per seeker. Bulk-import queue results omit contact data, and inquiry contact access requires an audit write. Sentry telemetry strips email-verification URL tokens and restricts the API test endpoint to staging admins.
- **MVP + Full Extras + Hindi:** All user-facing copy in English and Hindi (`next-intl`), with Hindi rendering support in PDF resumes (`@fontsource/noto-sans-devanagari`).
- **Database:** Supabase / PostgreSQL with Row-Level Security (RLS) as second lock.
- **OAuth (AUTH-01, AUTH-05):** The API issues a session only after Supabase Auth confirms the provider session and its email. Existing account matching must agree with the confirmed email.
- **Browser sign-in and CSP (AUTH-01, AUTH-05):** The browser redeems the Google redirect code with Supabase using PKCE and sends the resulting access token to the API for verification. Next.js middleware sends a fresh CSP nonce for each rendered response. The policy allows the configured API origin, and Fastify permits browser requests from the configured web origin.
- **Sign-in entry points (AUTH-02, JS-01, BULK-03):** The sign-in dialog distinguishes institution staff, invited students, independent job seekers, and employers in English and Hindi. Invited students use mobile OTP with the number their institution registered. The verified account determines workspace access and institutional affiliation.
- **Staging worker scope (BULK-03/04, JS-03):** Staging always runs bulk import, invitation, and resume PDF consumers. Optional consumers follow the corresponding API feature flags. Each enabled periodic task has one BullMQ scheduler.
- **Worker release readiness (BULK-04, JS-03):** The heartbeat requires running consumers and a successful Redis Lua probe. Recent worker runtime errors mark readiness unavailable. GitHub checks fresh heartbeats from the exact staging worker deployment before it can request production approval.
- **Observability:** Sentry with DPDP-compliant Zero-PII scrubbing and distributed trace propagation (`web` -> `api` -> `worker`).
- **Worker error telemetry:** Record queue, job, trace and attempt metadata for exhausted retries. Exclude the job input and notification provider response bodies from logs and events.
- **MVP bulk intake (BULK-01–05):** Forms and downloadable templates start empty. Authenticated intake accepts CSV and Excel `.xlsx` and converts the first worksheet to CSV under upload and expansion limits. Aadhaar columns are rejected before storing the CSV or queuing its private storage reference. The worker ignores Aadhaar fields in legacy jobs. Invitation waves require a completed import and a separate cost preview.
- **First-time resumes (JS-03):** A missing private resume object queues PDF generation. While generation is pending the web client polls the authenticated endpoint. Storage errors remain retryable worker failures.
- **Notification dispatch (NOT-02, AUTH-03/04, BULK-03):** Staging and production require a provider acknowledgement before reporting a dispatch as accepted. Staging allowlist blocks and provider failures return a failure without a synthetic receipt. Provider acceptance does not confirm inbox or handset delivery.
