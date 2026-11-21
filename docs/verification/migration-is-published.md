# Migration Investigation: `institution_profiles.is_published`

## Context & Issue Summary
During CI execution of `supabase start`, migrations fail when applying `supabase/migrations/20261118085644_public_api_projection_reads.sql` (introduced in commit `25b4e5f` and consolidated into `supabase/migrations/` in `973b9ca`):
```text
ERROR: column i.is_published does not exist (SQLSTATE 42703)
```
The migration attempts to filter `public.institution_profiles i` on `i.is_published` in both the `public_institution_profiles` view and the `read_public_institution_cms` stored procedure. However, no preceding migration defines the column `is_published` on `public.institution_profiles`.

---

## 1. Git History of Views & Functions Referencing `institution_profiles` Publish/Visibility State

Tracking `public_institution_profiles` and visibility-related functions across git history reveals the following progression:

1. **Commit `c2eae6a` (2026-11-12)** - `feat(db): database catalog sync and production migration scripts`
   - **Migration:** `supabase/migrations/20261110000002_rls_pii_and_policy_fixes.sql`
   - **Definition:** First definition of view `public.public_institution_profiles`.
   - **Visibility State:** Selected directly `FROM public.institution_profiles;` with **no `WHERE` clause** and no publication filter. All rows were exposed.

2. **Commit `00a5804` (2026-11-14)** - `feat(slugs): ID-02 recreate public views without IDs and wire owner slug links`
   - **Migration:** `supabase/migrations/20261115100000_public_views_and_rpc_slugs.sql`
   - **Definition:** Recreated `public.public_institution_profiles` substituting internal UUID `id` with `public_slug AS slug`.
   - **Visibility State:** Selected `FROM public.institution_profiles;` with **no `WHERE` clause** and no publication filter.

3. **Commit `25b4e5f` (2026-11-19)** - `feat(db): ID-02 add high-speed public projection reads and allow PDF storage`
   - **Migration:** `supabase/migrations/20261118085644_public_api_projection_reads.sql`
   - **Definition:** Replaced view with:
     ```sql
     CREATE VIEW public.public_institution_profiles WITH (security_invoker=true) AS
     SELECT i.public_slug AS slug, i.id, i.institution_name, i.institution_type, i.affiliation, 
            i.establishment_year, i.website, i.city, i.district, i.state, i.trades_offered, 
            i.annual_capacity, i.placement_brochure_url, i.about, i.created_at
     FROM public.institution_profiles i JOIN public.users u ON u.id=i.user_id
     WHERE i.is_published AND u.role='intermediary' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$';
     ```
     Also introduced RPC `read_public_institution_cms(p_slug text)`:
     ```sql
     SELECT jsonb_build_object('content',i.cms_data) FROM public.institution_profiles i
     WHERE i.public_slug = p_slug AND i.is_published = true;
     ```
   - **Visibility State:** Introduced predicate `WHERE i.is_published AND u.role='intermediary' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$'`. However, `is_published` was never added to the database schema.

4. **Commit `973b9ca` (2026-11-20)** - `chore(wallet): real-PG CI, single migration tree, rawBody/trustProxy, strict payment env`
   - Consolidated all migrations into a single root migration tree executed during CI `supabase start`, making the missing column an immediate blocker.

---

## 2. Full Column List of `institution_profiles` in Migration Chain

Applying all migrations in chronological order produces exactly **35 columns** on `public.institution_profiles`:

| # | Column Name | Data Type & Constraints | Introduced In Migration |
|---|---|---|---|
| 1 | `id` | `UUID PRIMARY KEY DEFAULT uuid_generate_v4()` | `20261008000000_init_schema.sql` |
| 2 | `user_id` | `UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE` | `20261008000000_init_schema.sql` |
| 3 | `institution_name` | `VARCHAR(255) NOT NULL` | `20261008000000_init_schema.sql` |
| 4 | `affiliation` | `VARCHAR(255)` | `20261008000000_init_schema.sql` |
| 5 | `address` | `TEXT` | `20261008000000_init_schema.sql` |
| 6 | `created_at` | `TIMESTAMP WITH TIME ZONE DEFAULT NOW()` | `20261008000000_init_schema.sql` |
| 7 | `updated_at` | `TIMESTAMP WITH TIME ZONE DEFAULT NOW()` | `20261008000000_init_schema.sql` |
| 8 | `source` | `VARCHAR(100) DEFAULT 'direct'` | `20261008000001_db_schema_v1_rls.sql` |
| 9 | `created_by` | `UUID REFERENCES users(id) ON DELETE SET NULL` | `20261008000001_db_schema_v1_rls.sql` |
| 10 | `updated_by` | `UUID REFERENCES users(id) ON DELETE SET NULL` | `20261008000001_db_schema_v1_rls.sql` |
| 11 | `institution_type` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 12 | `affiliation_code` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 13 | `establishment_year` | `INTEGER` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 14 | `principal_name` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 15 | `contact_person` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 16 | `contact_designation` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 17 | `contact_email` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 18 | `contact_phone` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 19 | `website` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 20 | `city` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 21 | `district` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 22 | `state` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 23 | `pincode` | `VARCHAR(6)` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 24 | `trades_offered` | `TEXT[] DEFAULT '{}'` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 25 | `annual_capacity` | `INTEGER DEFAULT 0` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 26 | `placement_brochure_url` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 27 | `about` | `TEXT` | `20261015000000_public_profiles_and_applications_rls.sql` |
| 28 | `is_sponsorship_active` | `BOOLEAN NOT NULL DEFAULT false` | `20261017200000_institution_sponsorship_tiers.sql` |
| 29 | `sponsorship_tier` | `VARCHAR(50) DEFAULT 'free' CHECK (...)` | `20261017200000_institution_sponsorship_tiers.sql` |
| 30 | `sponsorship_rate_per_student` | `NUMERIC(10,2) DEFAULT 0.00` | `20261017200000_institution_sponsorship_tiers.sql` |
| 31 | `sponsorship_expires_at` | `TIMESTAMPTZ` | `20261017200000_institution_sponsorship_tiers.sql` |
| 32 | `total_sponsored_students` | `INTEGER DEFAULT 0` | `20261017200000_institution_sponsorship_tiers.sql` |
| 33 | `annual_sponsorship_fee` | `NUMERIC(10,2) DEFAULT 0.00` | `20261017200000_institution_sponsorship_tiers.sql` |
| 34 | `cms_data` | `JSONB DEFAULT '{}'::jsonb` | `20261017300000_institution_cms_and_inquiries.sql` |
| 35 | `public_slug` | `TEXT NOT NULL DEFAULT generate_public_slug()` | `20261115000000_public_slugs.sql` |

