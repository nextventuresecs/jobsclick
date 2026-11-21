# Core Features & Infrastructure Production Readiness Audit (Requirement R3: P0-6, P0-7, P0-9)

**Project:** Jobsclick (Indian Job Portal Platform)  
**Document Reference:** `docs/audits/02-core-features-infrastructure.md`  
**Specification Authority:** `docs/PRD.md` (v1.3/v1.4), `docs/decisions/001-client-decisions.md`, `AGENTS.md`  
**Audit Date:** November 3, 2026  
**Auditor:** Principal Systems Auditor & Staff Infrastructure Architect (Worker M2)  
**Audit Scope:** Backend API (`apps/api`), Background Worker (`apps/worker`), Database Layer (`packages/database`), Validation (`packages/validation`), Frontend Fallbacks (`apps/web`)  
**Integrity Mode:** Production Readiness Inspection (Local Mock / Offline Verification)

---

## 1. Executive Summary

A comprehensive, line-by-line architectural and operational audit was executed across the backend API, distributed background worker subsystem, PostgreSQL database migrations, and client-side failure boundaries. The audit focused strictly on **Requirement R3** of the Production Readiness Evaluation:
1. **SMS & Invites (P0-6):** Candidate bulk SMS invitation pipeline, background worker loops, BullMQ vs. QStash queue orchestration, candidate status transitions, and MSG91 provider client hooks.
2. **Sponsorships & Credit Ledger (P0-7):** Institutional sponsorship activation, credit and balance deduction atomicity, Time-of-Check to Time-of-Use (TOCTOU) race conditions, SQL UUID type casting in PostgreSQL RPCs, multi-container in-memory lock bypasses, contract expiration enforcement, payment refund reconciliation, and Hard Invariant #7 compliance.
3. **Fake Data Stores (P0-9):** In-memory repositories, synchronous local JSON file writes (`.scratch/db-persistence.json`), in-memory DPDP privacy deletion requests, and frontend optimistic UI masking that conceals backend failures.

### Audit Verdict: **NOT PRODUCTION READY (Launch Blocking)**

The backend and worker architecture exhibits severe production-blocking defects. Most critically:
- **Candidate Bulk Invitation is Simulated:** The worker processes candidate batches by extracting only 1 candidate per 250-candidate chunk and advancing `sentCount` by 250, resulting in 99.6% of candidates never receiving SMS invitations. Furthermore, candidate records in PostgreSQL are never updated upon dispatch, causing subsequent waves to starve unprocessed candidates.
- **Broken Endpoints & Fatal SQL Crashes:** The `POST /wallet/feature-job` endpoint invokes a database RPC with a hardcoded string `'generic_deduction'` for a parameter strongly typed as `UUID`, causing immediate PostgreSQL fatal syntax errors (22P02) in production.
- **Perpetual Free Application Leakage:** Once a candidate is flagged as sponsored by an educational institution, the application deduction stored procedure grants free job applications indefinitely, never checking if the institution's 1-year annual contract has lapsed.
- **Severe Regulatory Exposure under DPDP Act:** Statutory data erasure requests submitted under India's Digital Personal Data Protection (DPDP) Act are pushed into a volatile in-memory JavaScript array (`this.privacyRequests`), permanently vanishing upon pod restart.
- **Split-Brain & RLS Bypass via Fake Stores:** Repositories throughout `apps/api` and `apps/worker` fall back to a local JSON file (`.scratch/db-persistence.json`) in non-production environments, bypassing Supabase Row Level Security (RLS) and causing severe split-brain states in containerized environments. Frontend modals silently catch backend HTTP errors and display false "Success!" alerts to end users.

---

## 2. Audit Evaluation Matrix

Each evaluated component has been assigned a definitive status:
- **`Confirmed Bug`**: Verifiable code defect, race condition, data loss vector, or unhandled runtime failure.
- **`Incomplete Feature`**: Functionality that is partially implemented or missing architectural capabilities required for production scale.
- **`Mitigated / Not an Issue`**: Potential concern investigated and verified to be properly guarded, designed, or mitigated.

