# AGENTS.md — Indian Jobs (Job Portal Platform)

Spec: `docs/PRD.md` (v1.3) + `docs/decisions/001-client-decisions.md` (overrides PRD where they differ). Requirement IDs (AUTH-01, BULK-03, …) are the shared vocabulary. Cite them in branches, commits, PRs, issues.

## Scope rules
- Build **MVP + Full extras + Hindi** (see decisions doc). Do not implement `P2`/`P3` features early unless the issue is labelled so.
- MVP DB schema must include P2/P3 tables (credit ledger, payment, location node, search log, task) but **no logic** on them.
- Out of scope: native apps, WhatsApp Business API, courses, video interviews, AI resume parsing, storing full Aadhaar numbers.
- Unclear requirement → open a question on the issue. Do not guess.

## Stack (fixed, do not swap)
- Monorepo: pnpm workspaces (no Turborepo).
  - `apps/web` Next.js + TS + Tailwind + shadcn/ui
  - `apps/api` NestJS on **Fastify adapter**, `nestjs-zod`, `@fastify/multipart` (no multer, no Express)
  - `apps/worker` plain Node + BullMQ (no web framework)
  - `packages/database` Supabase SQL migrations, RLS, generated types
  - `packages/validation` shared zod schemas (single source for form + API)
  - `packages/ui` shared components
- Postgres/Supabase (RLS = second lock), Supabase Storage, Supabase phone OTP with custom SMS hook (MSG91), Upstash Redis (`@upstash/ratelimit`, BullMQ), Cloudflare Turnstile, Resend, Sentry.
- PDF: `@react-pdf/renderer` (no headless browser). Search: Postgres FTS. QR: `qrcode`.
- Docker yes. Kubernetes no. Terraform only if AWS chosen.

## Hard invariants (never violate, test each)
1. Employer/anyone never sees a job seeker's phone or email. Contact only via platform message.
2. Bulk import creates users in `invited` state. **No SMS at import.** Invites go out in batches with cost preview.
3. Every bulk import row keeps `source`.
4. OTP: Turnstile before send, per-number/device/IP limits, cool-down, daily cap, spend alert.
5. Authz enforced in API guards AND RLS. A user sees only own data unless explicitly allowed.
6. Audit log (admin login, imports, exports, credit changes) is append-only, not editable by admins.
7. Credit balances derive from ledger only (P2). Never store mutable balance as truth.
8. Aadhaar: optional field, but **never store the full number**. Store last 4 digits + `verified` flag only (verified via licensed partner later). Never log it. APAAR ID optional. Show consent text before collecting either.
8a. i18n: English + Hindi at launch. **No hardcoded user-facing strings.** All copy in message files (`next-intl`), API errors return codes not prose. Hindi renders correctly in PDF (embed a Devanagari font).
9. Public job/company pages server-rendered + JobPosting JSON-LD.
10. No secrets in code. Never read/write `.env*` with real keys. Use `.env.example`.

## Workflow (one issue = one branch = one PR)
1. Read issue + cited PRD IDs.
2. Plan first (short). Post plan on issue for non-trivial work.
3. Failing test first (TDD). Then implement.
4. `pnpm lint && pnpm typecheck && pnpm test` must pass before PR.
5. Small PRs (<~400 lines diff). Conventional commits: `feat(auth): AUTH-03 otp rate limit`.
6. PR description: PRD IDs covered, how tested, anything deferred.
7. Verify before claiming done: run it, show output.

## Human-review-only (agent drafts, human approves)
RLS policies, auth/OTP flow, migrations touching existing data, anything with payments, DPDP consent text.

## Conventions
- TS strict. No `any`. Validate all input with zod at API boundary.
- Types from `packages/validation` and `packages/database`; do not redeclare.
- Config via env, validated at startup.
- Mobile-first, low-end Android, 4G. Public pages <2s target.
- Tests: unit (Vitest/Jest), API e2e, one import test with 50k-row fixture.
- Docs: when an issue changes behaviour, update `docs/PRD.md` or `docs/decisions/` in same PR.

## Skills usage
- superpowers: brainstorming → writing-plans → TDD → verification-before-completion, per issue.
- gstack: plan review before slice, QA before merge.
- mattpocock: TS/zod typing discipline for validation + API types.

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to repo label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (one `GLOSSARY.md` + `docs/adr/`). See `docs/agents/domain.md`.