Column `is_published` does not appear in any migration.

### Evidence from the Owner
On the owner's existing database, `institution_profiles` has **34 columns**:
`id`, `user_id`, `institution_name`, `affiliation`, `address`, `created_at`, `updated_at`, `source`, `created_by`, `updated_by`, `institution_type`, `affiliation_code`, `establishment_year`, `principal_name`, `contact_person`, `contact_designation`, `contact_email`, `contact_phone`, `website`, `city`, `district`, `state`, `pincode`, `trades_offered`, `annual_capacity`, `placement_brochure_url`, `about`, `is_sponsorship_active`, `sponsorship_tier`, `sponsorship_rate_per_student`, `sponsorship_expires_at`, `total_sponsored_students`, `annual_sponsorship_fee`, `cms_data`.

Neither `is_published` nor `public_slug` is present on the existing database. This confirms the existing database has applied migrations through `20261017300000_institution_cms_and_inquiries.sql` (and subsequent non-profile migrations up to `20261110000007_reset_views_security_invoker.sql`).

To bring that database to the current chain level, the following migrations must be applied:
1. `20261115000000_public_slugs.sql` (adds `public_slug`)
2. `20261115100000_public_views_and_rpc_slugs.sql`
3. `20261118085644_public_api_projection_reads.sql`
4. `20261119000000_allow_email_first_users.sql`
5. `20261119100000_bulk_invitations_email_support.sql`
6. `20261121000100_money_schema.sql`
7. `20261121000200_money_security.sql`
8. `20261121000300_wallet_settlement.sql`
9. `20261121000400_sponsorship.sql`
10. `20261121000500_refunds_invoices.sql`

Applying `20261118085644_public_api_projection_reads.sql` to that database will currently fail with the same `column i.is_published does not exist` error.

---

## 3. Codebase References to `is_published`

A repository-wide search across `apps/*`, `packages/*`, seeds, and tests reveals:

| Location | Code Snippet | Notes |
|---|---|---|
| `apps/api/src/database/repositories/public-discovery.repository.ts:152` | `(p as unknown as { is_published?: boolean }).is_published !== false && Boolean(p.public_slug)` | Typecast used because `InstitutionProfileRow` and `BusinessProfileRow` lack `is_published`. Note that `!== false` treats `undefined` (missing column) as `true` (published). |
| `apps/api/test/public-discovery.spec.ts:46` | `is_published: true,` | Test fixture mocking `business_profiles` row using `as unknown as BusinessProfileRow`. |
| `supabase/migrations/20261118085644_public_api_projection_reads.sql:8` | `WHERE i.is_published AND u.role='intermediary' ...` | View filter referencing non-existent column. |
| `supabase/migrations/20261118085644_public_api_projection_reads.sql:40` | `WHERE i.public_slug = p_slug AND i.is_published = true;` | Stored procedure filter referencing non-existent column. |

No seed scripts, forms, controllers, or database schemas define or set `is_published`.

---

## 4. Comprehensive Audit of `20261118085644_public_api_projection_reads.sql`

Every relation and column in `20261118085644_public_api_projection_reads.sql` was verified against earlier migrations:

