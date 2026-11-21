# Module 2: Bulk Onboarding & Invite Waves (BULK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-grade, tenant-isolated bulk onboarding pipeline for MSME Employers and Institution Students, featuring simplified contact-only CSV ingestion (email or mobile number), automated welcome & onboarding step emails, single-queue BullMQ invite wave orchestration, and complete resolution of the P0-6 defect (1:1 SMS dispatch with DB status tracking and strict batch scoping).

**Architecture:**
- **Streaming Ingestion:** BullMQ queue (`bulk-import`) processes streaming CSV files (up to 50,000 rows) in 500-row chunks. Each row extracts either an email or Indian mobile number, registers the user in `users` with status `invited`, records an invitation in `invitations` scoped to `batch_id`, and dispatches an onboarding email with login and profile completion instructions for users with email.
- **Wave Orchestration (Single Source of Truth):** Drop QStash duplicate invocations from `bulk.service.ts` so BullMQ is the sole queue orchestrator. `InviteProcessor` queries `invitations` strictly scoped to `batch_id` and `status = 'pending'`, dispatches 1:1 real SMS via MSG91, updates per-recipient DB status, and records wave progress.
- **Tenant Isolation & Security:** `BulkService` isolates storage paths (`bulk-imports/${actor.id}/${uuid}_${filename}`), enforces `assertOwner` to prohibit cross-institution access, and restricts entity types per role (`intermediary` -> student, `msme_admin` -> employer, `admin` -> both).
- **Web UI:** Employer bulk onboard page (MSME Admin / Admin) and Institution bulk upload console (Institutions) accept contact-only CSV templates, show real-time progress, and provide error CSV downloads.

**Tech Stack:** NestJS, Fastify, Supabase Storage, PostgreSQL, BullMQ, Redis, MSG91 (DLT SMS), Resend (Transactional Email), Next.js 15, Tailwind CSS, shadcn/ui, Zod.

