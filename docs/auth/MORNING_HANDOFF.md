# Morning handoff — 2026-11-18

Verified local continuation; **not merge/deployment approval**. Current branch: codex/auth-32-morning-handoff in remediation .scratch/auth-review. No S6 implementation or staging action. Critical work is separated on **codex/auth-31-critical-review** with [specific decisions, owners and acceptance gates](CRITICAL_HUMAN_REVIEW.md).

## Completed work

| Slice | Result |
| --- | --- |
| AUTH-05 disposable runner | Reproduced synthetic parent payment-secret leakage. Child processes now inherit only required OS/tool variables; unknown credentials, runtime injection, provider endpoints/flags and remote Docker environment overrides are excluded. Fresh fixture credentials are added after provisioning. Normal and native-OTP paths verified. Docker's saved default context is not changed by this policy. |
| Native contract fixtures | Removed writable hardcoded dev targets/keys from two user suites. Real DB/Redis concurrency assertions now run on marked per-run endpoints. Bootstrap dry-run uses one uniquely named child DB inside that throwaway cluster and proves zero schema/table writes. Stronger marker-refusal errors replace obsolete localhost-only messages. |
| Privacy assertions | Corrected stale expectations that demanded visible phone digits and email prefix/domain. Added explicit suffix/domain denial assertions. Production masking was already correct and was not changed; this is not a newly fixed production leak. |
| AUTH-07 Hindi routing | Restored /hi page rewrites, /en canonical redirects, query preservation, server-selected locale/cookie and EN/HI alternate links. Preserved identity stripping/origin checks/session gates, added localized API and ambiguous-path denials. Shared middleware remains an auth-review draft. |
| AUTH-06 native proof | Existing provider adapter denies copied unexpired credentials after real local/global GoTrue logout and deletion, preserving the other session after local logout. No fake red or new adapter implementation was invented. Opaque-store/API/BFF composition remains unregistered/pending. |
| CI ordering | Reproduced test-before-build defect. Verify job now builds production artifacts with synthetic public settings before full-suite startup assertions. Runtime unsafe-config denials stay intact; deployment placeholders still fail. |

## Verification and limits

| Check | Observed result |
| --- | --- |
| Initial broad red | **23 failed / 1,055 passed / 25 skipped**, 9 failing files; [retained baseline](evidence/followup/overnight/full-suite.txt). Includes fixture, stale privacy, routing and missing-build failures. |
| Corrected full repository command | **1,105 PASS / 12 SKIP**, 118 passing files + 3 skipped suites; no failures. Includes both 50k imports, financial attackers, workspace/application, privacy, API/RLS, frontend and all 6 production-startup cases. [Full result](evidence/followup/overnight/final-suite.txt). |
| Native SQL and Auth | **12 pgTAP PASS**, **2 native Auth PASS** after the broad run. [pgTAP](evidence/followup/overnight/final-suite-pgtap.txt), [Auth](evidence/followup/overnight/final-suite-native-auth.txt). |
| Hook and actual OTP | **19 hook/budget PASS**, another **12 pgTAP PASS**, **6 native OTP PASS / 1 mode-specific SKIP**; fake delivery only. [Hook](evidence/followup/overnight/native-otp.txt), [native OTP](evidence/followup/overnight/native-otp-native-auth.txt), [observations](evidence/followup/overnight/native-otp-observations.json). Dummy CAPTCHA does not prove production single-use/hostname/action. |
| Builds/startup | Production web build PASS; CI-equivalent **whole workspace production build PASS without JWT_SECRET**. All **6 startup/config-denial checks PASS** again against that artifact. [Web](evidence/followup/overnight/web-build.txt), [workspace](evidence/followup/overnight/workspace-build-no-jwt.txt), [startup](evidence/followup/overnight/startup-after-ci-build.txt). |
| Database tools | Generated 14-schema type freshness, catalog and security drill PASS; **22/22 HTTP smoke PASS**. [Types](evidence/followup/overnight/final-suite-types-check.txt), [catalog](evidence/followup/overnight/final-suite-catalog.txt), [drill](evidence/followup/overnight/final-suite-security-drill.txt), [smoke](evidence/followup/overnight/final-suite-http-smoke.txt). |
| Source gates/integrity | Six-package typecheck + lint zero errors before each code commit. **19 offline guards PASS**; all **41 migration mirrors identical**; historical 17 auth cases and original payment attacker file unchanged. [Guards](evidence/followup/overnight/offline-guards.txt), [migration sync](evidence/followup/overnight/migration-sync.txt), [auth integrity](evidence/followup/overnight/historical-integrity.json), [payment integrity](evidence/followup/overnight/payment-assertion-integrity.json). |
| Data and cleanup | **Zero disposable containers remain**. Persistent counts unchanged: 251,250 users / 1 Auth user; 1,300 application rows and the Auth user remain unclassified. Original main/remediation heads remain 00a5804 / 65c5f4c. [Cleanup](evidence/followup/overnight/cleanup.json), [read-only counts](evidence/followup/overnight/dev-counts-readonly.json), [checkout snapshot](evidence/followup/overnight/preserved-checkouts.json). |

