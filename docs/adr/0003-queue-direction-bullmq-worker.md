# ADR 0003: Queue Direction — BullMQ Worker vs Upstash QStash

- **Status:** Proposed — requires human approval (`#132`, `ready-for-human`)
- **Date:** 2026-11-27
- **Related Issues:** `#132` (Queue direction ADR), `#124` (Bound Redis job retention — implemented), `#134` (Invite wave claim-before-send)

---

## 1. Context

Early architecture notes referenced Upstash QStash as the target queue direction, while the live implementation evolved around a dedicated Node.js worker (`apps/worker`) running **BullMQ** on Redis (`ioredis`) and deployed on Railway Pro:

| Workload | Current Runtime Engine | Why It Lives There |
| :--- | :--- | :--- |
| `bulk-import` (50k CSV pipeline) | **BullMQ** (`apps/worker`) | Streaming download, chunked Postgres inserts, progress reporting (`job.updateProgress`), bounded retention (`#124`) |
| `invite-wave` (SMS wave dispatch) | **BullMQ** (`apps/worker`) | Per-batch Redis distributed lock (`lock:invite-batch:<batchId>`), `DelayedError` backoff when another wave holds the batch, mid-run pause/cancel checks, progress reporting |
| `pdf-generator` (worker path) + `PdfTaskService` | **BullMQ** + **QStash** (`qstash-webhook.controller.ts`) | Dual path: QStash triggers signed HTTP webhook or BullMQ runs `@react-pdf/renderer` directly |
| `broadcast-queue`, `alerts-queue` | **BullMQ** (`apps/worker`) | Batch fan-out, Redis idempotency sets, repeatable watchdog/digest schedules |
| `payments-reconcile`, `payments-expire`, `payments-refund`, `payments-invoice-outbox` | **BullMQ** (`apps/worker`) | Repeatable cron schedules, strict retention/dead-letter retention, DB-backed outbox |
| Legacy `invite_waves.qstash_message_id` | **QStash** (`cancelMessage` best-effort) | Cancellation fallback only when a wave has a stored `qstash_message_id` |

Meanwhile, `apps/api/src/bulk/bulk.service.ts` already enforces BullMQ as the single dispatch path for the 50k import & invite pipeline, and `/admin/queues*` exposes `bull-board` protected by `ADMIN_DASHBOARD_SECRET` (`#123`).

---

## 2. Questions Addressed (`#132`)

1. **Keep the BullMQ worker (Railway Pro runs it) or move to QStash?**
   **Decision: Keep the BullMQ worker (`apps/worker`) as the primary job orchestration engine.**
2. **If moving, what replaces batch locks, retries, and progress reporting?**
   Moving to pure QStash HTTP webhooks would require re-implementing:
   - Distributed batch locks + lock renewal + `DelayedError` rescheduling in API HTTP handlers (subject to HTTP request timeouts and Railway API worker saturation during 50k CSV imports).
   - Durable `job.updateProgress` tracking in Postgres polling tables.
   - `bull-board` operational visibility and dead-letter inspection.
   - Repeatable cron scheduling (`payments-*`, `alerts-queue`, `broadcast-watchdog`) across multiple API replicas without duplicate execution.
3. **Migration order for `bulk-import`, `invite-wave`, `broadcast`, and `alerts` queues?**
   No migration away from BullMQ is warranted. Instead, the **consolidation order** for the remaining QStash surface is:
   1. **Keep BullMQ** for `bulk-import`, `invite-wave`, `broadcast-queue`, `alerts-queue`, and `payments-*` (already primary).
   2. **Deprecate unused bulk QStash webhook dispatch**: keep `qstash-webhook.controller.ts` / `BulkController` QStash webhook handlers strictly behind `QstashSignatureGuard` + `QstashIdempotencyInterceptor` during transition, and retain `cancelMessage(wave.qstash_message_id)` only for in-flight legacy waves.
   3. **Optional post-MVP cleanup**: route `PdfTaskService` exclusively through BullMQ `pdf-generator` once staging telemetry confirms zero QStash-only PDF callers, reducing external webhook secret surface.

---

## 3. Trade-Offs

| Dimension | BullMQ (`apps/worker` + Redis) — **Chosen** | Upstash QStash (HTTP Webhooks to `apps/api`) |
| :--- | :--- | :--- |
| Long-running 50k CSV & PDF CPU work | Isolated in `apps/worker`; never blocks API HTTP event loop | Runs inside `apps/api` HTTP handlers; risks request timeouts & API latency spikes |
| Batch locking & `DelayedError` | Native Redis Lua locks + BullMQ `moveToDelayed` | Must be custom-built over Redis/Postgres + HTTP 429/503 retries |
| Operational visibility | Built-in `bull-board` (`/admin/queues`) | External Upstash console only |
| Redis memory risk | Mitigated by `#124` (`removeOnComplete` / `removeOnFail` bounds on all non-payment queues) | Zero Redis job key storage |
| Cost & complexity | Requires 1 Railway Pro worker service (already provisioned and monitored via `/health/ready`) | Per-message QStash pricing + HTTP ingress surface |

---

## 4. Consequences & Action Items

1. **Formalize BullMQ as canonical** in architecture docs and worker runbooks.
2. **Issue `#124` (`Bound Redis job retention on non-payment BullMQ queues`)**: Already implemented on `integration/staging` (commit `6fd6f1d`) and verified; **mark `#124` ready to close** upon merge.
3. **Unblock `#134`**: `invite.processor.ts` remains on BullMQ and adds Postgres atomic `claim_pending_invitations` (`FOR UPDATE SKIP LOCKED`), `{ error }` checks on every `supabase-js` write, stale-`sending` reaper, and Hindi `_HI` language routing.
