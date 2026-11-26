# ADR 0002: API-Enforced Authorization, Tenant Isolation and Database Access Hardening

- **Status:** Approved with Pre-Launch Security Conditions (#127 resolved 2026-11-26 — Option 1 retained for MVP with P0 release blockers and phased evolution to Option 3)
- **Date:** 2026-11-26
- **Amends:** Hard invariant #5 in `AGENTS.md`; the "RLS = second lock" wording in `AGENTS.md`, `docs/decisions/001-client-decisions.md`, and `docs/PRD.md`; the RLS-enforced multi-tenancy claim in [ADR 0001](./0001-phase-2-architecture-and-security-hardening.md) §2 (item 4) and §6.1
- **Decision:** Retain **Option 1** (API-enforced authorization + deny-all database access backstop) for MVP launch, enforce mandatory **P0** pre-launch gates, and evolve toward **Option 3** (API-enforced authorization with least-privilege database roles).

---

## 1. Context

Hard Invariant #5 previously stated: *"Authz enforced in API guards AND RLS."* The implemented architecture does not behave that way at runtime:

| Fact (verified on `integration/staging`) | Architectural Consequence |
|---|---|
| Users authenticate with an API-minted HS256 JWT (`iss=jobsclick-api`, `aud=jobsclick-web`, claims `sub`, `tv`, `jti`), not a Supabase Auth JWT (`role=authenticated`, `auth.uid()`) | Row-level policies keyed on `auth.uid()` cannot identify the end user |
| Both API (`apps/api`) and background worker (`apps/worker`) connect to Postgres with `service_role` (`BYPASSRLS`) | PostgreSQL RLS never evaluates for normal application or worker traffic |
| `createUserScopedSupabaseClient` and `USER_SCOPED_SUPABASE_FACTORY` are wired in DI without production consumers | User-scoped RLS execution is inactive dead wiring |
| Base tables have RLS enabled and zero table grants to `anon`/`authenticated`; only `public_business_profiles` and `public_jobs` are readable (`db:catalog:check` checks 3–5, `db:smoke:postgrest`) | Browser clients using the `anon` key cannot read or write private base tables |
| Money and PII mutations use `SECURITY DEFINER` RPCs with execute revoked from `PUBLIC`/`anon`/`authenticated` (`db:catalog:check` check 2) | Client roles cannot invoke sensitive RPCs directly |
| The browser uses `supabase-js` solely for Google OAuth PKCE code exchange | There is no direct client-side table/mutation data access |

### Failure-Mode Distinction

| Attack Scenario | Protected Today? |
|---|---|
| Anonymous direct access to private tables | **Yes**, by revoked DB table privileges |
| Authenticated direct access to private tables | **Yes**, by revoked DB table privileges |
| Accidental grant exposure on private tables | **Conditionally**, by enabled RLS default-deny |
| Cross-tenant API request | **Depends on API guard and service logic** |
| Missing repository tenant filter | **No independent database protection** |
| Compromised `service_role` credential | **No tenant isolation** (`BYPASSRLS` + broad schema access) |
| Unauthorized sensitive RPC call through API | **Depends on API guard and RPC validation** |

The API is therefore the primary runtime authorization boundary. Automated authorization tests provide regression protection, **not** an independent runtime security boundary against bugs that escape testing.

---

## 2. Options Considered

- **Option 1 — API-only authorization with deny-all DB backstop (MVP baseline).** Retain `service_role` application access for MVP launch, keep base tables deny-all to `anon`/`authenticated`, and enforce strict P0 pre-launch verification in API/repository layers.
- **Option 2 — Full user-scoped RLS (deferred).** Mint Supabase-compatible JWTs (using supported third-party auth integrations, asymmetric signing options, or staged token migration — not strictly requiring secret equality or instant full token invalidation) and maintain per-table policies for reads, inserts, updates, and deletes (preliminary estimate: 6–8 engineer-days plus policy test matrix and bulk workload benchmarking).
- **Option 3 — API-enforced authorization with least-privilege database roles (target evolution).** Keep API authorization + custom JWTs, replace shared `service_role` usage with scoped Postgres identities (`jobsclick_api`, `jobsclick_worker`, `jobsclick_finance`, `jobsclick_migrator`, public client role) to reduce credential blast radius without breaking bulk performance or custom auth.

### Option Comparison

| Criteria | Option 1 (Current MVP Baseline) | Option 2 (User-Scoped RLS) | Option 3 (Target Evolution) |
| :--- | :--- | :--- | :--- |
| Custom JWT compatibility | Yes | Requires JWT integration / migration | Yes |
| API authorization | Yes | Yes | Yes |
| User-level RLS | No | Yes | No |
| Tenant-scoped repositories | Yes | Recommended | Yes |
| Restricted database roles | Partial (service role initially) | Possible | **Yes** |
| Reduced credential blast radius | Limited | Partial | **Stronger** |
| Independent DB tenant isolation | No | For scoped user traffic | No (relies on API/repository scoping) |
| Implementation effort | Low | High | Medium |

---

## 3. Decision & Architectural Controls

**Adopt Option 1 for MVP launch, rename/rewrite Hard Invariant #5 to match runtime truth, require P0 pre-launch gates before production, and progressively evolve toward Option 3.**

The API is the primary runtime authorization boundary. Database grants and RLS protect against unauthorized direct database access. Automated authorization tests provide regression protection but do not constitute an independent runtime authorization boundary.

### 3.1 Layered Authorization Model (RBAC + ABAC + ReBAC)

Pure RBAC is insufficient because institution membership, sponsored students, and MSME department workflows depend on attributes and entity relationships:

- **RBAC (Role-Based):** Baseline role enforcement (`job_seeker`, `employer`, `intermediary`, `msme_admin`, `admin`).
- **ABAC (Attribute-Based):** Account status (`active` vs `suspended`/`invited`), sponsorship active flags, publication state, and department/feature flags.
- **ReBAC (Relationship-Based):** Institution ownership/intermediary management, student enrollment links, employer job ownership, and corporate placement tie-ups.

```text
Client (Next.js Web / Future Clients)
  │
  ▼
API Authentication (HS256 JWT verify, token_version / session validity, account status)
  │
  ▼
Centralized Authorization Policy (RBAC + ABAC + ReBAC -> builds trusted AuthorizationContext)
  │
  ▼
Domain Service Layer (workflow state, ownership, business invariants)
  │
  ▼
Tenant-Scoped Repository (mandatory AuthorizationContext + atomic tenant predicates)
  │
  ├──► Normal DB Access (Option 3 target: jobsclick_api / jobsclick_worker)
  └──► Sensitive RPCs (SECURITY DEFINER with restricted EXECUTE, search_path, audit & idempotency)
  │
  ▼
PostgreSQL / Supabase (deny-all grants & RLS backstop for anon/authenticated, constraints, append-only audit logs)
```

### 3.2 Repository Tenant Scoping Standard

Repositories must accept a trusted server-constructed `AuthorizationContext` rather than relying on bare record IDs or unverified client-supplied tenant IDs.

```typescript
export type AuthorizationContext = Readonly<{
  actorId: string;
  role: string;
  tenant: {
    type: 'institution' | 'business';
    id: string;
  };
  permissions: readonly string[];
  requestId: string;
}>;
```

- Repository reads must filter explicitly by both resource ID and `ctx.tenant.id` (`eq('business_id', ctx.tenant.id)` / `eq('institution_id', ctx.tenant.id)`).
- Repository **updates and deletes** must embed the tenant predicate directly inside the mutating query (`WHERE id = $1 AND tenant_id = $2`), never relying solely on a prior read check.
- Avoid `select('*')`; project explicit column allowlists matching controller output schemas.

### 3.3 `SECURITY DEFINER` Function Hardening

Using `SECURITY DEFINER` does not automatically guarantee secure mutations (PostgreSQL runs such functions with owner privileges, and `service_role` bypasses RLS on direct table writes unless table privileges are restricted). Every sensitive RPC must enforce:

1. Pinned safe `search_path` (`SET search_path = public, pg_temp` or `SET search_path = ''` with schema-qualified references).
2. Explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated` and narrow `GRANT EXECUTE` (covering default privileges).
3. Actor, resource, and tenant relationship validation inside the function where applicable.
4. Business invariant checks, transactional atomicity, append-only audit logging, and idempotency keys for retryable operations.

### 3.4 Least-Privilege Database Identity Separation (Option 3 Target)

Sharing a single unrestricted `service_role` credential across API, background workers, and migrations maximizes blast radius. The target role model separates duties:

| Proposed Database Identity | Responsibility |
| :--- | :--- |
| `jobsclick_api` | Normal API application reads and writes (least-privilege grants) |
| `jobsclick_worker` | Bulk import, resume PDF rendering, and background dispatch tasks |
| `jobsclick_finance` | Restricted settlement, refund, and ledger financial RPC execution |
| `jobsclick_migrator` | Schema migrations and DDL changes only |
| `anon` / `authenticated` | Zero base-table grants; approved public views only |

Additionally, plan migration away from Supabase's legacy `anon` and `service_role` API keys to publishable/secret keys ahead of early-2027 deprecation. Switching to a Supabase secret key does not bypass the need for least-privilege Postgres roles because secret keys also carry `BYPASSRLS`.

### 3.5 Public Views Verification (`public_business_profiles`, `public_jobs`)

Only `public_business_profiles` and `public_jobs` are readable by `anon` and `authenticated`:
- Both must use explicit column allowlists excluding private phone/email PII and internal UUID foreign keys (`id`, `employer_id`, `user_id`).
- Visibility filters must exclude unpublished jobs, expired postings, and suspended/inactive accounts (`public_jobs` already filters `is_active` and `expiry_date`; `public_business_profiles` active-owner filtering must be verified/enforced before launch).
- View `security_invoker` / owner execution semantics must be audited alongside `db:catalog:check` so views cannot leak restricted rows from underlying tables.

---

## 4. Expanded Authorization Test Matrix (Mandatory Coverage)

Existing and new endpoints accepting identifiers or operating on tenant resources must verify rejection (with **zero database mutations or queued side effects** on denied writes):

| Scenario | Expected Outcome |
| :--- | :--- |
| Missing or invalid JWT | `401 Unauthorized` |
| Expired JWT or revoked session (`token_version` mismatch) | `401 Unauthorized` |
| Authorized user accessing own tenant | Success (`2xx`) |
| Same role, different tenant (`institution` or `business`) | `403` / `404` |
| Unauthorized role within same tenant | `403` / `404` |
| Suspended institution or inactive user account | Denied (`403`) |
| Removed tenant membership | Denied (`403`) |
| Unauthorized MSME department / scope | Denied (`403`) |
| Forged tenant ID injected in request body/query | Ignored or Denied (`403`) |
| Cross-tenant nested resource ID (e.g., student/application/tie-up) | Denied (`403` / `404`) |
| Mixed-tenant bulk request | Denied or restricted to authorized subset |
| Cross-tenant search, listing, or CSV export | Zero cross-tenant rows / Denied |
| Unauthorized financial mutation or replay | Denied (`403` / `404` / idempotent) |
| Unauthorized PII access or field modification (mass assignment) | Denied (`400` / `403`) |
| Direct private table read/write via PostgREST (`anon` / `authenticated`) | Denied (`db:smoke:postgrest`) |

---

## 5. Rewritten Hard Invariant #5

> **Hard Invariant #5 — Authorization and Data Isolation**
>
> Authorization is deny-by-default and enforced by trusted server-side application components. Every protected operation must validate the authenticated actor, required permissions, tenant membership, and applicable resource ownership or relationships.
>
> Tenant-owned data must be accessed through explicitly scoped repositories or authorized domain operations. Tenant context must be derived from validated server-side authorization state and must never be trusted solely from client-provided identifiers.
>
> Direct access to application-owned private database tables is denied to `anon` and `authenticated` roles through restricted database grants and enabled Row-Level Security (RLS). Only explicitly approved public read surfaces may be exposed.
>
> Privileged database credentials must remain confined to authorized server-side workloads. Sensitive financial and PII mutations must use approved, audited database functions with restricted execution privileges, pinned `search_path`, and business invariant validation.
>
> Application-level authorization is the primary runtime tenant-isolation boundary. RLS does not provide user-level tenant isolation for privileged application traffic that bypasses it.
>
> These controls are verified through blocking CI checks, including `db:catalog:check`, `db:smoke:postgrest`, authorization regression tests, cross-tenant isolation tests, and credential exposure checks.

---

## 6. Revisit Triggers

Reopen Option 2 (full user-scoped RLS) if any of the following occur:
- Direct client-side database reads/writes are introduced (e.g., Supabase Realtime subscriptions, mobile client direct PostgREST access, or direct analyst/BI access).
- A regulatory, government data-sharing, or audit mandate requires database-level row isolation independent of the API.
- Any IDOR or cross-tenant isolation failure is discovered in production or penetration testing.
- Authentication migrates to Supabase Auth with native `auth.uid()` sessions.

---

## 7. Implementation Roadmap & Acceptance Gates

### P0 — Mandatory Before Production Launch (Security Release Blockers)
- [x] `db:catalog:check` check 3 & check 4 enforce RLS enabled and zero base-table grants to `anon`/`authenticated` ([`scripts/db-catalog-check.ts`](../../scripts/db-catalog-check.ts) + [`scripts/db-catalog-check.spec.ts`](../../scripts/db-catalog-check.spec.ts)).
- [x] `db:smoke:postgrest` asserts direct PostgREST access to private tables/columns is denied in CI.
- [ ] Complete the 18-scenario OWASP authorization & IDOR matrix across all existing endpoints (including zero-side-effect assertions on denied mutations).
- [ ] Audit and enforce server-derived `AuthorizationContext` and atomic tenant predicates across all existing repositories.
- [ ] Assert in CI that `SUPABASE_SERVICE_ROLE_KEY` (and any privileged DB secret) is absent from `apps/web` build artifacts and `NEXT_PUBLIC_*` env vars.
- [ ] Complete audit of all sensitive `SECURITY DEFINER` RPCs for pinned `search_path`, execution privileges, actor/tenant validation, and idempotency.
- [ ] Verify public views (`public_business_profiles`, `public_jobs`) filter suspended/inactive owners as well as unapproved columns, and confirm JWT validation + `token_version` session revocation end-to-end.

### P1 — Immediate Hardening (Pre-Launch Where Feasible)
- [ ] Remove unused `USER_SCOPED_SUPABASE_FACTORY` / `createUserScopedSupabaseClient` wiring (`apps/api/src/database/supabase.provider.ts`, `database.module.ts`, and `auth-rls.e2e-spec.ts` factory test).
- [ ] Separate API and background worker database credential identities.
- [ ] Emit structured authorization failure/denial audit events (zero PII).
- [ ] Expand automated `db:catalog:check` assertions for privileged RPC grants and indirect access via views/functions/storage.
- [ ] Plan Supabase legacy `anon`/`service_role` API key migration to publishable/secret keys ahead of early-2027 deprecation.

### P2 — Post-Launch Architectural Hardening (Option 3 Evolution)
- [ ] Complete migration to least-privilege database roles (`jobsclick_api`, `jobsclick_worker`, `jobsclick_finance`, `jobsclick_migrator`).
- [ ] Restrict financial table mutations exclusively to `jobsclick_finance` / vetted financial RPCs.
- [ ] Benchmark user-scoped RLS against representative 50,000-row bulk workloads and re-evaluate Option 2 vs Option 3 after independent security assessment.
