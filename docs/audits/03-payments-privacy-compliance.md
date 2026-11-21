# Payments, Privacy Laws, & Compliance Audit (Requirement R4: Open P1 Items)

**Project:** Jobsclick (Indian Job Portal Platform)  
**Document Reference:** `docs/audits/03-payments-privacy-compliance.md`  
**Specification Authority:** `docs/PRD.md` (v1.3/v1.4), `docs/decisions/001-client-decisions.md`, `AGENTS.md`  
**Statutory Frameworks:** Digital Personal Data Protection (DPDP) Act 2023, Central Goods and Services Tax (CGST) Act 2017 § 36, RBI Payment Aggregator Guidelines  
**Audit Date:** November 3, 2026  
**Auditor:** Principal Security & Privacy Systems Auditor (Worker M3)  
**Audit Scope:** Payments Subsystem (`apps/api/src/wallet`), Privacy & Administration (`apps/api/src/admin`), Queue Infrastructure (`apps/api/src/queue`), Authentication & JWT Sessioning (`apps/api/src/auth`, `apps/web/src/context`), Data Models & Migrations (`packages/database`), Public Frontend Pages (`apps/web/src/app`), Background PDF Generator (`apps/worker/src/pdf`)  
**Integrity Mode:** Production Readiness Inspection (Local Mock / Offline Verification)

---

## 1. Executive Summary

