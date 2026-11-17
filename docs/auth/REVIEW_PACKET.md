# AUTH v2.1 follow-up review packet

2026-11-17. **NOT MERGEABLE.** F0-d payment reuse and partial-grant crash regressions remain failing. S4 still lacks the reviewed MSG91 transport contract and production single-use/device/IP proof. S6 was **not started**, following the supplied dependency gate. Three pre-existing public owner-privilege views remain advisor ERROR findings. These are local review drafts; staging and the persistent dev DB were not modified.

## Database and original checkouts

The persistent target is actual Docker Supabase `indian-job-portal-local`, database `127.0.0.1:54322/postgres`, API 54321, volume/container `supabase_db_indian-job-portal-local`. Native `postgres` is not a superuser; it has BYPASSRLS. The previous persistent-target synthetic fixture writes and exact-ID cleanup were a process violation. They are not accepted as disposable verification.

Read-only counts remain **251,250 application users / one Auth user**. Exactly 249,950 rows have source `Govt ITI Bhopal`, consistent with five 49,990-accepted import fixtures; this does not prove all data synthetic. The other **1,300 rows and Auth user remain unclassified**. [PII-free inventory](evidence/review/UNEXPLAINED-DATA.md), [row fingerprints](evidence/review/unexplained-data.json), [final read-only counts](evidence/followup/final/dev-counts-readonly.json). Human chose reviewed backup/reset planning; reset remains pending until backup and ownership are confirmed. Nothing was deleted or reset.

The original main checkout remains `feat/public-slugs-id-02` / `00a5804`; original dirty remediation remains `feat/bulk-onboarding` / `65c5f4c`. Work is in remediation `.scratch/auth-review`, on stacked local branches. [Preserved checkout snapshot](evidence/followup/final/preserved-checkouts.json). The prerequisite has 63 files and 1,167 changed production-source lines: [review index](PREREQUISITE-REVIEW.md), [proposed split](PREREQUISITE-SPLIT.md). A git review note was added; no split or history rewrite occurred.

## Final verification

Every run created fresh Supabase/Redis projects, replayed canonical migrations, and asserted **users=0 / auth=0 before fixtures**. Current replay is 38 migrations. Supabase CLI 3.1.0 and Docker Desktop 29.9.2 were available; CLI was pinned rather than upgraded. Test JSON files are isolated per run; the network/marker guards exclude persistent and hosted targets.

| Check | Observed result / evidence |
| --- | --- |
| Final selected auth, workspace/application, tenant isolation, SQL races, session, OTP, privacy, sponsorship-expiry and feature-flag tests | **344 PASS / 35 files**, including both 50k-row imports. [Output](evidence/followup/final/combined.txt) |
| Native M1/M2 pgTAP | **12 PASS / 2 files**. [Output](evidence/followup/final/combined-pgtap.txt) |
| Native GoTrue credential/claim/ban adapter checks | **2 PASS**. [Output](evidence/followup/final/combined-native-auth.txt). This is not an HTTP-guard ban test. |
| Real phone/email OTP, signed fake-delivery hook and CAPTCHA-enabled chains | **6 PASS** on `jc-auth-test-71c56434`; failure-mode case deliberately runs on another stack. [Output](evidence/followup/clock/green-native-otp-native-auth.txt) |
| Native CAPTCHA validation failure | **1 PASS**, six other native cases excluded by explicit test-name selection; public always-fail test secret. [Output](evidence/followup/S4-native/green-captcha-failure-mode-native-auth.txt) |
| F0-d attacker/legacy/native expiry/default flag checks | **30 PASS / 2 FAIL**. Payment-reference reuse and partial grant after write crash remain enabled failing assertions. [Output](evidence/followup/F0-d/verified-partial-two-open-gates.txt) |
| Generated types, catalog, security drill, HTTP smoke | Freshness/catalog/drill PASS; **22/22 HTTP smoke PASS**. [Types](evidence/followup/final/combined-types-check.txt), [catalog](evidence/followup/final/combined-catalog.txt), [drill](evidence/followup/final/combined-security-drill.txt), [smoke](evidence/followup/final/combined-http-smoke.txt) |
| Native security advisors | Command ran, **3 existing ERROR findings** for `public_jobs`, `public_business_profiles`, `public_institution_profiles`. `--fail-on none` collected results, not clean signoff. [Output](evidence/followup/F0-e/advisors-live.txt) |
| Offline target/filesystem/CLI/CI guards | **16 PASS**. [Output](evidence/followup/final/offline-guards.txt) |
| Migration mirrors and historical assertions | Mirrors byte-identical. Historical 17 reported cases remain unchanged; the entire historical test file has no diff since `b19f7ee`. [Sync](evidence/followup/final/migration-sync.txt), [integrity](evidence/followup/final/historical-integrity.json), [original extraction](evidence/review/historical-assertions.json), [mutex-only diff](evidence/review/historical-mutex-only.patch) |
| Per-code-commit gates | Six-package typecheck and lint PASS before every source commit. Source/evidence receipts are separate under `evidence/followup/<item>/`. The render fixture's NodeNext import error was corrected before commit; no casts or assertions were weakened. |
| Cleanup | **Zero remaining disposable test containers**; developer Supabase/Redis still present. [Receipt](evidence/followup/final/cleanup.json) |

