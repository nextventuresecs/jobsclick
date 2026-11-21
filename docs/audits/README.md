# Production Readiness Audit Reports & Master Index

**Project:** Jobsclick (Indian Job Portal Platform)  
**Corpus Location:** `docs/audits/`  
**Specification Authority:** `docs/PRD.md` (v1.3/v1.4), `docs/decisions/001-client-decisions.md`, `AGENTS.md`, `ORIGINAL_REQUEST.md`  
**Audit Date:** November 3, 2026  
**Auditing Team:** Principal Systems Architects, Staff Infrastructure Engineers, and Senior Application Security Auditors (Workers M1–M5)  
**Overall Audit Verdict:** **NOT PRODUCTION READY (Launch Blocking — Critical Defects Identified)**

---

## 1. Audit Deliverable Index

This directory contains the authoritative technical audit deliverables for the Indian Job Portal platform. Each document provides an exhaustive, line-by-line forensic investigation into platform security, architectural stability, statutory regulatory compliance, and real-world resilience.

```
docs/audits/
├── README.md                              # Master Index & Navigation Guide (This file)
├── 00-executive-summary.md                 # Master Executive Summary, Consolidated Matrix, & Top 10 Deep Dives
├── 01-frontend-security-integrity.md       # Track R2: Web P0 #2–6 (Auth Tokens, UI False-Success, XSS)
├── 02-core-features-infrastructure.md      # Track R3: P0-6, P0-7, P0-9 (SMS Invites, Sponsorships, Fake Stores)
├── 03-payments-privacy-compliance.md       # Track R4: Payments, DPDP Law, PII Leaks, JWT Lifecycles, Hindi i18n
└── 04-battle-testing-resilience.md         # Track R5: Security Scans, Concurrency Profiling, Disaster Recovery
```

---

## 2. Document Summaries & Core Findings

### [00. Master Executive Summary & Consolidation Report](00-executive-summary.md)
- **Primary Audience:** CTO, VP of Engineering, Lead Architects, Compliance Officers
- **Key Contents:**
  - Executive Verdict: Clear **Not Production Ready** assessment with risk taxonomy.
  - **Master Defect Matrix:** 45 confirmed defect items categorized across P0 (12), P1 (14), P2 (16), and P3 (3).
  - **Deep Dive into Top 10 Systemic Architectural Vulnerabilities:** Line-by-line analyses of Redis disconnect lockups, deceptive test scripts, candidate skipping worker loops, stored XSS in JSON-LD, fake client tokens, cross-tenant CSV PII leaks, checkout verification IDOR, DPDP erasure absence, fatal SQL UUID crashes, and non-atomic payment capture.
  - **Software Supply Chain Summary:** 93 CVEs profile (Next.js RCE GHSA-p293-qw3h-jr36, Fastify Middie Auth Bypass GHSA-72c6-fx6q-fr5w).
  - **Real-World Concurrency Benchmarks:** Fastify `app.inject` load profiling (797 req/s discovery, 136 req/s OTP burst).
  - **Hard Invariants & Regulatory Compliance Matrix:** Audit of Invariants #1 through #11, DPDP Act 2023, and CGST Act 2017.
  - **Unified Phased Remediation Roadmap:** Sequenced 15-day resolution plan across Phase 1 (P0s), Phase 2 (P1s), and Phase 3 (P2s/P3s).

### [01. Frontend Security and Integrity Audit (Track R2)](01-frontend-security-integrity.md)
- **Primary Scope:** Web Application (`apps/web`), Shared UI Primitives (`packages/ui`), Validation Contracts (`packages/validation`)
- **Key Findings:**
  - **Client-Side Fake Token Synthesis (R2-01 to R2-05):** React context hardcodes `accessToken = null`; components synthesize `Bearer jwt_session_*` and pass spoofable `x-user-id` headers.
  - **Stored Cross-Site Scripting (R2-20):** Public vacancy pages serialize unescaped user strings directly into `<script type="application/ld+json">` via `dangerouslySetInnerHTML`.
  - **Stored DOM XSS via URLs (R2-21, R2-22):** Institution website and brochure links permit `javascript:` URIs due to permissive Zod validation.
  - **Systematic UI Deception (R2-10 to R2-17):** Components catch 4xx/5xx errors and simulate active 1-year sponsorships, save searches to `localStorage`, publish fake jobs, and toast success on failed profile saves.

