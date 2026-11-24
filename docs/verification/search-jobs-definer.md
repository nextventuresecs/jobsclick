# Verification Report: `public.search_jobs` SECURITY DEFINER Review

**Target Object:** `public.search_jobs(text, text, text, numeric, integer, integer)`  
**Migration Reference:** `supabase/migrations/20261121000200_money_security.sql`  
**Execution Boundary:** `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `service_role` only.

---

## 1. Complete Migration History and Final Function Body

### Migration Chronology

The function `public.search_jobs` has evolved across five migrations in chronological order:

1. **`20261025200000_jobs_full_text_search_and_ranking.sql`** (Initial Definition):
   - Created `search_jobs(text, text, text, numeric, integer, integer)` as `SECURITY INVOKER` with `SET search_path = public, pg_temp`.
   - Returned internal database UUIDs (`id UUID`, `employer_id UUID`, `created_by UUID`, `updated_by UUID`) alongside job columns.
   - Handled FTS rank computation (`ts_rank(j.fts, v_query)`) and promotion sorting.

2. **`20261110000001_lockdown_definer_functions.sql`** (Linter Remediation):
   - Pinned search path explicitly:
     ```sql
     ALTER FUNCTION public.search_jobs(text, text, text, numeric, integer, integer) SET search_path = public, pg_temp;
     ```

3. **`20261110000002_rls_pii_and_policy_fixes.sql`** (Hard Invariants #1 & #5):
   - Dropped and recreated `search_jobs` as `SECURITY INVOKER` with `SET search_path = public, pg_temp`.
   - Enforced active and unexpired filtering:
     ```sql
     WHERE j.is_active = TRUE
       AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP)
     ```
   - Still returned internal UUIDs (`id`, `employer_id`, `created_by`, `updated_by`).

4. **`20261115100000_public_views_and_rpc_slugs.sql`** (Public Slugs & ID Elimination, ID-02):
   - Dropped and recreated `search_jobs` as `SECURITY DEFINER` with `SET search_path = public, pg_temp`.
   - Replaced internal UUIDs (`id`, `employer_id`, `created_by`, `updated_by`) with opaque public slugs (`slug VARCHAR`, `company_slug VARCHAR`).
   - Joined `public.jobs j LEFT JOIN public.business_profiles bp ON bp.user_id = j.employer_id`.
   - Granted execute to `anon, authenticated`.

5. **`20261121000200_money_security.sql`** (Service-Role Permission Boundary Lockdown):
   - Re-asserted `SECURITY DEFINER` and pinned `search_path = public, pg_temp`.
   - Revoked execute privileges from `public, anon, authenticated`.
   - Granted execute privilege exclusively to `service_role`:
     ```sql
     alter function public.search_jobs(text, text, text, numeric, integer, integer) security definer;
     alter function public.search_jobs(text, text, text, numeric, integer, integer) set search_path = public, pg_temp;
     revoke execute on function public.search_jobs(text, text, text, numeric, integer, integer) from public, anon, authenticated;
     grant  execute on function public.search_jobs(text, text, text, numeric, integer, integer) to service_role;
     ```

---

### Final Function Body

The active SQL definition in production and staging:

```sql
CREATE OR REPLACE FUNCTION public.search_jobs(
    p_keyword TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_min_pay NUMERIC DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
) RETURNS TABLE (
    slug VARCHAR,
    company_slug VARCHAR,
    title VARCHAR,
    description TEXT,
    category job_category,
    city VARCHAR,
    openings INT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    employment_type VARCHAR,
    experience_level VARCHAR,
    min_pay NUMERIC,
    max_pay NUMERIC,
    district VARCHAR,
    state VARCHAR,
    skills TEXT[],
    expiry_date TIMESTAMPTZ,
    is_featured BOOLEAN,
    featured_until TIMESTAMPTZ,
    source VARCHAR,
    total_count BIGINT
) LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_query tsquery;
BEGIN
    IF p_keyword IS NOT NULL AND trim(p_keyword) <> '' THEN
        v_query := websearch_to_tsquery('english', p_keyword);
    END IF;

    RETURN QUERY
    WITH filtered AS (
        SELECT
            j.public_slug::VARCHAR AS slug,
            bp.public_slug::VARCHAR AS company_slug,
            j.title,
            j.description,
            j.category,
            j.city,
            j.openings,
            j.is_active,
            j.created_at,
            j.updated_at,
            j.employment_type,
            j.experience_level,
            j.min_pay,
            j.max_pay,
            j.district,
            j.state,
            j.skills,
            j.expiry_date,
            j.is_featured,
            j.featured_until,
            j.source,
            COUNT(*) OVER() AS total_count,
            (j.is_featured IS TRUE AND j.featured_until IS NOT NULL AND j.featured_until > NOW()) AS is_currently_promoted,
            CASE WHEN v_query IS NOT NULL THEN ts_rank(j.fts, v_query) ELSE 0.0 END AS relevance_score
        FROM public.jobs j
        LEFT JOIN public.business_profiles bp ON bp.user_id = j.employer_id
        WHERE j.is_active = TRUE
          AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP)
          AND (p_city IS NULL OR j.city ILIKE p_city)
          AND (p_category IS NULL OR j.category::text = p_category)
          AND (p_min_pay IS NULL OR j.max_pay >= p_min_pay)
          AND (v_query IS NULL OR j.fts @@ v_query)
    )
    SELECT
        f.slug,
        f.company_slug,
        f.title,
        f.description,
        f.category,
        f.city,
        f.openings,
        f.is_active,
        f.created_at,
        f.updated_at,
        f.employment_type,
        f.experience_level,
        f.min_pay,
        f.max_pay,
        f.district,
        f.state,
        f.skills,
        f.expiry_date,
        f.is_featured,
        f.featured_until,
        f.source,
        f.total_count
    FROM filtered f
    ORDER BY
        f.is_currently_promoted DESC,
        f.relevance_score DESC,
        f.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Permissions:
REVOKE ALL ON FUNCTION public.search_jobs(text, text, text, numeric, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_jobs(text, text, text, numeric, integer, integer) TO service_role;
```

---

## 2. Why `SECURITY DEFINER` Was Required

### Failure Under `SECURITY INVOKER`

Under PostgreSQL `SECURITY INVOKER`, a function executes using the privileges and RLS context of the caller (invoking user/role).

1. **Table Privilege Denial (SQLSTATE `42501`):**
   - In accordance with Hard Invariant #5 (Dual-layer authorization, default-deny RLS) and the database security catalog rules, direct table privileges on all base tables are revoked from client roles:
     ```sql
     REVOKE ALL ON public.jobs FROM anon, authenticated;
     REVOKE ALL ON public.business_profiles FROM anon, authenticated;
     ```
   - When an unauthenticated caller or non-service role executes `search_jobs` under `SECURITY INVOKER`, PostgreSQL checks the caller's privileges on `public.jobs` and `public.business_profiles` and aborts:
     ```text
     ERROR: 42501: permission denied for table jobs
     ```
     or
     ```text
     ERROR: 42501: permission denied for table business_profiles
     ```

2. **RLS Context Collision:**
   - Base table `public.jobs` has RLS enabled with default-deny policies. The only SELECT policy on `jobs` is `jobs_employer_select_policy`:
     ```sql
     USING (employer_id = auth.uid())
     ```
   - If `search_jobs` ran as `SECURITY INVOKER`, even with table-level SELECT granted, the RLS policy would evaluate against `auth.uid()`. An employer would only search their own job postings, while job seekers and anonymous candidates (`auth.uid() IS NULL`) would receive `0` search results.

3. **Catalog Linter & Exposure Dilemma:**
   - In `20261115100000`, `search_jobs` was made `SECURITY DEFINER`, but was granted to `anon, authenticated`.
   - This violated Check 2 of the security catalog audit (`scripts/db-catalog-check.ts`):
     ```sql
     -- Zero prosecdef functions callable by anon or authenticated
     SELECT p.proname, p.prosecdef FROM pg_proc p ...
     WHERE p.prosecdef = true AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', ...));
     ```
   - In `20261121000200_money_security.sql`, the team initially tried switching `search_jobs` to `SECURITY INVOKER`, which caused the `42501 permission denied for table jobs` failure when queried.
   - **The Resolution:** `search_jobs` must remain `SECURITY DEFINER` so it can access the base tables, but its direct client execution must be revoked from `anon` and `authenticated`, granting access **only to `service_role`**. This satisfies the zero-client-definer audit invariant while allowing the NestJS API backend to query search results using the service role client.

---

## 3. Returned Columns & PII Safety Proof

`public.search_jobs` queries `jobs` and joins `business_profiles`. It guarantees that no PII, contact info, or internal system columns leak to clients.

### Returned Columns List
| Column | Type | Description |
|---|---|---|
| `slug` | `VARCHAR` | Opaque public slug of the job (e.g. `senior-lathe-operator-7a1b`) |
| `company_slug` | `VARCHAR` | Opaque public slug of the employer company |
| `title` | `VARCHAR` | Job title |
| `description` | `TEXT` | Job description |
| `category` | `job_category` | Enum category (e.g., `machining`, `welding`) |
| `city` | `VARCHAR` | Job location city |
| `openings` | `INT` | Number of vacancies |
| `is_active` | `BOOLEAN` | Active status flag (always `TRUE`) |
| `created_at` | `TIMESTAMPTZ` | Timestamp when job was posted |
| `updated_at` | `TIMESTAMPTZ` | Timestamp when job was last updated |
| `employment_type` | `VARCHAR` | Full-time, part-time, apprenticeship |
| `experience_level` | `VARCHAR` | Fresher, 1-3 years, etc. |
| `min_pay` | `NUMERIC` | Minimum salary range |
| `max_pay` | `NUMERIC` | Maximum salary range |
| `district` | `VARCHAR` | District name |
| `state` | `VARCHAR` | State name |
| `skills` | `TEXT[]` | Required skill tags |
| `expiry_date` | `TIMESTAMPTZ` | Application deadline |
| `is_featured` | `BOOLEAN` | Promotion status |
| `featured_until` | `TIMESTAMPTZ` | Promotion expiry |
| `source` | `VARCHAR` | Ingestion provenance channel (e.g. `direct`, `bulk`) |
| `total_count` | `BIGINT` | Total matching results for client-side pagination |

### Excluded Columns & Leakage Protection
- **No Internal UUIDs:** `j.id`, `j.employer_id`, `bp.id`, and `bp.user_id` are completely excluded.
- **No Audit Identities:** `created_by` and `updated_by` are excluded.
- **No FTS Internals:** `j.fts` (`tsvector`) is used for ranking/filtering but never returned.
- **No Contact / PII Fields:** Phone numbers, email addresses, contact person names, and GSTIN/Aadhaar data from `users` and `business_profiles` are not selected.
- **Active & Unexpired Only:** The `WHERE` clause strictly filters:
  ```sql
  WHERE j.is_active = TRUE
    AND (j.expiry_date IS NULL OR j.expiry_date >= CURRENT_TIMESTAMP)
  ```
- **Automated Verification:** Verified in `apps/api/test/public-views-and-rpc.spec.ts`:
  ```ts
  expect(job).not.toHaveProperty('id');
  expect(job).not.toHaveProperty('employer_id');
  expect(job).not.toHaveProperty('created_by');
  expect(job).not.toHaveProperty('updated_by');
  expect(forbiddenRegex.test(key)).toBe(false);
  ```

---

## 4. Query Architecture: Static SQL & Pinned Search Path

1. **No Dynamic SQL:**
   - The function body contains **zero** dynamic SQL statements (`EXECUTE`, `format()`, string concatenation `||`).
   - The query uses static PL/pgSQL `RETURN QUERY WITH filtered AS (...) SELECT ...`.
2. **Schema Qualification:**
   - Base tables are explicitly schema-qualified: `FROM public.jobs j LEFT JOIN public.business_profiles bp`.
3. **Pinned `search_path`:**
   - The function definition explicitly specifies:
     ```sql
     SET search_path = public, pg_temp
     ```
   - This ensures safe resolution of PostgreSQL operators and functions, neutralizing search-path hijacking attacks.

---

## 5. Execution Boundary Proof

Privileges on `public.search_jobs(text, text, text, numeric, integer, integer)`:

```sql
SELECT 
    has_function_privilege('anon', 'public.search_jobs(text,text,text,numeric,integer,integer)', 'EXECUTE') AS anon_priv,
    has_function_privilege('authenticated', 'public.search_jobs(text,text,text,numeric,integer,integer)', 'EXECUTE') AS auth_priv,
    has_function_privilege('service_role', 'public.search_jobs(text,text,text,numeric,integer,integer)', 'EXECUTE') AS service_priv,
    (SELECT count(*) FROM aclexplode(p.proacl) WHERE grantee = 0 AND privilege_type = 'EXECUTE') AS public_priv_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'search_jobs';
```

### Result Matrix
| Role | Execution Privilege | Expected Status / Behavior |
|---|---|---|
| `anon` | **`FALSE`** | PostgREST HTTP 401/403/404 Access Denied |
| `authenticated` | **`FALSE`** | PostgREST HTTP 403 Forbidden |
| `public` (`grantee = 0`) | **`0` (Revoked)** | Function not executable by public pseudo-role |
| `service_role` | **`TRUE`** | HTTP 200 OK via authenticated backend API client |

Verified in `apps/api/test/public-views-and-rpc.spec.ts:75-87`:
Direct anonymous calls to `POST /rpc/search_jobs` return `[401, 403, 404]`. Calls with the backend `serviceRoleKey` succeed with HTTP 200.

---

## 6. Comparison: `search_jobs` vs. `search_public_jobs`

### Function Differences
| Property | `search_jobs` | `search_public_jobs` |
|---|---|---|
| **Defined in** | `20261115100000_public_views_and_rpc_slugs.sql` | `20261118085644_public_api_projection_reads.sql` |
| **Hardenings** | `20261121000200_money_security.sql` | — |
| **Return Type** | `RETURNS TABLE (...)` (Relational set) | `RETURNS jsonb` (`{ "jobs": [...], "total": N }`) |
| **Security Mode** | `SECURITY DEFINER` | `SECURITY INVOKER` |
| **Parameters** | 6 params: `keyword, city, category, min_pay, limit, offset` | 7 params: `keyword, city, category, min_pay, company_uuid, limit, offset` |
| **Data Source** | `public.jobs` + `public.business_profiles` | `public.public_jobs` view + `public.jobs` |
| **Execution Grant** | `service_role` only | `service_role` only |

### Which Function the API Calls
The API exclusively calls **`search_jobs`**:

1. **`apps/api/src/database/repositories/job.repository.ts:140`**:
   ```ts
   const { data: rpcData, error: rpcError } = await this.supabase.rpc(
     'search_jobs',
     {
       p_keyword: filters.keyword || null,
       p_city: filters.city || null,
       p_category: filters.category || null,
       p_min_pay: filters.minPay ?? null,
       p_limit: limit,
       p_offset: offset,
     },
   );
   ```
2. **`apps/api/src/database/repositories/public-discovery.repository.ts:292`**:
   ```ts
   const { data, error } = await this.db.rpc('search_jobs', {
     p_keyword: filters.keyword,
     p_city: filters.city,
     p_category: filters.category,
     p_min_pay: filters.minPay,
     p_limit: Math.min(filters.limit, 100),
     p_offset: Math.min(filters.offset, 10000),
   });
   ```

No file in `apps/api`, `apps/web`, or `apps/worker` calls `search_public_jobs`.

### Can `search_public_jobs` Be Removed?
- **Code Dependency:** Zero production runtime code depends on `search_public_jobs`. Only `packages/database/test/public-projections-migration.test.ts:11` asserts that the migration text contains the declaration string.
- **Recommendation:** `search_public_jobs` is an unused artifact from a previous experiment. While historical migrations must not be modified in place (preserving single-migration-tree immutability), `search_public_jobs` can safely be dropped via a future cleanup migration:
  ```sql
  DROP FUNCTION IF EXISTS public.search_public_jobs(text, text, text, numeric, uuid, integer, integer);
  ```

---

## 7. Audit of Hard-Invariant Tests for `SECURITY INVOKER`

1. **Tests on Functions:**
   - `packages/database/test/money-security.local.test.ts:41` asserts:
     ```ts
     it('every public rpc_* wrapper is SECURITY INVOKER with search_path pinned', async () => {
       select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname like 'rpc\\_%'
         and (p.prosecdef or p.proconfig is null or not (p.proconfig::text like '%search_path=%'))
     ```
     This assertion explicitly filters `p.proname like 'rpc\\_%'`. It enforces `SECURITY INVOKER` on RPC wrappers (such as `rpc_settle_payment`, `rpc_create_order`, `rpc_get_balance`), but does not apply to `search_jobs`.
   - `packages/database/test/money-security.local.test.ts:30` asserts that **zero** `prosecdef` functions in `public` or `private_payments` are callable by `anon` or `authenticated`. `search_jobs` complies because its privileges are restricted to `service_role`.
   - `scripts/db-catalog-check.ts:152` asserts that `prohibit_truncate_trigger` is `SECURITY INVOKER`.
   - `scripts/db-catalog-check.ts:39-55` asserts that zero `prosecdef` functions are executable by `anon` or `authenticated`.

2. **Did Any Existing Hard-Invariant Test Assert INVOKER for `search_jobs`?**
   - **No.** There has never been an invariant test requiring `search_jobs` to be `SECURITY INVOKER`.
   - All catalog security checks and security drill tests (`scripts/db-security-drill.ts:1014-1029`) expect `search_jobs` to run with `service_role` authority to filter active and unexpired jobs without exposing base tables to client roles.
   - No existing hard-invariant test was relaxed or changed.