| ID | Focus Area | Component & File Path | Lines | Definitive Status | Summary of Core Finding |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R3-01** | SMS & Invites (P0-6) | Batch SMS Worker Loop<br>`apps/worker/src/processors/invite.processor.ts` | 79–129 | **Confirmed Bug** | Loops in steps of 250, dispatches SMS to ONLY 1 sample user per chunk, skips remaining 249 candidates, increments `sentCount` by 250, and never updates candidate status in DB. |
| **R3-02** | SMS & Invites (P0-6) | QStash Webhook Mock Loop<br>`apps/api/src/bulk/bulk.service.ts` | 561–615 | **Confirmed Bug** | Webhook `/webhooks/qstash/send-invite-wave` performs zero SMS dispatches and blindly marks `invite_waves` as `completed` with full `sent_count`. |
| **R3-03** | SMS & Invites (P0-6) | Dual Queue Scheduling Race<br>`apps/api/src/bulk/bulk.service.ts` | 509–523 | **Confirmed Bug** | `scheduleInviteWave` simultaneously schedules both QStash HTTP webhook and BullMQ Redis queue, leading to concurrent race conditions and inconsistent status mutations. |
| **R3-04** | SMS & Invites (P0-6) | MSG91 Single-Recipient Client<br>`apps/worker/src/sms/sms.service.ts` | 63–82 | **Incomplete Feature** | Worker MSG91 client passes a single mobile number per HTTP request, lacking batch array integration for high-throughput dispatches. |
| **R3-05** | SMS & Invites (P0-6) | BullMQ Redis Mock Fallback<br>`apps/worker/src/main.ts`<br>`apps/api/src/config/env.ts` | 57–74<br>234–236 | **Mitigated / Not an Issue** | Redis mock fallback (`ioredis-mock`) is strictly disallowed and rejected at process startup when `NODE_ENV === 'production'`. |
| **R3-06** | Sponsorships (P0-7) | TOCTOU Balance Deduction Race<br>`apps/api/src/wallet/wallet.service.ts` | 204–231 | **Confirmed Bug** | `deductForFeaturedPromotion` executes non-atomic read-then-write balance check without database locks, enabling concurrent overdrafts. |
| **R3-07** | Sponsorships (P0-7) | Fatal SQL UUID Cast Crash<br>`apps/api/src/database/repositories/credit-ledger.repository.ts` | 304–320 | **Confirmed Bug** | `atomicDeduct` passes string `'generic_deduction'` to PostgreSQL RPC expecting UUID parameter, crashing with fatal error code 22P02. |
| **R3-08** | Sponsorships (P0-7) | Multi-Container Mutex Lock Bypass<br>`apps/api/src/wallet/sponsorship.service.ts`<br>`apps/api/src/database/repositories/profile.repository.ts` | 238–349<br>329–331 | **Confirmed Bug** | `activateSponsorship` uses in-memory Node `withLock` rather than database row locks, completely bypassed across multiple container instances. |
| **R3-09** | Sponsorships (P0-7) | Permanent Free Application Leak<br>`20261026100000_atomic_application_deduction_procedure.sql` | 24–42 | **Confirmed Bug** | Job application stored procedure checks only `is_sponsored = TRUE` without verifying if sponsoring institution's contract has expired (`sponsorship_expires_at < NOW()`). |
| **R3-10** | Sponsorships (P0-7) | Refund Overdraft & Sponsorship Orphan<br>`apps/api/src/wallet/payment.service.ts` | 476–530 | **Confirmed Bug** | Payment refunds debit credits even if already spent (dropping balance < 0), and never revoke active institution sponsorships. |
| **R3-11** | Sponsorships (P0-7) | Ledger-Derived Balance Architecture<br>`20261017000000_credit_ledgers_and_rls.sql` | 12–32 | **Mitigated / Not an Issue** | Fully complies with Hard Invariant #7: database triggers prohibit UPDATE and DELETE; balance is dynamically derived via `COALESCE(SUM(amount), 0)`. |
| **R3-12** | Fake Stores (P0-9) | PersistentDatabaseStore Disk Writes<br>`apps/api/src/database/supabase.provider.ts` | 29–209 | **Confirmed Bug** | Local JSON store (`.scratch/db-persistence.json`) used by repositories in non-production, bypassing RLS and causing split-brain states across containers. |
| **R3-13** | Fake Stores (P0-9) | Active InMemoryUserRepository<br>`apps/api/src/database/database.module.ts`<br>`apps/api/src/database/repositories/in-memory-user.repository.ts` | 36–41<br>12–247 | **Confirmed Bug** | `InMemoryUserRepository` conditionally injected via `USE_JSON_STORE=1`, bypassing Supabase PostgreSQL and database triggers entirely. |
| **R3-14** | Fake Stores (P0-9) | In-Memory DPDP Deletion Requests<br>`apps/api/src/admin/admin.service.ts` | 51–52<br>269–308 | **Confirmed Bug** | Statutory DPDP account deletion requests and user notifications stored in volatile JavaScript arrays/Maps, lost on container restart. |
| **R3-15** | Fake Stores (P0-9) | In-Memory Bulk Import Batch Maps<br>`apps/api/src/bulk/bulk.service.ts` | 80–81 | **Confirmed Bug** | Bulk import batches and invite waves stored in JavaScript `Map` structures during test/dev modes, bypassing DB validation and RLS. |
| **R3-16** | Fake Stores (P0-9) | Worker Alerts Local JSON Fallback<br>`apps/worker/src/processors/alerts.processor.ts` | 35–55 | **Confirmed Bug** | Alerts processor reads/writes `.scratch/db-persistence.json` and static in-memory sets, losing state on worker restart. |
| **R3-17** | Fake Stores (P0-9) | Frontend Optimistic UI Masking<br>`apps/web/src/components/jobs/SaveSearchAlertModal.tsx`<br>`apps/web/src/components/workspaces/admin/MsmeBroadcastConsole.tsx` | 52–76<br>206–214 | **Confirmed Bug** | On backend request failure (`!res.ok`), UI writes to `localStorage` or generates fake IDs and displays fake green "Success!" alert to user. |

---

## 3. Detailed Technical Audit Findings

---

### Focus Area 1: SMS & Candidate Invitations (P0-6)

#### Item 1.1: Simulated Candidate Batch SMS Invitation Loop in Background Worker
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/worker/src/processors/invite.processor.ts`, lines 79–129
- **Verbatim Code Snippet:**
```typescript
79:     let invitedCandidates: Array<{ phone: string; language?: 'en' | 'hi' }> = [];
80:     if (this.supabase) {
81:       try {
82:         const { data: users } = await this.supabase
83:           .from('users')
84:           .select('phone, language')
85:           .eq('status', 'invited')
86:           .limit(waveSize);
87:         if (users && users.length > 0) {
88:           invitedCandidates = users.map((u) => ({
89:             phone: u.phone,
90:             language: (u.language as 'en' | 'hi') || 'en',
91:           }));
92:         }
93:       } catch {
94:         // Fallback
95:       }
96:     }
97: 
98:     // Process SMS dispatch in sub-batches of 250 with MSG91 live/sandbox/mock handling
99:     const chunkSize = 250;
100:    let failedCount = 0;
101:    let sentCount = 0;
102:    const iterations = Math.ceil(waveSize / chunkSize);
103: 
104:    for (let i = 0; i < iterations; i++) {
105:      const currentBatchCount = Math.min(chunkSize, waveSize - sentCount);
106:      const sampleCandidate = invitedCandidates[sentCount] || {
107:        phone: '9876543210',
108:        language: 'en' as const,
109:      };
110: 
111:      const smsResult = await this.smsService.sendInviteSms({
112:        phone: sampleCandidate.phone,
113:        language: sampleCandidate.language,
114:      });
115: 
116:      if (smsResult.success) {
117:        sentCount += currentBatchCount;
118:      } else {
119:        failedCount += currentBatchCount;
120:      }
121: 
122:      if (typeof job.updateProgress === 'function') {
123:        await job.updateProgress({
124:          dispatched: sentCount,
125:          total: waveSize,
126:          percent: Math.round((sentCount / waveSize) * 100),
127:        });
128:      }
129:    }
```
- **Root Cause Explanation:**  
  1. **Candidate Skipping:** The loop divides `waveSize` by `chunkSize` (250). Inside each iteration `i`, it extracts exactly **ONE** candidate (`sampleCandidate = invitedCandidates[sentCount]`) and performs a single SMS dispatch (`this.smsService.sendInviteSms`). If that single SMS succeeds, line 117 executes `sentCount += currentBatchCount`, jumping `sentCount` forward by up to 250! The remaining 249 candidates in that chunk are completely skipped and never contacted.
  2. **Unfiltered & Starved Candidates:** The query at line 85 uses `.select('phone, language').eq('status', 'invited').limit(waveSize)`. It does not filter by `batch_id` or `source`. It indiscriminately grabs the first `waveSize` rows ordered by PostgreSQL physical storage.
  3. **Missing State Mutation:** At no point are candidate records in `users` updated to record that an invitation was sent (`invited_at` or `status = 'invite_sent'`). Consequently, every subsequent wave queries the exact same first N candidates over and over again, repeatedly messaging them while leaving later imported users completely starved of invites.
- **Real-World User & Business Impact:**  
  In a real bulk import of 10,000 candidates:
  - Total iterations = 40.
  - Exactly 40 SMS messages are sent.
  - 9,960 candidates (99.6%) are never notified.
  - The organization or government department is billed ₹2,000 (10,000 × ₹0.20/SMS), but only ₹8 worth of SMS are delivered.
  - Candidate onboarding rate drops to 0%, destroying the core value proposition of bulk MSME/government hiring drives.
- **Specific Remediation Recommendation:**  
  1. Refactor `invite.processor.ts` to iterate through every candidate in `invitedCandidates`.
  2. Implement controlled concurrency (e.g. `p-limit(10)` or sub-chunking of 50 recipients).
  3. Update candidate rows in `users` upon dispatch:
     ```typescript
     await this.supabase
       .from('users')
       .update({ status: 'invite_sent', invited_at: new Date().toISOString() })
       .in('phone', chunkPhones);
     ```
  4. Scope candidate selection by `batch_id` using a dedicated foreign key or `users.source`.

---

#### Item 1.2: Simulated Mock Loop in QStash Webhook Handler
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/bulk/bulk.service.ts`, lines 561–615
- **Verbatim Code Snippet:**
```typescript
561: async executeInviteWaveJob(waveId: string): Promise<InviteWaveRecord> {
...
588:   const { data: wave, error } = await this.supabase
589:     .from('invite_waves')
590:     .select('*')
591:     .eq('id', waveId)
592:     .single();
593: 
594:   if (error || !wave) {
595:     throw new NotFoundException('Invite wave not found');
596:   }
597: 
598:   if (wave.status === 'completed' || wave.status === 'queued') {
599:     console.log(`[QStash Webhook] Wave ${waveId} is completed or paused (status: ${wave.status}). Skipping execution.`);
600:     return this.toWaveRecord(wave);
601:   }
602: 
603:   await this.supabase
604:     .from('invite_waves')
605:     .update({ status: 'completed' as TaskStatus, sent_count: wave.wave_size, completed_at: new Date().toISOString() })
606:     .eq('id', waveId);
607: 
608:   const { data: updated } = await this.supabase
609:     .from('invite_waves')
610:     .select('*')
611:     .eq('id', waveId)
612:     .single();
613: 
614:   return this.toWaveRecord(updated || wave);
615: }
```
- **Root Cause Explanation:**  
  When an invite wave is scheduled, `BulkService.scheduleInviteWave` registers a QStash webhook task targeting `/webhooks/qstash/send-invite-wave`. When QStash invokes `executeInviteWaveJob`, the method does not query candidates, does not instantiate `SmsService`, and dispatches zero SMS messages. Instead, it immediately issues an SQL `UPDATE` setting `status = 'completed'` and `sent_count = wave.wave_size`.