**Spec:**
- `docs/PRD.md` (BULK-01, BULK-02, BULK-03, Hard Invariants #1, #2, #3, #8)
- `docs/decisions/001-client-decisions.md`
- `docs/audits/02-core-features-infrastructure.md` (Audit P0-6: R3-01, R3-02, R3-03, R3-04, R3-15)
- `docs/security/bulk-ownership-verification.md`

---

## Global Constraints

- **PRD BULK-01:** Direct upload of up to 50,000-row CSV files via Supabase Storage signed URLs.
- **PRD BULK-02:** Bulk parsing and validation with streaming processing. Only email or Indian mobile number required from CSV.
- **PRD BULK-03:** Batch SMS invite waves with pre-dispatch cost preview and pause/resume/cancel controls.
- **Hard Invariant #1:** Employer/anyone never sees a job seeker's phone or email. Contact only via platform message.
- **Hard Invariant #2:** Bulk import creates users in `invited` state. **No SMS at import.** Invites go out in batches with cost preview.
- **Hard Invariant #3:** Every bulk import row keeps `source`.
- **Hard Invariant #8:** Aadhaar last 4 only (if provided). Never store full 12 digits.
- **AGENTS.md Constraint #10:** Zero secrets in code; environment variables validated at startup.
- **AGENTS.md Constraint #11:** Mandatory Pre-Commit Gate: Before committing ANY code change, ALWAYS run typecheck across packages (`tsc --noEmit`) and lint check (`pnpm lint`). Zero errors permitted.

---

## Review Focus

1. **P0-6 Defect Elimination:** `invite.processor.ts` must never query global `users` without batch scoping and must never fake 250 sends per single SMS dispatch.
2. **Contact-Only Ingestion Flexibility:** CSV rows with only email, only phone, or both must be accepted and registered; rows missing both or having invalid formats must be recorded in error reports.
3. **Queue Single Source of Truth:** `bulk.service.ts` must not invoke duplicate QStash webhook jobs that overwrite wave state without sending real SMS.
4. **Tenant Isolation:** An institution or MSME admin must never view, download error reports for, or trigger invite waves on batches uploaded by another actor.
5. **Onboarding Email Delivery:** Users imported with an email address must receive an automated registration confirmation email containing login links and clear role-specific onboarding steps.

---

### Task 1: Database Migration for Email-Supported Bulk Invitations

**Files:**
- Create: `packages/database/supabase/migrations/20261119100000_bulk_invitations_email_support.sql`
- Test: `packages/database/test/invitations-schema.test.ts`

**Interfaces:**
- Consumes: PostgreSQL schema for `public.invitations`
- Produces: Nullable `phone`, new `email` column, check constraint for contact presence, and composite index on `(batch_id, status)`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/database/test/invitations-schema.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Invitations Schema Migration (Email Support & Batch Indexing)', () => {
  it('defines nullable phone, email column, contact check constraint, and batch_id+status index', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../supabase/migrations/20261119100000_bulk_invitations_email_support.sql'
    );
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/ALTER TABLE (?:public\.)?invitations ALTER COLUMN phone DROP NOT NULL/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS email VARCHAR\(255\)/i);
    expect(sql).toMatch(/CHECK \((?:phone IS NOT NULL OR email IS NOT NULL)\)/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_invitations_batch_status ON (?:public\.)?invitations\s*\(batch_id,\s*status\)/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/database/test/invitations-schema.test.ts`  
Expected: FAIL (migration file does not exist).

- [ ] **Step 3: Implement SQL migration `20261119100000_bulk_invitations_email_support.sql`**

In `packages/database/supabase/migrations/20261119100000_bulk_invitations_email_support.sql`:
```sql
-- Migration: bulk_invitations_email_support
-- Enables contact-only CSV bulk onboarding (email or phone) with batch indexing for fast wave queries.
BEGIN;

-- Allow phone to be nullable in invitations for email-only imported users
ALTER TABLE public.invitations ALTER COLUMN phone DROP NOT NULL;

-- Add email column to invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Ensure at least one contact method is present on every invitation
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS check_invitation_contact_present;
ALTER TABLE public.invitations ADD CONSTRAINT check_invitation_contact_present
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- Index for high-throughput wave candidate lookups (P0-6 fix)
CREATE INDEX IF NOT EXISTS idx_invitations_batch_status ON public.invitations(batch_id, status);

COMMIT;
```

Run migration sync:
`node scripts/sync-migrations.js`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/database/test/invitations-schema.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/database/supabase/migrations/20261119100000_bulk_invitations_email_support.sql packages/database/test/invitations-schema.test.ts
git commit -m "feat(database): BULK-02 add email support and composite batch index to invitations"
```

---

### Task 2: Shared RFC-4180 CSV Parser & Contact Validation (`packages/validation`)

**Files:**
- Create: `packages/validation/src/csv.ts`
- Modify: `packages/validation/src/index.ts:1-10`
- Modify: `packages/validation/src/auth.ts:160-195`
- Modify: `packages/validation/src/bulk.ts:1-32`
- Test: `packages/validation/test/csv.test.ts`

**Interfaces:**
- Consumes: `csv-parse/sync`
- Produces: `parseSharedCsv(csvText, options)`, `normalizeIndianPhone(input)`, `normalizeEmail(input)`, `BulkContactRowSchema`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/validation/test/csv.test.ts
import { describe, it, expect } from 'vitest';
import { parseSharedCsv, normalizeIndianPhone, normalizeEmail } from '../src/index.js';

describe('Shared RFC-4180 CSV & Contact Normalizer', () => {
  it('parses CSV with BOM, quotes, and commas cleanly', () => {
    const csv = '\uFEFF"email","phone"\n"candidate@example.com","+91 98765 43210"\n"student2@test.in",';
    const parsed = parseSharedCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.['email']).toBe('candidate@example.com');
    expect(normalizeIndianPhone(parsed[0]?.['phone'])).toBe('9876543210');
    expect(normalizeEmail(parsed[1]?.['email'])).toBe('student2@test.in');
  });

  it('normalizes Indian mobile numbers to 10 digits and rejects invalid formats', () => {
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('91-9876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('+919876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('12345')).toBeNull();
    expect(normalizeIndianPhone('5876543210')).toBeNull();
  });

  it('normalizes emails to lowercase and rejects malformed values', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    expect(normalizeEmail('invalid-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/validation/test/csv.test.ts`  
Expected: FAIL (`parseSharedCsv` or `normalizeEmail` not found).

- [ ] **Step 3: Implement `packages/validation/src/csv.ts`, update `auth.ts`, `bulk.ts`, and `index.ts`**

In `packages/validation/src/csv.ts`:
```typescript
import { parse as parseCsvSync } from 'csv-parse/sync';

export interface CsvParseOptions {
  readonly relaxColumnCount?: boolean;
  readonly trim?: boolean;
}

export function parseSharedCsv(
  csvText: string,
  options?: CsvParseOptions,
): Array<Record<string, string>> {
  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return [];
  }

  try {
    return parseCsvSync(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: options?.trim ?? true,
      bom: true,
      relax_column_count: options?.relaxColumnCount ?? true,
    }) as Array<Record<string, string>>;
  } catch (err) {
    throw new Error(`CSV parse error: ${(err as Error).message}`);
  }
}
```

In `packages/validation/src/auth.ts`:
Ensure `normalizeEmail` and `normalizeIndianPhone` are exported:
```typescript
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed) || trimmed.length > 254) return null;
  return trimmed;
}
```

In `packages/validation/src/index.ts`:
```typescript
export * from './csv.js';
export * from './auth.js';
export * from './bulk.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/validation/test/csv.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/csv.ts packages/validation/src/auth.ts packages/validation/src/bulk.ts packages/validation/src/index.ts packages/validation/test/csv.test.ts
git commit -m "feat(validation): BULK-02 add shared CSV parser and contact normalizers"
```

---

### Task 3: Worker Streaming CSV Ingestion with Contact-Only Extraction & Welcome Email (`apps/worker`)

**Files:**
- Modify: `apps/worker/src/email/email.service.ts:90-149`
- Modify: `apps/worker/src/processors/import.processor.ts:1-600`
- Create: `apps/worker/test/import-contacts.spec.ts`
- Modify: `apps/worker/test/import.processor.spec.ts:1-200`

**Interfaces:**
- Consumes: BullMQ Job (`BulkImportJobData`), Supabase Storage stream, `WorkerEmailService`
- Produces: `BulkImportJobResult`, created users in `status: 'invited'`, `invitations` with `batch_id`, welcome email sent to rows with email

- [ ] **Step 1: Write the failing test**

```typescript
// apps/worker/test/import-contacts.spec.ts
import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { ImportProcessor, type BulkImportJobData } from '../src/processors/import.processor.js';
import { createMockSupabase } from './fixtures/import-supabase.js';

describe('BULK-02 contact-only CSV ingestion (email or mobile)', () => {
  it('imports student with email only and sends welcome email with login steps', async () => {
    const database = createMockSupabase();
    const mockEmailService = {
      sendBulkOnboardingWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
    };
    const processor = new ImportProcessor(database, mockEmailService as any);

    const result = await processor.process({
      data: {
        batchId: '00000000-0000-0000-0000-000000000001',
        source: 'Indore Engineering College',
        entityType: 'student',
        csvContent: 'email,phone\nstudent1@test.in,\nstudent2@test.in,9876543210\n,9876543211',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<BulkImportJobData>);

    expect(result.validRows).toBe(3);
    expect(result.errorRows).toBe(0);
    expect(database._users).toHaveLength(3);
    expect(database._users[0]).toMatchObject({
      email: 'student1@test.in',
      phone: null,
      role: 'job_seeker',
      status: 'invited',
    });
    expect(mockEmailService.sendBulkOnboardingWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student1@test.in',
        role: 'job_seeker',
        source: 'Indore Engineering College',
      }),
    );
  });

  it('rejects rows where both email and mobile are missing or invalid', async () => {
    const database = createMockSupabase();
    const processor = new ImportProcessor(database);

    const result = await processor.process({
      data: {
        batchId: '00000000-0000-0000-0000-000000000002',
        source: 'DIC Bhopal',
        entityType: 'employer',
        csvContent: 'email,phone\n,\ninvalid-email,12345\nvalid@company.com,9876543212',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<BulkImportJobData>);

    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/worker/test/import-contacts.spec.ts`  
Expected: FAIL (`sendBulkOnboardingWelcomeEmail` missing, or processor requires company_name/name).

- [ ] **Step 3: Implement Welcome Email in `email.service.ts` and update `import.processor.ts`**

In `apps/worker/src/email/email.service.ts`:
Add `sendBulkOnboardingWelcomeEmail`:
```typescript
export interface BulkOnboardingWelcomeEmailOptions {
  email: string;
  role: 'job_seeker' | 'employer';
  source: string;
  name?: string;
}

export class WorkerEmailService {
  // ... existing methods
  async sendBulkOnboardingWelcomeEmail(options: BulkOnboardingWelcomeEmailOptions): Promise<SendEmailResult> {
    const webUrl = process.env['WEB_URL'] || 'https://jobsclick.live';
    const isEmployer = options.role === 'employer';
    const subject = isEmployer
      ? `Welcome to JobsClick - Complete Your Employer Registration (${options.source})`
      : `Welcome to JobsClick - Your Account is Ready (${options.source})`;

    const loginUrl = `${webUrl}/auth?email=${encodeURIComponent(options.email)}`;
    const stepsHtml = isEmployer
      ? `<ol>
          <li>Click <a href="${loginUrl}">Log In</a> to access your employer account.</li>
          <li>Complete your Enterprise & MSME profile.</li>
          <li>Post your job openings to connect with verified student candidates.</li>
        </ol>`
      : `<ol>
          <li>Click <a href="${loginUrl}">Log In</a> to verify your student account.</li>
          <li>Complete your education profile and skills.</li>
          <li>Discover and apply for verified entry-level and MSME jobs.</li>
        </ol>`;

    const html = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2>Welcome to JobsClick!</h2>
        <p>You have been registered on the JobsClick platform by <strong>${options.source}</strong>.</p>
        <h3>Next Steps to Complete Your Onboarding:</h3>
        ${stepsHtml}
        <p style="margin-top: 24px;">
          <a href="${loginUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Log In to JobsClick</a>
        </p>
      </div>
    `;

    return this.sendEmail({
      to: options.email,
      subject,
      html,
    });
  }
}
```

In `apps/worker/src/processors/import.processor.ts`:
Refactor CSV parsing to:
1. Extract `phone` (`normalizeIndianPhone`) and `email` (`normalizeEmail`).
2. Optional extra fields: `name`, `company_name`, `company_size`, `ownership_type`, `aadhaar`.
3. Validation: row is valid if `phone` is valid OR `email` is valid. If raw phone is given but invalid, or raw email is given but invalid, or both empty -> record row error.
4. Deduplicate inside batch and against DB by phone and email.
5. Upsert `users` with `role` (`employer` if MSME admin, `job_seeker` if student), `status: 'invited'`, `source`.
6. Insert corresponding `job_seeker_profiles` or `business_profiles`.
7. Insert `invitations` record with `{ batch_id, phone: u.phone, email: u.email, status: 'pending' }`.
8. For rows with `email`: call `this.emailService.sendBulkOnboardingWelcomeEmail({...})`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/worker/test/import-contacts.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/email/email.service.ts apps/worker/src/processors/import.processor.ts apps/worker/test/import-contacts.spec.ts
git commit -m "feat(worker): BULK-02 contact-only CSV ingestion and onboarding welcome email"
```

---

### Task 4: Worker Invite Wave Processor with Strict Batch Scoping & 1:1 SMS (Fix P0-6)

**Files:**
- Modify: `apps/worker/src/processors/invite.processor.ts:1-160`
- Create: `apps/worker/test/invite-isolation.spec.ts`
- Modify: `apps/worker/test/processors.spec.ts:100-140`

**Interfaces:**
- Consumes: BullMQ Job (`InviteWaveJobData`), `WorkerSmsService`, Supabase DB
- Produces: `InviteWaveJobResult`, 1:1 SMS dispatch, updated `invitations.status` per recipient, updated `invite_waves.status`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/worker/test/invite-isolation.spec.ts
import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { InviteProcessor, type InviteWaveJobData } from '../src/processors/invite.processor.js';

describe('BULK-03 invitation recipient isolation (P0-6 Fix)', () => {
  const batchId = '12345678-1234-4234-8234-123456789012';

  it('queries ONLY invitations scoped to batch_id with status pending, never queries users globally', async () => {
    const sendInviteSms = vi.fn().mockResolvedValue({ success: true });
    const processor = new InviteProcessor();

    const query = {
      select: () => query,
      eq: vi.fn(() => query),
      update: () => query,
      single: async () => ({ data: { id: 'wave-1', batch_id: batchId, status: 'dispatched' }, error: null }),
      limit: async () => ({
        data: [
          { id: 'inv-1', phone: '9876543210' },
          { id: 'inv-2', phone: '9876543211' },
        ],
        error: null,
      }),
    };
    const from = vi.fn((table: string) => query);
    Object.assign(processor, { supabase: { from }, smsService: { sendInviteSms } });

    const result = await processor.process({
      data: { waveId: 'wave-1', batchId, waveSize: 2 },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<InviteWaveJobData>);

    expect(result.sentCount).toBe(2);
    expect(sendInviteSms).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalledWith('users');
    expect(from).toHaveBeenCalledWith('invitations');
    expect(query.eq).toHaveBeenCalledWith('batch_id', batchId);
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('never sends unrelated or synthetic recipients when batch lookup is empty', async () => {
    const sendInviteSms = vi.fn().mockResolvedValue({ success: true });
    const processor = new InviteProcessor();

    const query = {
      select: () => query,
      eq: () => query,
      update: () => query,
      single: async () => ({ data: { id: 'wave-2', batch_id: batchId, status: 'dispatched' }, error: null }),
      limit: async () => ({ data: [], error: null }),
    };
    const from = vi.fn(() => query);
    Object.assign(processor, { supabase: { from }, smsService: { sendInviteSms } });

    const result = await processor.process({
      data: { waveId: 'wave-2', batchId, waveSize: 10 },
      attemptsMade: 0,
      updateProgress: vi.fn(),
    } as unknown as Job<InviteWaveJobData>);

    expect(result.sentCount).toBe(0);
    expect(sendInviteSms).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/worker/test/invite-isolation.spec.ts`  
Expected: FAIL (unscoped query or mock chunk skipping in `invite.processor.ts`).

- [ ] **Step 3: Implement exact P0-6 fix in `apps/worker/src/processors/invite.processor.ts`**

In `apps/worker/src/processors/invite.processor.ts`:
1. Check wave existence and batch matching:
```typescript
const { data: currentWave, error: waveError } = await this.supabase
  .from('invite_waves')
  .select('*')
  .eq('id', waveId)
  .single();

if (waveError || !currentWave || currentWave.batch_id !== batchId) {
  throw new Error('INVITE_WAVE_BATCH_MISMATCH');
}
```
2. Query strictly pending invitations for this `batchId`:
```typescript
const { data: invitations, error: invitationError } = await this.supabase
  .from('invitations')
  .select('id, phone')
  .eq('batch_id', batchId)
  .eq('status', 'pending')
  .not('phone', 'is', null)
  .limit(waveSize);

if (invitationError || !invitations) throw new Error('INVITE_RECIPIENT_LOOKUP_FAILED');
```
3. Loop 1:1 through each recipient with DB status update:
```typescript
for (let i = 0; i < invitations.length && i < waveSize; i++) {
  const recipient = invitations[i]!;
  if (!recipient.phone) continue;

  const smsResult = await this.smsService.sendInviteSms({
    phone: recipient.phone,
    language: 'en',
  });

  if (smsResult.success) {
    sentCount++;
    await this.supabase.from('invitations').update({ status: 'sent' }).eq('id', recipient.id);
  } else {
    failedCount++;
    await this.supabase.from('invitations').update({ status: 'failed' }).eq('id', recipient.id);
  }

  if (typeof job.updateProgress === 'function' && (i % 25 === 0 || i === invitations.length - 1)) {
    await job.updateProgress({
      dispatched: sentCount,
      total: waveSize,
      percent: Math.round(((sentCount + failedCount) / waveSize) * 100),
    });
  }
}
```
4. Update `invite_waves` row to `completed`, with `sent_count: sentCount`, `failed_count: failedCount`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/worker/test/invite-isolation.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/processors/invite.processor.ts apps/worker/test/invite-isolation.spec.ts
git commit -m "fix(worker): P0-6 scope invite waves strictly to batch invitations and record 1:1 SMS status"
```

---

### Task 5: API Bulk Service Tenant Isolation & Drop QStash Duplicate Invocation (`apps/api`)

**Files:**
- Modify: `apps/api/src/bulk/bulk.service.ts:1-750`
- Modify: `apps/api/src/bulk/bulk.controller.ts:1-100`
- Modify: `apps/api/src/auth/guards/jwt-auth.guard.ts:10-40` (support `TEST_AUTH_GUARD`)
- Create: `apps/api/test/bulk-ownership.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `QueueService`
- Produces: Isolated storage paths, `assertOwner` authorization, single BullMQ scheduling without QStash duplication

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/test/bulk-ownership.e2e-spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';

describe('BULK-01–03 Tenant Isolation & Single BullMQ Queue', () => {
  let app: NestFastifyApplication;
  let batchId: string;
  const institutionA = { 'x-user-id': 'inst-a', 'x-user-role': 'intermediary' };
  const institutionB = { 'x-user-id': 'inst-b', 'x-user-role': 'intermediary' };
  const msmeAdmin = { 'x-user-id': 'msme-admin-1', 'x-user-role': 'msme_admin' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const res = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: institutionA,
      payload: { source: 'College A', entityType: 'student', csvContent: 'email,phone\nstud@test.in,9876543210' },
    });
    batchId = res.json().id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies institution B from accessing institution A batch status and error reports', async () => {
    const resStatus = await app.inject({
      method: 'GET',
      url: `/bulk/batches/${batchId}`,
      headers: institutionB,
    });
    expect(resStatus.statusCode).toBe(404);

    const resReport = await app.inject({
      method: 'GET',
      url: `/bulk/batches/${batchId}/error-report`,
      headers: institutionB,
    });
    expect(resReport.statusCode).toBe(404);
  });

  it('restricts intermediaries to students and msme_admin to employers', async () => {
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: institutionA,
      payload: { source: 'College A', entityType: 'employer', csvContent: 'email\nemp@test.in' },
    });
    expect(invalidRes.statusCode).toBe(403);

    const validMsmeRes = await app.inject({
      method: 'POST',
      url: '/bulk/batches',
      headers: msmeAdmin,
      payload: { source: 'DIC Indore', entityType: 'employer', csvContent: 'email\nemp@test.in' },
    });
    expect(validMsmeRes.statusCode).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/api/test/bulk-ownership.e2e-spec.ts`  
Expected: FAIL (cross-tenant access permitted or entity restriction missing).

- [ ] **Step 3: Implement Tenant Isolation and Drop QStash in `apps/api/src/bulk/bulk.service.ts`**

In `apps/api/src/bulk/bulk.service.ts`:
1. Add actor parameter and ownership assertion:
```typescript
private assertOwner(createdBy: string | null | undefined, actor?: AuthenticatedUser): void {
  this.requireImporter(actor);
  if (actor!.role !== 'admin' && (!createdBy || createdBy !== actor!.id)) {
    throw new NotFoundException('BULK_NOT_FOUND');
  }
}
```
2. In `getSignedUploadUrl`:
```typescript
const storagePath = `bulk-imports/${actor!.id}/${randomUUID()}_${safeName}`;
```
3. In `scheduleInviteWave`:
**Drop QStash duplicate invocation!**
```typescript
// BullMQ is the single source of truth for wave dispatch
await this.queueService.publishInviteWaveJob({
  waveId,
  batchId: input.batchId,
  waveSize: input.waveSize,
  costPerSmsInr: input.costPerSmsInr,
});
```
Delete `this.qstashService.publishTask` from `scheduleInviteWave`.

In `apps/api/src/bulk/bulk.controller.ts`:
- Pass `@CurrentUser() user: AuthenticatedUser` to all `bulkService` methods.
- Role annotations: `@Roles('admin', 'intermediary', 'msme_admin')` on batch endpoints; `@Roles('admin', 'intermediary')` on invite preview and schedule.

In `apps/api/src/auth/guards/jwt-auth.guard.ts`:
- Export `export const TEST_AUTH_GUARD = Symbol('TEST_AUTH_GUARD');` and inject `@Optional() @Inject(TEST_AUTH_GUARD) private readonly testAuthGuard?: CanActivate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/api/test/bulk-ownership.e2e-spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bulk/bulk.service.ts apps/api/src/bulk/bulk.controller.ts apps/api/src/auth/guards/jwt-auth.guard.ts apps/api/test/bulk-ownership.e2e-spec.ts
git commit -m "feat(api): BULK-01 BULK-03 enforce tenant isolation and drop duplicate QStash scheduling"
```

---

### Task 6: Web UI Pages & Route Handlers (`apps/web`)

**Files:**
- Modify: `apps/web/src/app/company/bulk-onboard/page.tsx:1-400`
- Modify: `apps/web/src/components/workspaces/institution/csvParser.ts:1-70`
- Modify: `apps/web/src/app/api/bulk/batches/route.ts:1-80`
- Modify: `apps/web/src/app/api/bulk/signed-url/route.ts:1-60`
- Test: `apps/web/test/bulk-onboard.spec.ts`

**Interfaces:**
- Consumes: Next.js Session cookie, API `/bulk/*`
- Produces: Employer bulk onboarding page with contact-only CSV instructions, institution CSV parser supporting email or phone, authenticated route handlers

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/test/bulk-onboard.spec.ts
import { describe, it, expect } from 'vitest';
import { parseCsvContent } from '../src/components/workspaces/institution/csvParser';

describe('Web CSV Parser (Contact-Only Support)', () => {
  it('accepts rows with email only or phone only', () => {
    const csv = 'student_name,email,phone\nAlice,alice@college.edu,\nBob,,9876543210';
    const { rows, error } = parseCsvContent(csv);
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.errors).toHaveLength(0);
    expect(rows[1]?.errors).toHaveLength(0);
  });

  it('flags rows with neither valid email nor valid phone', () => {
    const csv = 'student_name,email,phone\nCharlie,invalid-email,12345';
    const { rows } = parseCsvContent(csv);
    expect(rows[0]?.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/test/bulk-onboard.spec.ts`  
Expected: FAIL (missing roll number error or strict phone requirement).

- [ ] **Step 3: Update `apps/web/src/components/workspaces/institution/csvParser.ts` and `apps/web/src/app/company/bulk-onboard/page.tsx`**

In `csvParser.ts`:
- Check for `normalizeEmail` or `normalizeIndianPhone`.
- Mark row valid if either email OR valid Indian phone is present.
- Download template with simplified columns: `email,phone,name`.

In `apps/web/src/app/company/bulk-onboard/page.tsx`:
- Update sample CSV and instructions:
```csv
email,phone,company_name
contact@shreetextiles.in,9876543210,Shree Ganesh Textiles
admin@malwaagro.com,,Malwa Agro Processing
,9876543212,Mahakal Auto Components
```
- Clarify in the UI helper that either an email address or 10-digit Indian mobile number is required to register each enterprise, and registered contacts will receive an onboarding invitation email/link.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/test/bulk-onboard.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspaces/institution/csvParser.ts apps/web/src/app/company/bulk-onboard/page.tsx apps/web/test/bulk-onboard.spec.ts
git commit -m "feat(web): BULK-02 support contact-only CSV in employer and institution onboarding"
```

---

### Task 7: Comprehensive Verification & Pre-Commit Verification Gate

**Files:**
- Test: All suites across packages

**Interfaces:**
- Consumes: Entire workspace
- Produces: 100% green test passes, zero TypeScript errors, zero ESLint errors

- [ ] **Step 1: Run all unit and e2e test suites**

```bash
pnpm test packages/validation/test/csv.test.ts packages/validation/test/bulk.test.ts apps/worker/test/invite-isolation.spec.ts apps/worker/test/import-contacts.spec.ts apps/worker/test/processors.spec.ts apps/api/test/bulk-ownership.e2e-spec.ts apps/web/test/bulk-onboard.spec.ts
```
Expected: All tests pass with zero failures.

- [ ] **Step 2: Run mandatory TypeScript typecheck across all packages**

```bash
pnpm typecheck
```
Expected: Exit code 0, zero errors across `packages/database`, `packages/validation`, `packages/ui`, `apps/api`, `apps/web`, `apps/worker`.

- [ ] **Step 3: Run ESLint across workspace**

```bash
pnpm lint
```
Expected: Zero errors.

- [ ] **Step 4: Final commit and verify clean git status**

```bash
git status
```
Expected: Clean working tree ready to push.
