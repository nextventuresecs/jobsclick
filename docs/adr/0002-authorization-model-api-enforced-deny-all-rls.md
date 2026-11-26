# ADR 0002: Authorization model — API-enforced, with RLS as a deny-all backstop

- **Status:** Approved (#127 resolved 2026-11-26 — Option 1 approved by human)
- **Date:** 2026-11-26
- **Amends:** Hard invariant #5 in `AGENTS.md`; the "RLS = second lock" wording in `AGENTS.md`, `docs/decisions/001-client-decisions.md`, and `docs/PRD.md`; the RLS-enforced multi-tenancy claim in [ADR 0001](./0001-phase-2-architecture-and-security-hardening.md) §2 (item 4) and §6.1
- **Decision:** Option 1 — API-only authorization, RLS kept as a deny-all backstop

## 1. Context

Invariant #5 reads "Authz enforced in API guards AND RLS." The code does not do that today:

| Fact (verified on `integration/staging`) | Consequence |
|---|---|
| Users authenticate with an API-minted HS256 JWT (`iss=jobsclick-api`, `aud=jobsclick-web`, claims `sub`, `tv`, `jti`). It is not a Supabase Auth JWT: no `role=authenticated`, no `auth.uid()` semantics | RLS policies keyed on `auth.uid()` cannot see the user |
| The API and worker reach Postgres with the service role (`BYPASSRLS`) | RLS never evaluates for application traffic |
| `createUserScopedSupabaseClient` and `USER_SCOPED_SUPABASE_FACTORY` are wired in DI but have no production consumers | The "second lock" path is dead code |
| All base tables have RLS enabled and **zero** table grants to `anon`/`authenticated`; only two public views (`public_business_profiles`, `public_jobs`) are readable (`db:catalog:check` checks 3 to 5, plus `db:smoke:postgrest` in CI) | The anon key shipped to the browser cannot read or write any table |
| Money and PII mutations run in SECURITY DEFINER functions with execute revoked from `PUBLIC`/`anon`/`authenticated` (`db:catalog:check` check 2) | Sensitive writes already have a single audited entry point |
| The browser uses supabase-js only for Google OAuth code exchange | There is no client-side direct data access to protect |

So the real defence today is: (1) API guards, (2) a deny-all database surface that PostgREST cannot be used against. The invariant text overstates this.

## 2. Options

**Option 1 — API-only authorization (chosen).** Keep service-role access from the API/worker only. Keep RLS enabled on every table with no grants to `anon`/`authenticated`, so any accidental PostgREST exposure is a hard deny. Rewrite invariant #5 to say that.

**Option 2 — Build the second lock.** Mint Supabase-compatible JWTs (or move to Supabase Auth), use per-request user-scoped clients, and write and maintain per-table policies.
- Needs the API signing secret to equal the Supabase JWT secret, or a migration to Supabase Auth. That widens the blast radius of the signing key and invalidates every issued token.
- Policies for institution tenancy, sponsored students, MSME department scope and admin roles must be written and kept in lock-step with API guards. Estimate: 6 to 8 engineer-days plus a policy test matrix.
- Adds per-request role switching and policy evaluation cost on 50,000-row bulk paths; the bulk worker would still need service role.
- Most heavy flows (settlement, grants, erasure, broadcast, bulk) are SECURITY DEFINER or worker-side and would bypass RLS anyway, so the second lock would cover only simple reads.

## 3. Decision

Adopt Option 1 for the MVP launch. The second lock is the **deny-all database surface plus an authorization test suite**, not user-scoped RLS.

### Rewritten invariant #5
> Authorization is enforced in API guards and repository tenant scoping. The database is deny-all to `anon` and `authenticated` (RLS enabled on every table, no table grants), and sensitive mutations run only in SECURITY DEFINER functions callable by the service role. This is verified in CI by `db:catalog:check` and `db:smoke:postgrest`.

### Compensating controls (required, since there is no user-level RLS)
1. **IDOR/tenancy test matrix.** Every endpoint that takes an id must have a negative test: a user, an institution admin or an MSME admin from another tenant gets 403/404. This is the replacement for the second lock and is a merge gate for new endpoints.
2. **Service-role key confinement.** The service-role key exists only in the API and worker environments. It is never in the web image or any `NEXT_PUBLIC_*` variable. CI asserts the web build env contains no service-role value.
3. **Catalog gate stays blocking.** `db:catalog:check` already fails CI if any base table lacks RLS or has a grant to `anon`/`authenticated`, or if a SECURITY DEFINER function is executable by them. No change needed; this ADR names it as the acceptance test for the decision.
4. **Least-privilege follow-up.** Replace `service_role` for application traffic with a dedicated Postgres role granted only the RPCs and tables the API needs. Track as a post-launch hardening ticket.
5. **Repository scoping.** New repositories take the tenant id (institution/business) as a required argument; no unscoped `select` on tenant tables from a controller path.

## 4. Consequences

- **Accepted risk:** an authorization bug in the API (for example an IDOR) is not caught by the database. The compensating controls above reduce, but do not remove, that risk. Compromise of the API process or its service-role key means full database access.
- The unused user-scoped client wiring should be removed to avoid implying it is active.
- ADR 0001's statement that multi-tenancy is "enforced via PostgreSQL Row-Level Security" is superseded; tenancy is enforced in the API and repositories.
- If Option 2 is wanted later, the ADR triggers below apply and the work is additive: deny-all grants already hold.

## 5. Revisit triggers

Reopen this decision if any of these happens:
- a requirement for direct client-side reads (Realtime, a mobile app using the Supabase client), or analyst/BI access to the database;
- a government data-sharing or audit requirement that mandates database-level tenant isolation;
- any IDOR or cross-tenant finding in a security review;
- a move to Supabase Auth for another reason (then user-scoped RLS becomes cheap).

## 6. Acceptance test for this decision

- [x] `db:catalog:check` check 4 asserts zero base-table grants to `anon`/`authenticated` (already implemented in [`scripts/db-catalog-check.ts`](../../scripts/db-catalog-check.ts)).
- [x] `db:catalog:check` check 3 asserts RLS is enabled on every base table.
- [x] `db:smoke:postgrest` asserts direct PostgREST access is denied (already run in CI).
- [ ] Follow-up tickets: IDOR matrix gate, web-build service-role assertion, remove unused user-scoped factory, least-privilege DB role.
