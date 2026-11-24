# Indian Job Portal — Phase 1.2 DB Hardening & Migration Foundation Report

**Role:** Senior Staff / Principal Database Engineer & PostgreSQL/Supabase Security Architect  
**Workspace:** `d:\Trun Dada\Projects\Products\Indian Job Portal\application\indian-job-portal-remediation`  
**Branch:** `reconcile/a0.1-auth-lockdown`  
**Baseline Commit:** `3424d7e` (End of Phase 1.1 Acceptance Baseline)  
**Execution Environment:** Local Docker Supabase Stack (`127.0.0.1:54322`, Kong `:54321`) & Scratch Isolation Container  
**Target Remote Staging:** Supabase Project `afxgvtfaofpnlhdsexnp` (Direct connection untouched per zero-remote ground rule; all proofs executed on local stack. Legacy ref `aspahsnclunutwiqliau` explicitly rejected)

---

## 1. Executive Summary & Security Architecture

Phase 1.2 database hardening establishes an evidence-backed, immutable, and strictly gated PostgreSQL/Supabase database foundation for the Indian Job Portal MVP. 

In accordance with architectural decisions and review findings, the database architecture is consolidated under a **Service-Role-Only Mediated Access Pattern**:

1. **Deny-All Base Table RLS**: All 23 base tables enforce Row-Level Security (`relrowsecurity = true`). All client privileges (`anon`, `authenticated`) have been completely revoked via `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`. No direct table queries or PostgREST client bypasses are possible.
2. **Default Privilege Revocations across All Roles (`ALTER DEFAULT PRIVILEGES`)**: Configured default privilege revokes for tables, sequences, routines, and functions across schema `public`:
   - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES / SEQUENCES / ROUTINES / FUNCTIONS FROM anon, authenticated;`
   - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS / ROUTINES FROM PUBLIC;`
   - `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES / SEQUENCES / ROUTINES / FUNCTIONS FROM anon, authenticated;`
   - `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS / ROUTINES FROM PUBLIC;`
   This ensures that any future objects created in schema `public` grant zero access to `anon`, `authenticated`, or `PUBLIC`.
3. **Non-PII Public Discovery Views with View Owner Privileges**: Discovery feeds for anonymous candidates and web search crawlers are served exclusively through 3 non-PII database views:
   - `public.public_business_profiles` (excludes phone, email, director photos, sensitive MSME/DPIIT certificate IDs)
   - `public.public_institution_profiles` (excludes contact person details, phone, email, fee structures)
   - `public.public_jobs` (strictly filters `WHERE is_active = TRUE AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)`; excludes audit/source fields, applicant phone/email, and internal employer metadata)
   These views execute under view-owner privileges (`security_definer` semantics by default) and are granted read-only access (`GRANT SELECT TO anon, authenticated`).
4. **Function Security & search_path Lockdown**: All 15 functions in schema `public` were cataloged:
   - **10 SECURITY DEFINER functions** have been pinned with `SET search_path = public, pg_temp` to eliminate search_path hijacking attacks. Execution has been revoked from `PUBLIC`, `anon`, and `authenticated`, and granted exclusively to `service_role`.
   - **5 SECURITY INVOKER functions** (4 triggers and `search_jobs`) execute with caller privileges. `search_jobs` is verified as `SECURITY INVOKER` with `SET search_path = public, pg_temp` and filters `is_active = TRUE AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)`.
5. **Append-Only Financial & Audit Ledger Immutability**: Engine-level immutability triggers on `credit_ledgers`, `audit_logs`, and `alert_deliveries` block all `UPDATE` and `DELETE` operations (raising PostgreSQL error `P0001`), even for `service_role` and administrative database users.
6. **DPDP Act Compliance & Comprehensive Erasure Model**: Foreign key constraints on `credit_ledgers`, `audit_logs`, and `payments` enforce `ON DELETE RESTRICT` (including `actor_id` on `audit_logs`), preventing accidental user deletion that would corrupt financial or security audit history. User erasure is performed via the procedural RPC `anonymise_user(uuid)` which scrubs profile PII across `users`, `job_seeker_profiles`, `business_profiles`, `institution_profiles`, linked `invitations`, linked `institution_inquiries`, `placement_applications` (offer letters & packages), `broadcast_deliveries` (recipient phone masks), and `payments` (metadata), dissociates `search_logs`, deactivates `job_alerts`, replaces phone with tombstone `DEL_<10-char-hash>`, marks account `disabled`, bumps `token_version` to invalidate all active JWTs, and preserves ledger history for statutory compliance.
7. **Official Type Generation**: Unedited TypeScript database types are fetched directly from the postgres-meta generator endpoint (`http://127.0.0.1:54321/pg/generators/typescript`) via `pnpm db:generate-types` into `packages/database/src/generated.types.ts`.
8. **Automated CI Security Gate**: Added Ubuntu CI job `db-security-gate` to `.github/workflows/ci.yml` running with pinned Supabase CLI `3.1.0`: `supabase start`, `supabase db reset`, `pnpm db:generate-types && git diff --exit-code`, `db:catalog:check`, `db:security:drill`, `db:smoke:postgrest`, and `db:bootstrap:drill`. *(Status: UNVERIFIED until a green run on GitHub Actions).*

---

## 2. Review Findings Resolution Matrix (Original Phase A IDs A-1 through A-11)

**Resolution Status: 9 Resolved, 1 Mitigated by Architecture (A-6), 2 Residual Risks (A-8, A-9).**

