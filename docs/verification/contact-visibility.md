# Candidate Contact Visibility & PII Inventory

**Audit Date**: 2026-11-22  
**Target Branch**: `integration/staging`  
**Compliance Standard**: Hard Invariant #1, DPDP Act 2023, and Approved Candidate Contact Visibility Policy.

---

## 1. Approved Visibility Policy Reference

| Principal / Role | Approved Policy Standard | Audit-Logging Requirement |
| :--- | :--- | :--- |
| **Employer & ATS Views** | **Never see candidate/student phone or email.** Contact permitted solely via platform messaging or system-dispatched SMS. | N/A (Contact is strictly omitted/redacted). |
| **Institution** | **Sees its OWN students' phone and email in full.** Under no circumstance may an institution view another institution's students. | **Mandatory on every read/view.** |
| **Platform Admin** | **Full phone and email access** across all candidates/users. | **Mandatory on every read/export.** |
| **MSME Department (`msme_admin`)** | **No individual job-seeker contact details.** Access restricted strictly to aggregate metrics, district totals, and business records. | Audit-logged actions for campaign dispatches. |
| **Public / Anonymous** | **Never.** Zero internal IDs, zero phone numbers, zero email addresses. | Rate-limited and public route shielded. |

---

## 2. Comprehensive Contact Egress Inventory Table

The following table documents every egress point in the platform where candidate or student contact details (phone, email) are processed, returned, or displayed.

