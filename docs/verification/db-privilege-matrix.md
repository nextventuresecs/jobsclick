# Least-Privilege Database Access & Option 3 Privilege Matrix (ADR 0002 / AUTHZ-12)

## Current Workload Inventory

| Workload | Code Consumers | Tables / Views / RPCs Used | Residual Excess Privilege Under Shared `service_role` |
| :--- | :--- | :--- | :--- |
| **`jobsclick_api`** (`apps/api`) | `UserRepository`, `ProfileRepository`, `JobRepository`, `ApplicationRepository`, `CorporateTieUpRepository`, `PlacementPipelineRepository`, `InquiryRepository`, `AuditLogRepository` (append only), `BulkService` (intake), `PublicDiscoveryRepository` | Read/write application entities; `INSERT` only on `audit_logs`; read `credit_ledgers` (`rpc_get_balance`); call non-settlement RPCs (`search_jobs`, `increment_token_version`, `anonymise_user`, `promote_job_with_ledger`, `rpc_charge_application`, `unlock_contact_with_ledger`) | Currently also holds unrestricted `service_role` write access to `payments`, `payment_refunds`, `invoices`, `credit_ledgers`, and full DDL owner schema objects. |
| **`jobsclick_worker`** (`apps/worker`) | `import.processor.ts`, `invite.processor.ts`, `pdf.processor.ts`, `broadcast.processor.ts`, `alerts.processor.ts`, `reconcile.processor.ts`, `outbox.processor.ts` | Read/update `bulk_import_batches`, `invite_waves`, `invitations`, `users`, `job_seeker_profiles`, `broadcast_campaigns`, `broadcast_deliveries`, `job_alerts`, `alert_deliveries`, `jobs`; storage `private` bucket; `rpc_claim_outbox_batch`, `rpc_complete_outbox` | Does not need access to `audit_logs` reads, admin exports, `institution_cms`, or arbitrary `payments` writes. |
| **`jobsclick_finance`** (FinTech RPCs / webhooks / settlement) | `PaymentRepository` settlement, Razorpay webhooks, invoice outbox & refunds | `private_payments.*` RPCs (`rpc_settle_payment`, `rpc_apply_refund`, `rpc_record_dispute`, `rpc_issue_invoice`), `payments`, `credit_ledgers`, `invoices`, `payment_refunds`, `institution_sponsorships` | Isolates all financial mutations from normal web/worker traffic. |
| **`jobsclick_migrator`** (CI / deploy bootstrap) | `scripts/bootstrap-staging-db.ts`, Supabase CLI migrations | Schema DDL across `public` and `private_payments` | Used only in CI / deployment windows; never mounted in API or worker runtime containers. |
| **`anon` / `authenticated`** (Browser Supabase JS) | Google OAuth PKCE code exchange only | `SELECT` only on `public_business_profiles` and `public_jobs` | Zero base-table grants, zero `SECURITY DEFINER` execute grants (`db:catalog:check`). |

## Staged Cutover Prerequisites (Before Runtime Role Switch)

Because all base tables enable Row-Level Security with zero end-user policies (`deny-all` default under ADR 0002), any runtime role **without** `BYPASSRLS` (`jobsclick_api`, `jobsclick_worker`, `jobsclick_finance`) requires explicit scoped workload policies (or `SECURITY DEFINER` gateways) alongside PostgREST `authenticator` role membership (`GRANT jobsclick_api TO authenticator;`) or direct `pg` role credentials.

Provisioned cleanly without impacting active `service_role` traffic in [`20261126000200_least_privilege_db_roles.sql`](../../supabase/migrations/20261126000200_least_privilege_db_roles.sql):
1. Creates `jobsclick_api`, `jobsclick_worker`, `jobsclick_finance`, `jobsclick_migrator` as `NOLOGIN NOINHERIT NOBYPASSRLS`.
2. Grants exact minimal schema, table, and function privileges per workload.
3. Preserves zero privileges for `PUBLIC`, `anon`, and `authenticated`.
4. Staging/prod runtime cutover occurs in Phase 2 once workload RLS policies + bulk 50k-row benchmarks are verified and Supabase legacy API keys (`anon`/`service_role`) are rotated to publishable/secret keys ahead of early-2027 deprecation.