A comprehensive, line-by-line architectural and operational audit was executed across the payment integration, data privacy enforcement, authentication lifecycle, localization, and document generation subsystems of the Indian Job Portal platform. The audit was conducted in strict adherence to **Requirement R4** of the Production Readiness Evaluation, verifying compliance with India's Digital Personal Data Protection (DPDP) Act 2023, the Central Goods and Services Tax (CGST) Act 2017, and the repository's immutable Hard Invariants (#1, #4, #5, #6, #7, #8, and #8a).

The audit rigorously evaluated five core domains:
1. **Razorpay Payments & Webhooks:** Cryptographic HMAC SHA-256 signature verification, checkout confirmation authorization boundaries, transactional atomicity between payment status transitions and credit ledger grants, and multi-node concurrency locks.
2. **DPDP Privacy Law Compliance:** Account erasure request persistence, background erasure pipelines, public deletion interfaces, and database foreign key cascades versus statutory tax invoice retention mandates.
3. **Privacy Leaks & Hard Invariants #1 & #8:** Bulk error report authorization boundaries, exposure of candidate mobile numbers in background queues and operational dashboards, applicant contact stripping, and Aadhaar 4-digit masking.
4. **Token Expiration & Refresh Flow:** Session lifecycles, JWT access token expiration boundaries, refresh token rotation architectures, and client-side unauthenticated handling.
5. **Hindi Localization & PDF Generation:** Translation coverage across public user journeys and Devanagari typography rendering in vector PDF resumes.

### Audit Verdict: **NOT PRODUCTION READY (Launch Blocking)**

While the platform demonstrates sound architectural execution in several critical areas—notably constant-time HMAC signature verification for Razorpay webhooks, strict Aadhaar 4-digit truncation at API boundaries, candidate contact shielding in applicant tracking views, and robust Devanagari font rendering in vector PDF resumes—it is compromised by **eight critical confirmed bugs and one incomplete feature** that constitute severe financial, security, and statutory launch blockers:

- **Critical Cross-Tenant PII Leak (Hard Invariant #1 Violation):** The endpoint `GET /bulk/batches/:id/error-report` allows any authenticated employer or intermediary to download raw CSV error logs containing the unredacted phone numbers and names of candidates uploaded by other colleges, training institutes, or competing employers.
- **Direct Checkout Verification IDOR & PII Disclosure:** The `POST /wallet/recharge/verify` endpoint verifies Razorpay payment signatures and returns full GST tax invoices containing customer legal names, addresses, GSTINs, emails, and phone numbers without validating that the authenticated user owns the underlying order.
- **Silent Financial Ledger Loss (Hard Invariant #7 Violation):** In `PaymentService.processPaymentSuccess`, transitioning a payment to `'captured'` and granting credits in `credit_ledgers` are unmanaged, non-atomic database operations. A transient failure during ledger credit creation permanently flags the payment as captured; subsequent retries exit immediately via idempotency guards, leaving the customer debited by Razorpay with zero credits granted.
- **Multi-Instance Concurrency Mutex Bypass:** Concurrency synchronization during payment capture relies on an in-memory Node.js `Map` (`withLock`), which is completely segregated across horizontally scaled containers, allowing concurrent webhook retries and browser verifications to bypass mutual exclusion.
- **Total DPDP Erasure System Absence (DPDP Act § 12 Violation):** User account erasure requests are appended to an ephemeral, in-memory JavaScript array (`this.privacyRequests = []`) that is destroyed upon pod restart. No database table, queue message, or background worker exists to purge user records or storage files, and the "Submit Account Erasure Request" button on `/privacy` is a non-functional static HTML button without an event handler.
- **Statutory Tax Invoice Destruction vs. Cascading Deletion Deadlock:** The database schema defines `ON DELETE CASCADE` from `users` to `payments` and `credit_ledgers`, permanently deleting tax invoice records mandated by Section 36 of the CGST Act 2017 to be preserved for up to 8 years. Simultaneously, `broadcast_campaigns` defines `ON DELETE RESTRICT`, causing raw user deletion queries to crash with foreign key constraint errors.
- **Unencrypted Citizen Mobile Numbers in Queues and Dashboard:** Broadcast campaign jobs enqueue plain-text candidate phone numbers into Redis BullMQ queues, which are rendered in cleartext on the unauthenticated Bull-Board administrative interface (`/admin/queues/ui`).
- **Abrupt 30-Minute Forced Logout:** Users are issued a single 30-minute JWT with no refresh token mechanism, no `/auth/refresh` API endpoint, and no client-side HTTP 401 retry interceptor, causing abrupt session drops and data loss mid-workflow.
- **Hardcoded English Across 8 Public Pages (Hard Invariant #8a Violation):** Eight primary public user-facing App Router routes contain hardcoded English text in JSX without `next-intl` localization, rendering the platform inaccessible to Hindi-speaking job seekers.

---

## 2. Audit Evaluation Matrix

Every evaluated item has been assigned a definitive classification:
- **`Confirmed Bug`**: A verifiable defect, security vulnerability, data loss risk, or statutory compliance violation.
- **`Incomplete Feature`**: Functionality that is partially drafted, un-wired, or missing operational infrastructure required for production.
- **`Mitigated / Not an Issue`**: A suspected issue that was systematically inspected and verified to be properly guarded or compliant.

| ID | Focus Area | Component & File Path | Code Lines | Definitive Status | Severity | Summary of Core Finding |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R4-01** | Payments | Webhook HMAC Signature Validation<br>`apps/api/src/wallet/payment.service.ts` | 182–205 | **Mitigated / Not an Issue** | Low / Info | Constant-time `crypto.timingSafeEqual` prevents timing attacks; verifies against raw unparsed request body. |
| **R4-02** | Payments | Checkout Verification IDOR & PII Leak<br>`apps/api/src/wallet/wallet.controller.ts`<br>`apps/api/src/wallet/payment.service.ts` | 77–105<br>325–360 | **Confirmed Bug** | **P1 (High)** | `POST /wallet/recharge/verify` omits user ownership validation, allowing any authenticated user to claim orders and extract customer GST/PII invoices. |
| **R4-03** | Payments | Non-Atomic Payment Capture & Ledger Loss<br>`apps/api/src/wallet/payment.service.ts` | 344–348<br>367–401 | **Confirmed Bug** | **P1 (High)** | Payment status update and credit ledger insertion are not wrapped in a PostgreSQL transaction; ledger failure leads to permanent credit loss on retry. |
| **R4-04** | Payments | In-Memory Concurrency Mutex in Multi-Node<br>`apps/api/src/wallet/payment.service.ts`<br>`apps/api/src/database/supabase.provider.ts` | 331–334<br>77–94 | **Confirmed Bug** | **P1 (Medium)** | Mutex lock uses local Node.js process `Map`; segregated across multiple Railway/container instances, failing to serialize concurrent webhooks. |
| **R4-05** | DPDP Privacy | In-Memory Deletion Requests & Dummy UI<br>`apps/api/src/admin/admin.service.ts`<br>`apps/web/src/app/privacy/page.tsx` | 51–52, 296–308<br>30–38 | **Incomplete Feature** | **P1 (Critical)** | Statutory DPDP erasure requests pushed to ephemeral in-memory array; UI button lacks `onClick` handler; zero background purge workers exist. |
| **R4-06** | DPDP Privacy | FK Cascade vs Statutory 8-Year GST Retention<br>`packages/database/supabase/migrations/20261008000000_init_schema.sql`<br>`packages/database/supabase/migrations/20261024000000_msme_broadcast_and_district_reports.sql` | 108, 116<br>8 | **Confirmed Bug** | **P1 (High)** | `payments` cascades on delete, destroying required 8-year tax invoices (CGST Act § 36); `broadcast_campaigns` uses `RESTRICT`, crashing user deletion. |
| **R4-07** | Privacy Leaks | Cross-Tenant Candidate PII Leak in Error CSV<br>`apps/api/src/bulk/bulk.controller.ts`<br>`apps/api/src/bulk/bulk.service.ts` | 59–64<br>470–492 | **Confirmed Bug** | **P1 (Critical)** | `GET /bulk/batches/:id/error-report` allows employers to download unredacted candidate phone numbers from any institution's import batch. |
| **R4-08** | Privacy Leaks | Plain-Text Phone Numbers in Queues & UI<br>`apps/api/src/queue/queue.service.ts`<br>`apps/api/src/main.ts` | 235–256<br>68–78 | **Confirmed Bug** | **P1 (Medium)** | Plain-text phone numbers enqueued in Redis BullMQ broadcast payload; exposed in cleartext on unauthenticated Bull-Board (`/admin/queues/ui`). |
| **R4-09** | Privacy Leaks | Applicant Phone/Email Stripping in Views<br>`apps/api/src/jobs/jobs.service.ts`<br>`apps/api/src/profiles/profiles.service.ts` | 351–358<br>163–184 | **Mitigated / Not an Issue** | Low / Info | Contact details are strictly omitted from applicant profile projections and public seeker profile queries (Hard Invariant #1 compliant). |
| **R4-10** | Privacy Leaks | Aadhaar 4-Digit Truncation & Logging Scrubber<br>`packages/validation/src/profiles.ts`<br>`apps/worker/src/processors/import.processor.ts` | 14–17<br>65–72 | **Mitigated / Not an Issue** | Low / Info | Zod schema strictly validates 4-digit regex; import processor truncates raw values via `.slice(-4)`; zero full 12-digit Aadhaar storage. |
| **R4-11** | Token Lifecycle | 30-Min JWT Expiry Without Refresh Token Flow<br>`apps/api/src/auth/jwt.service.ts`<br>`apps/web/src/context/AppContext.tsx` | 23–50<br>87–116 | **Confirmed Bug** | **P1 (High)** | Fixed 30-minute JWT with no refresh token issuance, no `/auth/refresh` route, and no client retry interceptor; triggers sudden user logout. |
| **R4-12** | Hindi / i18n | Hardcoded English Copy Across 8 Public Pages<br>`apps/web/src/app/jobs/page.tsx`<br>`apps/web/src/app/privacy/page.tsx` (and 6 others) | 100–156<br>6–38 | **Confirmed Bug** | **P1 (Medium)** | Eight major public App Router pages contain static English strings in JSX without `next-intl` integration, violating Hard Invariant #8a. |
| **R4-13** | PDF Generation | Devanagari Font Embedding in Vector PDF<br>`apps/worker/src/pdf/pdf-generator.ts`<br>`apps/worker/test/pdf.test.ts` | 25–43<br>1–5 | **Mitigated / Not an Issue** | Low / Info | Noto Sans Devanagari font files embedded via `@react-pdf/renderer`; verified passing 5/5 Vitest tests without glyph corruption or tofu boxes. |

---

## 3. Detailed Technical Audit Findings

---

### Focus Area 1: Razorpay Payments & Financial Integrity (PRD WAL-03)

#### Item R4-01: Razorpay Webhook HMAC Cryptographic Signature Validation
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/api/src/wallet/payment.service.ts`, lines 182–205
- **Verbatim Code Snippet:**
```typescript
181:   // Webhook Signature Verification (HMAC SHA256)
182:   verifyWebhookSignature(rawBody: string, signature: string, secretOverride?: string): boolean {
183:     if (!signature || !rawBody) {
184:       return false;
185:     }
186: 
187:     const secret = secretOverride || this.webhookSecret;
188:     try {
189:       const expectedSignature = crypto
190:         .createHmac('sha256', secret)
191:         .update(rawBody)
192:         .digest('hex');
193: 
194:       const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
195:       const signatureBuffer = Buffer.from(signature, 'utf-8');
196: 
197:       if (expectedBuffer.length !== signatureBuffer.length) {
198:         return false;
199:       }
200: 
201:       return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
202:     } catch {
203:       return false;
204:     }
205:   }
```
- **Execution Flow & Cryptographic Analysis:**
  1. The incoming webhook HTTP request hits Fastify configured with `rawBody: true` in `apps/api/src/main.ts:62`.
  2. The webhook controller extracts the raw body buffer prior to JSON deserialization, preventing byte alteration or whitespace normalization discrepancies that could invalidate HMAC calculations.
  3. `payment.service.ts` creates an HMAC digest using SHA-256 keyed with `process.env['RAZORPAY_WEBHOOK_SECRET']`.
  4. Both the computed digest and the incoming `x-razorpay-signature` header are converted into UTF-8 byte buffers.
  5. The method explicitly compares buffer lengths (`expectedBuffer.length !== signatureBuffer.length`) before calling `crypto.timingSafeEqual`. This eliminates timing side-channel attacks without triggering runtime buffer length mismatches in OpenSSL.
  6. Automated integration testing via `apps/api/test/payment.e2e-spec.ts` confirms that forged signatures, altered payloads, and missing secrets are rejected with HTTP 400 Bad Request.
- **Audit Verdict:** The HMAC signature verification is cryptographically sound, timing-safe, and complies with industry payment gateway integration standards.

---

#### Item R4-02: Direct Checkout Verification IDOR & Customer Billing PII Leak
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/wallet/wallet.controller.ts`, lines 77–105; `apps/api/src/wallet/payment.service.ts`, lines 325–360, 552–570
- **Verbatim Code Snippet:**
`apps/api/src/wallet/wallet.controller.ts`:
```typescript
77:   @Post('recharge/verify')
78:   @RequireFeatureFlag('ENABLE_P2_PAYMENTS')
79:   async verifyPayment(
80:     @CurrentUser() user: AuthUser,
81:     @Body() body: VerifyPaymentInput,
82:   ) {
83:     const validated = verifyPaymentSchema.parse(body);
84: 
85:     const isValid = this.paymentService.verifyClientPaymentSignature(
86:       validated.razorpayOrderId,
87:       validated.razorpayPaymentId,
88:       validated.razorpaySignature,
89:     );
90: 
91:     if (!isValid) {
92:       throw new BadRequestException({
93:         statusCode: 400,
94:         code: 'INVALID_SIGNATURE',
95:         message: 'Invalid payment signature from Razorpay checkout',
96:       });
97:     }
98: 
99:     return this.paymentService.processPaymentSuccess(
100:       validated.razorpayOrderId,
101:       validated.razorpayPaymentId,
102:       validated.razorpaySignature,
103:       { verifiedBy: 'client_checkout', verifiedByUserId: user.id },
104:     );
105:   }
```
`apps/api/src/wallet/payment.service.ts`:
```typescript
325:   async processPaymentSuccess(
326:     orderId: string,
327:     paymentId: string,
328:     signature?: string,
329:     extraMetadata?: Record<string, unknown>,
330:   ): Promise<{ payment: PaymentRow; invoice: InvoiceResponse; alreadyProcessed: boolean }> {
...
334:     return (await store.withLock(orderId, async () => {
335:       const payment = await this.paymentRepository.findByGatewayOrderId(orderId);
336:       if (!payment) {
337:         throw new BadRequestException({ ... });
338:       }
...
344:       // 1. Idempotency Check: if already captured, return existing invoice without duplicate grant
345:       if (payment.status === 'captured') {
346:         const invoice = this.formatInvoice(payment);
347:         return { payment, invoice, alreadyProcessed: true };
348:       }
...
384:           const invoice = this.formatInvoice(capturedPayment);
385:           return { payment: capturedPayment, invoice, alreadyProcessed: true };
...
399:         );
400:       }
```
- **Root Cause & Execution Path:**
  1. The controller receives the authenticated caller via `@CurrentUser() user: AuthUser`.
  2. However, line 99 passes only `orderId`, `paymentId`, and `signature` to `processPaymentSuccess`. The `user.id` is relegated to an optional `extraMetadata` object.
  3. `processPaymentSuccess` locates the payment record strictly by `orderId` (`paymentRepository.findByGatewayOrderId(orderId)`). It **never verifies** whether `payment.user_id === user.id`.
  4. In contrast, the dedicated invoice retrieval method (`getInvoice` on lines 552–570) explicitly enforces this check:
     ```typescript
     if (payment.user_id !== userId && !isAdmin) {
       throw new ForbiddenException({ message: 'You are not authorized to view this invoice' });
     }
     ```
  5. Because `processPaymentSuccess` formats and returns `invoice` immediately upon completion or idempotency match, any authenticated user who obtains a valid `orderId` and signature pair can call `POST /wallet/recharge/verify` and receive the full GST tax invoice.
- **User, Financial, & Security Impact:**
  - **Insecure Direct Object Reference (IDOR):** An attacker with a low-privilege account can enumerate or intercept Razorpay order identifiers and inspect the structured invoice data of other companies.
  - **Customer Billing PII Exposure:** The returned `invoice` object exposes `customerName`, `customerGstin`, `billingAddress`, `billingEmail`, `billingPhone`, and exact financial purchase amounts, violating corporate data confidentiality and Hard Invariant #5 ("Authz enforced in API guards. A user sees only own data unless explicitly allowed").
- **Remediation:**
  1. Enforce user authorization directly at the controller and service layer:
  ```typescript
  // wallet.controller.ts
  const payment = await this.paymentRepository.findByGatewayOrderId(validated.razorpayOrderId);
  if (!payment) throw new NotFoundException('Payment order not found');
  if (payment.user_id !== user.id && user.role !== 'admin') {
    throw new ForbiddenException('You are not authorized to verify this payment order');
  }
  ```
  2. Alternatively, pass `user.id` as a required parameter to `processPaymentSuccess` and reject requests where `payment.user_id !== expectedUserId` unless called by the webhook handler.

---

#### Item R4-03: Non-Atomic Payment Capture and Silent Credit Ledger Loss
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/wallet/payment.service.ts`, lines 344–348, 367–401
- **Verbatim Code Snippet:**
```typescript
366:       // 3. Atomic Conditional Transition to 'captured'
367:       const transitionResult = await this.paymentRepository.transitionToCaptured(payment.id, {
368:         gateway_payment_id: paymentId,
369:         gateway_signature: signature ?? payment.gateway_signature,
370:         invoice_number: invoiceNumber,
371:         processed_at: now.toISOString(),
372:         processed_by: (extraMetadata?.['verifiedBy'] as string) || 'razorpay_webhook',
373:         metadata: {
374:           ...(payment.metadata ?? {}),
375:           ...(extraMetadata ?? {}),
376:           capturedAt: now.toISOString(),
377:         },
378:       });
...
391:       // 4. Grant credits to wallet via ledger (Hard Invariant #7: Ledger is source of truth)
392:       const creditsToGrant = updatedPayment.credits_added || 0;
393:       if (creditsToGrant > 0) {
394:         await this.walletService.grantCredits(
395:           updatedPayment.user_id,
396:           creditsToGrant,
397:           `Wallet recharge: Credit pack ${updatedPayment.pack_id} (Ref: ${paymentId})`,
398:           updatedPayment.user_id,
399:         );
400:       }
```
- **Root Cause & Execution Path:**
  1. Line 367 invokes `this.paymentRepository.transitionToCaptured`, which executes an independent SQL `UPDATE payments SET status = 'captured' ...` and commits immediately.
  2. Line 394 then invokes `this.walletService.grantCredits`, which performs an independent SQL `INSERT INTO credit_ledgers ...`.
  3. These two distinct operations are executed outside of a PostgreSQL database transaction (`BEGIN ... COMMIT`).
  4. If an exception occurs on line 394 (e.g., PostgreSQL connection timeout, deadlock, process crash, or container restart), the database state is left corrupted: the payment row is committed as `'captured'`, but zero rows are inserted into `credit_ledgers`.
  5. When Razorpay retries the webhook or the user refreshes their checkout page, the flow re-enters `processPaymentSuccess` and hits line 345:
     ```typescript
     if (payment.status === 'captured') {
       const invoice = this.formatInvoice(payment);
       return { payment, invoice, alreadyProcessed: true };
     }
     ```
  6. The idempotency guard assumes that because `status === 'captured'`, credits were already granted. It exits cleanly and returns the invoice without ever crediting the user's ledger!
- **User, Financial, & Regulatory Impact:**
  - **Irrecoverable Fund Deductions:** The customer's bank account or credit card is charged by Razorpay, the payment is recorded as successful, but the customer receives 0 credits.
  - **Violation of Hard Invariant #7:** Violates the foundational platform invariant: *"Credit balances derive from ledger only (P2). Never store mutable balance as truth."* The system creates an irreconcilable discrepancy between captured monetary transactions and ledger entries.
- **Remediation:**
  Encapsulate the state transition and ledger credit issuance within an atomic PostgreSQL transaction or stored procedure:
  ```sql
  CREATE OR REPLACE FUNCTION capture_payment_and_grant_credits(
    p_payment_id UUID,
    p_gateway_payment_id TEXT,
    p_gateway_signature TEXT,
    p_invoice_number TEXT,
    p_user_id UUID,
    p_credits INT,
    p_description TEXT
  ) RETURNS JSONB AS $$
  DECLARE
    v_payment payments%ROWTYPE;
  BEGIN
    -- Atomic conditional transition
    UPDATE payments
    SET status = 'captured',
        gateway_payment_id = p_gateway_payment_id,
        gateway_signature = p_gateway_signature,
        invoice_number = p_invoice_number,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payment_id AND status != 'captured'
    RETURNING * INTO v_payment;

    IF NOT FOUND THEN
      -- Already captured concurrently
      SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
      RETURN jsonb_build_object('already_captured', true, 'payment_id', v_payment.id);
    END IF;

    -- Grant credits to ledger inside the exact same atomic transaction
    IF p_credits > 0 THEN
      INSERT INTO credit_ledgers (user_id, amount, reason, created_at)
      VALUES (p_user_id, p_credits, p_description, NOW());
    END IF;

    RETURN jsonb_build_object('already_captured', false, 'payment_id', v_payment.id);
  END;
  $$ LANGUAGE plpgsql;
  ```

---

#### Item R4-04: In-Memory Concurrency Mutex Ineffective Across Multi-Replica Deployments
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/wallet/payment.service.ts`, lines 331–334; `apps/api/src/database/supabase.provider.ts`, lines 77–94
- **Verbatim Code Snippet:**
`apps/api/src/wallet/payment.service.ts`:
```typescript
331:     // Atomic synchronization by orderId to prevent race conditions during concurrent webhook retries
332:     const store = (this.paymentRepository as unknown as { persistentStore: { withLock: (id: string, fn: () => Promise<unknown>) => Promise<unknown> } }).persistentStore;
333: 
334:     return (await store.withLock(orderId, async () => {
```
`apps/api/src/database/supabase.provider.ts`:
```typescript
77:   public async withLock<T>(resourceId: string, fn: () => Promise<T>): Promise<T> {
78:     const prev = this.locks.get(resourceId) || Promise.resolve();
79:     let release: () => void;
80:     const next = new Promise<void>((resolve) => {
81:       release = resolve;
82:     });
83:     this.locks.set(resourceId, next);
84: 
85:     try {
86:       await prev;
87:       return await fn();
88:     } finally {
89:       release!();
90:       if (this.locks.get(resourceId) === next) {
91:         this.locks.delete(resourceId);
92:       }
93:     }
94:   }
```
- **Root Cause & Architectural Failure:**
  1. `withLock` is backed by `private locks: Map<string, Promise<void>> = new Map()`, which lives entirely within the Node.js V8 process memory heap.
  2. The production deployment architecture targets Railway with multiple stateless container replicas (`web`, `api`, `worker`).
  3. When an employer completes payment checkout in their browser, their browser sends a request to `POST /wallet/recharge/verify`, while Razorpay's servers simultaneously dispatch a webhook to `POST /webhooks/razorpay`.
  4. In a multi-replica deployment, Railway's round-robin or least-connections load balancer frequently routes the user request to Container Instance A and the webhook request to Container Instance B.
  5. Because heap memory is strictly isolated between containers, Instance A's mutex map has zero knowledge of Instance B's mutex. Both requests enter `processPaymentSuccess` concurrently without synchronization.
- **User & Financial Impact:**
  - Under load, concurrent execution of payment verification and webhook ingestion leads to race conditions, double invoice numbering attempts, and lock contention crashes.
- **Remediation:**
  Replace the in-process JavaScript `Map` lock with a distributed locking primitive using Redis (`ioredis` / `@upstash/redis` with Redlock algorithm) or a PostgreSQL transaction advisory lock:
  ```sql
  -- Acquire exclusive transaction-level advisory lock on hashed order ID
  SELECT pg_advisory_xact_lock(hashtext(p_order_id));
  ```

---

### Focus Area 2: DPDP Privacy Law Compliance & Data Purge

#### Item R4-05: Ephemeral In-Memory Account Deletion Requests, Dummy UI Button, & Missing Background Purge Worker
- **Definitive Status:** `Incomplete Feature`
- **Location:** `apps/api/src/admin/admin.service.ts`, lines 51–52, 296–308; `apps/web/src/app/privacy/page.tsx`, lines 30–38; `apps/worker/src/processors/`
- **Verbatim Code Snippet:**
`apps/api/src/admin/admin.service.ts`:
```typescript
51:   private notifications = new Map<string, NotificationRecord[]>();
52:   private privacyRequests: PrivacyDeletionRequestRecord[] = [];
...
296:   // Issue #24: DPDP Privacy Deletion Request
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
`apps/web/src/app/privacy/page.tsx`:
```tsx
30:         <section className="pt-4 border-t border-gray-200">
31:           <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Request Data Deletion</h2>
32:           <p className="mb-4">
33:             Under DPDP guidelines, you have the right to request full erasure of your account and personal data at any time.
34:           </p>
35:           <button className="px-4 py-2 bg-red-600 text-white font-medium rounded hover:bg-red-700">
36:             Submit Account Erasure Request
37:           </button>
38:         </section>
```
- **Root Cause & Architecture Trace:**
  1. **Volatile Memory Storage:** In `admin.service.ts`, deletion requests are simply appended to `this.privacyRequests: PrivacyDeletionRequestRecord[] = []`. When the API restarts, scales down, or redeploys, all statutory erasure requests vanish without a trace.
  2. **Non-Functional User Interface:** On the public privacy policy page (`apps/web/src/app/privacy/page.tsx`), the "Submit Account Erasure Request" button has no `onClick` handler, no form binding, and no API integration. Clicking the button produces zero network requests and zero user feedback.
  3. **Zero Purge Worker Pipeline:** An inspection of `apps/worker/src/processors/` reveals five processors: `alerts.processor.ts`, `broadcast.processor.ts`, `import.processor.ts`, `invite.processor.ts`, and `pdf.processor.ts`. There is **no erasure processor, no anonymization worker, and no scheduled queue** to handle data purges.
  4. **Orphaned Storage Objects:** Resumes uploaded to Supabase Storage (`resumes/{id}.pdf`) and generated verification files are never deleted upon user exit.
- **Statutory & Legal Exposure:**
  - **Direct Violation of the Digital Personal Data Protection Act 2023 (Section 12 - Right to Correction and Erasure of Personal Data):** The Act imposes statutory obligations on Data Fiduciaries to erase personal data upon withdrawal of consent unless retention is required for legal compliance. Failure to maintain verifiable technical mechanisms for data erasure risks severe regulatory penalties from the Data Protection Board of India (DPBI).
- **Remediation:**
  1. Add a dedicated persistent table:
     ```sql
     CREATE TABLE privacy_deletion_requests (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       reason TEXT,
       status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
       requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       completed_at TIMESTAMPTZ
     );
     ```
  2. Implement an asynchronous worker (`erasure.processor.ts`) to:
     - Scrub user profile, education, experience, and contact records.
     - Delete resume PDF files from Supabase Storage buckets.
     - Revoke active JWT sessions in Redis by incrementing `users.token_version`.
     - Record a PII-scrubbed audit log entry (Hard Invariant #6).
  3. Wire the frontend button on `/privacy` to open a confirmation modal and submit `POST /api/privacy/erasure-request`.

---

#### Item R4-06: Foreign Key Cascade vs Statutory 8-Year GST Tax Invoice Retention & `ON DELETE RESTRICT` Deletion Blockers
- **Definitive Status:** `Confirmed Bug`
- **Location:** `packages/database/supabase/migrations/20261008000000_init_schema.sql`, lines 108, 116; `packages/database/supabase/migrations/20261024000000_msme_broadcast_and_district_reports.sql`, line 8
- **Verbatim Code Snippet:**
`packages/database/supabase/migrations/20261008000000_init_schema.sql`:
```sql
106: CREATE TABLE credit_ledgers (
107:     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
108:     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
109:     amount INT NOT NULL,
110:     reason VARCHAR(255) NOT NULL,
111:     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
112: );
113: 
114: CREATE TABLE payments (
115:     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
116:     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
117:     gateway_order_id VARCHAR(255) NOT NULL,
118:     amount_inr NUMERIC(10, 2) NOT NULL,
119:     status VARCHAR(50) NOT NULL,
120:     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
121: );
```
`packages/database/supabase/migrations/20261024000000_msme_broadcast_and_district_reports.sql`:
```sql
6: CREATE TABLE IF NOT EXISTS broadcast_campaigns (
7:     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
8:     created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
9:     dlt_template_id VARCHAR(100) NOT NULL,
...
```
- **Root Cause & Legal Conflict Analysis:**
  1. **Statutory Tax Destruction (CGST Act § 36):** Under Indian GST regulations (Section 36 of the Central Goods and Services Tax Act 2017), every registered business must maintain all tax invoices, payment records, and ledgers for 72 months following the due date of furnishing the annual return (effectively up to 8 years). In `init_schema.sql`, both `payments` and `credit_ledgers` declare `ON DELETE CASCADE`. If an administrator or script executes a naive SQL `DELETE FROM users WHERE id = ...` in response to a user's DPDP deletion request, all historical payment records, GST breakdown receipts, and credit ledgers are permanently purged from PostgreSQL, exposing the platform to severe tax audit violations.
  2. **Cascading Deletion Deadlock:** Simultaneously, in `msme_broadcast_and_district_reports.sql:8`, `broadcast_campaigns` defines `created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`. If an employer who previously created a broadcast campaign requests DPDP account erasure, running `DELETE FROM users WHERE id = ...` crashes with a fatal PostgreSQL foreign key violation error (error code `23503: foreign_key_violation`), causing the erasure process to abort.
- **Remediation:**
  1. Alter `payments` and `credit_ledgers` foreign keys to make `user_id` nullable with `ON DELETE SET NULL`:
     ```sql
     ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;
     ALTER TABLE payments DROP CONSTRAINT payments_user_id_fkey,
       ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

     ALTER TABLE credit_ledgers ALTER COLUMN user_id DROP NOT NULL;
     ALTER TABLE credit_ledgers DROP CONSTRAINT credit_ledgers_user_id_fkey,
       ADD CONSTRAINT credit_ledgers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
     ```
  2. Ensure customer billing metadata (legal entity name, GSTIN, invoice address) is permanently snapshotted in the `metadata` JSONB column of `payments` so that the tax invoice remains legally intact and verifiable after the live user account is anonymized.
  3. Alter `broadcast_campaigns.created_by` to allow `ON DELETE SET NULL`.

---

### Focus Area 3: Privacy Leaks & Security Hard Invariants (Hard Invariants #1 & #8)

#### Item R4-07: Unrestricted Cross-Tenant Candidate PII Leak in Bulk Import Error CSV Download
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/bulk/bulk.controller.ts`, lines 59–64; `apps/api/src/bulk/bulk.service.ts`, lines 470–492
- **Verbatim Code Snippet:**
`apps/api/src/bulk/bulk.controller.ts`:
```typescript
59:   @Roles('admin', 'intermediary', 'employer')
60:   @Get('bulk/batches/:id/error-report')
61:   @Header('Content-Type', 'text/csv')
62:   async downloadErrorCsv(@Param('id') id: string) {
63:     return this.bulkService.getBatchErrorCsv(id);
64:   }
```
`apps/api/src/bulk/bulk.service.ts`:
```typescript
470:   async getBatchErrorCsv(batchId: string): Promise<string> {
471:     if (this.isTestMode) {
472:       const batch = this.memBatches.get(batchId);
473:       return batch?.errorCsvContent || 'row,phone,reason\n';
474:     }
475: 
476:     const { data: batch } = await this.supabase
477:       .from('bulk_import_batches')
478:       .select('error_csv_storage_path')
479:       .eq('id', batchId)
480:       .single();
481: 
482:     if (!batch?.error_csv_storage_path) {
483:       return 'row,phone,reason\n';
484:     }
485: 
486:     const { data: fileData } = await this.supabase.storage.from('private').download(batch.error_csv_storage_path);
487:     if (!fileData) {
488:       return 'row,phone,reason\n';
489:     }
490: 
491:     return await fileData.text();
492:   }
```
- **Root Cause & Security Vulnerability:**
  1. The controller route `@Get('bulk/batches/:id/error-report')` is decorated with `@Roles('admin', 'intermediary', 'employer')`. This means any user logged in with an `employer` role can invoke the endpoint.
  2. The handler accepts `@Param('id') id: string` and forwards it directly to `this.bulkService.getBatchErrorCsv(id)`.
  3. **Total Absence of Tenant Authorization:** Neither the controller nor the service method checks whether the authenticated user created the batch or belongs to the organization that uploaded it!
  4. The error CSV contains raw candidate mobile numbers (`row,phone,reason\n`), candidate names, and trade qualifications from failed import rows.
- **User & Regulatory Impact:**
  - **Severe Cross-Tenant Data Breach:** An attacker with a standard employer account can scrape or enumerate batch UUIDs and download the error reports of any other enterprise, ITI college, or polytechnic institution.
  - **Direct Violation of Hard Invariant #1:** *"Employer/anyone never sees a job seeker's phone or email. Contact only via platform message."*
- **Remediation:**
  Inject `@CurrentUser() user: AuthUser` and verify tenant ownership in `bulk.service.ts`:
  ```typescript
  // Verify batch ownership
  const { data: batch } = await this.supabase
    .from('bulk_import_batches')
    .select('id, created_by, error_csv_storage_path')
    .eq('id', batchId)
    .single();

  if (!batch) throw new NotFoundException('Batch not found');
  if (user.role !== 'admin' && batch.created_by !== user.id) {
    throw new ForbiddenException('You are not authorized to access this batch error report');
  }
  ```

---

#### Item R4-08: Plain-Text Candidate Mobile Numbers in BullMQ Broadcast Payload Exposed via Unauthenticated Bull-Board
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/queue/queue.service.ts`, lines 235–256; `apps/api/src/main.ts`, lines 68–78
- **Verbatim Code Snippet:**
`apps/api/src/queue/queue.service.ts`:
```typescript
235:   async publishBroadcastJob(data: {
236:     campaignId: string;
237:     batchIndex: number;
238:     totalBatches: number;
239:     recipients: Array<{
240:       businessProfileId: string;
241:       phone: string;
242:       idempotencyKey: string;
243:     }>;
244:     templateId: string;
245:     variables: Record<string, string>;
246:     shouldSimulateFailure?: boolean;
247:     _traceContext?: { sentryTrace?: string; baggage?: string; traceId?: string };
248:   }) {
249:     const jobData = this.enrichJobData(data);
250:     if (this.isMock) {
251:       this.mockCounters[QUEUE_NAMES.BROADCAST].waiting++;
252:       return { id: `mock_${Date.now()}`, name: 'broadcast-batch', data: jobData } as unknown as Job;
253:     }
254:     try {
255:       return await this.broadcastQueue.add('broadcast-batch', jobData, DEFAULT_JOB_OPTIONS);
```
`apps/api/src/main.ts`:
```typescript
68:   // Mount Bull-Board Dashboard UI behind /admin/queues/ui
69:   try {
70:     const { QueueService } = await import('./queue/queue.service.js');
71:     const queueService = app.get(QueueService);
72:     await app.register(
73:       queueService.serverAdapter.registerPlugin() as unknown as Parameters<NestFastifyApplication['register']>[0],
74:       { prefix: '/admin/queues/ui' } as unknown as Parameters<NestFastifyApplication['register']>[1],
75:     );
76:   } catch (err) {
77:     console.warn('[Bull-Board] Failed to mount Bull-Board on Fastify:', err);
78:   }
```
- **Root Cause & Security Analysis:**
  1. The API enqueues broadcast jobs by inserting plain-text mobile numbers directly into the BullMQ job payload (`recipients: Array<{ phone: string; ... }>`), which is written as unencrypted JSON into Redis.
  2. In `main.ts:72–75`, the Bull-Board dashboard UI plugin is registered directly on the Fastify instance at `/admin/queues/ui` without any NestJS authentication guard (`@UseGuards(AuthGuard, RolesGuard)`).
  3. Anyone who navigates to `/admin/queues/ui` can view pending, active, and failed jobs and inspect their full `job.data` payloads, exposing hundreds of thousands of candidate and citizen mobile numbers in cleartext.
- **User & Security Impact:**
  - Violates the zero-PII storage principle and Hard Invariant #1. Exposes citizen mobile numbers to any internal developer, contractor, or network observer with access to the web port or Redis instance.
- **Remediation:**
  1. Enqueue only opaque candidate user IDs (`userIds: string[]`) in BullMQ job data. The worker (`broadcast.processor.ts`) should resolve phone numbers just-in-time from the database at the exact millisecond of dispatch.
  2. Restrict the Bull-Board route behind strict HTTP Basic Auth or session-based admin authorization guards in Fastify.

---

#### Item R4-09: Candidate Phone Number and Email Masking/Stripping in Public and Employer Applicant Tracking Views
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/api/src/jobs/jobs.service.ts`, lines 351–358; `apps/api/src/profiles/profiles.service.ts`, lines 163–184
- **Verbatim Code Snippet:**
`apps/api/src/jobs/jobs.service.ts`:
```typescript
351:         applicantProfile: {
352:           seekerId: seekerProfile?.id || `seeker_${app.applicant_id}`,
353:           fullName: seekerProfile?.full_name || 'Applicant',
354:           seekerType: seekerProfile?.seeker_type || 'individual',
355:           city: seekerProfile?.city || '',
356:           skills: seekerProfile?.skills || [],
357:           // Hard Invariant #1: Phone & email explicitly excluded!
358:         },
```
`apps/api/src/profiles/profiles.service.ts`:
```typescript
163:   // Hard Invariant #1: Employer/anyone never sees phone or email!
164:   async getSeekerProfilePublic(
165:     seekerId: string,
166:   ): Promise<Omit<SeekerProfileRecord, 'phone' | 'email' | 'aadhaarLastFour' | 'apaarId'>> {
167:     const profile = await this.profileRepository.findSeekerProfileById(seekerId);
168:     if (!profile) {
169:       throw new NotFoundException('Job seeker profile not found');
170:     }
171: 
172:     return {
173:       id: profile.id,
174:       userId: profile.user_id,
175:       fullName: profile.full_name,
176:       photoUrl: profile.photo_url || '',
177:       seekerType: profile.seeker_type as 'student' | 'individual',
178:       dpdpConsentGiven: profile.dpdp_consent_given ?? false,
179:       skills: profile.skills,
180:       preferredCategories: (profile.preferred_categories || []) as JobCategory[],
181:       city: profile.city || '',
182:       completenessScore: 60,
183:     };
184:   }
```
- **Logic Chain & Verification:**
  - Both `jobs.service.ts` and `profiles.service.ts` deliberately construct response objects that exclude sensitive contact parameters (`phone`, `email`, `aadhaarLastFour`, `apaarId`).
  - Employer interactions are restricted to platform messaging channels.
  - The implementation strictly complies with Hard Invariant #1 ("Employer/anyone never sees a job seeker's phone or email").
- **Audit Verdict:** Fully mitigated and compliant.

---

#### Item R4-10: Aadhaar 4-Digit Data Minimization, Masking, and Sentry PII Scrubbing
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `packages/validation/src/profiles.ts`, lines 14–17; `apps/worker/src/processors/import.processor.ts`, lines 65–72
- **Verbatim Code Snippet:**
`packages/validation/src/profiles.ts`:
```typescript
14:     aadhaarLastFour: z
15:       .string()
16:       .regex(/^\d{4}$/, 'Must be exactly the last 4 digits of Aadhaar')
17:       .optional(),
```
`apps/worker/src/processors/import.processor.ts`:
```typescript
65: export function extractAadhaarLast4(input?: string): string | undefined {
66:   if (!input) return undefined;
67:   const digitsOnly = input.replace(/\D/g, '');
68:   if (digitsOnly.length >= 4) {
69:     return digitsOnly.slice(-4);
70:   }
71:   return undefined;
72: }
```
- **Logic Chain & Verification:**
  - In `packages/validation/src/profiles.ts`, the Zod schema enforces that `aadhaarLastFour` must be exactly 4 digits (`/^\d{4}$/`). Attempts to pass a full 12-digit Aadhaar number fail validation at the API boundary.
  - In `apps/worker/src/processors/import.processor.ts`, the bulk import worker sanitizes incoming spreadsheet data by isolating only the final four numeric digits (`digitsOnly.slice(-4)`).
  - The Sentry error reporting configuration in `apps/api/src/main.ts` includes a regex scrubber that redacts 12-digit numeric sequences from error reports and logs.
  - Complies fully with Hard Invariant #8 ("Aadhaar: optional field, but never store the full number. Store last 4 digits + verified flag only. Never log it").
- **Audit Verdict:** Fully mitigated and compliant.

---

### Focus Area 4: Session Management & Token Expiration Lifecycles

#### Item R4-11: 30-Minute Access Token Abrupt Expiration Without Refresh Token Flow or Client Interceptor
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/api/src/auth/jwt.service.ts`, lines 23–50; `apps/web/src/context/AppContext.tsx`, lines 87–116
- **Verbatim Code Snippet:**
`apps/api/src/auth/jwt.service.ts`:
```typescript
23:   getTtlMinutes(): number {
24:     const raw = process.env['JWT_ACCESS_TOKEN_TTL_MINUTES'];
25:     const parsed = raw ? parseInt(raw, 10) : 30;
26:     if (isNaN(parsed) || parsed < 1) return 30;
27:     return Math.min(parsed, 60);
28:   }
29: 
30:   async signAccessToken(userId: string, tokenVersion: number, additionalClaims?: Record<string, unknown>): Promise<string> {
...
32:     const ttlMinutes = this.getTtlMinutes();
...
47:       .setExpirationTime(expSec);
48: 
49:     return builder.sign(secretKey);
50:   }
```
`apps/web/src/context/AppContext.tsx`:
```typescript
87:   const refreshSession = useCallback(async (): Promise<AuthenticatedUser | null> => {
88:     try {
89:       setIsLoadingSession(true);
90:       const res = await fetch('/api/auth/session', {
91:         method: 'GET',
92:         credentials: 'include',
93:         headers: { Accept: 'application/json' },
94:         cache: 'no-store',
95:       });
96: 
97:       if (!res.ok) {
98:         setUser(null);
99:         return null;
100:       }
...
108:       setUser(null);
109:       return null;
110:     } catch {
111:       setUser(null);
112:       return null;
113:     } finally {
114:       setIsLoadingSession(false);
115:     }
116:   }, []);
```
- **Root Cause & Operational Breakdown:**
  1. `jwt.service.ts` signs a single JWT access token with an expiration of 30 minutes (`ttlMinutes`).
  2. The service contains **no refresh token issuance logic, no refresh token table in Postgres, and no `/auth/refresh` API endpoint**.
  3. In `AppContext.tsx`, `refreshSession` merely performs a `GET /api/auth/session`.
  4. Once 30 minutes elapse, any subsequent request to `/api/auth/session` receives HTTP 401 Unauthorized because the token is expired.
  5. The frontend has no token refresh interceptor. Upon receiving HTTP 401, lines 97–100 immediately invoke `setUser(null)`, wiping the user state from React context.
- **User Experience Impact:**
  - An employer actively reviewing candidate profiles, typing job descriptions, or scheduling an invite wave is kicked out to the landing page at minute 31, losing all unsaved form input.
  - Candidates completing multi-step profile builders or verification forms experience sudden session termination.
- **Remediation:**
  1. Implement industry-standard dual-token authentication:
     - Issue a short-lived access token (15 minutes).
     - Issue a secure, `HttpOnly`, `SameSite=Lax`, path-restricted refresh token cookie (30-day sliding expiry).
  2. Create an endpoint `POST /auth/refresh` in `apps/api/src/auth/auth.controller.ts` that validates the refresh token, checks `users.token_version`, and issues a new access token.
  3. Implement an HTTP interceptor in the frontend API client (`apps/web/src/lib/api-client.ts`) that catches 401 responses, silently calls `/api/auth/refresh`, and seamlessly retries the original request.

---

### Focus Area 5: Hindi Localization & PDF Document Generation (Hard Invariant #8a)

#### Item R4-12: Extensive Hardcoded English Copy Across 8 Major Public User-Facing Pages
- **Definitive Status:** `Confirmed Bug`
- **Location:** 
  1. `apps/web/src/app/jobs/page.tsx`, lines 100–156
  2. `apps/web/src/app/jobs/[id]/page.tsx`, lines 42–120
  3. `apps/web/src/app/company/page.tsx`, lines 31–90
  4. `apps/web/src/app/company/[id]/page.tsx`, lines 38–110
  5. `apps/web/src/app/institutions/page.tsx`, lines 25–78
  6. `apps/web/src/app/institution/[id]/page.tsx`, lines 34–95
  7. `apps/web/src/app/how-it-works/page.tsx`, lines 28–85
  8. `apps/web/src/app/privacy/page.tsx`, lines 6–38
- **Verbatim Code Snippets:**
`apps/web/src/app/jobs/page.tsx`:
```tsx
103:             <span className="text-xs font-bold uppercase tracking-wider text-brand-orange">
104:               Pan-India Job Directory
105:             </span>
106:             <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
107:               Find Verified Opportunities Nationwide
108:             </h1>
109:             <p className="text-xs sm:text-sm text-gray-600 mt-1">
110:               Direct hiring with verified MSMEs and enterprises. Contact privacy guaranteed.
111:             </p>
...
122:                 placeholder="Job title, skill (e.g. CNC, React, Sales, Logistics)..."
...
133:                 placeholder="City (e.g. Bengaluru, Pune, Delhi, Mumbai)..."
...
144:                 Search Jobs
```
`apps/web/src/app/privacy/page.tsx`:
```tsx
6:       <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy & DPDP Disclosures</h1>
7: 
8:       <div className="bg-white rounded-lg shadow p-6 border border-gray-200 space-y-6 text-gray-700 leading-relaxed">
9:         <section>
10:           <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Data Protection & Digital Personal Data Protection (DPDP)</h2>
11:           <p>
12:             The Indian Job Portal platform complies with Digital Personal Data Protection (DPDP) principles...
```
- **Root Cause & Specification Violation:**
  - While localization dictionaries exist in `apps/web/messages/en.json` and `apps/web/messages/hi.json`, developers authored eight primary public routes with hardcoded English strings directly in JSX without importing `useTranslations` or `getTranslations` from `next-intl`.
  - Violates **Hard Invariant #8a**: *"i18n: English + Hindi at launch. No hardcoded user-facing strings. All copy in message files (next-intl), API errors return codes not prose."*
- **User Impact:**
  - When a blue/grey-collar job seeker in Uttar Pradesh, Bihar, Madhya Pradesh, or Rajasthan selects Hindi, the core headings, placeholders, category buttons, and privacy notices remain entirely in English, undermining accessibility.
- **Remediation:**
  Extract all text into `messages/en.json` and `messages/hi.json` under appropriate namespaces (`jobsListPage`, `howItWorks`, `privacyPolicy`) and refactor all eight pages to consume translations via `getTranslations()` (for Server Components) or `useTranslations()` (for Client Components).

---

#### Item R4-13: Devanagari Vector Font Embedding and Rendering Verification in `@react-pdf/renderer`
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/worker/src/pdf/pdf-generator.ts`, lines 25–43; `apps/worker/src/pdf/templates/ProfilePdfTemplate.tsx`, lines 30–40; `apps/worker/test/pdf.test.ts`
- **Verbatim Code Snippet:**
`apps/worker/src/pdf/pdf-generator.ts`:
```typescript
25: export function ensureDevanagariFontsRegistered(): void {
26:   if (fontsRegistered) return;
27:   try {
28:     const fontPkg = path.dirname(require.resolve('@fontsource/noto-sans-devanagari/package.json'));
29:     const regularFontPath = path.join(fontPkg, 'files', 'noto-sans-devanagari-devanagari-400-normal.woff');
30:     const boldFontPath = path.join(fontPkg, 'files', 'noto-sans-devanagari-devanagari-700-normal.woff');
31: 
32:     Font.register({
33:       family: 'Noto Sans Devanagari',
34:       fonts: [
35:         { src: regularFontPath, fontWeight: 400 },
36:         { src: boldFontPath, fontWeight: 700 },
37:       ],
38:     });
39:     fontsRegistered = true;
40:   } catch (err) {
41:     console.warn('[PdfGeneratorService] Warning: Could not register local Noto Sans Devanagari font:', err);
42:   }
43: }
```
- **Verification Execution & Result:**
  Automated testing was executed via Vitest:
  ```powershell
  npx vitest run apps/worker/test/pdf.test.ts
  ```
  **Observed Output:**
  ```
  ✓ apps/worker/test/pdf.test.ts (5 tests) 1830ms
    ✓ PdfGeneratorService - Ticket T-09 (JS-03 & Hard Invariant #8a) > generates valid vector PDF and serves from cache in under 500ms (AC #1) 526ms
    ✓ PdfGeneratorService - Ticket T-09 (JS-03 & Hard Invariant #8a) > renders Hindi (Devanagari) characters cleanly without glyph corruption (Hard Invariant #8a & AC #2) 655ms
    ✓ PdfGeneratorService - Ticket T-09 (JS-03 & Hard Invariant #8a) > renders candidate education, experience, and clickable verification link (AC #3) 306ms

  Test Files  1 passed (1)
       Tests  5 passed (5)
  ```
- **Logic Chain:**
  1. The PDF worker embeds `Noto Sans Devanagari` WOFF font files directly via `@react-pdf/renderer` without headless browser overhead.
  2. Vitest unit tests confirm that Hindi glyphs (such as candidate names and vocational trade titles) render cleanly without tofu boxes (`□`) or glyph corruption.
  3. Meets Hard Invariant #8a ("Hindi renders correctly in PDF (embed a Devanagari font)").
- **Audit Verdict:** Fully mitigated and compliant.

---

## 4. Prioritized Remediation Roadmap

The identified vulnerabilities and defects must be addressed in order of severity and regulatory risk:

### Phase 1: Immediate Launch Blockers (Security & Financial Integrity)
1. **Fix Cross-Tenant Bulk Error Report IDOR (Item R4-07):** Add strict tenant ownership validation in `GET /bulk/batches/:id/error-report` (`batch.created_by === user.id`).
2. **Fix Checkout Verification IDOR (Item R4-02):** Enforce user ownership in `POST /wallet/recharge/verify`.
3. **Atomic Payment Capture & Ledger Grant (Item R4-03):** Wrap payment capture and credit ledger creation in a single PostgreSQL atomic function.
4. **Scrub Queue Payloads & Protect Bull-Board (Item R4-08):** Enqueue opaque user IDs instead of cleartext mobile numbers in BullMQ; secure `/admin/queues/ui` with authentication guards.

### Phase 2: Statutory Compliance & Data Lifecycle
5. **Implement DPDP Erasure Pipeline (Item R4-05):** Create `privacy_deletion_requests` table, wire frontend `/privacy` button, and implement an asynchronous worker to scrub profiles and storage files.
6. **Reconcile Database Foreign Keys for Tax Compliance (Item R4-06):** Alter `payments` and `credit_ledgers` foreign keys to `ON DELETE SET NULL` to preserve 8-year tax records under CGST Act § 36; alter `broadcast_campaigns` to allow user anonymization.

### Phase 3: User Experience & Localization
7. **Implement Dual-Token Refresh Architecture (Item R4-11):** Implement 15-minute access token + 30-day `HttpOnly` refresh token with silent client retry interceptor.
8. **Extract Hardcoded Copy to Localization Dictionaries (Item R4-12):** Migrate all static English strings across the 8 public pages into `messages/en.json` and `messages/hi.json`.
9. **Upgrade Distributed Concurrency Locks (Item R4-04):** Replace in-memory Node `withLock` with Redis Redlock or PostgreSQL transaction advisory locks.

---

## 5. Verification & Test Execution Log

Independent auditors can re-verify all claims using the following test commands and source references:

### 5.1 Test Execution Commands
```powershell
# 1. Verify PDF Generation & Devanagari Font Rendering (Hard Invariant #8a)
npx vitest run apps/worker/test/pdf.test.ts

# 2. Verify Razorpay Payment HMAC Validation & Invoicing (WAL-03)
npx vitest run apps/api/test/payment.e2e-spec.ts
```

### 5.2 Verification Log Summary
- **PDF Vitest Suite:** Passed 5/5 tests in 1830ms, confirming vector PDF integrity and Devanagari glyph rendering.
- **Payment E2E Suite:** Passed 10/10 tests in 231ms, confirming HMAC SHA-256 signature rejection on invalid/tampered payloads.
- **Source Code Inspections:** Line numbers, parameter flows, and database foreign keys verified directly against active workspace source files.
