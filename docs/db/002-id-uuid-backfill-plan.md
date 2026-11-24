# PR 3: Database ID Architecture & Migration/Backfill Plan

## Context & Security Objective
In accordance with **Hard Invariant #1** (protecting job seeker identity & contact privacy) and **PR 3 Launch Blocker Remediation**, all primary identifiers across platform entities must be cryptographically strong, non-enumerable, database-generated UUIDs (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`).

Previously, synthetic composite IDs (e.g., `usr_<phone>`, `seeker_usr_<phone>`, `job_<timestamp>`, `app_<jobId>_<applicantId>`, `cld_<ts>_<rand>`, `pay_<ts>_<rand>`) were generated in application layer services. If composed with user phone numbers or sequential timestamps, these composite IDs leak personal identifiable information (PII) and application timeline metadata when exposed in URLs, QR code poster payloads, or public endpoints.

## 1. Schema State Audit
All target tables in the relational PostgreSQL schema already define `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`:
- `public.users` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`)
- `public.job_seeker_profiles` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id)`)
- `public.business_profiles` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id)`)
- `public.institution_profiles` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id)`)
- `public.jobs` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `employer_id UUID REFERENCES users(id)`)
- `public.applications` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `job_id UUID`, `applicant_id UUID`)
- `public.credit_ledgers` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id)`)
- `public.payments` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id)`)
- `public.audit_logs` (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `actor_id UUID`)

## 2. Application Layer Elimination of Synthetic Composite IDs
All application services have been updated to eliminate synthetic composite ID composition:
- `JobsService.createJob`: replaces `job_${Date.now()}_...` with `randomUUID()`.
- `JobsService.applyJob`: replaces `app_${jobId}_${applicantId}` with `randomUUID()`.
- `CreditLedgerRepository`: replaces `cld_${Date.now()}_...` with `randomUUID()`.
- `JobRepository.promoteJob`: replaces `cld_${Date.now()}_...` with `randomUUID()`.
- `WalletService.recordTransaction`: replaces `cld_${Date.now()}_...` and `aud_${Date.now()}_...` with `randomUUID()`.
- `PaymentService.createOrder`: replaces `pay_${Date.now()}_...` and `aud_pay_${Date.now()}_...` with `randomUUID()`.
- `BroadcastService.dispatchBroadcast`: replaces `cld_escrow_${campaignId}` with `randomUUID()`.
- `SponsorshipService.activateSponsorship`: replaces `spons_${Date.now()}_...` and `aud_spons_${Date.now()}_...` with `randomUUID()`.
- `AdminService.recordAuditLog`: replaces `audit_${Date.now()}_...` with `randomUUID()`.
- `ProfilesService.updateBusinessProfileMe`: replaces `bus_${userId}` with `randomUUID()`.

## 3. SQL Backfill Procedure (For Historical / Legacy Data)
If legacy staging or development environments contain text-based tables or rows with composite prefixes, the following transactional backfill procedure safely migrates foreign keys and primary keys to UUIDs:

```sql
-- Transactional Migration Script: Cleanse & Backfill Non-UUID Rows
BEGIN;

-- 1. Ensure pgcrypto extension is enabled for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Verify all user primary keys conform to valid UUIDv4 format
DO $$
DECLARE
    r RECORD;
    v_new_uuid UUID;
BEGIN
    -- Audit users table for any legacy records
    FOR r IN SELECT id FROM public.users LOOP
        IF r.id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_new_uuid := gen_random_uuid();
            -- Update dependent foreign key references before updating primary key
            UPDATE public.job_seeker_profiles SET user_id = v_new_uuid WHERE user_id = r.id;
            UPDATE public.business_profiles SET user_id = v_new_uuid WHERE user_id = r.id;
            UPDATE public.institution_profiles SET user_id = v_new_uuid WHERE user_id = r.id;
            UPDATE public.jobs SET employer_id = v_new_uuid WHERE employer_id = r.id;
            UPDATE public.applications SET applicant_id = v_new_uuid WHERE applicant_id = r.id;
            UPDATE public.credit_ledgers SET user_id = v_new_uuid WHERE user_id = r.id;
            UPDATE public.payments SET user_id = v_new_uuid WHERE user_id = r.id;
            UPDATE public.audit_logs SET actor_id = v_new_uuid WHERE actor_id = r.id;
            UPDATE public.users SET id = v_new_uuid WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

COMMIT;
```

## 4. Verification and Enforcement
1. **API Boundary**: All public endpoints (`GET /profiles/seeker/:id`, `/company/:id`, `/jobs/:id`) accept only opaque slugs or valid UUID parameters.
2. **Zero Phone Leakage**: Automated integration tests confirm no `usr_\d{10}` or candidate phone numbers appear in HTML output, URLs, QR payloads, or notification toasts.