| Endpoint or Component (`file:line`) | Roles Authorized | Fields Returned / Exposed | Current Behaviour | Behaviour Required by Policy | Change Needed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /jobs/:id/applications`<br>([jobs.controller.ts:51](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.controller.ts#L51), [jobs.service.ts:404](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.service.ts#L404)) | `employer`, `admin` | `applicantProfile: { id, fullName, seekerId, seekerType, city, skills }` | Phone and email are completely stripped from the response projection. | Employer must never see candidate phone or email. | None. Adheres to policy. |
| `POST /jobs/applications/:appId/status`<br>([jobs.controller.ts:60](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.controller.ts#L60), [jobs.service.ts:430](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.service.ts#L430)) | `employer`, `admin` | `ApplicationRecord` (`id, jobId, seekerId, status, appliedAt, applicantProfile`) | Contact information is omitted from `applicantProfile`. | Employer must never see candidate phone or email. | None. Adheres to policy. |
| `POST /jobs/applications/:appId/interview-invite`<br>([jobs.controller.ts:65](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.controller.ts#L65), [jobs.service.ts:457](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.service.ts#L457)) | `employer`, `admin` | `{ success: true, message: string }` | Candidate phone is fetched internally by server to trigger SMS via MSG91; phone/email never sent back to employer. | Employer never sees contact details; communication mediated by platform. | None for payload. Add audit log for invite dispatch. |
| `GET /placement/pipeline`<br>([placement.controller.ts:25](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/placement/placement.controller.ts#L25), [placement.service.ts:311](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/placement/placement.service.ts#L311)) | `employer`, `institution`, `intermediary`, `admin` | `PlacementApplication[]` (`id, institutionId, employerId, studentId, studentName, rollNumber, trade, passingYear, grade, jobId, jobTitle, companyName, isPartneredEmployer, stage, updatedAt`) | Phone and email are omitted entirely from `PlacementApplication` DTO. | Employer must never see candidate contact. Institution may see own students' contacts in full. | When queried by `institution`, conditionally enrich with own student contacts and write to `audit_logs`. |
| `POST /placement/share-batch`<br>([placement.controller.ts:52](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/placement/placement.controller.ts#L52), [placement.service.ts:392](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/placement/placement.service.ts#L392)) | `institution`, `intermediary`, `admin` | `PlacementApplication[]` | Candidate batch shared to employer partner contains only academic/trade details; phone/email omitted. | Employer receives drive applicants without phone/email. | None. Adheres to policy. |
| `GET /profiles/institution/students`<br>([profiles.controller.ts:117](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.controller.ts#L117), [profiles.service.ts:395](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.service.ts#L395)) | `institution`, `intermediary`, `admin` | `JobSeekerProfileRow[]` | Returns `job_seeker_profiles` rows without joining `users` table; phone & email are missing. No audit log is recorded. | Institution must see its **own** students' phone and email in full, never another institution's; every view must be audit-logged. | Join `users` table for own students only; return full phone/email to institution; log `INSTITUTION_STUDENT_CONTACTS_VIEWED` to `audit_logs`. |
| `GET /profiles/institution/inquiries`<br>([profiles.controller.ts:175](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.controller.ts#L175), [institution-cms.service.ts:318](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/institution-cms.service.ts#L318)) | Authenticated user with institution profile | `InstitutionInquiryRow[]` (`id, institution_id, student_name, student_phone, student_email, message, status, created_at, updated_at`) | Returns prospective student phone and email in full for caller's institution leads. No audit log written. | Institution sees inquiries for its own institution; every view must be audit-logged. | Add mandatory audit log entry (`INSTITUTION_INQUIRIES_VIEWED`) on each access. |
| `GET /bulk/batches/:id/error-report`<br>([bulk.controller.ts:62](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/bulk/bulk.controller.ts#L62), [bulk.service.ts:436](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/bulk/bulk.service.ts#L436)) | `admin`, `intermediary`, `msme_admin` | CSV: `row,phone,reason\n` | Returns unmasked phone numbers for failed import rows. Enforces ownership via `assertOwner(createdBy, actor)` ([bulk.service.ts:418, 432, 730](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/bulk/bulk.service.ts#L730)). `intermediary` and `msme_admin` can ONLY access their own batches (`created_by === actor.id`), failing with `NotFoundException` otherwise. `msme_admin` batches contain business records uploaded by that user, not job-seeker batches. No cross-tenant leakage. No audit log currently written. | Importers may download error reports for their own batches with audit logging. Admin may download any batch with audit logging. | Add immutable audit log entry (`BULK_ERROR_REPORT_DOWNLOADED`) with actor, batchId, and error row count. |
| `GET /admin/export`<br>([admin.controller.ts:90](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/admin/admin.controller.ts#L90), [admin.service.ts:208](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/admin/admin.service.ts#L208)) | `admin` | When `entity=users`: `id, phoneMasked (regex $1******$2), role, status, source, createdAt`. Email omitted. | Phone is regex-masked; email is omitted. Action writes `DATA_EXPORT_PERFORMED` to `audit_logs`. | Platform admin is allowed full phone/email on explicit request because export is strictly audit-logged. | Mask by default. When admin explicitly specifies `includeContacts=true`, return full contact details and record dedicated audit log. |
| `GET /admin/reports/district-employment`<br>([admin.controller.ts:167](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/admin/admin.controller.ts#L167), [reports.service.ts:51](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/admin/reports.service.ts#L51)) | `admin`, `msme_admin` | `DistrictEmploymentReport[]` (`district, onboardedMsmes, activeJobs, totalHires, lastUpdated`) | Returns aggregate counts only; values <5 suppressed for k-anonymity. Zero candidate contacts. | MSME Department: business records and totals only, no individual contact. | None. Strictly conforms to policy. |
| `POST /admin/broadcast/preview` & `POST /admin/broadcast/dispatch`<br>([admin.controller.ts:142, 148](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/admin/admin.controller.ts#L142)) | `admin`, `msme_admin` | Preview: `{ recipientCount, estimatedCostPaise, costPerSmsPaise, currency }`<br>Dispatch: `{ campaignId, status, recipientCount, ... }` | Returns aggregated counts; individual recipient contact numbers are never returned. Writes `MSME_BROADCAST_DISPATCHED` to `audit_logs`. | MSME Department: campaign totals only. No recipient contact leakage. | None. Strictly conforms to policy. |
| `GET /profiles/seeker/me/pdf`<br>([profiles.controller.ts:64](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.controller.ts#L64), [profiles.service.ts:100](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.service.ts#L100)) | `job_seeker`, `admin` | `{ downloadUrl: string, cached: boolean }` | Returns pre-signed download URL for candidate CV PDF. PDF document contains NO phone and NO email. | Seeker downloads own digital CV. Direct contact hidden from PDF. | None. Adheres to policy. |
| `GET /profiles/seeker/:slug`<br>([profiles.controller.ts:73](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.controller.ts#L73), [profiles.service.ts:272](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.service.ts#L272)) | Public (`@Public()`) | `SeekerPublicRecord` (`slug, firstName, skills, city, district, seekerType, profileCompleted`) | Strict projection omitting all IDs, phone numbers, and email addresses. | Public/anonymous: never see contact details. | None. Strictly conforms to policy. |
| `GET /jobs/alerts`<br>([jobs.controller.ts:84](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.controller.ts#L84), [jobs.service.ts:373](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.service.ts#L373)) | `job_seeker`, `employer`, `admin` | `JobAlertRow[]` (`id, user_id, title, query, location, is_active, ...`) | Returns the caller's own alert search filters. Alert delivery logs are not exposed via any public/admin endpoint. | User views only own alert preferences. | None. Adheres to policy. |
| `ApplicantDetailModal.tsx`<br>([ApplicantDetailModal.tsx:63, 68](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/web/src/components/workspaces/employer/ApplicantDetailModal.tsx#L63)) | Employer UI Component | Displays masked literals: `+91 ••••• •••••` and `••••••••••@••••••••` | Static masked strings rendered in UI. API does not provide real contact data. | Employer must never see phone or email. | None (Double-layer protection: API omits, UI displays masked indicator). |
| `PlacementDashboard.tsx`<br>([PlacementDashboard.tsx:856, 859, 1378, 1381](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/web/src/components/workspaces/institution/PlacementDashboard.tsx#L856)) | Institution UI Component | Evaluates `maskContactNumber(st.phone)` and `maskEmailAddress(st.email)` | Fully masks contact numbers to `+91 ••••• •••••` and emails to `••••••@••••••`. | Approved policy states institution must see its OWN students' phone and email in full. | Render full unmasked contact details when institution views its own enrolled students. |
| `studentUtils.ts`<br>([studentUtils.ts:35, 46](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/web/src/components/workspaces/institution/studentUtils.ts#L35)) | UI Helper | Functions `maskContactNumber` and `maskEmailAddress` | Masks all contact info to bullet characters regardless of viewer role. | Helper enforces blanket UI masking even for institution's own students. | Refactor helper to allow full display for verified institution viewers, or retire in favor of API redaction. |
| `sampleWorkspaces.ts`<br>([sampleWorkspaces.ts:420, 437](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/web/src/data/sampleWorkspaces.ts#L420)) | Web Static Mock Data | `SAMPLE_STUDENTS` records contain unmasked phone numbers (`+91 94251 88301`) and emails | Dummy contact data bundled into frontend client scripts for offline/demo mode. | Client mock data must not leak real candidate data or create false security assumptions. | Replace raw demo phone numbers with synthetic dummy tokens (`+91 00000 00000`). |
| `Database: public.users RLS`<br>([20261102100000_user_mutations_and_starter_credits.sql:151](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/supabase/migrations/20261102100000_user_mutations_and_starter_credits.sql#L151)) | Database Schema | `users` table columns: `phone`, `email` | `REVOKE ALL ON users FROM anon, authenticated;` All direct access revoked; accessible ONLY to `service_role`. | No non-service role can read users table directly. | None. Strictly secured. |
| `Database: public.invitations RLS`<br>([20261110000002_rls_pii_and_policy_fixes.sql:240, 340](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/supabase/migrations/20261110000002_rls_pii_and_policy_fixes.sql#L240)) | Database Schema | `invitations` table columns: `phone`, `email` | Policies dropped in migration `20261110000002`. RLS is enabled with 0 policies (Deny-All Default). All privileges revoked from `anon` and `authenticated`. Accessible strictly to `service_role`. Verified: `has_table_privilege('authenticated', 'public.invitations', 'SELECT') = false`. | No non-service-role access to invitations table. | None. Fully secured at database layer. |
| `Database: public.institution_inquiries RLS`<br>([20261017300000_institution_cms_and_inquiries.sql:44](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/supabase/migrations/20261017300000_institution_cms_and_inquiries.sql#L44)) | Database Schema | `institution_inquiries`: `student_phone`, `student_email` | Institution owner can SELECT inquiries for their own institution (`ip.user_id = auth.uid()`). | Institution sees inquiries for its own institution only. | None at DB layer; API access must be audit-logged. |
| `Database: public.broadcast_deliveries`<br>([20261024000000_msme_broadcast_and_district_reports.sql:27](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/supabase/migrations/20261024000000_msme_broadcast_and_district_reports.sql#L27)) | Database Schema | Table column `phone_masked VARCHAR(20)` | Stores pre-masked phone (`+91******1234`), never raw phone. | Prevents exposure of raw recipient phone numbers in audit and delivery tables. | None. Strictly conforms to policy. |

---

## 3. Candidate Profile PDF (JS-03) & Institutional Candidate Sharing

### A. Candidate Profile PDF (`JS-03`)
- **Generation & Storage**: Built using `@react-pdf/renderer` in `apps/worker/src/pdf/pdf-generator.ts` using template `apps/worker/src/pdf/templates/ProfilePdfTemplate.tsx`. Stored in Supabase private storage at `resumes/{seekerId}.pdf`.
- **Egress Endpoint**: `GET /profiles/seeker/me/pdf` ([profiles.controller.ts:64](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.controller.ts#L64)).
- **Who Can Access**: Only the candidate themselves (`role: 'job_seeker'`) and platform `admin`. Employers **cannot** download the candidate's PDF.
- **Contact Data Presence**:
  - `ProfilePdfProps` explicitly omits `phone` and `email` ([ProfilePdfTemplate.tsx:17-28](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/worker/src/pdf/templates/ProfilePdfTemplate.tsx#L17)).
  - Lines 261–263 render an immutable privacy badge:
    ```tsx
    <Text style={styles.privacyNotice}>
      Invariant Protected: Direct phone/email hidden. Employer contact enabled only via platform messaging.
    </Text>
    ```
  - **Verdict**: The PDF does **not** contain candidate phone or email.

### B. One-Click Candidate Profile Sharing
- **Egress Endpoint**: `POST /placement/share-batch` ([placement.controller.ts:52](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/placement/placement.controller.ts#L52), [placement.service.ts:392](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/placement/placement.service.ts#L392)).
- **Functionality**: Enables institutions to share student batches with corporate tie-up partners for campus drives.
- **Contact Data Presence**: Generates `PlacementApplication` records containing student name, roll number, trade, and passing year. Phone and email are **not** present in the payload or data model.
- **Verdict**: One-click candidate sharing strictly adheres to Invariant #1; employers receive zero candidate contact details.

---

## 4. Frontend Masking vs. Server-Side API Enforcement

A critical security principle is that data protection must never rely exclusively on client-side masking. The current repository exhibits a mixed architecture:

1. **Employer Applicants & ATS Views**:
   - **Enforced at API Layer**: `JobsService.getJobApplications` ([jobs.service.ts:404](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.service.ts#L404)) omits `phone` and `email` from `applicantProfile`. The payload sent across the network has no contact data.
   - **Defense-in-Depth UI**: `ApplicantDetailModal.tsx` renders static masked text `+91 ••••• •••••` as an informative UI indicator.
   - **Verdict**: Properly secured at API boundary.

2. **Institution Student Roster & Placement Dashboard**:
   - **Client-Side Masking Issue**: `PlacementDashboard.tsx` ([lines 856, 859](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/web/src/components/workspaces/institution/PlacementDashboard.tsx#L856)) uses `maskContactNumber` and `maskEmailAddress` from `studentUtils.ts`, which unconditionally convert contacts to bullet strings (`+91 ••••• •••••`, `••••••@••••••`).
   - **Policy Conflict**: The approved policy requires that an **institution sees its OWN students' phone and email in full**. Ticket T-19 applied client-side masking indiscriminately across the dashboard, obscuring legitimate student contacts from their own institution.
   - **API Omission**: `getInstitutionStudents` ([profiles.service.ts:395](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.service.ts#L395)) returns `JobSeekerProfileRow[]` without joining the `users` table, meaning live API responses currently omit contact data altogether for institutions.

---

## 5. Database Views, Functions & RLS Policies Analysis

| Database Object | Type | Grants / RLS Policy | Exposes Phone or Email? | Analysis & Policy Alignment |
| :--- | :--- | :--- | :--- | :--- |
| `public.users` | Table | `REVOKE ALL ON users FROM anon, authenticated;` `GRANT ALL TO service_role;` | Yes (`phone`, `email`) | **Complies**. Zero non-service-role access at DB level. Queries must pass through API guards. |
| `public.invitations` | Table | **RLS Enabled** (`relrowsecurity = t`). **0 policies** (`pg_policies` = 0 rows). Privileges granted exclusively to `service_role` and `postgres`. `has_table_privilege('authenticated', ...)` = `false`. | Yes (`phone`, `email`) | **Complies**. Direct client queries are fully blocked for all non-service roles (including `msme_admin`). All queries run through API via `service_role`. |
| `public.institution_inquiries` | Table | `institution_inquiries_owner_select_policy` allows institution owner (`ip.user_id = auth.uid()`) | Yes (`student_phone`, `student_email`) | **Complies with tenancy**. Confined to own institution. Requires audit logging in API layer. |
| `public.job_seeker_profiles` | Table | `job_seeker_own_profile_policy` allows `auth.uid() = user_id` | No | Table stores profile metadata (`apaar_id`, `aadhaar_last_four`), but does not contain `phone` or `email`. |
| `public.broadcast_deliveries` | Table | Tenant isolated to business owner | Stores `phone_masked` | **Complies**. Only pre-masked phone is stored. |
| `public.search_jobs` | RPC | `SECURITY INVOKER`, execute granted to `service_role` | No | Stripped of PII, internal columns, and `source`. |
| `public.search_public_jobs` | RPC | `SECURITY INVOKER` (`prosecdef = f`), `proconfig = {"search_path=\"\""}`. Execution revoked from `PUBLIC, anon, authenticated`, granted exclusively to `service_role`. | No | Stripped of PII and internal columns; executable strictly by `service_role`. |

### Database Verification Query Evidence

#### 1. `invitations` RLS & Privilege Verification Output
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies WHERE tablename = 'invitations';
-- Result:
 schemaname | tablename | policyname | permissive | roles | cmd | qual | with_check 
------------+-----------+------------+------------+-------+-----+------+------------
(0 rows)

SELECT role, 
       has_table_privilege(role, 'public.invitations', 'SELECT') AS can_select, 
       has_table_privilege(role, 'public.invitations', 'INSERT') AS can_insert, 
       has_table_privilege(role, 'public.invitations', 'UPDATE') AS can_update, 
       has_table_privilege(role, 'public.invitations', 'DELETE') AS can_delete 
FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')) AS t(role);
-- Result:
     role      | can_select | can_insert | can_update | can_delete 
---------------+------------+------------+------------+------------
 anon          | f          | f          | f          | f
 authenticated | f          | f          | f          | f
 service_role  | t          | t          | t          | t
 postgres      | t          | t          | t          | t
(4 rows)
```
*Note*: Migration `20261110000002_rls_pii_and_policy_fixes.sql` lines 240–241 explicitly dropped `invitations_select_policy` and `invitations_insert_policy`. Combined with `ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;`, PostgreSQL's default deny-all RLS rule applies, and standard client roles (`anon`, `authenticated`) have zero privileges on the table.