### A. View `public.public_institution_profiles`
- Target table: `public.institution_profiles i`
  - `i.public_slug`: Created in `20261115000000_public_slugs.sql`
  - `i.id`: Created in `20261008000000_init_schema.sql`
  - `i.institution_name`: Created in `20261008000000_init_schema.sql`
  - `i.institution_type`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.affiliation`: Created in `20261008000000_init_schema.sql`
  - `i.establishment_year`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.website`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.city`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.district`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.state`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.trades_offered`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.annual_capacity`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.placement_brochure_url`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.about`: Created in `20261015000000_public_profiles_and_applications_rls.sql`
  - `i.created_at`: Created in `20261008000000_init_schema.sql`
  - `i.user_id`: Created in `20261008000000_init_schema.sql`
  - **`i.is_published`: MISSING (Not created in any earlier migration).**
- Joined table: `public.users u`
  - `u.id`, `u.role`, `u.status`, `u.phone`: Created in `20261008000000_init_schema.sql`

### B. Function `public.search_public_jobs`
- Joins `public.public_jobs v` (created in `20261115100000_public_views_and_rpc_slugs.sql`) and `public.jobs j` (created in `20261008000000_init_schema.sql`, `public_slug` added in `20261115000000_public_slugs.sql`).
- References `public.business_profiles b` (`b.id`, `b.user_id`).
- All columns (`slug`, `company_slug`, `title`, `description`, `category`, `employment_type`, `experience_level`, `min_pay`, `max_pay`, `city`, `district`, `state`, `openings`, `skills`, `expiry_date`, `is_featured`, `featured_until`, `created_at`, `fts`, `employer_id`) exist in earlier migrations.

### C. Function `public.read_public_institution_cms`
- Target table: `public.institution_profiles i`
  - `i.cms_data`: Created in `20261017300000_institution_cms_and_inquiries.sql`
  - `i.public_slug`: Created in `20261115000000_public_slugs.sql`
  - **`i.is_published`: MISSING (Not created in any earlier migration).**

**Audit Result:** `i.is_published` is the **only** missing column or table in the entire migration.

---

## 5. Remediation Options with Risk Assessment

### Option A: Add a new migration before `20261118085644_public_api_projection_reads.sql`
Introduce a migration (e.g. `20261118080000_add_institution_is_published.sql`):
```sql
ALTER TABLE public.institution_profiles
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_institution_profiles_is_published ON public.institution_profiles(is_published);
```

- **Default Value Rationalization:** `DEFAULT true` matches current application behavior where all active institutions with a `public_slug` are considered published (`is_published !== false`).
- **Risks:** Adds a column that does not yet have an admin dashboard or user management UI to toggle it.
- **Effect on Fresh Database (CI / Local):**
  - Migration runs prior to `20261118085644`.
  - Column exists when `20261118085644` creates `public_institution_profiles` and `read_public_institution_cms`.
  - `supabase start` succeeds in CI with zero errors.
- **Effect on Database with Later Migrations (e.g. Owner Database):**
  - Owner's database has not yet applied `20261115000000_public_slugs.sql` through `20261121000500_refunds_invoices.sql`.
  - Applying the chain in timestamp order applies `is_published` prior to `20261118085644`, allowing `20261118085644` and all subsequent migrations to apply without failure.
- **Tests Affected:**
  - TypeScript types in `packages/database/src/generated.types.ts` will reflect `is_published: boolean`, eliminating the need for `(p as unknown as { is_published?: boolean })` casts in `public-discovery.repository.ts`.
  - No existing tests are broken or weakened.

### Option B: Change view and RPC predicate in `20261118085644_public_api_projection_reads.sql`
Remove the `is_published` dependency from `20261118085644_public_api_projection_reads.sql`:
1. In `public.public_institution_profiles`:
   ```sql
   -- Before
   WHERE i.is_published AND u.role='intermediary' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$';

   -- After
   WHERE u.role='intermediary' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$';
   ```
2. In `public.read_public_institution_cms`:
   ```sql
   -- Before
   WHERE i.public_slug = p_slug AND i.is_published = true;

   -- After
   WHERE i.public_slug = p_slug;
   ```

- **Risks:** Modifies a committed migration file. If any environment had already recorded the migration checksum of `20261118085644`, it would cause a migration integrity error (though no environment could have successfully executed `20261118085644` without manually patching the database).
- **Effect on Fresh Database (CI / Local):**
  - `supabase start` succeeds immediately because the non-existent column is no longer referenced.
- **Effect on Database with Later Migrations (e.g. Owner Database):**
  - When the owner database applies migrations starting from `20261115000000`, `20261118085644` executes cleanly without requiring any DDL for `is_published`.
- **Tests Affected:**
  - `public-discovery.repository.ts:152` continues to evaluate `is_published !== false`, which evaluates to `true` for `undefined`.
  - No existing tests break or change.

---

## 6. Recommendation

**Recommendation:** Adopt **Option A**. The PRD (AUTH-05 / F0-f) and `public-discovery.repository.ts` explicitly contemplate an active publication gate (`is_published`), and `20261118085644_public_api_projection_reads.sql` was intentionally authored to enforce that gate. Adding `20261118080000_add_institution_is_published.sql` with `DEFAULT true` accurately reflects existing production reality (where institutions are publicly visible by default), preserves migration immutability by leaving `20261118085644` intact, unblocks CI `supabase start`, and provides a clean, forward-compatible path for the owner's database when it migrates from its current 34-column state.