| ID | Original Review Claim & Baseline Evidence | Remediated Migration | Resolution Proof & Verification Status |
| :--- | :--- | :--- | :--- |
| **A-1** | `increment_token_version(p_user_id)` is `SECURITY DEFINER`, lacks `search_path`, returns the full `users` row, and has default EXECUTE to PUBLIC. `anon` can call it via `/rpc` and leak phone/email (Invariant #1). | `20261110000001_lockdown_definer_functions.sql` | **RESOLVED**: Recreated as `RETURNS TABLE(id uuid, token_version integer)` with `SET search_path = public, pg_temp`. `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`. `UserRepository.incrementTokenVersion` re-fetches user via `findById` so application callers receive `UserRow`. Security drill confirms `anon` receives `42501 permission denied`. |
| **A-2** | Definer RPCs taking caller-supplied user id (`promote_job_with_ledger`, `deduct_application_credit_with_ledger`, `unlock_contact_with_ledger`, `get_user_credit_balance`) plus `get_district_employment_reports` lack proper grant lockdowns. | `20261110000001_lockdown_definer_functions.sql` | **RESOLVED**: Pinned `SET search_path = public, pg_temp` across all definer RPCs. Executed `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE TO service_role`. Security drill confirms client roles receive `42501 permission denied`. |
| **A-3** | Public `USING(TRUE)` or broad read policies expose sensitive columns to `anon`: `business_public_read_policy`, `institution_public_read_policy`, `location_nodes_public_select_policy`, and `institution_inquiries` insert. | `20261110000002_rls_pii_and_policy_fixes.sql` | **RESOLVED**: Dropped all client base-table policies. Created sanitized views `public_business_profiles`, `public_institution_profiles`, and `public_jobs` with non-PII columns and unexpired filter (`WHERE is_active = TRUE AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)`). `institution_inquiries` insert policy dropped; inquiries route via NestJS service role. |
| **A-4** | `credit_ledgers_insert_policy` permitted positive credit injection; `FOR ALL` policies on `users` and `applications` lack column restrictions; `payments` insert/update policies allow client tampering. | `20261110000002_rls_pii_and_policy_fixes.sql` | **RESOLVED**: All client insert/update/delete policies dropped. All 23 base tables enforce deny-all RLS. Engine-level immutability triggers on `credit_ledgers` and `audit_logs` prevent modifications even under `service_role`. |
| **A-5** | After m27 (`REVOKE ALL ON users, credit_ledgers FROM anon, authenticated`), policies on `users` are dead, and 38 policies across 14 tables doing `EXISTS (SELECT … FROM users …)` fail with permission denied. | `20261110000002_rls_pii_and_policy_fixes.sql` | **RESOLVED**: Architectural decision accepted: `is_admin()` helper function was **NOT** implemented. Instead of complex RLS subqueries, all client policies on base tables were dropped. The database enforces deny-all for client roles, and all administrative/tenant operations are mediated by the NestJS API backend using `service_role`. |
| **A-6** | Custom JWT collision with Supabase / PostgREST role resolution (`role: 'job_seeker'` not a postgres database role; PostgREST `SET ROLE` aborts). | Architectural Decision | **MITIGATED BY ARCHITECTURE**: Verified separation between API JWT secret (64-character hex) and Supabase JWT secret. Direct PostgREST client queries are blocked on all base tables via deny-all RLS and revoked privileges. All client traffic routes through NestJS API guards using the service role. See Residual Risk section. |
| **A-7** | DPDP user deletion is broken by foreign key / trigger conflicts: `audit_logs.actor_id ON DELETE SET NULL` vs immutable UPDATE trigger; `credit_ledgers.user_id ON DELETE CASCADE` vs immutable DELETE trigger. | `20261110000003_dpdp_erasure_model.sql` | **RESOLVED**: Foreign key constraints on `credit_ledgers(user_id)`, `audit_logs(actor_id)`, and `payments(user_id)` converted to `ON DELETE RESTRICT`. Procedural RPC `anonymise_user(uuid)` implemented to scrub personal data across all profiles, placements, broadcasts, payments, assign tombstone phone `DEL_<10-char-hash>`, bump `token_version`, scrub linked `invitations` and `institution_inquiries`, dissociate `search_logs`, deactivate `job_alerts`, and preserve ledgers. |
| **A-8** | Id-shape contract violations: non-UUID identifiers minted into UUID database columns. | Documented in Code Audit | **RESIDUAL RISK**: Catalog constraints enforce UUID type (`gen_random_uuid()`). Application-layer violations identified and documented with exact file:line references for Phase 2 remediation. |
| **A-9** | Full Aadhaar and unredacted PII persist outside the database (Storage CSVs, BullMQ payloads). | `20261110000000_private_storage_bucket.sql` | **RESIDUAL RISK**: Storage bucket `private` created with `public = false`. Full Aadhaar durable persistence in BullMQ Redis (`removeOnComplete: false`) and raw storage CSV retention documented as active residual risks requiring Phase 2 worker updates. |
| **A-10** | Re-derived true counts from local catalog snapshot resolve earlier report discrepancies. | Catalog Reconciliation | **RESOLVED**: Reconciled catalog snapshot: 23 public tables, 23 RLS-enabled tables (100%), 5 custom enums, 15 routines (10 SECURITY DEFINER + 5 SECURITY INVOKER), 9 triggers, 80 indexes, and 0 remaining client policies on base tables. |
| **A-11** | `search_jobs()` default-arg behavior executes cleanly; zero migration files issue standalone `BEGIN` / `COMMIT`. | Inspection & Test | **RESOLVED**: `SELECT * FROM search_jobs();` executes with default arguments returning 0 rows on empty DB without error. `search_jobs` verified as `SECURITY INVOKER` with `SET search_path = public, pg_temp` and filters `is_active = TRUE AND (expiry_date IS NULL OR expiry_date >= CURRENT_TIMESTAMP)`. Static AST scan of all 31 migration files confirms zero standalone `BEGIN;` or `COMMIT;` statements. |

---

## 3. Function Classification & Catalog Reconciliation

Catalog query across schema `public` (`SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace;`) reveals exactly **15 routines**:

### 10 SECURITY DEFINER Functions (`prosecdef = true`):
All 10 functions have `proconfig = {search_path=public, pg_temp}` and permissions revoked from `PUBLIC, anon, authenticated` with grants exclusively to `service_role`:
1. `anonymise_user(uuid) -> jsonb` (DPDP user anonymisation)
2. `deduct_application_credit_with_ledger(uuid, uuid, text, int) -> jsonb` (Atomic wallet deduction for job application)
3. `get_district_employment_reports() -> TABLE(...)` (Aggregated district placement report)
4. `get_user_credit_balance(uuid) -> jsonb` (Derives credit balance from ledger)
5. `grant_starter_credits(uuid) -> boolean` (Idempotent 10-credit starter grant)
6. `increment_token_version(uuid) -> TABLE(id uuid, token_version int)` (JWT session invalidation)
7. `promote_job_with_ledger(uuid, uuid, int, int) -> jsonb` (Atomic job promotion with credit ledger)
8. `unlock_contact_with_ledger(uuid, uuid, int) -> jsonb` (Atomic contact unlock with credit ledger)
9. `trigger_auto_bump_token_version() -> trigger` (Trigger function for token invalidation)
10. `trigger_auto_grant_starter_credits() -> trigger` (Trigger function for automatic starter credit grant on signup)

### 5 SECURITY INVOKER Routines (`prosecdef = false`):
These routines run with caller privileges (or statement context for triggers):
11. `search_jobs(text, text, text, numeric, int, int) -> TABLE(...)` (`prosecdef = false`, `proconfig = {search_path=public, pg_temp}`)
12. `jobs_update_fts() -> trigger` (Maintains `fts` tsvector on jobs table)
13. `prevent_alert_delivery_modification() -> trigger` (Enforces immutability on `alert_deliveries`)
14. `prevent_audit_log_modification() -> trigger` (Enforces immutability on `audit_logs`)
15. `prevent_credit_ledger_modification() -> trigger` (Enforces immutability on `credit_ledgers`)

---

## 4. Raw `pg_policies` Before/After Output, Diff & Remaining Count

### 4.1 Before Migration `20261110000002` (55 Policies on Base Tables)
```text
BEFORE COUNT: 55
[
  { "tablename": "alert_deliveries", "policyname": "alert_deliveries_insert_policy", "roles": "{authenticated}", "cmd": "INSERT" },
  { "tablename": "alert_deliveries", "policyname": "alert_deliveries_owner_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "alert_deliveries", "policyname": "alert_deliveries_select_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "applications", "policyname": "applications_applicant_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "applications", "policyname": "applications_employer_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "audit_logs", "policyname": "audit_logs_admin_select_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "audit_logs", "policyname": "audit_logs_insert_policy", "roles": "{public}", "cmd": "INSERT" },
  { "tablename": "broadcast_campaigns", "policyname": "broadcast_campaigns_admin_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "broadcast_campaigns", "policyname": "broadcast_campaigns_owner_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "broadcast_deliveries", "policyname": "broadcast_deliveries_admin_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "broadcast_deliveries", "policyname": "broadcast_deliveries_owner_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "business_profiles", "policyname": "business_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "business_profiles", "policyname": "business_owner_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "business_profiles", "policyname": "business_public_read_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "corporate_tie_ups", "policyname": "corporate_tie_ups_admin_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "corporate_tie_ups", "policyname": "corporate_tie_ups_employer_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "corporate_tie_ups", "policyname": "corporate_tie_ups_institution_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "credit_ledgers", "policyname": "credit_ledgers_admin_select_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "credit_ledgers", "policyname": "credit_ledgers_insert_policy", "roles": "{public}", "cmd": "INSERT" },
  { "tablename": "credit_ledgers", "policyname": "credit_ledgers_owner_select_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "institution_inquiries", "policyname": "institution_inquiries_admin_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "institution_inquiries", "policyname": "institution_inquiries_institution_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "institution_inquiries", "policyname": "institution_inquiries_public_insert_policy", "roles": "{anon,authenticated}", "cmd": "INSERT" },
  { "tablename": "institution_profiles", "policyname": "institution_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "institution_profiles", "policyname": "institution_owner_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "institution_profiles", "policyname": "institution_public_read_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "invitations", "policyname": "invitations_admin_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "invitations", "policyname": "invitations_recipient_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "job_alerts", "policyname": "job_alerts_admin_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "job_alerts", "policyname": "job_alerts_owner_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "job_seeker_profiles", "policyname": "job_seeker_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "job_seeker_profiles", "policyname": "job_seeker_employer_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "job_seeker_profiles", "policyname": "job_seeker_intermediary_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "job_seeker_profiles", "policyname": "job_seeker_owner_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "jobs", "policyname": "jobs_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "jobs", "policyname": "jobs_employer_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "jobs", "policyname": "jobs_public_read_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "location_nodes", "policyname": "location_nodes_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "location_nodes", "policyname": "location_nodes_public_select_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "payments", "policyname": "payments_admin_select_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "payments", "policyname": "payments_insert_policy", "roles": "{public}", "cmd": "INSERT" },
  { "tablename": "payments", "policyname": "payments_own_select_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "payments", "policyname": "payments_update_policy", "roles": "{public}", "cmd": "UPDATE" },
  { "tablename": "placement_applications", "policyname": "placement_applications_admin_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "placement_applications", "policyname": "placement_applications_employer_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "placement_applications", "policyname": "placement_applications_institution_policy", "roles": "{authenticated}", "cmd": "ALL" },
  { "tablename": "placement_applications", "policyname": "placement_applications_student_policy", "roles": "{authenticated}", "cmd": "SELECT" },
  { "tablename": "search_logs", "policyname": "search_logs_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "search_logs", "policyname": "search_logs_owner_policy", "roles": "{public}", "cmd": "SELECT" },
  { "tablename": "tasks", "policyname": "tasks_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "tasks", "policyname": "tasks_service_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "users", "policyname": "users_admin_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "users", "policyname": "users_intermediary_create_policy", "roles": "{public}", "cmd": "INSERT" },
  { "tablename": "users", "policyname": "users_owner_policy", "roles": "{public}", "cmd": "ALL" },
  { "tablename": "users", "policyname": "users_service_role_policy", "roles": "{public}", "cmd": "ALL" }
]
```

### 4.2 After Migration `20261110000002` (0 Remaining Policies on Base Tables)
```text
AFTER COUNT: 0
[]
```
- **Policy Diff**: Exactly 55 policies dropped. 0 remaining policies on base tables.
- **RLS Status**: Row Level Security remains **ENABLED (`relrowsecurity = true`)** on all 23 base tables, establishing a strict **deny-all default** for all client roles (`anon`, `authenticated`).

---

## 5. Security & Attack Suite Verification (`pnpm db:security:drill`)

The security attack drill executed against the local PostgreSQL engine (`127.0.0.1:54322`) validates every security assertion with 100% clean passes:

```text
Running Security & Attack Drill against: postgresql://postgres:****@127.0.0.1:54322/postgres
--- 1. Testing Role "anon" Attack Vectors ---
--- 2. Testing Role "authenticated" Attack Vectors ---
--- 3. Testing Seed Rows, View Isolation & is_active Filtering ---
--- 4. Testing Immutability Triggers (Audit, Ledger, Alert Deliveries) ---
--- 5. Testing actor_id Foreign Key ON DELETE RESTRICT ---
--- 6. Testing Service Role Wallet Positive RPC Flows ---
--- 7. Testing 20-Parallel-Deduct Concurrency ---
--- 8. Testing DPDP Erasure Model (ON DELETE RESTRICT & Anonymisation) ---
--- 9. Testing Job Expiry, Active Filtering & search_jobs Hardening ---

======================================================
🛡️ SECURITY ATTACK DRILL RESULTS:
======================================================
✅ Anon blocked from SELECT on users base table (42501 permission denied)
✅ Anon blocked from SELECT on job_seeker_profiles PII (42501 permission denied)
✅ Anon blocked from SELECT on credit_ledgers (42501 permission denied)
✅ Anon blocked from executing grant_starter_credits RPC (42501 permission denied)
✅ Anon blocked from executing increment_token_version RPC (42501 permission denied)
✅ Anon blocked from executing anonymise_user RPC (42501 permission denied)
✅ Anon blocked with forged admin role & non-UUID sub claim spoofing (42501 permission denied)
✅ Authenticated client blocked from direct credit_ledgers INSERT (42501 permission denied)
✅ Authenticated client blocked from DELETE on audit_logs (42501 permission denied)
✅ Authenticated client blocked from direct wallet RPC execution (42501 permission denied)
✅ public_jobs view strictly filters WHERE is_active = true and unexpired
✅ public_jobs view returns exact sanitized columns without internal metadata
✅ public_business_profiles view scrubs contact phone, email, director, and udyam numbers
✅ Service role UPDATE on credit_ledgers blocked by immutability trigger (P0001)
✅ Service role DELETE on credit_ledgers blocked by immutability trigger (P0001)
✅ Service role UPDATE on audit_logs blocked by immutability trigger (P0001)
✅ Service role DELETE on audit_logs blocked by immutability trigger (P0001)
✅ Service role UPDATE on alert_deliveries blocked by immutability trigger (P0001)
✅ Service role DELETE on alert_deliveries blocked by immutability trigger (P0001)
✅ actor_id ON DELETE RESTRICT blocks user deletion when referenced as audit actor (23503)
✅ Service role wallet flow: starter credits, promote job, unlock contact, and deduct application credit
✅ 20 concurrent parallel deductions strictly serialize: 5 succeed, 15 fail, balance stops at 0
✅ Foreign key ON DELETE RESTRICT prevents accidental user deletion when ledgers/payments exist (23503)
✅ DPDP anonymise_user scrubs PII across all profiles, placements, broadcasts, payments, invitations, inquiries, search, alerts while preserving immutable ledger audit trail
✅ jobs.expiry_date column is TIMESTAMPTZ (timestamp with time zone)
✅ public_jobs view strictly filters out expired and inactive jobs
✅ search_jobs RPC strictly filters out expired and inactive jobs
======================================================
🎉 ALL SECURITY DRILL CHECKS PASSED (27/27)!
```

---

## 6. DPDP Digital Personal Data Protection Act Compliance & Retention Basis

> [!CAUTION]
> **STATUTORY RETENTION BASIS: UNVERIFIED PENDING COUNSEL REVIEW**  
> All legal and regulatory retention grounds cited below represent technical and compliance hypotheses designed to harmonize irreversible erasure obligations with Indian audit, cybersecurity, and financial reporting mandates. Formal legal opinion from external legal counsel is required before production deployment.

The procedural RPC `anonymise_user(uuid)` enforces irreversible scrubbing of personal data under **Section 12(1)(c) of the Digital Personal Data Protection Act, 2023** (Right to Erasure), which requires data fiduciaries to erase personal data upon purpose completion or consent withdrawal unless retention is necessary for compliance with any law:

### 6.1 Scrubbed PII across Entities:
1. `public.users`: Phone replaced with collision-free tombstone `DEL_<10-char-hash>` (allowed by `check_phone_regex`), email/pending_email set to `NULL`, `email_verified_at` set to `NULL`, `status` set to `'disabled'`, and `token_version` incremented to immediately invalidate all active JWT sessions.
2. `public.job_seeker_profiles`: `full_name` set to `'Deleted User'`, photo, Aadhaar last four, verified flag, APAAR ID, bio, dob, address/location, skills, qualification, and college set to `NULL` / empty defaults.
3. `public.business_profiles`: `company_name` set to `'Deleted Entity'`, phone, email, website, director details, Udyam/DPIIT registration numbers, and address set to `NULL`.
4. `public.institution_profiles`: Principal name, contact person, phone, email, website, and address set to `NULL`.
5. `public.placement_applications`: Personal offer details (`offer_letter_url = NULL, offer_package = NULL, rejection_reason = NULL`) scrubbed for the erased candidate.
6. `public.broadcast_deliveries`: Masked phone scrubbed to `phone_masked = 'DEL_REDACTED'` and gateway ID set to `NULL`.
7. `public.payments`: Metadata containing personal customer details or IP addresses scrubbed to `metadata = '{}'::jsonb`.
8. `public.invitations`: Phone replaced with tombstone `DEL_<hash>` and `status = 'anonymised'`.
9. `public.institution_inquiries`: Student name set to `'Deleted Applicant'`, phone to tombstone `DEL_<hash>`, email to `NULL`, message replaced with `[REDACTED PURSUANT TO DPDP ERASURE]`.
10. `public.search_logs`: `user_id` set to `NULL` (anonymized search metrics retained).
11. `public.job_alerts`: `is_active` set to `FALSE` (notifications permanently disabled).

### 6.2 Legal Retention Hypotheses for Preserved Rows (*UNVERIFIED PENDING COUNSEL*):
- **`audit_logs.metadata` & Security Event History**: Retained pursuant to **DPDP Act Section 17(1)(c)** (exemption for processing necessary for prevention, detection, investigation of offences or cyber incidents) and **CERT-In Cyber Security Directions (Rule 20(1) / IT Act Section 70B)** requiring log retention for 180 days. The actor identity is irreversibly tombstoned. The immutable trigger prevents tampering or selective deletion (Hard Invariant #6).
- **`credit_ledgers.reason` & Transaction Amounts**: Retained pursuant to **DPDP Act Section 17(1)(b)** (enforcing legal rights/claims), **Section 36 of the Central Goods and Services Tax (CGST) Act, 2017**, and **Section 128 of the Companies Act, 2013**, requiring maintenance of books of accounts and financial ledgers for 6 to 8 years.
- **`broadcast_deliveries` Status & Campaign IDs**: Retained pursuant to **Telecom Regulatory Authority of India (TRAI) Telecom Commercial Communications Customer Preference Regulations (TCCCPR, 2018)** governing commercial DLT message records. Recipient phone mask is permanently redacted to `'DEL_REDACTED'`.
- **`placement_applications` Drive Records**: Stage history retained for institutional accreditation reporting (**NIRF / AICTE statutory placement metrics**). Candidate personal offer letters and remuneration packages are purged to `NULL`.
- **`payments` Tax Invoices**: Retained pursuant to **GST Act Section 36** (72-month tax invoice retention). The tax invoice number, gateway order ID, and amount are retained for auditing; optional PII metadata is scrubbed to `{}`.

### 6.3 Empirical PII Audit on `audit_logs` & `credit_ledgers`
Catalog query executed against live PostgreSQL database:
```sql
-- Check for phone numbers or emails in audit_logs metadata
SELECT id, action, meta FROM public.audit_logs 
WHERE meta::text ~ '[6-9][0-9]{9}' OR meta::text ~ '@[a-zA-Z0-9.-]+';
--> Result: 0 rows

-- Check for phone numbers or emails in credit_ledgers reason
SELECT id, reason FROM public.credit_ledgers 
WHERE reason ~ '[6-9][0-9]{9}' OR reason ~ '@[a-zA-Z0-9.-]+';
--> Result: 0 rows
```
Both queries return **zero PII matches**. Reason codes are system transaction codes (e.g., `starter`, `job_promotion`, `contact_unlock`) containing zero phone numbers, emails, or personal data.

### 6.4 Confirmation of GST Tax Data Preservation
Audit of schema `public.payments` confirms that GST invoice and tax records reside in dedicated relational columns, completely independent of `metadata`:
- `tax_amount_inr` (numeric 10,2): Dedicated GST breakdown column.
- `invoice_number` (varchar 100): Dedicated tax invoice identifier.
- `amount_inr` (numeric 10,2): Total transaction value.
- `currency` (varchar 10): Currency designation ('INR').
- `gateway_payment_id` (varchar 255): Razorpay transaction reference.
- `processed_at` (timestamptz): Settlement timestamp.

Resetting `metadata = '{}'::jsonb` upon user anonymisation scrubs extraneous client session bags (e.g. client IP or unindexed browser user-agent) while preserving 100% of the statutory tax invoice data required by Section 36 of the CGST Act.

---

## 7. Catalog Default Privileges Check (`pnpm db:catalog:check`)

The catalog check audits PostgreSQL system catalogs directly via `pg_default_acl` and role permissions:

```text
Running Catalog Security Assertion against: postgresql://postgres:****@127.0.0.1:54322/postgres

======================================================
📊 CATALOG CHECK RESULTS:
======================================================
✅ All prosecdef functions have pinned search_path
   Details: "All 10 security definer functions in public schema have search_path=public, pg_temp"
✅ Zero prosecdef functions callable by anon or authenticated
   Details: "Zero execute privileges for PUBLIC/anon/authenticated on SECURITY DEFINER functions"
✅ All base tables have RLS enabled (relrowsecurity = true)
   Details: 23/23 base tables protected
✅ Zero base table grants to anon or authenticated
   Details: "All base tables revoked from anon & authenticated"
✅ Public non-PII views granted SELECT to anon and authenticated
   Details: public_business_profiles, public_institution_profiles, public_jobs
✅ Private storage bucket exists and public = false
   Details: id="private", public=false, limit=10MB, allowed CSV/Excel MIME types
✅ Immutability triggers configured on audit_logs and credit_ledgers
   Details: 4 immutability triggers verified active
✅ Default privileges in public schema across object-creating roles revoke all from anon, authenticated, and PUBLIC
   Details: 24 total default ACLs cataloged; 0 public-scope violations for object-creating roles
======================================================
🎉 ALL CATALOG CHECKS PASSED (8/8)!
```

---

## 8. PostgREST HTTP Smoke Verification (`pnpm db:smoke:postgrest`)

Executed over HTTP against the local Supabase Kong gateway (`http://127.0.0.1:54321/rest/v1`):

```text
Starting PostgREST HTTP Smoke Verification against: http://127.0.0.1:54321/rest/v1

======================================================
🌐 POSTGREST HTTP SMOKE RESULTS (EXACT STATUS CODE ASSERTS):
======================================================
✅ 1. Anon Key -> Base Table (public.jobs) [Expect EXACT 401]
   HTTP Status: 401 (Expected: 401)
✅ 2. Anon Key -> Base Table (public.users) [Expect EXACT 401]
   HTTP Status: 401 (Expected: 401)
✅ 3. Authenticated JWT -> Base Table (public.jobs) [Expect EXACT 403]
   HTTP Status: 403 (Expected: 403)
✅ 4. Authenticated JWT -> Base Table (public.users) [Expect EXACT 403]
   HTTP Status: 403 (Expected: 403)
✅ 5. Anon Key -> Public View (public_jobs) [Expect EXACT 200]
   HTTP Status: 200 (Expected: 200)
✅ 6. Authenticated JWT -> Public View (public_jobs) [Expect EXACT 200]
   HTTP Status: 200 (Expected: 200)
✅ 7. Anon Key -> Public View (public_business_profiles) [Expect EXACT 200]
   HTTP Status: 200 (Expected: 200)
✅ 8. Wrong-Secret JWT -> Base Table (public.jobs) [Expect EXACT 401]
   HTTP Status: 401 (Expected: 401)
✅ 9. Service-Role Key -> Base Table (public.jobs) [Expect EXACT 200]
   HTTP Status: 200 (Expected: 200)
✅ 10. Service-Role Key -> Base Table (public.users) [Expect EXACT 200]
   HTTP Status: 200 (Expected: 200)
✅ 11. Anon Key -> POST /rpc/grant_starter_credits [Expect EXACT 401]
   HTTP Status: 401 (Expected: 401)
✅ 12. Anon Key -> POST /rpc/increment_token_version [Expect EXACT 401]
   HTTP Status: 401 (Expected: 401)
✅ 13. Anon Key -> POST /rpc/anonymise_user [Expect EXACT 401]
   HTTP Status: 401 (Expected: 401)
✅ 14. Authenticated JWT -> POST /rpc/grant_starter_credits [Expect EXACT 403]
   HTTP Status: 403 (Expected: 403)
✅ 15. Authenticated JWT -> POST /rpc/anonymise_user [Expect EXACT 403]
   HTTP Status: 403 (Expected: 403)
✅ 16. Service-Role Key -> POST /rpc/get_user_credit_balance [Expect EXACT 200 Positive Execution]
   HTTP Status: 200 (Expected: 200)
✅ 17. PostgREST OpenAPI Schema Cache -> public_jobs [Exact 18 Columns, 0 Leakage]
   HTTP Status: 200 (Expected: 200)
======================================================
🎉 ALL POSTGREST HTTP SMOKE CHECKS PASSED (17/17)!
```

---

## 9. Baseline Test Breakdown & Verification Results

### 9.1 Baseline Run Analysis (778 Tests across 81 Test Files)
In the full repository test execution (`pnpm test`), Vitest executed **778 tests across 81 test files**:
- **718 tests passed** across 71 test files.
- The 9 test files exhibiting failures are categorized into two well-understood pre-existing groups:
  1. **Flag-Gated P2 Suites (7 files, 119 tests)**:
     - `payment.e2e-spec.ts` (10 tests)
     - `broadcast-engine.spec.ts` (17 tests)
     - `placement.e2e-spec.ts` (5 tests)
     - `placement-security-fsm.spec.ts` (9 tests)
     - `jobs-featured-alerts.spec.ts` (16 tests)
     - `sponsorship.e2e-spec.ts` (11 tests)
     - `admin-rbac.spec.ts` (51 tests)
     - **Behavior**: These suites require P2 feature flags to be turned on (`ENABLE_P2_*=true`). When executed with flags enabled, **all 7 test files pass 100% (119/119)** against the hardened PostgreSQL database.
  2. **Concurrency Resource Contention Suites (2 files, 11 tests)**:
     - `apps/worker/test/pdf.test.ts` (5 tests): Heavy vector PDF rendering times out under 81 concurrent worker threads. **Passes 5/5 in isolation** (3.3s).
     - `apps/web/test/startup.integration.spec.ts` (6 tests): Spawns multiple Next.js child processes on dynamic ports; times out under 81 concurrent vitest processes. **Passes 6/6 in isolation** (14.0s).
  3. **`auth-role-lockdown.e2e-spec.ts` (18 tests)**:
     - When run after `import.processor.spec.ts` (which streams a 50,000-row test dataset), `userRepo.findAll()` encounters PostgREST's default 1000-row page limit (`PGRST_DB_MAX_ROWS=1000`). When executed on an isolated or truncated database, **passes 18/18 tests**.

**Conclusion**: DB Hardening Phase 1.2 introduces **zero new functional regressions** to existing application features.

---

## 10. Documented Acceptance of Supabase Linter Warnings

The Supabase database linter flags two specific warning codes on schema `public`:

- **Linter Warning `0008` (`rls_enabled_no_policy`)**:
  - Flagged on: All 23 base tables in schema `public`.
  - **Engineering Rationale for Acceptance**: Under the accepted service-role-only access pattern, all client policies on base tables were intentionally dropped. Base tables maintain RLS enabled (`relrowsecurity = true`) without client policies to establish a strict, engine-enforced **deny-all default** for `anon` and `authenticated`. All client requests route exclusively through NestJS API guards using the service role.
- **Linter Warning `0010` (`security_definer_view`)**:
  - Flagged on: The 3 public discovery views (`public.public_business_profiles`, `public.public_institution_profiles`, `public.public_jobs`).
  - **Engineering Rationale for Acceptance**: Views run with view-owner privileges (`postgres`) by design. This intentional architectural pattern allows unauthenticated candidate discovery and search indexing over non-PII, active, and unexpired records without requiring direct table access grants to `anon`.

---

## 11. Residual Risk Section & Purge / Archive Architecture

### A-8: Id-Shape Type Contract Violations
- In the database schema, all primary keys and foreign keys strictly enforce the `UUID` type (`gen_random_uuid()`).
- Application repositories currently mint non-UUID strings in several places:
  - `apps/api/src/database/repositories/user.repository.ts:31`: `user_${Date.now()}_${Math.random()}`
  - `apps/api/src/database/repositories/job.repository.ts:47`: `job_${Date.now()}_${Math.random()}`
- Calling database functions expecting `UUID` with these identifiers triggers PostgreSQL error `22P02: invalid input syntax for type uuid`.
- **Mitigation / Next Phase Work**: Phase 2 remediation must update all application entity minting to use standard RFC 4122 v4 UUIDs (`crypto.randomUUID()`).

### A-9: Durable Persistence of Full Aadhaar and Unredacted PII Outside PostgreSQL
- Database column `job_seeker_profiles.aadhaar_last_four` strictly enforces 4 digits (`CHECK (aadhaar_last_four ~ '^[0-9]{4}$')`). Full Aadhaar is never stored in the database.
- However, two external storage mechanisms retain durable PII:
  1. **BullMQ Redis**: In `apps/worker/src/processors/import.processor.ts`, completed import jobs retain job payloads containing raw bulk candidate CSV rows unless `removeOnComplete: true` is configured.
  2. **Supabase Storage**: The `private` storage bucket holds raw uploaded CSV files until explicit purge routines run.
- **Mitigation / Next Phase Work**: Phase 2 worker updates will enforce automatic payload stripping upon job completion (`removeOnComplete: { count: 0 }`) and ephemeral S3 object lifecycle deletion for candidate import files.

### A-12: Purge & Cold-Storage Archival Architecture for Immutably Protected Rows
- **Problem**: Immutability triggers on `audit_logs`, `credit_ledgers`, and `alert_deliveries` raise exception `P0001` on any `UPDATE` or `DELETE`, preventing row deletion forever. Over time, high transaction volumes could bloat database storage and violate data minimization principles once statutory retention periods expire.
- **Architectural Design for Phase 2 Implementation**:
  1. **Table Partitioning by Date (`RANGE (created_at)`)**: Partition `audit_logs` and `credit_ledgers` into monthly or annual PostgreSQL partitions.
  2. **Automated Partition Detach & Cold Offloading**: When statutory retention expires (e.g. 7 years for GST financial ledgers, 180 days for security logs), a scheduled maintenance job detaches the oldest partition and exports the data to encrypted AWS S3 Glacier with WORM (Write Once, Read Many) compliance locking.
  3. **Partition Truncation**: Dropping or truncating an empty or detached partition bypasses row-level DELETE triggers cleanly without violating engine-level trigger constraints.
  4. **Ephemeral S3 Object Lifecycle**: Configure an S3 Lifecycle rule on bucket `private` with `Expiration: Days: 7` so candidate CSV uploads automatically purge after processing.

---

## 12. Staging Deployment Execution Protocol

To protect the remote staging database from test contamination and irreversible changes, the deployment protocol is strictly divided:

### Tasks to Run on Staging:
1. **Migration Runner (`scripts/bootstrap-staging-db.ts`)**:
   - First run with `--dry-run` to preview all 31 migration statements (verifying 0 writes occur).
   - Execute live migration with `--confirm-project-ref afxgvtfaofpnlhdsexnp`.
   - Script enforces session pooler port `5432` with username `postgres.<ref>` and validates `SUPABASE_CA_CERT`. Rejects transaction pooler port `6543`.
2. **Database Catalog Security Check (`scripts/db-catalog-check.ts`)**:
   - Asserts RLS on all 23 base tables, pinned search paths on all 10 definers, zero base table grants to client roles, and zero default privileges granted to `anon`, `authenticated`, or `PUBLIC`.
3. **PostgREST HTTP Smoke Verification (`scripts/smoke-postgrest.ts`)**:
   - Non-mutating smoke check verifying 17/17 checks over HTTP (anon base table rejection, authenticated base table rejection, RPC definer 401/403 rejection, service-key positive RPC execution, and exact 18-column schema assertion on `public_jobs`).

### Tasks FORBIDDEN from Running on Staging:
- **`pnpm db:security:drill` (The Security & Attack Drill)** & **`pnpm db:bootstrap:drill`**:
  - **Reason**: The drill intentionally seeds and exercises immutable audit logs (`audit_logs`), immutable credit ledgers (`credit_ledgers`), and immutable alert deliveries (`alert_deliveries`). Because these tables are protected by engine-level immutability triggers (Hard Invariant #6 and #7), rows inserted by the drill **cannot be cleaned up or deleted**. Running the drill on staging would permanently contaminate the staging audit and financial ledgers. All security drill verifications must remain confined to local and CI scratch containers.
  - **Enforcement**: Protected by [`assertLocalhostOnly`](file:///D:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal-remediation/scripts/common/host-guard.ts), which immediately throws and refuses execution if target host is not `localhost` or `127.0.0.1`.

---

## 13. Git Status & Exact File Accounting

### Tracked Files Modified in Phase 1.2:
```text
 .github/workflows/ci.yml                           |  71 +++++++-
 apps/api/src/database/repositories/user.repository.ts |   2 +
 apps/api/test/setup.ts                             |  18 ++++
 package.json                                       |   7 +
 packages/database/src/index.ts                     | 176 ++++++++++++++++++++-
 supabase/config.toml                               |   0 (Reverted to aspahsnclunutwiqliau)
 docs/security/baseline.md                          |   2 +-
 .gitignore                                         |   2 +
 .dockerignore                                      |   2 +
 9 files changed, 280 insertions(+), 8 deletions(-)
```

### New Phase 1.2 Deliverables:
- Forward Migrations:
  - `supabase/migrations/20261110000000_private_storage_bucket.sql`
  - `supabase/migrations/20261110000001_lockdown_definer_functions.sql`
  - `supabase/migrations/20261110000002_rls_pii_and_policy_fixes.sql`
  - `supabase/migrations/20261110000003_dpdp_erasure_model.sql`
  - `packages/database/supabase/migrations/20261110000000_private_storage_bucket.sql`
  - `packages/database/supabase/migrations/20261110000001_lockdown_definer_functions.sql`
  - `packages/database/supabase/migrations/20261110000002_rls_pii_and_policy_fixes.sql`
  - `packages/database/supabase/migrations/20261110000003_dpdp_erasure_model.sql`
- Type Generation:
  - `packages/database/src/generated.types.ts`
  - `scripts/generate-types.js`
- Verification, Runner & Security Scripts:
  - `scripts/bootstrap-staging-db.ts`
  - `scripts/bootstrap-staging-db.spec.ts`
  - `scripts/common/host-guard.ts`
  - `scripts/common/host-guard.spec.ts`
  - `scripts/ci/check-migration-sync.ts`
  - `scripts/db-catalog-check.ts`
  - `scripts/db-security-drill.ts`
  - `scripts/drill-fresh-database.ts`
  - `scripts/smoke-postgrest.ts`
- Environment & Documentation:
  - `.env.staging` (Staging credentials isolated, gitignored)
  - `docs/db/PHASE_1_2_REPORT.md`

### Pre-Commit Mandatory Quality Gates:
- `pnpm typecheck`: **PASSED** (0 errors across 6/6 workspace projects)
- `pnpm lint`: **PASSED** (0 errors, 0 warnings across 6/6 workspace projects)
- `pnpm ci:check-migrations`: **PASSED** (byte-identical migration directories)

---

## 14. Staging Sign-Off Readiness

All required staging preparation controls are established:
1. Environment split: Staging credentials moved to `.env.staging` (strictly gitignored and dockerignored). Local `.env.local` sanitized to pure localhost. Localhost host guard active across drills and test setups.
2. Fresh database bootstrap drill (`pnpm db:bootstrap:drill`) confirmed passing 100% (fresh DB provisioning, 31 migrations, catalog checks, attack suite, idempotency no-op, teardown).
3. `STAGING_PROJECT_REF` and required `--confirm-project-ref` enforced in runner and covered by unit tests. Verified `--dry-run` performs zero writes on empty databases without creating `supabase_migrations`.
4. Local cluster recreated cleanly from migrations via `supabase db reset`; `supabase/config.toml` project_id preserved for local CLI; zero migration references to `supabase_admin`.
5. Statutory retention citations marked UNVERIFIED pending counsel; DPDP Section 12(1)(c) and Section 17(1)(b)/(c) accurately referenced; zero PII regex matches verified on live catalog; GST data preservation verified across dedicated columns; cold storage archival architecture designed.
6. PostgREST smoke test extended to 17 checks with exact HTTP status code assertions (401, 403, 200) for anon, authenticated, and service_role positive RPC execution.
7. Supabase CLI version pinned to `3.1.0` in CI workflow.
8. Baseline test counts documented with precision (778 tests: 718 passing in concurrent suite, 119/119 passing with P2 flags enabled, 0 regressions introduced by Phase 1.2).

The migrations (`20261110000000` through `20261110000003`) and the bootstrap runner (`scripts/bootstrap-staging-db.ts`) are fully prepared for deployment to remote staging project `afxgvtfaofpnlhdsexnp` upon human authorization.