The broad run's 12 skips are native OTP (7), native Auth (2) and opt-in worker cluster (3). Native Auth was run separately; six OTP cases were run separately. The OTP invalid-CAPTCHA failure-mode case requires its separate mode; earlier proof is retained in [the prior packet](REVIEW_PACKET.md), not claimed as a fresh run here. The three old worker-cluster fixtures remain NOT RUN and need ownership/Redis/invite-approval correction; do not enable their hardcoded persistent-port configuration.

All checks were local Windows/Node 24.18.1 with pinned Supabase CLI 3.1.0 and Docker Desktop. Remote Linux/Node 22 GitHub Actions, hosted owner/OAuth behavior, real Google, real gateway lifecycle, production ingress/CAPTCHA, browser navigation/QR/toast QA, and new provider-session workspace/application cutover are NOT RUN. Build deprecation/bundle warnings remain; no load/performance or enterprise-certification claim. Email provider "live" log strings in the broad output are from stubbed email tests, not actual delivery. An initial CI test-authoring escape error is retained separately from the intended build-order red evidence.

## Local review units

Review each branch against its direct parent; source and evidence commits are separate. No history rewrite or push.

| Unit | Local branch | Source / evidence | Status |
| --- | --- | --- | --- |
| Test child environment | `codex/auth-25-test-environment` | `d685082` / `26d7791` | Synthetic credential-leak red; OS allowlist, 18 guards PASS |
| Native fixture isolation | `codex/auth-26-native-fixtures` | `41b7085` / `98d411a` | 53 checks PASS; business assertions preserved |
| Full-mask test contracts | `codex/auth-27-privacy-contracts` | `88e81d4` / `0637907` | 33 checks PASS; production masking unchanged |
| AUTH-07 locale/auth boundaries | `codex/auth-28-hindi-routing-review` | `c621655` / `364990a` | Red-first routing/ambiguity; 47 checks PASS; auth review required |
| Native provider logout/deletion | `codex/auth-29-provider-revocation-review` | `118c09c` / `e4b2724` | 55 provider/store/native checks PASS; no provider implementation change |
| Production build before startup tests | `codex/auth-30-ci-build-order` | `59069f8` / `a932a4f` | 19 guards, workspace build without JWT and 6 startup cases PASS |
| Critical human decisions | `codex/auth-31-critical-review` | `6e420ec` / `cfd8faf` | Notes only; no critical configuration/SQL enabled |

The payment transaction units 18–23 remain verified local drafts, with unchanged attackers and no feature enablement. [Previous stack and payment runbook](REVIEW_PACKET.md).

## Morning work order

1. Read [critical review queue](CRITICAL_HUMAN_REVIEW.md), then inspect auth-28 middleware and auth-18–23 payment SQL as human-review-only changes. Approve or amend concrete contracts; do not enable flags solely because local tests pass.
2. Resolve public-view API/RLS direction, MSG91 mappings/retry, provider-direct IP/device/CAPTCHA admission, Google linking evidence, Redis operational/lifecycle design and the S6 audit/endpoint wording. Keep Google, nullable-phone CSV, general email login and payment enablement disabled. Orphan deletion thresholds remain unapproved; dry-run only.
3. Finish dependency-ready S4/S5 work, then start S6 with red-first HTTP copied-credential/status/onboarding/import-verification denials and authenticated opaque-session workspace/application E2E. Rebuild the worker-cluster fixtures as a separate test slice.
4. Confirm backup and ownership before a persistent dev reset; review the prerequisite split and obtain the independent second review. No reset, export or account deletion is authorised by this handoff.

Replay from the review checkout using the verify-job production build settings in [.github/workflows/ci.yml](../../.github/workflows/ci.yml): typecheck, lint, test:target-guard, build, then test -- --auth-contracts --db-tools. Startup checks require the built .next artifact. Never copy real credentials into these test settings or run fixtures against the developer/staging database.
