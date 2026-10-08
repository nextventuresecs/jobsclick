# MVP + Full issue list (GitHub Project) — Indian Jobs

Labels: `MVP` `P2` `P3` · area: `db` `auth` `web` `api` `worker` `infra` `admin` · `needs-human-review` · `blocked-client`
Board columns: Backlog → Ready → In progress → Review → Done. Only MVP issues go to Ready.
Order = dependency order. Each issue: PRD IDs, acceptance criteria (AC).

## Epic 0 — Foundation
**#1 Monorepo scaffold** `infra` — pnpm workspaces, TS config, lint, Vitest, folder layout per AGENTS.md, **`next-intl` with en + hi message files wired in**.
AC: `pnpm i && pnpm lint && pnpm typecheck && pnpm test` green on clean clone.

**#2 Docker + compose + local env** `infra` — api/worker Dockerfiles, compose with Postgres+Redis (local), `.env.example`.
AC: `docker compose up` starts api+worker+deps; health endpoints 200.

**#3 CI/CD** `infra` — GH Actions: lint/type/test/build, container build, staging deploy, prod needs approval.
AC: PR blocked on red CI; staging deploys on main merge.

**#4 Observability baseline** `infra` — Sentry (web/api/worker), uptime check stub. (Section 7)
AC: thrown test error appears in Sentry.

## Epic 1 — Data & access
**#5 DB schema v1 + RLS** `db` `needs-human-review` — All entities per PRD 8.6 incl. P2/P3 tables (no logic). Source, created/updated/by on all rows.
AC: migrations apply clean; generated types in `packages/database`; RLS tests prove user A can't read user B.

**#6 Auth: OTP login** `auth` `blocked-client(DLT)` `needs-human-review` — AUTH-01, 02, 05, 06. Supabase phone OTP, custom SMS hook, SMS test mode.
AC: signup/login <60s in test mode; roles resolved; sign-out-all works.

**#7 OTP abuse protection** `auth` `needs-human-review` — AUTH-03, ADM-05. Turnstile, Upstash limits, daily cap + alert.
AC: >N requests/number blocked; no OTP without Turnstile token; cap alert fires in test.

**#8 Email verify (second contact)** `auth` — AUTH-04, NOT-02 (welcome/verify via Resend).

## Epic 2 — Profiles
**#9 Job seeker profile** `web` `api` — JS-01, 02, 05, 06, 07 (Aadhaar: last 4 + verified flag only, optional, consent shown), 08(tags). Student vs individual.
AC: profile complete score; phone/email never in any employer-facing response (test).

**#10 Business profile + public page + QR** `web` `api` — EMP-01, 02, 03, 05, MSME-02 fields.
AC: public page SSR, indexable, QR downloads.

**#11 Institution profile (basic)** `web` `api` — INT-01.

**#12 Profile PDF** `worker` `web` — JS-03. Must render Hindi (Devanagari font embedded). react-pdf, queued, cached until profile changes, concurrency cap.
AC: PDF <500ms typical; links clickable; 100 concurrent requests don't spike memory.

## Epic 3 — Jobs
**#13 Job CRUD + collar categories** `api` `web` — JOB-01, 04 (moderation basic).
**#14 Search + filters + SEO** `api` `web` — JOB-02. FTS indexes, filters, JSON-LD, sitemap.
AC: filters work; Google rich-result test passes; list page <2s.
**#15 Apply + status** `api` `web` — JOB-03. Employer sees applicants, not contacts.

## Epic 4 — Bulk onboarding (core of 50k goal)
**#16 Import upload + template + mapping UI** `web` `api` — BULK-01, 06.
**#17 Import worker: validate, dedupe, error report** `worker` — BULK-02, 04, 05. Streaming csv-parse, batches, progress, safe retry.
AC: 50k-row fixture <30 min; public site p95 unaffected; error CSV downloadable; `source` stored.
**#18 Invitations in controlled batches** `worker` `api` — BULK-03, NOT-01. Cost preview, approval, batch send.
AC: zero SMS at import (test); invited→OTP login completes profile.
**#38 Invite wave scheduler** `worker` `api` — BULK-03 extension. Schedule waves (N/day), pause/resume, per-wave cost preview, daily SMS cap link.
**#39 Employer-first launch metrics** `admin` — weekly report: registered / invited / activated / profile-complete / jobs posted, split by source.
**#19 bull-board** `infra` — queue dashboard, admin-only.
**#20 MSME + institution roles can import own data** `api` — MSME-01, scoped visibility.

## Epic 5 — Admin & trust
**#21 Basic admin** `admin` — ADM-01, 04.
**#22 Audit log** `api` `needs-human-review` — ADM-03. Append-only.
AC: admin can't UPDATE/DELETE audit rows (DB-level).
**#23 In-app notification centre** `web` — NOT-03.
**#24 Privacy: consent, deletion, policy pages** `web` `api` — DPDP principles. Legal review by client.

## Epic 6 — Launch readiness (₹5k pack)
**#25 Load test** `infra` — re-baseline after D9: 50k employer accounts, wave-driven OTP login spikes, 2x target; speed targets.
**#26 Backup restore drill** `infra`.
**#27 Alerts: spend (Vercel/SMS), errors, uptime** `infra`.
**#28 Security checklist + dependency scanning** `infra` `needs-human-review`.
**#29 Acceptance walkthrough vs PRD 14.1** — script each item.


## Epic 7 — Full extras (in scope, build after Epic 3)
**#30 Resume builder with templates** `web` `worker` — JS-04. Reuse PDF pipeline.
**#31 Social embeds on company page** `web` — EMP-04. Instagram/Facebook/YouTube; sanitize, lazy-load, no layout shift.
**#32 Full admin + reports** `admin` — ADM-02. Sign-ups, jobs, applications, imports, OTP/SMS spend.
**#33 Polish pass + extended testing** `web` — a11y check, device tests, copy review.

## Epic 8 — Hindi at launch (AUTH-07 pulled from P2 into MVP)
**#34 Hindi translation of all UI strings** `web` — complete `hi` message file; human translator review, not machine-only.
**#35 Language switcher + persisted preference** `web` `api` — user locale on profile; SSR respects it; Hindi SEO pages (`/hi/...`, hreflang).
**#36 Hindi in SMS/email templates** `api` `blocked-client(DLT)` — separate DLT-approved Hindi templates (Unicode SMS costs more per message — update cost preview).
**#37 Hindi QA** `web` — fonts on low-end Android, text overflow, PDF output.

## Deferred (create as P2/P3, don't Ready)
Wallet, institution CMS, placement dashboard, MSME broadcast/reports, agency tools, featured jobs/alerts (P2) · GEO, Job Work, custom domains, compliance tracking, web push (P3). Full-version extras: resume builder, social embeds, full admin reports.

## Blockers to clear before #6 / #17
SMS DLT registration started (**English + Hindi templates**); MSME sample file received (#17 can build against a synthetic 50k fixture meanwhile).
