# SECURITY DEFINER & Sensitive RPC Inventory (ADR 0002 / AUTHZ-06)

All `SECURITY DEFINER` procedures and sensitive financial/auth RPCs across `supabase/migrations/` are audited below. Direct `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` is revoked and blocked by CI (`pnpm db:catalog:check` checks 1–2 and `pnpm db:smoke:postgrest`).

| Schema & Function | Latest Definition Migration | Execution Mode & `search_path` | Callable Roles | Security & Invariant Controls |
| :--- | :--- | :--- | :--- | :--- |
| `public.increment_token_version(uuid)` | `20261110000001` | `SECURITY DEFINER`, `public, pg_temp` | `service_role` only | Strips PII from return columns; atomic `token_version` increment. |
| `public.get_district_employment_reports()` | `20261110000001` / `20261121000200` | `SECURITY DEFINER`, `public, pg_temp` | `service_role` only | Aggregate district counts only; zero candidate phone/email returned. |
| `public.promote_job_with_ledger(...)` | `20261110000001` / `20261121000200` | `SECURITY DEFINER`, `public, pg_temp` | `service_role` only | Verifies job ownership, `FOR UPDATE` ledger balance check, atomic debit. |
| `public.unlock_contact_with_ledger(...)` | `20261110000001` | `SECURITY DEFINER`, `public, pg_temp` | `service_role` only | Advisory lock, idempotency check, atomic debit, audit row. |
| `public.grant_starter_credits(uuid)` & user triggers | `20261102100000` / `20261110000001` | `SECURITY DEFINER`, `public, pg_temp` | `service_role` / triggers | Unique partial index enforces one-time 10-credit starter grant; auto-bumps `token_version` on role/status change. |
| `public.anonymise_user(uuid)` | `20261110000003` | `SECURITY DEFINER`, `public, pg_temp` | `service_role` only | DPDP erasure (`DEL_*` tombstone, session revocation, PII scrub, immutable `audit_logs` insert). |
| `public.prohibit_truncate_trigger()` | `20261110000004` / `20261110000005` | `SECURITY INVOKER`, `''` | Trigger only | Blocks `TRUNCATE` across 7 ledger/audit/payment/broadcast tables. |
| `private_payments.settle_payment(...)` & `public.rpc_settle_payment(...)` | `20261121000300` / `20261121000400` | `SECURITY DEFINER`, pinned | `service_role` only | Validates `amount_paise` against stored quote, gateway payment idempotency, advisory lock, `purpose` dispatch, immutable audit log. |
| `private_payments.create_sponsorship_grant(...)` | `20261121000400` | `SECURITY DEFINER`, pinned | `service_role` only | Scopes sponsored students strictly by `institution_id` (not free-text institution name). |
| `private_payments.charge_application(...)` & `public.rpc_charge_application(...)` | `20261121000300` | `SECURITY DEFINER`, pinned | `service_role` only | Checks active sponsorship before charging 1 credit; serializes wallet balance check. |
| `private_payments.apply_refund(...)` & `public.rpc_apply_refund(...)` | `20261121000500` | `SECURITY DEFINER`, pinned | `service_role` only | Reconciles credit clawback or sponsorship revocation idempotently. |
| `private_payments.record_dispute(...)` & `public.rpc_record_dispute(...)` | `20261121000500` | `SECURITY DEFINER`, pinned | `service_role` only | Idempotent dispute recording & audit log. |
| `private_payments.issue_invoice(...)`, `claim_outbox_batch(...)`, `complete_outbox(...)` | `20261121000500` | `SECURITY DEFINER`, pinned | `service_role` only | Sequential FY GST invoice generation (`INV-FY-XXXX`) & `SKIP LOCKED` outbox worker claim. |
| `public.search_jobs(...)` | `20261122130000` | `SECURITY INVOKER`, `public, pg_temp` | `service_role` only | Strips internal `source`, caps `p_limit` (`1..100`) & `p_offset` (`0..10000`). |
| `public.search_public_jobs(...)` & `public.read_public_institution_cms(...)` | `20261118085644` | `SECURITY INVOKER`, `''` | `service_role` only | Queries public projections cleanly without `BYPASSRLS`. |

## Residual Privilege Note (Before Option 3 Role Cutover)
While `anon` and `authenticated` cannot invoke any `SECURITY DEFINER` RPC or read/write private base tables (`db:catalog:check`), the API and worker still connect with `service_role` (`BYPASSRLS`). Restricting direct table writes on `payments`, `credit_ledgers`, and `institution_sponsorships` so only `jobsclick_finance` / vetted RPCs can mutate financial state is staged in [db-privilege-matrix.md](./db-privilege-matrix.md) (`AUTHZ-12`).