The 344-test command is an explicit selected suite, not a full-suite green claim. It does not include the separately retained two financial contract failures. Broad CI verification still includes their test file and must fail until fixed. GitHub Actions, remote container builds, hosted owner/OAuth tests and deployment were NOT RUN. CI deployment placeholders explicitly fail. No commit was pushed; no merge, hosted migration, real SMS/email, legal-text change or deployment occurred.

## Follow-up stack and plan mapping

Each row is reviewed against its direct parent; source and evidence are separate commits. The approved follow-up starts from `codex/auth-07-sms-hook` / `119e001`.

| Follow-up item / execution slice | Local branch | Source / evidence commit | Status |
| --- | --- | --- | --- |
| Step 0 inventory/prerequisite review | `codex/auth-08-housekeeping` | `8bb71e8` / `bfc818b` | Read-only inventory PASS; reset/split pending |
| Step 1.1 / S3-M2 coverage and provider-lock race | `codex/auth-09-m2-coverage` | `42d4c09` / `942a1fc` | 75 SQL tests PASS; separate audit-wrapper mismatch |
| Step 1.2 / S1-M1 + S3-M2 canonical migrations | `codex/auth-10-migrations` | `7a48946` / `5c9ed46` | Native replay and nullable-phone compatibility PASS |
| Step 1.3 / S0 disposable CI + generated types | `codex/auth-11-disposable-ci` | `b3bd90e`, `1caab37` / `bba8c44` | Local exact commands PASS; remote CI NOT RUN |
| Step 2.2 / S4 SMS HMAC quotas/spend | `codex/auth-12-sms-budgets` | `083eee0` / `83a8a19` | 19 hook/budget tests PASS; alert delivery pending |
| Steps 2.1/2.3/2.4 / S4 real native OTP | `codex/auth-13-native-otp` | `b126148` / `aed1b5b` | Native proof retained; S4 overall PARTIAL |
| S5/provider-time follow-up from native failure | `codex/auth-14-provider-clock` | `418c785` / `893649c` | 53 provider/session tests + native OTP PASS |
| Step 3.1 / F0-d payment drafts | `codex/auth-15-sponsorship-boundaries` | `e5e56b2` / `1c6ee9d` | Amount/UUID/expiry PASS; replay/atomicity FAIL |
| Step 3.2 / F0-e rendered identity | `codex/auth-16-opaque-render` | `6f39aae` / `f0aff82` | 25 focused render/API/privacy tests PASS; browser QR/toasts NOT RUN |
| Step 3.3 + final deliverable | `codex/auth-17-review-packet` | This documentation/evidence unit; see final receipt | Review packet only |
| Step 4 / S6 claim API and HTTP guards | No implementation branch | None | **NOT STARTED: dependency gates fail** |

Earlier foundations are preserved: prerequisite `e91f5e2`, disposable infrastructure `0396c24`, contacts `1e326f4`, identity claims `b19f7ee`, provider `46503b3`, encrypted sessions `24a6455`, test safety `72cbaf4`, prior packet `d5708af`, hook foundation `119e001`. The prerequisite needs its own review; none is merge-ready merely because tests pass.