#### 2. `search_public_jobs` Signature & Execution Privilege Verification Output
```sql
SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname = 'search_public_jobs';
-- Result:
      proname       | prosecdef |      proconfig       
--------------------+-----------+----------------------
 search_public_jobs | f         | {"search_path=\"\""}
(1 row)

SELECT r.role, has_function_privilege(r.role, p.oid, 'EXECUTE') AS can_execute 
FROM pg_proc p 
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('public'), ('service_role')) AS r(role) 
WHERE p.proname = 'search_public_jobs';
-- Result:
     role      | can_execute 
---------------+-------------
 anon          | f
 authenticated | f
 public        | f
 service_role  | t
(4 rows)
```
*Note*: As defined in migration `20261118085644_public_api_projection_reads.sql`, `search_public_jobs` is `SECURITY INVOKER` (`prosecdef = f`) with pinned empty search path (`search_path=""`). Execution is granted solely to `service_role`; `anon`, `authenticated`, and `public` cannot execute it directly.

---

## 6. Logs & Telemetry Scrubbing Verification

The repository contains multi-layer PII scrubbers operating across API, Worker, and Web:

1. **Sentry & Console Log Sanitization** (`packages/validation/src/scrubber.ts`):
   - `INDIAN_PHONE_REGEX` redacts all `+91` / 10-digit Indian numbers to `[PHONE_REDACTED]` ([scrubber.ts:109](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/packages/validation/src/scrubber.ts#L109)).
   - `EMAIL_REGEX` redacts email patterns to `[EMAIL_REDACTED]` ([scrubber.ts:111](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/packages/validation/src/scrubber.ts#L111)).
   - `deepScrubPii` recursively checks object keys against `SENSITIVE_KEY_PATTERNS` (`/phone/i`, `/email/i`, `/aadhaar/i`, `/otp/i`) and redacts values to `[REDACTED_PII]` ([scrubber.ts:135](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/packages/validation/src/scrubber.ts#L135)).
   - Registered hooks in `apps/api/src/config/sentry.ts`:
     - `beforeSend: (event, hint) => sanitizeSentryEvent(event, hint)`
     - `beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumb(breadcrumb)`
     - `beforeSendLog: (log) => sanitizeLogRecord(log)`
2. **Application Logger & Gateway Scrubbers** (`apps/api/src/common/mask.ts`):
   - `maskPhone()` redacts numbers down to the last 4 digits (`+91******1234`).
   - `scrubSensitiveData()` regex-scrubs query params, error strings, and JSON logs.
3. **Verdict**: Telemetry and logs are systematically scrubbed; candidate phone and email do not leak into Sentry or application log streams.

---

## 7. Audit Logging Coverage for Contact Reads

Approved policy mandates that **every view of candidate contact details by institutions and platform admins must be audit-logged**.

| Operation / Read Access | Component (`file:line`) | Current Audit Log Status | Policy Requirement |
| :--- | :--- | :--- | :--- |
| Admin Data Export (`entity=users`) | [admin.service.ts:208](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/admin/admin.service.ts#L208) | **Logged**: Writes `DATA_EXPORT_PERFORMED` with actor ID and entity. | Masked by default; dedicated unmasked audit log required when `includeContacts=true`. |
| Admin User List / Detail View | [admin.service.ts:98](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/admin/admin.service.ts#L98) | **Not Logged**: In-memory read of users does not write to `audit_logs`. | **Missing Audit Log**: Must record `ADMIN_USER_CONTACTS_VIEWED`. |
| Bulk Batch Error Report Download | [bulk.service.ts:436](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/bulk/bulk.service.ts#L436) | **Not Logged**: Batch ownership is enforced via `assertOwner` ([bulk.service.ts:730](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/bulk/bulk.service.ts#L730)), but CSV download is not recorded. | **Missing Audit Log**: Must record `BULK_ERROR_REPORT_DOWNLOADED`. |
| Institution Viewing Own Students | [profiles.service.ts:395](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/profiles.service.ts#L395) | **Not Logged**: `getInstitutionStudents` does not write to `audit_logs`. | **Missing Audit Log**: Must record `INSTITUTION_STUDENT_CONTACTS_VIEWED`. |
| Institution Viewing Inquiries | [institution-cms.service.ts:318](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/profiles/institution-cms.service.ts#L318) | **Not Logged**: `getInstitutionInquiries` does not write to `audit_logs`. | **Missing Audit Log**: Must record `INSTITUTION_INQUIRIES_VIEWED`. |
| Employer Applicant List / Detail | [jobs.service.ts:404](file:///d:/Trun%20Dada/Projects/Products/Indian%20Job%20Portal/application/indian-job-portal/apps/api/src/jobs/jobs.service.ts#L404) | Not Logged (Contact is completely stripped). | Compliant (No contact revealed). |

*Note on Bulk Error-Report Audit*: The bulk error-report audit write (`BULK_ERROR_REPORT_DOWNLOADED`) is best-effort because the caller is solely downloading failed rows from their own previously uploaded file (ownership strictly verified via `assertOwner`, so no cross-tenant candidate discovery occurs), ensuring error remediation workflows are not blocked by transient audit logging failures.

---

## 8. Tests Asserting Masking

The following test suites assert masking behaviour. Several suites were edited during previous development tickets (Ticket T10, Ticket T19) to enforce full bullet-masking:

1. **`apps/api/test/acceptance-walkthrough.e2e-spec.ts:146`**:
   - **Assertion**: `expect(apps[0].applicantProfile.phone).toBeUndefined();`
   - **Evaluates**: Confirms employer applicant list omits candidate phone number.
   - **Policy Alignment**: **Matches policy** (Employer never sees candidate phone).

2. **`apps/api/test/admin-export.e2e-spec.ts:66`**:
   - **Assertion**: `expect(first.phoneMasked).toMatch(/\d{2}\*{6}\d{2}/);`
   - **Evaluates**: Confirms admin export returns regex-masked phone (`98******10`).
   - **Policy Alignment**: **Matches default masked export policy**. When unmasked export is requested via `includeContacts=true`, dedicated audit log must accompany it.

3. **`apps/web/test/components.test.ts:106, 111`**:
   - **Assertion**: `expect(maskedPhone1).toBe('+91 ••••• •••••'); expect(maskedEmail).toBe('••••••@••••••');`
   - **Evaluates**: Confirms `maskCandidatePhone` and `maskCandidateEmail` replace all characters with bullets.
   - **Policy Alignment**: Matches employer view policy; overly restrictive for institution views.

4. **`apps/web/test/identity-leaks-trust-badges.test.ts:27-58`**:
   - **Assertion**:
     - `expect(maskCandidatePhone('+91 98260 14829')).toBe('+91 ••••• •••••');`
     - `expect(maskCandidateEmail('rahul.sharma@example.com')).toBe('••••••@••••••');`
     - `expect(maskContactNumber('+91 94250 88210')).toBe('+91 ••••• •••••');`
     - `expect(maskEmailAddress('student@mp.gov.in')).toBe('••••••@••••••');`
   - **Evaluates**: Asserts complete bullet masking for candidate and student contacts.
   - **Policy Alignment**: Matches employer policy; **conflicts with approved institution policy** where institutions are entitled to see their own students in full.

5. **`apps/web/test/ticket-t10-workspace-wiring.test.ts:27, 35`**:
   - **Assertion**: `expect(maskCandidatePhone(phone)).toBe('+91 ••••• •••••'); expect(maskCandidateEmail(email)).toBe('••••••@••••••');`
   - **Context**: Edited during Ticket T10 to replace legacy partial masking (`+91 98260 •••29`) with zero-leakage bullet masking.
   - **Policy Alignment**: Correct for employer / public viewers; over-masks for institution student rosters.

6. **`apps/web/test/ticket-t19-placement-dashboard.test.ts:181-195`**:
   - **Assertion**:
     - `expect(maskContactNumber('+91 94251 88301')).toBe('+91 ••••• •••••');`
     - `expect(maskEmailAddress('amitesh.c@iti.gov.in')).toBe('••••••@••••••');`
     - `expect(maskContactNumber('')).toBe('••••••••••');`
   - **Context**: Edited during Ticket T19 to enforce masking in the institution placement dashboard.
   - **Policy Alignment**: **Directly conflicts with approved policy**. The approved policy specifies: *"Institution: sees its OWN students' phone and email in full; every view audit-logged; never another institution's students."* Ticket T19 obscured these details from the institution.

---

## 9. Proposed Server-Side Redaction Architecture

To establish a single source of truth and eliminate fragmented masking logic across client and server, candidate contact exposure must be governed by a centralized server-side redaction utility adhering to four strict architectural conditions:

### Four Mandatory Architectural Conditions

1. **Server-Derived `institutionId` (Zero Client Trust)**:
   - The viewer's `institutionId` must always be derived exclusively on the server from the authenticated user's session and profile (e.g., via `profileRepository.findInstitutionProfileByUserId(user.id)`).
   - Under no circumstances may `institutionId` be accepted from client headers, query parameters, or body payloads. This guarantees strict tenant isolation and prevents cross-tenant parameter tampering.

2. **Batch Variant + Single Aggregated Audit Row (Zero PII in Audit Logs)**:
   - For collection endpoints (student rosters, placement pipeline batches, data exports), redaction must process arrays via a dedicated batch variant: `redactCandidateContactsBatch()`.
   - The operation must write exactly **ONE** audit log entry per request/page view containing high-level metadata (e.g. `{ action: 'INSTITUTION_STUDENT_CONTACTS_VIEWED', studentCount: N, institutionId: '...' }`).
   - The audit log entry **must NEVER contain individual candidate phone numbers or email addresses**, preventing secondary PII leakage into the immutable audit store.

3. **Fail-Closed Enforcement ("No Audit = Redacted")**:
   - If audit logging is omitted, fails, or cannot be verified for any role requiring audit (institution viewing own students, platform admin unmasked export), the redaction function must fail closed: contact fields (`phone`, `email`) must be returned as `null` and `contactVisible: false`.
   - Contact details are unmasked if and only if the view event is confirmed to be audit-logged.

4. **Admin Export Masked by Default; Unmasked via `includeContacts=true` Audited**:
   - Administrative data exports (`GET /admin/export`) must default to masked phone numbers (`$1******$2`) and omitted email addresses.
   - Full unmasked contact details are returned only when an administrator explicitly supplies the query flag `includeContacts=true`.
   - Supplying `includeContacts=true` must trigger a distinct, high-severity audit log entry (`ADMIN_CONTACTS_EXPORT_PERFORMED`) capturing the actor ID, entity, count, and export rationale.

---

### Proposed TypeScript Specification

```typescript
// Proposed location: packages/validation/src/contact-visibility.ts

export type UserRole =
  | 'employer'
  | 'institution'
  | 'intermediary'
  | 'job_seeker'
  | 'admin'
  | 'msme_admin'
  | 'public';

export interface ViewerContext {
  readonly role: UserRole;
  readonly id: string; // Authenticated user ID (or anonymous session ID)
  /**
   * MUST be derived on the server from the authenticated user's profile.
   * Never accept from client query/body/headers.
   */
  readonly institutionId?: string | null;
  /**
   * Indicates whether a valid audit log write was successfully initiated/committed
   * for this access request. If false, redaction fails closed.
   */
  readonly isAuditLogged: boolean;
  /**
   * Flag for platform admin unmasked export.
   */
  readonly includeContacts?: boolean;
}

export interface CandidateContactRecord {
  readonly id: string; // Seeker / Student User ID or Profile ID
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly institutionId?: string | null; // Student's enrolled institution profile ID
  readonly [key: string]: unknown;
}

export type RedactedRecord<T extends CandidateContactRecord> = Omit<T, 'phone' | 'email'> & {
  readonly phone: string | null;
  readonly email: string | null;
  readonly contactVisible: boolean;
};

export interface BatchRedactionResult<T extends CandidateContactRecord> {
  readonly records: RedactedRecord<T>[];
  readonly totalCount: number;
  readonly unmaskedCount: number;
  /**
   * Pre-computed metadata for writing exactly ONE audit row per request.
   * Contains zero candidate contact values.
   */
  readonly auditMetadata: {
    readonly viewerId: string;
    readonly viewerRole: UserRole;
    readonly institutionId?: string | null;
    readonly accessedCount: number;
    readonly unmaskedCount: number;
  };
}

/**
 * Single candidate contact redaction authority.
 */
export function redactCandidateContact<T extends CandidateContactRecord>(
  viewer: ViewerContext,
  record: T,
): RedactedRecord<T> {
  // 1. Platform Admin: Full visibility only when audit-logged
  if (viewer.role === 'admin') {
    // Condition 4: Admin exports/reads masked by default unless includeContacts=true and audit-logged
    if (viewer.includeContacts) {
      // Condition 3: Fail-closed if not audit-logged
      if (!viewer.isAuditLogged) {
        return { ...record, phone: null, email: null, contactVisible: false };
      }
      return {
        ...record,
        phone: record.phone ?? null,
        email: record.email ?? null,
        contactVisible: true,
      };
    }
    // Default masked state for admin view
    return {
      ...record,
      phone: record.phone ? record.phone.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2') : null,
      email: null,
      contactVisible: false,
    };
  }

  // 2. Candidate viewing self (no audit required for own data)
  if (viewer.role === 'job_seeker' && viewer.id === record.id) {
    return {
      ...record,
      phone: record.phone ?? null,
      email: record.email ?? null,
      contactVisible: true,
    };
  }

  // 3. Institution viewing its OWN enrolled students (Condition 1 & 3)
  if (
    (viewer.role === 'institution' || viewer.role === 'intermediary') &&
    viewer.institutionId &&
    record.institutionId &&
    viewer.institutionId === record.institutionId
  ) {
    // Condition 3: Fail-closed if audit logging failed or is omitted
    if (!viewer.isAuditLogged) {
      return { ...record, phone: null, email: null, contactVisible: false };
    }

    return {
      ...record,
      phone: record.phone ?? null,
      email: record.email ?? null,
      contactVisible: true,
    };
  }

  // 4. Default Fail-Closed: Employer, MSME Department, cross-institution, public
  return {
    ...record,
    phone: null,
    email: null,
    contactVisible: false,
  };
}

/**
 * Batch redaction variant (Condition 2).
 * Formats arrays and generates single-row audit metadata with zero contact values.
 */
export function redactCandidateContactsBatch<T extends CandidateContactRecord>(
  viewer: ViewerContext,
  records: readonly T[],
): BatchRedactionResult<T> {
  const redacted = records.map((r) => redactCandidateContact(viewer, r));
  const unmaskedCount = redacted.filter((r) => r.contactVisible).length;

  return {
    records: redacted,
    totalCount: records.length,
    unmaskedCount,
    auditMetadata: {
      viewerId: viewer.id,
      viewerRole: viewer.role,
      institutionId: viewer.institutionId ?? null,
      accessedCount: records.length,
      unmaskedCount,
    },
  };
}
```

---

## 10. Files Requiring Modification (When Implemented)

When implementing the approved policy in a subsequent task, the following files will be touched:

1. **`packages/validation/src/contact-visibility.ts`** *(New File)*:
   - Implement `redactCandidateContact`, `redactCandidateContactsBatch`, `ViewerContext`, and audit logging payload builders.
2. **`packages/validation/src/index.ts`**:
   - Export the new contact visibility module.
3. **`apps/api/src/profiles/profiles.service.ts`**:
   - Update `getInstitutionStudents`: Derive `institutionId` on server via `profileRepository.findInstitutionProfileByUserId(userId)`; join `users` table to fetch enrolled student phone/email; execute `redactCandidateContactsBatch`; record exactly one `INSTITUTION_STUDENT_CONTACTS_VIEWED` row in `audit_logs` with batch count and zero contact PII.
4. **`apps/api/src/profiles/institution-cms.service.ts`**:
   - Update `getInstitutionInquiries`: Record `INSTITUTION_INQUIRIES_VIEWED` in `audit_logs`.
5. **`apps/api/src/bulk/bulk.service.ts`**:
   - In `getBatchErrorCsv`, record `BULK_ERROR_REPORT_DOWNLOADED` in `audit_logs` (capturing actor ID, batch ID, error row count; zero contact values in audit log).
6. **`apps/api/src/admin/admin.service.ts`**:
   - In `exportData`, keep masked contact export by default. When `includeContacts=true` is requested by admin, return full contact details and record dedicated audit log `ADMIN_CONTACTS_EXPORT_PERFORMED`. Add audit log for administrative user list reads.
7. **`apps/web/src/components/workspaces/institution/PlacementDashboard.tsx`**:
   - Update student roster table to display full phone and email for own verified students when `contactVisible: true`.
8. **`apps/web/src/components/workspaces/institution/studentUtils.ts`**:
   - Refactor `maskContactNumber` and `maskEmailAddress` to allow full display when viewer is the student's verified institution.
9. **`apps/web/test/ticket-t19-placement-dashboard.test.ts` & `identity-leaks-trust-badges.test.ts`**:
   - Update assertions to reflect the approved policy: full contact visibility for institution's own students (audit-logged), complete masking for employers.