- **Real-World User & Business Impact:**  
  If the platform runs in a serverless environment or if QStash is relied upon for invite delivery, 100% of candidate invitations fail to deliver, while the administrative dashboard displays a green "Completed" status with 100% successful delivery metrics.
- **Specific Remediation Recommendation:**  
  Eradicate the mock completion logic in `executeInviteWaveJob`. Either have the QStash webhook trigger BullMQ queue dispatch, or inject `SmsService` and execute real, throttled batch delivery with database updates.

---

#### Item 1.3: Dual Queue Scheduling Race Condition (BullMQ + QStash)
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/bulk/bulk.service.ts`, lines 509–523
- **Verbatim Code Snippet:**
```typescript
509:     const qstashResult = await this.qstashService.publishTask({
510:       url: `${apiUrl}/webhooks/qstash/send-invite-wave`,
511:       body: { waveId },
512:       delaySeconds,
513:       deduplicationId: `wave_${waveId}`,
514:     });
515: 
516:     // Publish to BullMQ invite-wave queue (Ticket T-07)
517:     await this.queueService.publishInviteWaveJob({
518:       waveId,
519:       batchId: input.batchId,
520:       waveSize: input.waveSize,
521:       costPerSmsInr: input.costPerSmsInr,
522:     });
```
- **Root Cause Explanation:**  
  `scheduleInviteWave` schedules two separate asynchronous delivery pipelines for the exact same `waveId`:
  1. An external QStash webhook targeting the API server (`/webhooks/qstash/send-invite-wave`).
  2. A local BullMQ Redis queue job targeting `apps/worker` (`invite-wave`).  
  Both consumers execute concurrently against the same database record:
  - If QStash executes first, it immediately marks the wave `completed`. When BullMQ picks up the job, line 55 of `invite.processor.ts` checks only `currentWave.status === 'paused' || currentWave.status === 'queued'`, so BullMQ continues executing on an already "completed" wave record.
  - If BullMQ updates `sent_count` while QStash completes, QStash overwrites `sent_count` with `wave.wave_size`.
- **Real-World User & Business Impact:**  
  Race conditions create erratic metrics, duplicate customer billing events, conflicting audit logs, and unpredictable database state.
- **Specific Remediation Recommendation:**  
  Enforce a single authoritative queue architecture. Per `AGENTS.md` ("Monorepo: apps/worker plain Node + BullMQ"), BullMQ is the designated queue system. Remove the QStash webhook dispatch for wave execution, reserving QStash solely for external cron triggers if necessary.

---

#### Item 1.4: Single-Recipient MSG91 Flow Client
- **Definitive Status:** `Incomplete Feature`
- **Location:** `apps/worker/src/sms/sms.service.ts`, lines 63–82
- **Verbatim Code Snippet:**
```typescript
63:     try {
64:       const msg91Url = new URL('https://control.msg91.com/api/v5/flow');
65:       const response = await fetch(msg91Url.toString(), {
66:         method: 'POST',
67:         headers: {
68:           'Content-Type': 'application/json',
69:           authkey: authKey,
70:         },
71:         body: JSON.stringify({
72:           template_id: templateId,
73:           sender: 'JOBSCK',
74:           short_url: '0',
75:           recipients: [
76:             {
77:               mobiles: `91${phone}`,
78:               url: inviteUrl,
79:             },
80:           ],
81:         }),
82:       });
```
- **Root Cause Explanation:**  
  `WorkerSmsService.sendInviteSms` only accepts a single recipient (`{ phone, language }`). The MSG91 Flow API is designed to receive arrays of up to 1,000 recipients in a single HTTP request body. By issuing an individual HTTP POST request per candidate, sending a wave of 10,000 candidates requires 10,000 sequential HTTPS roundtrips.
- **Real-World User & Business Impact:**  
  Under realistic network latencies (150ms per HTTPS POST to MSG91), dispatching 10,000 SMS messages takes ~25 minutes, risking socket timeouts, Node.js connection pool starvation, and BullMQ worker lock timeouts.
- **Specific Remediation Recommendation:**  
  Add a bulk dispatch method `sendBatchInviteSms(recipients: Array<{ phone: string; url: string }>)` to `WorkerSmsService` that chunks candidates into batches of 250–500 recipients per single MSG91 HTTP request.

---

#### Item 1.5: BullMQ Redis Mock Fallback Guardrails
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/worker/src/main.ts`, lines 57–74; `apps/api/src/config/env.ts`, lines 234–236
- **Verbatim Code Snippet:**
```typescript
// apps/api/src/config/env.ts:
234:     if (rawSource['USE_MOCK_REDIS']) {
235:       errors.push('USE_MOCK_REDIS must not be set in production/staging');
236:     }

// apps/worker/src/main.ts:
57: export function getRedisConnection(env: EnvConfig): IORedis {
58:   if (env.USE_MOCK_REDIS === 'true' || env.NODE_ENV === 'test') {
59:     return new IORedisMock() as unknown as IORedis;
60:   }
61: 
62:   const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
63:   const isTls = redisUrl.startsWith('rediss://');
64: 
65:   return new IORedis(redisUrl, { ... });
```
- **Verification Analysis:**  
  While `apps/worker` imports `ioredis-mock` for testing, `apps/api/src/config/env.ts` explicitly checks `rawSource['USE_MOCK_REDIS']` during boot and raises a fatal configuration exception if set in production or staging. In production, real Upstash/Redis connections via `REDIS_URL` are enforced. This item is fully mitigated.

---

### Focus Area 2: Sponsorships & Credit Ledger Engine (P0-7)

#### Item 2.1: TOCTOU Concurrency Race in Credit Promotion
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/wallet/wallet.service.ts`, lines 204–231
- **Verbatim Code Snippet:**
```typescript
204:   async deductForFeaturedPromotion(
205:     employerId: string,
206:     jobId: string,
207:     durationDays: 7 | 14 | 30,
208:     cost: number,
209:   ): Promise<{ success: boolean; cost: number; remainingBalance: number }> {
210:     const { balance } = await this.getBalance(employerId);
211:     if (balance < cost) {
212:       throw new BadRequestException({
213:         statusCode: 400,
214:         code: 'INSUFFICIENT_CREDITS',
215:         message: `Insufficient credits. Featuring this job for ${durationDays} days requires ${cost} credits, but current balance is ${balance}.`,
216:       });
217:     }
218: 
219:     await this.recordTransaction({
220:       userId: employerId,
221:       amount: -cost,
222:       reason: `Featured job promotion: ${jobId} (${durationDays} days)`,
223:       actorId: employerId,
224:     });
225: 
226:     return {
227:       success: true,
228:       cost,
229:       remainingBalance: balance - cost,
230:     };
231:   }
```
- **Root Cause Explanation:**  
  `WalletService.deductForFeaturedPromotion` performs an unlocked read (`this.getBalance(employerId)` at line 210) followed by a separate write (`this.recordTransaction` at line 219). There is no PostgreSQL row lock (`SELECT ... FOR UPDATE`) or transaction advisory lock (`pg_advisory_xact_lock`).
- **Real-World User & Business Impact:**  
  If an employer has 10 credits remaining and issues two concurrent requests to feature two jobs (each costing 10 credits), both requests read `balance = 10` before either transaction is recorded. Both requests succeed, inserting two `-10` debit records into `credit_ledgers`. The employer's balance drops to `-10`, violating the zero-overdraft invariant and allowing employers to obtain free featured job listings.
- **Specific Remediation Recommendation:**  
  Deprecate `deductForFeaturedPromotion`. Route all job promotion deductions through `JobRepository.promoteJobAtomically`, which invokes the PostgreSQL procedure `promote_job_with_ledger` (protected by transaction-scoped advisory locks).

---

#### Item 2.2: Fatal PostgreSQL UUID Cast Failure in Job Promotion Endpoint
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/database/repositories/credit-ledger.repository.ts`, lines 304–320; `apps/api/src/wallet/wallet.service.ts`, lines 162–182
- **Verbatim Code Snippet:**
```typescript
// apps/api/src/database/repositories/credit-ledger.repository.ts:
304:     if (!this.isTestMode) {
305:       try {
306:         const { data, error } = await (this.supabase.rpc as unknown as (
307:           fn: string,
308:           args: Record<string, unknown>,
309:         ) => Promise<{ data: unknown; error: { message: string } | null }>)(
310:           'deduct_application_credit_with_ledger',
311:           {
312:             p_applicant_id: userId,
313:             p_job_id: 'generic_deduction',
314:             p_job_title: reason,
315:             p_cost: amountToDeduct,
316:           },
317:         );

// packages/database/supabase/migrations/20261026100000_atomic_application_deduction_procedure.sql:
5: CREATE OR REPLACE FUNCTION deduct_application_credit_with_ledger(
6:     p_applicant_id UUID,
7:     p_job_id UUID,
8:     p_job_title TEXT,
9:     p_cost INT DEFAULT 1
10: ) RETURNS JSONB
```
- **Root Cause Explanation:**  
  1. `WalletController.featureJob` (`POST /wallet/feature-job`) invokes `walletService.featureJob`, which delegates to `creditLedgerRepository.atomicDeduct`.
  2. In production (`!this.isTestMode`), `atomicDeduct` calls PostgreSQL RPC `deduct_application_credit_with_ledger`, passing the string literal `'generic_deduction'` as `p_job_id`.
  3. In migration `20261026100000_atomic_application_deduction_procedure.sql` (line 7), `p_job_id` is defined as PostgreSQL type `UUID`.
  4. PostgreSQL throws an immediate fatal SQL error: `invalid input syntax for type uuid: "generic_deduction"` (error code `22P02`).
  5. Furthermore, `deduct_application_credit_with_ledger` is intended for candidate job applications—it never updates `jobs.is_featured` or sets `jobs.featured_until`.
- **Real-World User & Business Impact:**  
  Any employer attempting to feature a job via `POST /wallet/feature-job` in production encounters an immediate HTTP 500 error. The feature is completely broken in production.
- **Specific Remediation Recommendation:**  
  Delete or deprecate `POST /wallet/feature-job` and `atomicDeduct`. Require employers to use `POST /jobs/:id/promote`, which properly uses `JobRepository.promoteJobAtomically` and executes `promote_job_with_ledger`.

---

#### Item 2.3: In-Memory Mutex Lock Bypass Across Multi-Container Deployments in Institution Sponsorship
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/wallet/sponsorship.service.ts`, lines 238–349; `apps/api/src/database/repositories/profile.repository.ts`, lines 329–331
- **Verbatim Code Snippet:**
```typescript
// apps/api/src/wallet/sponsorship.service.ts:
238:     // 4. Atomic transaction / serialization lock on institution row (SELECT ... FOR UPDATE equivalent)
239:     return this.profileRepository.withLock(institutionId, async () => {
240:       // Re-read institution state within the transaction lock
241:       let lockedInst: InstitutionProfileRow | null =
242:         await this.profileRepository.findInstitutionProfileById(institutionId);
...
302:       const countById = await this.profileRepository.updateStudentSponsorshipByInstitution(
303:         institution.id,
304:         true,
305:       );
...
337:       await this.profileRepository.saveSponsorship(sponsorshipRecord);
...
348:       await this.profileRepository.saveInstitutionProfile(institution);
349:     });

// apps/api/src/database/repositories/profile.repository.ts:
329:   async withLock<T>(institutionId: string, fn: () => Promise<T>): Promise<T> {
330:     return this.persistentStore.withLock(institutionId, fn);
331:   }
```
- **Root Cause Explanation:**  
  1. `SponsorshipService.activateSponsorship` attempts to prevent concurrent duplicate activations by wrapping operations in `profileRepository.withLock(institutionId, ...)`.
  2. `ProfileRepository.withLock` delegates to `PersistentDatabaseStore.getInstance().withLock`, which is a local Node.js in-process `Map<string, Promise<unknown>>`.
  3. In a multi-container deployment (e.g. Railway, Docker Swarm, or Kubernetes pods), two concurrent activation requests landing on separate pods run simultaneously without serialization.
  4. Furthermore, lines 302–348 execute three sequential HTTP REST calls to Supabase (`updateStudentSponsorshipByInstitution`, `saveSponsorship`, `saveInstitutionProfile`) with zero ACID transactional boundaries.
- **Real-World User & Business Impact:**  
  Under concurrent requests or network interruptions:
  - Institutions can be double-charged for annual student sponsorships.
  - Partial network failures leave student profiles sponsored (`is_sponsored = true`) while the institution profile update fails, corrupting accounting and reporting records.
- **Specific Remediation Recommendation:**  
  Implement a PostgreSQL stored procedure `activate_institution_sponsorship` with `pg_advisory_xact_lock(hashtext('institution_' || p_institution_id::text))` that updates `institution_profiles`, inserts `institution_sponsorships`, and updates `job_seeker_profiles` in a single atomic transaction.

---

#### Item 2.4: Permanent Free Application Leak Due to Missing Sponsorship Expiry Checks
- **Definitive Status:** `Confirmed Bug`
- **Location:** `packages/database/supabase/migrations/20261026100000_atomic_application_deduction_procedure.sql`, lines 24–42; `apps/api/src/wallet/wallet.service.ts`, lines 116–131
- **Verbatim Code Snippet:**
```sql
24:     -- 2. Check if applicant is a sponsored candidate enrolled in an institution (WAL-05)
25:     SELECT COALESCE(is_sponsored, FALSE) INTO v_is_sponsored
26:     FROM job_seeker_profiles
27:     WHERE user_id = p_applicant_id;
28: 
29:     -- Calculate current dynamic balance from immutable ledger entries (Hard Invariant #7)
30:     SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
31:     FROM credit_ledgers
32:     WHERE user_id = p_applicant_id;
33: 
34:     -- Sponsored candidates apply freely without consuming personal credits
35:     IF v_is_sponsored IS TRUE THEN
36:         RETURN jsonb_build_object(
37:             'success', TRUE,
38:             'cost', 0,
39:             'remaining_balance', v_current_balance,
40:             'is_sponsored', TRUE
41:         );
42:     END IF;
```
- **Root Cause Explanation:**  
  When an educational institution sponsors candidates, `job_seeker_profiles.is_sponsored` is set to `TRUE`. During job application credit deduction, both PostgreSQL procedure `deduct_application_credit_with_ledger` (lines 25–42) and `WalletService.deductForJobApplication` (lines 118–131) check only `is_sponsored = TRUE`.  
  Neither check validates whether the sponsoring institution's contract has expired (`institution_profiles.sponsorship_expires_at < NOW()`). Furthermore, no background worker or cron task exists to reset `is_sponsored` when the 365-day period ends.
- **Real-World User & Business Impact:**  
  Once an institution sponsors a batch of students, those candidates receive free, unlimited job applications forever. The institution has zero incentive to renew their sponsorship in subsequent years, causing massive revenue leakage.
- **Specific Remediation Recommendation:**  
  1. Modify `deduct_application_credit_with_ledger` to verify that the linked institution's sponsorship is active and valid:
     ```sql
     SELECT COALESCE(jsp.is_sponsored, FALSE) AND COALESCE(ip.is_sponsorship_active, FALSE) AND (ip.sponsorship_expires_at > NOW())
     INTO v_is_active_sponsored
     FROM job_seeker_profiles jsp
     LEFT JOIN institution_profiles ip ON ip.id = jsp.institution_id OR ip.institution_name = jsp.institution_name
     WHERE jsp.user_id = p_applicant_id;
     ```
  2. Add a daily scheduled job to `apps/worker` that identifies expired sponsorships and updates `job_seeker_profiles.is_sponsored = FALSE`.

---

#### Item 2.5: Refund Reconciliation Overdraft and Sponsorship Orphan
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/wallet/payment.service.ts`, lines 500–510
- **Verbatim Code Snippet:**
```typescript
500:       // Deduct corresponding credits from ledger if they were granted
501:       const creditsToDeduct = payment.credits_added || 0;
502:       if (creditsToDeduct > 0 && payment.status === 'captured') {
503:         await this.walletService.recordTransaction({
504:           userId: payment.user_id,
505:           amount: -creditsToDeduct,
506:           reason: `Reversal: Refund for payment ${paymentId}`,
507:           actorId: 'system',
508:         });
509:       }
```
- **Root Cause Explanation:**  
  1. In `PaymentService.handlePaymentRefunded`, when Razorpay notifies of a refund, the system appends a negative transaction (`-creditsToDeduct`) to the ledger. If the employer has already spent the credits (e.g. on candidate contact unlocks), their derived balance drops below zero (e.g. -50 credits), with no lock or administrative flag placed on the account.
  2. If the refunded payment was for an **institution annual sponsorship** (`payment.type === 'institution_sponsorship'`), `credits_added` is 0. The method executes no logic to deactivate `institution_profiles.is_sponsorship_active` or reset student `is_sponsored` flags.
- **Real-World User & Business Impact:**  
  Institutions can purchase an annual sponsorship, immediately request a payment chargeback/refund via Razorpay or bank dispute, receive a full refund, and retain active sponsorship benefits for hundreds of students indefinitely.
- **Specific Remediation Recommendation:**  
  In `handlePaymentRefunded`:
  - Check if `payment.type === 'institution_sponsorship'` and atomically deactivate the institution profile and student sponsorship flags.
  - If a credit deduction drives an employer's balance negative, flag the account with `wallet_frozen = true` and alert the administrative team for settlement.

---

#### Item 2.6: Ledger-Derived Balance Architecture (Hard Invariant #7)
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `packages/database/supabase/migrations/20261017000000_credit_ledgers_and_rls.sql`, lines 12–32
- **Verbatim Code Snippet:**
```sql
12: CREATE OR REPLACE FUNCTION prevent_credit_ledger_modification()
13: RETURNS TRIGGER
14: LANGUAGE plpgsql
15: SECURITY INVOKER
16: SET search_path = ''
17: AS $$
18: BEGIN
19:     RAISE EXCEPTION 'Credit ledger entries are immutable and cannot be updated or deleted.';
20: END;
21: $$;
22: 
23: DROP TRIGGER IF EXISTS credit_ledger_immutable_update_trigger ON credit_ledgers;
24: CREATE TRIGGER credit_ledger_immutable_update_trigger
25:     BEFORE UPDATE ON credit_ledgers
26:     FOR EACH ROW EXECUTE FUNCTION prevent_credit_ledger_modification();
27: 
28: DROP TRIGGER IF EXISTS credit_ledger_immutable_delete_trigger ON credit_ledgers;
29: CREATE TRIGGER credit_ledger_immutable_delete_trigger
30:     BEFORE DELETE ON credit_ledgers
31:     FOR EACH ROW EXECUTE FUNCTION prevent_credit_ledger_modification();
```
- **Verification Analysis:**  
  Hard Invariant #7 dictates: *"Credit balances derive from ledger only (P2). Never store mutable balance as truth."*  
  PostgreSQL triggers `credit_ledger_immutable_update_trigger` and `credit_ledger_immutable_delete_trigger` strictly prohibit UPDATE and DELETE operations on `credit_ledgers`. User credit balances are calculated on-the-fly via `SUM(amount)`. No mutable column stores credit balance as ground truth. This requirement is fully satisfied.

---

### Focus Area 3: Fake Data Stores & Client Masking (P0-9)

#### Item 3.1: PersistentDatabaseStore and Synchronous Disk I/O Fallback
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/database/supabase.provider.ts`, lines 29–209
- **Verbatim Code Snippet:**
```typescript
29: export class PersistentDatabaseStore {
30:   private static instance: PersistentDatabaseStore;
31:   private filePath: string = '';
32:   private locks: Map<string, Promise<unknown>> = new Map();
33:   private state: DatabasePersistenceState = {
34:     users: {},
35:     job_seeker_profiles: {},
36:     business_profiles: {},
37:     institution_profiles: {},
38:     jobs: {},
39:     applications: {},
40:     audit_logs: {},
41:     credit_ledgers: {},
42:     payments: {},
43:     institution_inquiries: {},
44:     institution_sponsorships: {},
45:     broadcast_campaigns: {},
46:     broadcast_deliveries: {},
47:     job_alerts: {},
48:     alert_deliveries: {},
49:     corporate_tie_ups: {},
50:     placement_applications: {},
51:   };
...
58:     const dir = path.resolve(process.cwd(), '.scratch');
...
66:     this.filePath = path.join(dir, 'db-persistence.json');
67:     this.load();
```
- **Root Cause Explanation:**  
  `PersistentDatabaseStore` implements an in-memory dictionary for 17 database tables and persists state by reading/writing synchronously to `.scratch/db-persistence.json`. Nine core repositories (`JobRepository`, `ApplicationRepository`, `ProfileRepository`, `CreditLedgerRepository`, `PaymentRepository`, `InquiryRepository`, `AuditLogRepository`, `CorporateTieUpRepository`, `PlacementPipelineRepository`) redirect database queries to `PersistentDatabaseStore` when `this.isTestMode` evaluates to true.
- **Real-World User & Business Impact:**  
  1. **Complete RLS Bypass:** In local development, staging, or automated test pipelines without live Supabase cloud credentials, all data operations bypass PostgreSQL Row Level Security (RLS) entirely. RLS policies are never exercised or tested before production deployment.
  2. **Multi-Container Split-Brain:** In containerized deployments (Docker/Railway), `.scratch/` is local to each container instance. Container A and Container B have independent JSON files, causing catastrophic data inconsistency.
  3. **Event Loop Starvation:** Synchronous file operations (`fs.readFileSync`, `fs.writeFileSync`) block the single-threaded Node.js event loop on every write.
  4. **Production Runtime Crashes:** In production (`NODE_ENV === 'production'`), `PersistentDatabaseStore` methods throw fatal runtime errors (`PersistentDatabaseStore write operation on "..." is prohibited in production mode`). If any repository accidentally triggers this fallback, the request crashes with an unhandled exception.
- **Specific Remediation Recommendation:**  
  Completely eradicate `PersistentDatabaseStore` and `.scratch/db-persistence.json`. Repositories must query Supabase PostgreSQL exclusively. Local development and testing should be run against a local Supabase Docker instance (`supabase start`).

---

#### Item 3.2: `InMemoryUserRepository` Bound in Database Module
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/database/database.module.ts`, lines 36–41; `apps/api/src/database/repositories/in-memory-user.repository.ts`, lines 12–247
- **Verbatim Code Snippet:**
```typescript
36:       provide: USER_REPOSITORY,
37:       useFactory: (supabase: SupabaseClient<Database>) => {
38:         if (!isStrictEnv() && process.env['USE_JSON_STORE'] === '1') {
39:           return new InMemoryUserRepository();
40:         }
41:         return new UserRepository(supabase);
42:       },
43:       inject: [SUPABASE_CLIENT],
```
- **Root Cause Explanation:**  
  `DatabaseModule` injects `InMemoryUserRepository` whenever `USE_JSON_STORE === '1'`. `InMemoryUserRepository` implements authentication, role changes, phone queries, and token versioning entirely in memory and synchronizes with `.scratch/db-persistence.json`, bypassing PostgreSQL constraints, triggers, and RLS.
- **Real-World User & Business Impact:**  
  Any environment running with `USE_JSON_STORE=1` maintains user identity, role assignments, and token versions in volatile memory and local files. All security controls, audit logs, and PostgreSQL constraints are completely bypassed.
- **Specific Remediation Recommendation:**  
  Delete `InMemoryUserRepository` and remove the `USE_JSON_STORE` check in `DatabaseModule`. Bind `UserRepository` directly as the sole provider.

---

#### Item 3.3: Volatile In-Memory DPDP Deletion Requests and User Notifications
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/admin/admin.service.ts`, lines 51–52, 269–308
- **Verbatim Code Snippet:**
```typescript
51:   private notifications = new Map<string, NotificationRecord[]>();
52:   private privacyRequests: PrivacyDeletionRequestRecord[] = [];
...
297:   async requestAccountDeletion(userId: string, reason?: string): Promise<PrivacyDeletionRequestRecord> {
298:     const reqRecord: PrivacyDeletionRequestRecord = {
299:       id: `del_req_${Date.now()}`,
300:       userId,
301:       reason: reason || 'User requested account deletion under DPDP principles',
302:       requestedAt: new Date().toISOString(),
303:       status: 'pending_processing',
304:     };
305:     this.privacyRequests.push(reqRecord);
306:     await this.recordAuditLog(userId, 'PRIVACY_DELETION_REQUESTED', { reason });
307:     return reqRecord;
308:   }
```
- **Root Cause Explanation:**  
  `AdminService` stores DPDP statutory account deletion requests (`requestAccountDeletion`) in a plain in-memory array (`this.privacyRequests`) and user notifications in a JavaScript `Map` (`this.notifications`). Neither is stored in PostgreSQL.
- **Real-World User & Business Impact:**  
  **Severe Legal Non-Compliance:** Under India's Digital Personal Data Protection Act (DPDP), users have the statutory right to request erasure of their personal data. Storing erasure requests in an in-memory array means every container redeploy or pod crash completely wipes all pending deletion requests. The organization will fail statutory data erasure compliance audits, exposing the business to heavy regulatory penalties (up to ₹250 crore under DPDP Act provisions).
- **Specific Remediation Recommendation:**  
  Create durable database tables `privacy_deletion_requests` and `user_notifications` in Supabase with append-only audit logging and durable lifecycle state tracking.

---

#### Item 3.4: In-Memory Batch & Wave Maps in BulkService
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/bulk/bulk.service.ts`, lines 80–81, 524–539
- **Verbatim Code Snippet:**
```typescript
80:   private memBatches = new Map<string, BulkBatchRecord>();
81:   private memWaves = new Map<string, InviteWaveRecord>();
...
524:     if (this.isTestMode) {
525:       const record: InviteWaveRecord = {
526:         id: waveId,
527:         batchId: input.batchId,
528:         waveSize: input.waveSize,
529:         costPerSmsInr: input.costPerSmsInr,
530:         totalCostInr: preview.totalCostInr,
531:         status: 'dispatched',
532:         sentCount: 0,
533:         failedCount: 0,
534:         qstashMessageId: qstashResult.messageId,
535:         createdAt: now,
536:       };
537:       this.memWaves.set(waveId, record);
538:       return record;
539:     }
```
- **Root Cause Explanation:**  
  `BulkService` uses in-memory `Map` objects (`memBatches`, `memWaves`) during test/dev modes instead of executing queries against PostgreSQL tables `bulk_import_batches` and `invite_waves`.
- **Real-World User & Business Impact:**  
  Integration tests and QA runs pass against in-memory mocks without validating real PostgreSQL schema constraints, foreign keys, or RLS policies on `bulk_import_batches` and `invite_waves`.
- **Specific Remediation Recommendation:**  
  Remove `memBatches` and `memWaves`. Repositories and services must always execute SQL queries against Supabase PostgreSQL.

---

#### Item 3.5: Worker Alerts Processor Local JSON Fallback and Static Sets
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/worker/src/processors/alerts.processor.ts`, lines 35–55
- **Verbatim Code Snippet:**
```typescript
34: export class AlertsProcessor {
35:   private static deliveredTupleLedger = new Set<string>();
36:   private static inMemoryDeliveries = new Map<string, AlertDeliveryRow>();
...
53:       const scratchDir = path.resolve(process.cwd(), '.scratch');
54:       this.persistenceFilePath = path.join(scratchDir, 'db-persistence.json');
```
- **Root Cause Explanation:**  
  `AlertsProcessor` maintains static in-memory sets (`deliveredTupleLedger`, `inMemoryDeliveries`) for delivery deduplication and falls back to reading/writing `.scratch/db-persistence.json` in non-production environments.
- **Real-World User & Business Impact:**  
  Delivery deduplication state is volatile and not shared across worker instances. If a worker pod restarts or if multiple worker pods run in parallel, candidates will receive duplicate search alert emails for the exact same jobs.
- **Specific Remediation Recommendation:**  
  Rely exclusively on Supabase PostgreSQL table `alert_deliveries` with a unique constraint `UNIQUE (alert_id, job_id)` to enforce delivery deduplication across all worker pods.

---

#### Item 3.6: Frontend Optimistic UI Masking & Silent Failure Fallbacks
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/web/src/components/jobs/SaveSearchAlertModal.tsx`, lines 52–76; `apps/web/src/components/workspaces/admin/MsmeBroadcastConsole.tsx`, lines 206–214
- **Verbatim Code Snippet:**
```typescript
// apps/web/src/components/jobs/SaveSearchAlertModal.tsx:
52:       if (!res.ok) {
53:         // Fall back to client storage if session or mock
54:         localStorage.setItem(
55:           `saved_alert_${Date.now()}`,
56:           JSON.stringify({ title, frequency, filters: { currentKeyword, currentCity, currentCategory } }),
57:         );
58:       }
59: 
60:       setStatus('success');
61:       setTimeout(() => {
62:         setIsOpen(false);
63:         setStatus('idle');
64:       }, 1800);
65:     } catch {
66:       // Local fallback
67:       localStorage.setItem(
68:         `saved_alert_${Date.now()}`,
69:         JSON.stringify({ title, frequency, filters: { currentKeyword, currentCity, currentCategory } }),
70:       );
71:       setStatus('success');
72:       setTimeout(() => {
73:         setIsOpen(false);
74:         setStatus('idle');
75:       }, 1800);
76:     }

// apps/web/src/components/workspaces/admin/MsmeBroadcastConsole.tsx:
203:         if (response.ok) {
204:           const data = await response.json();
205:           setDispatchSuccessId(data.campaignId || `camp_${Date.now()}`);
206:         } else {
207:           setDispatchSuccessId(`camp_${Date.now()}`);
208:         }
...
211:     } catch {
212:       // Graceful fallback for mock mode
213:       setDispatchSuccessId(`camp_${Date.now()}`);
214:       setIsModalOpen(false);
215:     }
```
- **Root Cause Explanation:**  
  When backend API requests fail (e.g. HTTP 400, 401, 500) or when network errors occur:
  - `SaveSearchAlertModal.tsx` intercepts the failure, writes the alert payload to browser `localStorage`, and updates state to `'success'`.
  - `MsmeBroadcastConsole.tsx` generates a synthetic client-side ID (`camp_${Date.now()}`) and triggers the success banner.
- **Real-World User & Business Impact:**  
  Job seekers believe their search alert was registered on the server, but no alert is ever created in the database and they will never receive notifications. Administrators believe their mass MSME broadcast was dispatched to thousands of employers, when in reality the server rejected or failed the request.
- **Specific Remediation Recommendation:**  
  Remove all client-side fallback masking. Render explicit error banners or toast notifications when the backend returns non-2xx responses or network exceptions occur.

---

## 4. Cross-Cutting Architectural & Compliance Impact

### 4.1 Invariant Adherence Review

| Hard Invariant (from `AGENTS.md`) | Compliance Status | Analysis & Evidence |
| :--- | :---: | :--- |
| **#1. Employer/anyone never sees job seeker phone/email** | **COMPLIANT** | Contact unlocks return platform messages or masked profiles; seeker contacts remain protected. |
| **#2. Bulk import creates users in `invited` state. No SMS at import.** | **COMPLIANT** | Bulk import CSV parser creates users with `status = 'invited'`. Zero SMS dispatched at import time. |
| **#3. Every bulk import row keeps `source`.** | **COMPLIANT** | Batch rows populate `source` with filename and batch metadata. |
| **#4. OTP: Turnstile before send, limits, cool-down, daily cap.** | **COMPLIANT** | Verified Upstash Redis sliding window limiter and 60s phone cool-down. |
| **#5. Authz enforced in API guards AND RLS.** | **VIOLATED** | Repositories falling back to `PersistentDatabaseStore` completely bypass PostgreSQL RLS. |
| **#6. Audit log append-only, not editable by admins.** | **COMPLIANT** | Immutable triggers in SQL protect audit logs from updates or deletions. |
| **#7. Credit balances derive from ledger only. Never store mutable balance.** | **COMPLIANT (DB) /<br>VIOLATED (API)** | Schema is compliant (immutable triggers, dynamic `SUM(amount)`). However, `POST /wallet/feature-job` crashes with SQL UUID error, and `deductForFeaturedPromotion` has TOCTOU balance overdraft races. |
| **#8. Aadhaar: Never store full number. Last 4 + verified flag.** | **COMPLIANT** | Only last 4 digits stored; full Aadhaar numbers rejected by Zod validation schemas. |

### 4.2 Regulatory Compliance Exposure (DPDP Act, India)
Storing DPDP account erasure requests in volatile Node.js memory (`AdminService.privacyRequests`) directly violates statutory compliance requirements under Section 12 of the Indian Digital Personal Data Protection Act, 2023. If an application instance restarts or auto-scales, all pending erasure requests are lost without an audit trail, exposing the platform to severe financial penalties and legal liability.

### 4.3 Multi-Container Cloud Deployment Hazards
The architecture currently relies on in-memory mutexes (`ProfileRepository.withLock`) and local JSON disk persistence (`.scratch/db-persistence.json`). In standard cloud deployments (e.g. Railway, AWS ECS, or Kubernetes):
1. **Container Replicas Cannot Coordinate:** Requests routed across different pods execute concurrently without synchronization, invalidating idempotency checks and enabling race conditions.
2. **Ephemeral Disk Data Loss:** Any data written to `.scratch/` is lost upon pod restart or redeployment.

---

## 5. Prioritized Remediation Roadmap

### Phase 1: Critical P0 Remediations (Immediate Launch Blockers)

1. **Fix Candidate Batch SMS Loop (`apps/worker/src/processors/invite.processor.ts`):**
   - Replace the single-candidate-per-chunk simulation with a real loop processing all candidates in `invitedCandidates`.
   - Update candidate status in `users` (`invited_at = NOW()`, `status = 'invite_sent'`) upon successful dispatch.
   - Filter candidate selection by `batch_id`.

2. **Fix Fatal SQL UUID Crash & Deprecate Broken Feature Job Endpoint:**
   - Remove `'generic_deduction'` call in `creditLedgerRepository.atomicDeduct`.
   - Deprecate `POST /wallet/feature-job` in favor of `POST /jobs/:id/promote`.
   - Enforce that all job promotions utilize the atomic stored procedure `promote_job_with_ledger`.

3. **Enforce Sponsorship Expiration in Job Applications:**
   - Update `packages/database/supabase/migrations/20261026100000_atomic_application_deduction_procedure.sql` to verify that `institution_profiles.sponsorship_expires_at > NOW()` before granting free job applications.
   - Implement a daily cron task in `apps/worker` to deactivate lapsed sponsorships.

4. **Eradicate In-Memory DPDP Erasure Queue:**
   - Create a durable PostgreSQL table `privacy_deletion_requests` with columns `(id, user_id, reason, status, requested_at, processed_at)`.
   - Update `AdminService.requestAccountDeletion` to insert records into Supabase PostgreSQL.

5. **Eliminate Frontend Silent Failure Masking:**
   - In `SaveSearchAlertModal.tsx` and `MsmeBroadcastConsole.tsx`, remove `localStorage` fallback writes and synthetic IDs. Display explicit error states when backend calls fail.

---

### Phase 2: Architectural Hardening & Queue Normalization (P1)

1. **Remove Dual Queue Dispatch in `BulkService`:**
   - Remove QStash webhook task scheduling from `scheduleInviteWave`. Direct all wave processing exclusively to BullMQ `invite-wave` queue.
   - Remove fake completion logic in `executeInviteWaveJob`.

2. **Upgrade MSG91 Client to High-Throughput Batch Payload:**
   - Implement `sendBatchInviteSms` in `WorkerSmsService` accepting arrays of up to 500 recipients per HTTP payload.

3. **Eradicate `PersistentDatabaseStore` & In-Memory Repositories:**
   - Remove `PersistentDatabaseStore` from `supabase.provider.ts`.
   - Delete `InMemoryUserRepository`.
   - Standardize all repository queries on Supabase PostgreSQL.

---

## 6. Verification & Reproducibility Guide

All findings documented in this report can be independently verified using the following commands and code inspections:

1. **Verify SMS Worker Candidate Skipping:**
   Inspect `apps/worker/src/processors/invite.processor.ts`:
   - Line 104: `for (let i = 0; i < iterations; i++)`
   - Line 106: `const sampleCandidate = invitedCandidates[sentCount]`
   - Line 117: `sentCount += currentBatchCount`
   - Notice that exactly one SMS is dispatched while `sentCount` increments by 250.

2. **Verify Fatal SQL UUID Cast Crash:**
   Inspect `apps/api/src/database/repositories/credit-ledger.repository.ts` at line 313:
   - Notice parameter `p_job_id: 'generic_deduction'`.
   - Compare with `packages/database/supabase/migrations/20261026100000_atomic_application_deduction_procedure.sql` line 7: `p_job_id UUID`.
   - Passing a non-UUID string to a PostgreSQL `UUID` parameter throws SQL code `22P02`.

3. **Verify Missing Sponsorship Expiration Check:**
   Inspect `packages/database/supabase/migrations/20261026100000_atomic_application_deduction_procedure.sql` lines 24–42:
   - Notice that `is_sponsored` on `job_seeker_profiles` is checked without joining `institution_profiles` or checking `sponsorship_expires_at`.

4. **Verify DPDP In-Memory Storage:**
   Inspect `apps/api/src/admin/admin.service.ts` lines 52 and 305:
   - Notice `private privacyRequests: PrivacyDeletionRequestRecord[] = []` and `this.privacyRequests.push(reqRecord)`.

5. **Typecheck & Linter Verification:**
   Verify the workspace compiles cleanly without code modifications:
   ```powershell
   pnpm --recursive run typecheck
   pnpm --recursive run lint
   ```
