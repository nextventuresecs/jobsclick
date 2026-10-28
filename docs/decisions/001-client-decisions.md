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
- **MVP + Full Extras + Hindi:** All user-facing copy in English and Hindi (`next-intl`), with Hindi rendering support in PDF resumes (`@fontsource/noto-sans-devanagari`).
- **Database:** Supabase / PostgreSQL with Row-Level Security (RLS) as second lock.
- **Observability:** Sentry with DPDP-compliant Zero-PII scrubbing and distributed trace propagation (`web` -> `api` -> `worker`).
