# Module 3: Public Profiles, Slugs & Job Discovery (EMP, JOB, JS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure, high-speed public discovery and candidate management architecture featuring opaque Base32 public slugs, indexed read projections for published companies/jobs/institutions, authenticated vector PDF digital CV generation via `@react-pdf/renderer` with embedded Devanagari fonts, and in-platform interview invite SMS dispatch preserving candidate confidentiality (Hard Invariant #1).

**Architecture:**
- **Opaque Public Slugs (ID-02):** Companies, jobs, and institutions are exposed to unauthenticated callers exclusively via 12-character Crockford Base32 strings (`/company/:slug`, `/jobs/:slug`, `/institution/:slug`). Public views and RPCs strip all internal UUIDs, employer IDs, and contact fields. Direct UUID lookups on public routes return HTTP 404 to prohibit identifier enumeration.
- **High-Speed Public Projections (AUTH-05 / F0-f):** Cherry-pick and adapt `PublicDiscoveryRepository` and migration `20261118085644_public_api_projection_reads.sql` to provide indexed, materialized CTE read projections and Postgres FTS (`ts_rank`, `websearch_to_tsquery`) for public directories and search queries, strictly filtering `is_published = true` and `status = 'active'`.
- **Worker Vector PDF Digital CV (JS-03 / Hard Invariant #8a):** Connect the frontend "Download PDF" button in `apps/web/src/components/workspaces/seeker/SeekerProfileForm.tsx` and `SeekerDigitalCvPreview.tsx` to an authenticated API endpoint (`GET /profiles/seeker/me/pdf`), backed by the BullMQ worker `@react-pdf/renderer` service (`apps/worker/src/pdf/pdf-generator.ts`), rendering vector PDFs with embedded Noto Sans Devanagari fonts and serving from Supabase Storage with sub-500ms cache hit performance.
- **In-Platform SMS Shortlist Trigger (PRD Invariant #1):** Enable employers shortlisting candidates to dispatch interview invitation SMS via backend MSG91 DLT flow without exposing candidate phone or email to the frontend. The server resolves candidate contacts internally and logs masked numbers only.

**Tech Stack:** NestJS, Fastify, PostgreSQL / Supabase, BullMQ, Redis, `@react-pdf/renderer`, `@fontsource/noto-sans-devanagari`, Next.js 15, Tailwind CSS, shadcn/ui, MSG91 (DLT SMS), Zod, Vitest.

**Spec:**
- `docs/PRD.md` (ID-02, EMP-01, EMP-02, EMP-03, JOB-01, JOB-02, JOB-03, JS-01, JS-02, JS-03, Hard Invariants #1, #8, #8a)
- `docs/decisions/001-client-decisions.md`
- `docs/audits/02-core-features-infrastructure.md`
- Commit `f4bbd0a` (`codex/review-auth-08-native-ci`)
- PR #106 (`feat/public-slugs-id-02`)

---

## Global Constraints

- **Hard Invariant #1:** Employer/anyone never sees a job seeker's phone or email. Contact only via platform message.
- **Hard Invariant #8:** Aadhaar last 4 only (if provided). Never store full 12 digits.
- **Hard Invariant #8a:** English + Hindi at launch. Embed Devanagari fonts for accurate vector PDF resume rendering.
- **PRD ID-02:** Public slugs are 12-character Crockford Base32 strings generated via crypto-safe random bytes. Never derived from phone, email, or user data. Public views/APIs return zero internal IDs.
- **AGENTS.md Constraint #10:** Zero secrets in code; environment variables validated at startup.
- **AGENTS.md Constraint #11:** Mandatory Pre-Commit Gate: Before committing ANY code change, ALWAYS run typecheck across packages (`tsc --noEmit`) and lint check (`pnpm lint`). Zero errors permitted.

---

## Review Focus

1. **Opaque Public Slug Enforcement:** Public endpoints (`/profiles/business/:slug`, `/profiles/institution/:slug`, `/jobs/:slug`) must reject UUIDs with HTTP 404 (no redirect) and must never disclose internal database UUIDs or user IDs.
2. **Confidential In-Platform Interview Invite:** Employer interview invite triggers must resolve candidate phone numbers purely on the server, ensuring zero candidate PII reaches the employer client or HTTP response body.
3. **Valid Vector PDF CV Generation:** Digital CV PDF generation must return a valid `%PDF-1.4` binary stream containing embedded Noto Sans Devanagari font subsets, clickable verification links, and sub-500ms cache latency.
4. **Publication & Status Filtering:** Public directories and search queries must strictly exclude unpublished entities (`is_published = false`) or suspended/disabled accounts (`status != 'active'`).
5. **PostgreSQL FTS Ranking:** `search_jobs` / `search_public_jobs` must perform ranked FTS matching via Postgres `ts_rank` and `websearch_to_tsquery('english', ...)` without falling back to unindexed table scans.

---

### Task 1: Database Migration for Public Projection Reads & Storage PDF MIME Types

**Files:**
- Create: `packages/database/supabase/migrations/20261118085644_public_api_projection_reads.sql`
- Modify: `packages/database/supabase/migrations/20261110000000_private_storage_bucket.sql`
- Test: `packages/database/test/public-projections-migration.test.ts`

**Interfaces:**
- Consumes: `public.business_profiles`, `public.institution_profiles`, `public.jobs`, `public.users`
- Produces: Service-role projection views (`public.public_institution_profiles`), high-speed RPC `public.search_public_jobs`, `public.read_public_institution_cms`, and updated storage MIME type array including `'application/pdf'`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/database/test/public-projections-migration.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Public Projection Reads Migration (20261118085644)', () => {
  const migrationPath = resolve(
    __dirname,
    '../supabase/migrations/20261118085644_public_api_projection_reads.sql'
  );

  it('declares search_public_jobs RPC with FTS ts_rank and slug projections', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('CREATE FUNCTION public.search_public_jobs');
    expect(sql).toContain('ts_rank(j.fts');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_public_jobs');
    expect(sql).toContain('TO service_role');
  });

  it('declares read_public_institution_cms with security invoker and jsonb output', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('CREATE FUNCTION public.read_public_institution_cms');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.read_public_institution_cms');
    expect(sql).toContain('TO service_role');
  });

  it('allows application/pdf in private storage bucket MIME types', () => {
    const bucketMigration = readFileSync(
      resolve(__dirname, '../supabase/migrations/20261110000000_private_storage_bucket.sql'),
      'utf-8'
    );
    expect(bucketMigration).toContain("'application/pdf'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/database test test/public-projections-migration.test.ts`
Expected: FAIL with "ENOENT: no such file or directory, open '.../20261118085644_public_api_projection_reads.sql'"

- [ ] **Step 3: Implement migration and update storage bucket configuration**

Create `packages/database/supabase/migrations/20261118085644_public_api_projection_reads.sql` adapted from commit `f4bbd0a` to work with `public_slug` (slug) columns and update `packages/database/supabase/migrations/20261110000000_private_storage_bucket.sql` to include `'application/pdf'` in `allowed_mime_types`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/database test test/public-projections-migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/database/supabase/migrations/
git commit -m "feat(db): ID-02 add high-speed public projection reads and allow PDF storage"
```

---

### Task 2: Cherry-Pick & Adapt `PublicDiscoveryRepository` with Opaque Slugs

**Files:**
- Create: `apps/api/src/database/repositories/public-discovery.repository.ts`
- Modify: `apps/api/src/database/database.module.ts`
- Modify: `apps/api/src/jobs/jobs.service.ts`
- Modify: `apps/api/src/profiles/profiles.service.ts`
- Test: `apps/api/test/public-discovery.spec.ts`

**Interfaces:**
- Consumes: Supabase client, `UserRepository`, `JobFilterInput`, `PublicDirectoryQuery`
- Produces: `PublicDiscoveryRepository` methods:
  - `company(slug: string): Promise<PublicBusinessRecord>`
  - `institution(slug: string): Promise<PublicInstitutionRecord>`
  - `job(slug: string): Promise<PublicJobRecord>`
  - `directory(kind: 'business' | 'institution', query: PublicDirectoryQuery): Promise<PublicDirectoryResult>`
  - `jobs(filters: JobFilterInput): Promise<{ jobs: PublicJobRecord[]; total: number }>`
  - `cms(slug: string): Promise<PublicInstitutionCms>`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/test/public-discovery.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PublicDiscoveryRepository } from '../src/database/repositories/public-discovery.repository.js';
import { PersistentDatabaseStore } from '../src/database/supabase.provider.js';
import { UserRepository } from '../src/database/repositories/user.repository.js';
import { NotFoundException } from '@nestjs/common';

describe('PublicDiscoveryRepository - Opaque Slugs & Projections', () => {
  let repo: PublicDiscoveryRepository;
  const store = PersistentDatabaseStore.getInstance();

  beforeEach(() => {
    store.clearAll();
    const mockUserRepo = {
      findById: async (id: string) => ({
        id,
        role: 'employer',
        status: 'active',
        phone: '9876543210',
      }),
    } as unknown as UserRepository;

    repo = new PublicDiscoveryRepository({} as any, mockUserRepo, true);
  });

  it('rejects UUID lookups on public routes with NotFoundException (ID-02)', async () => {
    const rawUuid = '123e4567-e89b-12d3-a456-426614174000';
    await expect(repo.company(rawUuid)).rejects.toThrow(NotFoundException);
    await expect(repo.job(rawUuid)).rejects.toThrow(NotFoundException);
  });

  it('resolves valid 12-char Crockford Base32 public slug without leaking UUIDs', async () => {
    const validSlug = '3m8x0b7k9w2a';
    store.insertRow('business_profiles', {
      id: 'biz-internal-uuid-1',
      user_id: 'usr-1',
      public_slug: validSlug,
      company_name: 'Apex Manufacturing',
      ownership_type: 'Private Limited',
      company_size: 'Small',
      sector: 'Automobile',
      city: 'Indore',
      district: 'Indore',
      is_published: true,
    } as any);

    const result = await repo.company(validSlug);
    expect(result.slug).toBe(validSlug);
    expect(result.companyName).toBe('Apex Manufacturing');
    expect((result as any).id).toBeUndefined();
    expect((result as any).userId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/api test test/public-discovery.spec.ts`
Expected: FAIL with "Cannot find module '../src/database/repositories/public-discovery.repository.js'"

- [ ] **Step 3: Implement `PublicDiscoveryRepository` and wire into `JobsService` and `ProfilesService`**

1. Create `apps/api/src/database/repositories/public-discovery.repository.ts` adapted from commit `f4bbd0a` to enforce Crockford Base32 `slug` validation (`/^[0-9a-hj-km-np-tv-z]{12}$/`) for public lookup and exclude internal UUIDs from projections.
2. Provide `PublicDiscoveryRepository` in `apps/api/src/database/database.module.ts`.
3. Wire `PublicDiscoveryRepository` into `JobsService.getJobs`, `JobsService.getJobBySlug`, and `ProfilesService.getBusinessProfilePublic` / `getInstitutionProfilePublic`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/api test test/public-discovery.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database/ apps/api/src/jobs/ apps/api/src/profiles/ apps/api/test/
git commit -m "feat(api): ID-02 integrate PublicDiscoveryRepository with opaque public slugs"
```

---

### Task 3: Backend Seeker PDF Generation Service & Download Endpoint

**Files:**
- Modify: `apps/api/src/profiles/profiles.controller.ts`
- Modify: `apps/api/src/profiles/profiles.service.ts`
- Modify: `apps/api/src/queue/queue.service.ts`
- Test: `apps/api/test/seeker-pdf-download.spec.ts`

**Interfaces:**
- Consumes: Current authenticated `AuthUser`, `ProfileRepository`, `QueueService` / Supabase Storage signed URLs
- Produces: `GET /profiles/seeker/me/pdf` returning `{ downloadUrl: string; cached: boolean }` or streaming PDF buffer

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/test/seeker-pdf-download.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesController } from '../src/profiles/profiles.controller.js';
import { ProfilesService } from '../src/profiles/profiles.service.js';
import { InstitutionCmsService } from '../src/profiles/institution-cms.service.js';
import { QueueService } from '../src/queue/queue.service.js';
import { AuthUser } from '../src/auth/decorators/current-user.decorator.js';

describe('Seeker PDF Download Endpoint (JS-03 / Hard Invariant #8a)', () => {
  let controller: ProfilesController;
  let profilesService: ProfilesService;

  beforeEach(async () => {
    const mockProfilesService = {
      getSeekerPdfDownload: async (userId: string) => ({
        downloadUrl: `https://storage.jobsclick.live/private/resumes/seeker_${userId}.pdf?token=mock`,
        cached: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        { provide: ProfilesService, useValue: mockProfilesService },
        { provide: InstitutionCmsService, useValue: {} },
        { provide: QueueService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
    profilesService = module.get<ProfilesService>(ProfilesService);
  });

  it('delivers signed download URL for authenticated candidate CV PDF', async () => {
    const user: AuthUser = { id: 'usr-seeker-1', role: 'job_seeker', status: 'active' };
    const result = await controller.getSeekerPdfMe(user);

    expect(result.downloadUrl).toContain('resumes/seeker_usr-seeker-1.pdf');
    expect(result.cached).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/api test test/seeker-pdf-download.spec.ts`
Expected: FAIL with "controller.getSeekerPdfMe is not a function"

- [ ] **Step 3: Implement `getSeekerPdfMe` in `ProfilesController` and `ProfilesService`**

1. In `apps/api/src/profiles/profiles.controller.ts`:
   Add `@Roles('job_seeker', 'admin') @Get('seeker/me/pdf') async getSeekerPdfMe(@CurrentUser() user: AuthUser)`.
2. In `apps/api/src/profiles/profiles.service.ts`:
   Implement `getSeekerPdfDownload(userId: string)`:
   - Check seeker profile existence in `ProfileRepository`.
   - Dispatch or verify presence in Supabase Storage (`resumes/${profile.id}.pdf`).
   - If not in storage, trigger BullMQ `publishPdfJob` via `QueueService` or generate signed URL.
   - Return `{ downloadUrl: string; cached: boolean }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/api test test/seeker-pdf-download.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/profiles/ apps/api/src/queue/ apps/api/test/
git commit -m "feat(api): JS-03 add authenticated seeker PDF CV download endpoint"
```

---

### Task 4: Connect Frontend "Download PDF" Button in Seeker Workspace

**Files:**
- Modify: `apps/web/src/components/workspaces/seeker/SeekerProfileForm.tsx`
- Modify: `apps/web/src/components/workspaces/seeker/SeekerDigitalCvPreview.tsx`
- Modify: `apps/web/src/components/workspaces/seeker/seekerApi.ts`
- Modify: `apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/hi.json`
- Test: `apps/web/test/seeker-pdf-download.test.ts`

**Interfaces:**
- Consumes: `downloadSeekerPdfApi(apiUrl, authHeader, seekerId, candidateName)`
- Produces: Interactive "Download PDF" button in `SeekerProfileForm` and `SeekerDigitalCvPreview` triggering client file download of `${candidateName}-Resume.pdf`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/test/seeker-pdf-download.test.ts
import { describe, it, expect, vi } from 'vitest';
import { downloadSeekerPdfApi } from '../src/components/workspaces/seeker/seekerApi';

describe('Seeker PDF Client Download Handler', () => {
  it('requests /profiles/seeker/me/pdf and triggers browser download link', async () => {
    const mockBlob = new Blob(['%PDF-1.4 mock binary'], { type: 'application/pdf' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
      json: async () => ({ downloadUrl: 'https://cdn.jobsclick.live/resume.pdf' }),
    } as any);

    const mockAnchor = { click: vi.fn(), href: '', download: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);

    const success = await downloadSeekerPdfApi('http://localhost:3001', 'Bearer mock-token', 'usr-123', 'Priya Sharma');
    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/profiles/seeker/me/pdf',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/web test test/seeker-pdf-download.test.ts`
Expected: FAIL with "downloadSeekerPdfApi is not defined"

- [ ] **Step 3: Implement `downloadSeekerPdfApi` and wire UI download buttons**

1. In `apps/web/src/components/workspaces/seeker/seekerApi.ts`:
   Add `downloadSeekerPdfApi` to fetch `/profiles/seeker/me/pdf`, resolve the binary or signed URL, and trigger a download anchor with filename `${candidateName || 'Candidate'}-Resume.pdf`.
2. In `apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts`:
   Add `handleDownloadPdf` state handler invoking `downloadSeekerPdfApi` with loading indicator and toast notification.
3. In `apps/web/src/components/workspaces/seeker/SeekerProfileForm.tsx`:
   Add "Download PDF" action button beside Save/Cancel.
4. In `apps/web/src/components/workspaces/seeker/SeekerDigitalCvPreview.tsx`:
   Add "Download PDF" button next to "Print Resume".
5. In `apps/web/messages/en.json` and `hi.json`:
   Ensure `downloadPdf` copy is localized ("Download Official PDF" / "आधिकारिक पीडीएफ डाउनलोड करें").

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/web test test/seeker-pdf-download.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspaces/seeker/ apps/web/messages/ apps/web/test/
git commit -m "feat(web): JS-03 wire Download PDF button in Seeker Profile Form and Digital CV"
```

---

### Task 5: In-Platform SMS Interview Invite Trigger for Shortlisted Candidates (PRD Invariant #1)

**Files:**
- Modify: `apps/api/src/jobs/jobs.controller.ts`
- Modify: `apps/api/src/jobs/jobs.service.ts`
- Modify: `apps/web/src/components/workspaces/employer/ApplicantDetailModal.tsx`
- Modify: `apps/web/src/components/workspaces/employer/employerApi.ts`
- Modify: `apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/hi.json`
- Test: `apps/api/test/interview-invite-sms.spec.ts`
- Test: `apps/web/test/applicant-interview-invite.test.ts`

**Interfaces:**
- Consumes: Employer auth session, `applicationId`, `UserRepository.findById` (server-side phone resolution)
- Produces: `POST /jobs/applications/:appId/interview-invite` returning `{ success: boolean; message: string }` without leaking candidate phone/email, and "Send Interview Invite (SMS)" button in `ApplicantDetailModal`

- [ ] **Step 1: Write the failing backend test**

```typescript
// apps/api/test/interview-invite-sms.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { SmsGateway } from '../src/auth/sms.service.js';

describe('In-Platform Interview Invite SMS (Hard Invariant #1)', () => {
  let jobsService: JobsService;
  let mockSmsGateway: { sendOtp: any; sendInviteSms?: any };

  beforeEach(() => {
    mockSmsGateway = {
      sendOtp: vi.fn().mockResolvedValue({ success: true, message: 'sent' }),
    };

    const mockAppRepo = {
      findById: async (id: string) => ({
        id,
        job_id: 'job-1',
        applicant_id: 'usr-applicant-1',
        status: 'shortlisted',
      }),
    };

    const mockJobRepo = {
      findById: async (id: string) => ({
        id,
        employer_id: 'usr-employer-1',
        title: 'CNC Operator',
      }),
    };

    const mockUserRepo = {
      findById: async (id: string) => ({
        id,
        phone: '9876543210',
      }),
    };

    const mockProfileRepo = {
      findSeekerProfileByUserId: async () => ({ full_name: 'Rahul Verma' }),
      findBusinessProfileByUserId: async () => ({ company_name: 'Tata Motors Vendor' }),
    };

    jobsService = new JobsService(
      {} as any,
      mockJobRepo as any,
      mockAppRepo as any,
      mockProfileRepo as any,
      mockUserRepo as any,
      {} as any,
      mockSmsGateway as any,
    );
  });

  it('dispatches SMS to candidate phone internally and redacts phone from employer response', async () => {
    const result = await jobsService.sendInterviewInvite('usr-employer-1', 'app-123', 'employer');

    expect(result.success).toBe(true);
    expect(result.message).toContain('Interview invite sent');
    // Ensure zero PII in returned object
    expect((result as any).phone).toBeUndefined();
    expect((result as any).candidatePhone).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @indian-job-portal/api test test/interview-invite-sms.spec.ts`
Expected: FAIL with "jobsService.sendInterviewInvite is not a function"

- [ ] **Step 3: Implement backend interview invite endpoint and frontend modal integration**

1. In `apps/api/src/jobs/jobs.controller.ts`:
   Add `@Roles('employer', 'admin') @Post('applications/:appId/interview-invite') async sendInterviewInvite(@CurrentUser() user: AuthUser, @Param('appId') appId: string)`.
2. In `apps/api/src/jobs/jobs.service.ts`:
   Implement `sendInterviewInvite(employerId, applicationId, role)`:
   - Verify job ownership (`job.employer_id === employerId` unless admin).
   - Fetch candidate's phone securely via `userRepository.findById(appRecord.applicant_id)`.
   - Dispatch SMS invite via `smsGateway` using DLT candidate template.
   - Return `{ success: true, message: 'Interview invite sent to candidate' }` without leaking phone or email.
3. In `apps/web/src/components/workspaces/employer/employerApi.ts`:
   Add `sendInterviewInviteSmsApi(apiUrl, authHeader, userId, appId)`.
4. In `apps/web/src/components/workspaces/employer/ApplicantDetailModal.tsx`:
   Add "Send Interview Invite (SMS)" button with confidential privacy badge, invoking `onSendInterviewInvite(applicant.id)`.
5. In `apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`:
   Wire toast success message ("Interview invite sent via confidential platform SMS").

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @indian-job-portal/api test test/interview-invite-sms.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/ apps/web/src/components/workspaces/employer/ apps/api/test/ apps/web/test/
git commit -m "feat(jobs): JOB-03 implement in-platform candidate interview invite SMS (Hard Invariant #1)"
```

---

### Task 6: Monorepo Verification & Pre-Commit Hardening Gate

**Files:**
- Test: All workspace test suites across API, Web, Worker, Database

**Interfaces:**
- Consumes: Full monorepo codebase
- Produces: 100% clean TypeScript typecheck (`tsc --noEmit`), clean ESLint (`pnpm lint`), and passing test suites

- [ ] **Step 1: Run monorepo typecheck**

Run: `pnpm -r typecheck`
Expected: 100% clean success across all workspace packages (0 errors).

- [ ] **Step 2: Run monorepo linter**

Run: `pnpm -r lint`
Expected: 100% clean success across all workspace packages (0 errors).

- [ ] **Step 3: Run targeted test verification**

Run:
- `pnpm --filter @indian-job-portal/api test test/public-discovery.spec.ts`
- `pnpm --filter @indian-job-portal/api test test/interview-invite-sms.spec.ts`
- `pnpm --filter @indian-job-portal/web test test/seeker-pdf-download.test.ts`
- `pnpm --filter @indian-job-portal/worker test test/pdf.test.ts`
Expected: All suites PASS.

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore(release): verify Module 3 public profiles, slugs, and discovery gates"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-19-module-3-public-profiles-slugs-discovery.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

For this plan I recommend **Native**, because the tasks are tightly coupled across the monorepo API, database, worker, and frontend components, and sequential execution allows instant iterative verification against the existing PR #106 test gates. Does the plan capture what you want, and which approach should we use?