## M2, CAPTCHA, IP and server-held sessions

[M2 coverage matrix](evidence/review/M2-COVERAGE.md) has zero MISSING among the 16 SQL contracts. Case 14's literal separate attempt wrapper remains **NOT RUN / SCHEMA_MISMATCH**: the reviewed RPC commits expected-rejection audit in its transaction and rolls back successful link/audit together. No arbitrary-reason audit endpoint or double-audit path was invented. Actual native metadata is `phone` / `[phone]` and `email` / `[email]`; Google is NOT RUN. [Conflicts](SCHEMA_MISMATCH.md).

With native CAPTCHA disabled, direct missing/invalid-token requests delivered one fake SMS and resend delivered a second: meaningful red evidence. With CAPTCHA enabled, missing-token and resend-without-token requests were rejected before extra delivery. Cloudflare's public always-pass secret accepted a bogus nonempty string; separate always-fail-secret verification rejected the invalid token with zero sends. Dummy secrets do not prove production hostname/action validation or actual single-use redemption. [Native findings](S4_NATIVE_OTP.md), [PII-free observations](evidence/S4-native/observations.json). No admin-confirmed phone/email seed was used for the OTP chain.

GoTrue audit `ip_address` was **blank for both direct and controlled API calls**. The local API used socket IP 127.0.0.1 and ignored a forged forwarding header. This proves no real browser-IP propagation or native per-IP enforcement. [IP evidence](evidence/S4-ip/README.md). Hard-invariant BFF device/IP admission remains required. Signed hook payloads do not contain trusted browser IP/device/Turnstile proof.

The disabled hook atomically reserves keyed-HMAC phone quotas/cooldown, replay IDs and estimated daily spend, and opens a Redis-backed breaker on exhaustion; Redis failures deny sends. Alerts are durable PII-free records, with external delivery still pending. MSG91's provider template ID differs from numeric DLT registration ID; no documented OTP idempotency contract was established. The literal adapter item is stopped pending reviewed EN/HI mappings and safe retry/ambiguity policy. [Blocked items](BLOCKED.md).

The provider time correction permits at most **two seconds of issue-time skew**, enforces signed `exp-iat <=900s`, and gives expired tokens no grace. The original store 0/901-second rejection tests remain unchanged for inputs without verified issue time. The 7-day ordinary and 12-hour admin/MSME deadlines are unchanged. [Policy](PROVIDER_TIME_POLICY.md). Opaque HttpOnly cookie direction and encrypted server Redis credentials remain the approved draft; browser lifecycle, durable provider logout/session checks, TLS/ACL/key rotation and API integration are incomplete. [ADR](../adr/0002-server-held-provider-sessions.md) explicitly fails closed on protected admin/payment/wallet routes.

## F0 and human gates

[F0 gate matrix](F0-REVIEW-GATES.md) records legacy OTP, privileged RPC and direct-ledger denials; sponsorship remains PARTIAL, rendered QR identity is locally verified, and three public-view advisor findings remain open. Amount/expiry checks do not substitute for canonical payment consumption or a transaction. The SQL expiry fix was also tested through the real service-role application RPC. [Payment conflict and retained failures](F0_SPONSORSHIP.md), [render scope/limits](F0_OPAQUE_RENDER.md).

**PENDING-HUMAN:** reviewed dev backup/reset ownership; prerequisite split approval; consent text; independent second reviewer; Supabase plan upgrade; hosted function-owner feasibility; hosted OAuth automatic-linking denial; MSG91 provider/DLT mappings and retry contract; payment-purpose/canonical-consumption/transaction and reconciliation design; public projection-view access/RLS design. No automatic linking by matching email is presumed safe.

Google, nullable-phone CSV admission and the new auth cutover remain disabled. General email OTP login and orphan deletion thresholds remain pending; email OTP here is a disposable provider-proof fixture only. S6 JWT/claim endpoint, incomplete-onboarding guards, copied-credential HTTP ban/disable denial, claim timing/rate limits, import verified-email gates and new opaque-session workspace/application E2E remain **NOT RUN**. Existing authenticated flows validate the current pipeline, not the new cutover. Stop here; no deployment steps.