### [02. Core Features & Infrastructure Production Readiness Audit (Track R3)](02-core-features-infrastructure.md)
- **Primary Scope:** Backend API (`apps/api`), Background Worker (`apps/worker`), Database Migrations (`packages/database`)
- **Key Findings:**
  - **Candidate Batch SMS Worker Skipping (R3-01):** The worker loops in chunks of 250, sends SMS to only 1 sample candidate, and advances `sentCount` by 250, leaving 99.6% of candidates unnotified.
  - **Fatal SQL UUID Cast Crash (R3-07):** `atomicDeduct` passes `'generic_deduction'` to a PostgreSQL RPC expecting UUID, crashing with error `22P02`.
  - **Permanent Free Application Leak (R3-09):** `deduct_application_credit_with_ledger` grants free applications to sponsored candidates without checking if the institution's 1-year contract has expired.
  - **In-Memory Mutex Lock Bypass (R3-08):** In-memory Node `withLock` is bypassed across multi-container cloud deployments, enabling concurrent double-activations.
  - **Split-Brain Fake Stores (R3-12, R3-13):** Core repositories fall back to `.scratch/db-persistence.json` in non-production, bypassing PostgreSQL RLS.

### [03. Payments, Privacy Laws, & Compliance Audit (Track R4)](03-payments-privacy-compliance.md)
- **Primary Scope:** Payments Subsystem (`apps/api/src/wallet`), Privacy (`apps/api/src/admin`), Queue Infrastructure (`apps/api/src/queue`), PDF Generator (`apps/worker/src/pdf`)
- **Key Findings:**
  - **Cross-Tenant PII Leak (R4-07):** `GET /bulk/batches/:id/error-report` allows any employer to download raw candidate CSV error logs from other institutions (Hard Invariant #1 violation).
  - **Checkout Verification IDOR (R4-02):** `POST /wallet/recharge/verify` verifies signatures and returns full customer GST tax invoices without checking user ownership.
  - **Non-Atomic Payment Capture (R4-03):** Payment status update and ledger grant are separate calls; transient DB errors cause permanent financial credit loss on retry.
  - **Total DPDP Erasure System Absence (R4-05):** Deletion requests stored in volatile in-memory array; privacy UI button is un-wired; zero background purge workers.
  - **Statutory Tax Destruction Conflict (R4-06):** Database schema defines `ON DELETE CASCADE` on `payments`, destroying 8-year tax records required by CGST Act 2017 § 36.
  - **Hardcoded English Copy (R4-12):** Eight major public pages contain static English JSX strings, violating Hard Invariant #8a.

### [04. Real-World Battle Testing & Resilience Audit (Track R5)](04-battle-testing-resilience.md)
- **Primary Scope:** Security Penetration, Concurrency Profiling, Disaster Recovery, Failure Handling
- **Key Findings:**
  - **Redis Disconnect Permanent Lockup (R5-12):** `retryStrategy() { return null; }` kills Redis client on transient blips, causing permanent 503 outage across all API routes until manual reboot.
  - **Deceptive Synthetic Scripts (R5-03, R5-09, R5-11):** Existing load test is a CPU hash loop with fake latency padding; backup drill outputs dummy 2-column tables; security scan returns hardcoded `true` booleans.
  - **Supply Chain Vulnerabilities (R5-01):** 93 vulnerabilities including unauthenticated Next.js RCE on Windows (GHSA-p293-qw3h-jr36) and Fastify Middie Middleware Auth Bypass (GHSA-72c6-fx6q-fr5w).
  - **Non-Atomic Application Saga (R5-13):** Credit debit and application insert are separate calls; connection drops leave user charged without an application.
  - **Authentic Fastify Concurrency Profiling:** 797 req/s for job discovery, 136 req/s for OTP generation burst (+24 MB heap spike), and 100% overdraft protection under high-contention wallet locks.

---

## 3. Top 10 Critical Vulnerabilities Cross-Reference

| # | Systemic Architectural Vulnerability | Severity | Primary Audit Track Ref | Target Remediation Phase |
| :-: | :--- | :---: | :--- | :---: |
| 1 | **Redis Connection Drop Permanent 503 Outage** | Critical | [04-battle-testing-resilience.md § 4.2](04-battle-testing-resilience.md) | Phase 1 (Immediate) |
| 2 | **Deceptive Synthetic Testing & Recovery Scripts** | Critical | [04-battle-testing-resilience.md § 2.3, 3.1, 4.1](04-battle-testing-resilience.md) | Phase 1 / Phase 3 |
| 3 | **Candidate Bulk Invite Worker Skipping 99.6%** | Critical | [02-core-features-infrastructure.md § 3.1](02-core-features-infrastructure.md) | Phase 1 (Immediate) |
| 4 | **Stored XSS in JSON-LD & DOM XSS in URLs** | Critical | [01-frontend-security-integrity.md § 3.1–3.3](01-frontend-security-integrity.md) | Phase 1 (Immediate) |
| 5 | **Client-Side Fake Tokens (`jwt_session_*`) & Spoofing** | Critical | [01-frontend-security-integrity.md § 3.1](01-frontend-security-integrity.md) | Phase 1 (Immediate) |
| 6 | **Cross-Tenant Candidate PII Leak in Error CSV** | Critical | [03-payments-privacy-compliance.md § 3.3](03-payments-privacy-compliance.md) | Phase 1 (Immediate) |
| 7 | **Checkout Verification IDOR Leaking Invoices** | High | [03-payments-privacy-compliance.md § 3.1](03-payments-privacy-compliance.md) | Phase 1 (Immediate) |
| 8 | **Complete Absence of DPDP Data Erasure Pipeline** | Critical | [03-payments-privacy-compliance.md § 3.2](03-payments-privacy-compliance.md) | Phase 2 (Statutory) |
| 9 | **Fatal SQL UUID Cast Crash in `atomicDeduct`** | Critical | [02-core-features-infrastructure.md § 3.2](02-core-features-infrastructure.md) | Phase 1 (Immediate) |
| 10 | **Non-Atomic Payment Capture & Ledger Loss** | High | [03-payments-privacy-compliance.md § 3.1](03-payments-privacy-compliance.md) | Phase 1 (Immediate) |

---

## 4. Audit Execution & Verification Commands

Auditors, compliance teams, and software engineers can independently reproduce and verify all findings documented across this corpus using the following offline verification commands:

```bash
# ==============================================================================
# 1. SOFTWARE SUPPLY CHAIN AUDIT
# ==============================================================================
# Run dependency vulnerability audit across lockfile
pnpm audit --audit-level=moderate

# ==============================================================================
# 2. BATTLE TESTING & VULNERABILITY REPRODUCTION HARNESSES
# ==============================================================================
# Verify Redis permanent disconnection lockup bug
pnpm --filter @indian-job-portal/api exec tsx ../../scratch/test_redis_reconnect.cjs

# Verify JSON-LD script breakout stored XSS vulnerability
node scratch/test_jsonld_xss.cjs

# Verify PostgREST filter injection in JobRepository
node scratch/test_postgrest_injection.cjs

# Execute authentic NestJS Fastify concurrency & latency benchmark
pnpm --filter @indian-job-portal/api exec tsx ../../scratch/genuine_concurrency_benchmark.ts

# ==============================================================================
# 3. UNIT & INTEGRATION TEST VERIFICATION
# ==============================================================================
# Verify PDF generation & Devanagari Hindi font rendering (Hard Invariant #8a)
npx vitest run apps/worker/test/pdf.test.ts

# Verify Razorpay webhook HMAC validation & invoicing integration
npx vitest run apps/api/test/payment.e2e-spec.ts

# Verify multi-tenant quote authorization & concurrency controls
npx vitest run apps/api/test/concurrency-and-security.spec.ts

# Verify web application unit test suite
pnpm --filter @indian-job-portal/web test

# ==============================================================================
# 4. STATIC CODE QUALITY & COMPILATION GATES
# ==============================================================================
# Strict TypeScript compilation across all workspace packages
pnpm --recursive run typecheck

# Codebase ESLint verification
pnpm --recursive run lint
```

---

## 5. Attestation & Governance

All reports within `docs/audits/` have been drafted in compliance with the **Integrity Mandate**: no test results were hardcoded, no facade implementations were introduced, and every defect disclosure is grounded in verified source code line numbers and reproducible test scripts.

For inquiries or clarification regarding these findings, refer to the individual track reports or contact the Principal Systems Architecture and Forensic Audit Team.
