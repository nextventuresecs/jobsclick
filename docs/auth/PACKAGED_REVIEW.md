# AUTH v2.1 packaged review

2026-11-18. LOCAL VERIFIED; **not approved for merge, apply or cutover**. Initial remote CI ran. It passed build/auth-migration/DB gates and exposed a startup-probe port collision and delayed mailbox fixture; deterministic local reds and green fixes are retained. Remote rerun is pending. S6 is NOT STARTED. Staging, provider settings and persistent data were not targeted.

## Review stack

Base: codex/review-remediation-base / e91f5e285880dbb0656f2a54233adaf40a19bfbe. This preserves the earlier 63-file remediation prerequisite; it still needs human review and is not hidden inside an auth approval. Original source/history: codex/auth-v21-history / 43b69c5b9722a335c8b882e834a95bccf07442fe. Old branches remain untouched.

| Unit | Branch | Source snapshot | Gate |
| --- | --- | --- | --- |
| 1 | `codex/review-auth-01-test-infra` | `6ddf667` | Typecheck/lint PASS |
| 2 | `codex/review-auth-02-contacts-m1-m2` | `49f315a` | Typecheck/lint PASS |
| 3 | `codex/review-auth-03-provider-sessions` | `ec17123` | Typecheck/lint PASS |
| 4 | `codex/review-auth-04-sms-budgets` | `9d3aa44` | Typecheck/lint PASS |
| 5 | `codex/review-auth-05-payments-off` | `06640ec` | Typecheck/lint PASS |
| 6 | `codex/review-auth-06-public-projections` | `f4bbd0a` | Typecheck/lint PASS |
| Separate i18n | `codex/review-i18n-hindi-routing` | `4362798` | Typecheck/lint PASS |
| CI follow-up | codex/review-auth-08-native-ci | 441c11d | 25 offline guards; six-package typecheck/lint PASS |

Six auth groups separate infrastructure, contacts/M1/M2, provider/sessions, SMS/budgets, payments OFF, and public projections. Hindi routing/shared middleware remains a separate i18n PR. Cold/native CI fixes are a small dependent follow-up; S6 may extend that dependent review unit after its gate. No old history was rewritten. Each unit has a real commit and source gate; complete runtime verification applies to the final stack, not a claim that every intermediate draft has all later migrations. All review units need a second reviewer or written human sign-off.

## Fresh verification

- Independent pnpm install; workspace links resolve to this worktree. Pinned Node 24.22.3. All 217 copied files match the prior complete source snapshot byte-for-byte at 4362798; 72 pre-existing branch refs are preserved. The later four-file CI change is separately red/green verified and does not change application runtime code.
- Fresh production build PASS, no provider/JWT secrets supplied. Full suite: **1,160 PASS / 14 conditional skips**, zero failures. Includes both 50k imports, isolation, existing workspace/apply and financial regressions.
- Native DB: **120 PASS**, plus **12 pgTAP + 2 actual Auth PASS**. Type freshness, catalog, security drill, 25 HTTP smoke cases PASS. Native advisors: zero findings; injected ERROR still makes the real CLI fail.
- Native fallback: **1 PASS** on its own fresh stack. Separate hook run: **13 hook + 12 pgTAP + 7 real OTP PASS / 1 mode skip**. Separate rejection run: **13 hook + 12 pgTAP + 1 invalid-CAPTCHA PASS / 7 nonselected skips**. Fake delivery/local mail only.
- First combined fallback/native-OTP attempt failed the second phase's zero-row precondition (one user/Auth fixture). Failure retained. Corrected orchestration creates a new marked Supabase/Redis stack per phase and disposes it. No assertion was weakened and no fixture ledger/user rows were manually deleted.
- Exact auth-migration CI selection also runs on a separate disposable stack; retained output records its count and native phases. Cold CI jobs now explicitly build shared dist exports. Native OTP CI uses independent invocations. Remote Linux/container results remain pending at this checkpoint.
- Historical 17-case identity file is byte-identical to b19f7ee; all seven original financial attacker bodies are identical to 1d6388c; the 1,000-request OTP file is unchanged. Source/integrity and per-unit gate receipts are under evidence/packaged-v1.

## Deliberate privacy/assertion changes requiring sign-off

See FOLLOWUP_2_REVIEW.md for every A/C/E contract change. auth-27 changed stale visible phone suffix/email prefix/domain expectations to complete masks in components.test.ts, ticket-t10-workspace-wiring.test.ts and ticket-t19-placement-dashboard.test.ts, adding suffix/domain denials; production masking was already correct. Option A changes anon/authenticated projection reads from 200 to exact 401/403 code 42501, removes client SELECT grants, retains service columns and adds invoker/column snapshots. Public HTTP cache becomes no-store, missing-resource prose becomes a code, explicit owned published fixtures replace invented sample visibility, and institution cms_data leaves the public view. Search/ranking/ownership/application assertions remain. C changes queued acceptance/unknown transport and daily hard lockouts to approved bounded cooldowns with explicit channel offers; replay/call-count/spend/privacy assertions remain. E keeps HTTP 503, replaces prose with an exact safe dependency code/request ID/no diagnostic, scopes real fixture counts to their source while retaining exact assertions, and explicitly publishes the positive QR fixture. Competing test files are bounded at two; within-file attacks and production timeouts are unchanged. Node's setup count becomes four because a fourth job is added; every job still uses the same exact pin. These are recorded contract/config changes, not silent assertion relaxations.

## Release limits

RLS/auth/SQL/payments remain human-reviewed drafts. No hosted apply, real messages/payment, merge or deployment. Provider lifetime declaration is validated and observed verified lifetimes latch readiness failure; hosted expiry itself still requires owner verification (no runtime management secret was added). Google OAuth/linking NOT RUN and disabled; nullable-phone CSV admission and general email OTP login stay disabled/pending. Real Turnstile hostname/action/single-use, gateway transport, Redis TLS/ACL/key rotation/queue operations and later activation/scoped-RLS slices remain release gates. Orphan deletion thresholds remain pending; no deletion was added. Persistent 1,300 unclassified rows/Auth user require owner-reviewed backup before any reset.

## Old-to-new mapping

File ownership is explicit; shared nullable-profile changes occur in contacts and final projection units. Raw historical outputs remain on the preserved history branch and are not silently rewritten.

| Old branch | Preserved head | New review branch(es) |
| --- | --- | --- |
| `codex/auth-00-disposable-tests` | `0396c24` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-03-provider-sessions`, `codex/review-auth-06-public-projections` |
| `codex/auth-01-contacts` | `1e326f4` | `codex/review-auth-02-contacts-m1-m2` |
| `codex/auth-02-identity-claims` | `b19f7ee` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-03-provider` | `46503b3` | `codex/review-auth-01-test-infra`, `codex/review-auth-03-provider-sessions` |
| `codex/auth-04-server-sessions` | `24a6455` | `codex/review-auth-03-provider-sessions`, `codex/review-auth-06-public-projections` |
| `codex/auth-05-test-safety` | `72cbaf4` | `codex/review-auth-01-test-infra`, `codex/review-auth-06-public-projections` |
| `codex/auth-06-review-packet` | `d5708af` | `codex/review-auth-01-test-infra`, `codex/review-auth-06-public-projections` |
| `codex/auth-07-sms-hook` | `119e001` | `codex/review-auth-01-test-infra`, `codex/review-auth-04-sms-budgets`, `codex/review-auth-06-public-projections` |
| `codex/auth-08-housekeeping` | `bfc818b` | `codex/review-auth-06-public-projections` |
| `codex/auth-09-m2-coverage` | `942a1fc` | `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-10-migrations` | `5c9ed46` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-11-disposable-ci` | `bba8c44` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-03-provider-sessions`, `codex/review-auth-06-public-projections` |
| `codex/auth-12-sms-budgets` | `83a8a19` | `codex/review-auth-04-sms-budgets`, `codex/review-auth-06-public-projections` |
| `codex/auth-13-native-otp` | `aed1b5b` | `codex/review-auth-01-test-infra`, `codex/review-auth-04-sms-budgets`, `codex/review-auth-06-public-projections` |
| `codex/auth-14-provider-clock` | `893649c` | `codex/review-auth-03-provider-sessions`, `codex/review-auth-06-public-projections` |
| `codex/auth-15-sponsorship-boundaries` | `1c6ee9d` | `codex/review-auth-05-payments-off`, `codex/review-auth-06-public-projections` |
| `codex/auth-16-opaque-render` | `f0aff82` | `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-17-review-packet` | `1d6388c` | `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-18-payment-transactions` | `5dec126` | `codex/review-auth-05-payments-off`, `codex/review-auth-06-public-projections` |
| `codex/auth-19-capture-settlement` | `3fb36cd` | `codex/review-auth-05-payments-off` |
| `codex/auth-20-payment-types` | `0e74ccb` | `codex/review-auth-02-contacts-m1-m2` |
| `codex/auth-21-payment-api` | `26b66cd` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-05-payments-off` |
| `codex/auth-22-payment-services` | `8a4b75b` | `codex/review-auth-05-payments-off` |
| `codex/auth-23-payment-boundaries` | `e1f64db` | `codex/review-auth-05-payments-off`, `codex/review-auth-06-public-projections` |
| `codex/auth-24-payment-review` | `4bd8920` | `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-25-test-environment` | `26d7791` | `codex/review-auth-01-test-infra`, `codex/review-auth-06-public-projections` |
| `codex/auth-26-native-fixtures` | `98d411a` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-27-privacy-contracts` | `0637907` | `codex/review-auth-06-public-projections` |
| `codex/auth-28-hindi-routing-review` | `364990a` | `codex/review-i18n-hindi-routing` |
| `codex/auth-29-provider-revocation-review` | `e4b2724` | `codex/review-auth-03-provider-sessions`, `codex/review-auth-06-public-projections` |
| `codex/auth-30-ci-build-order` | `a932a4f` | `codex/review-auth-01-test-infra`, `codex/review-auth-06-public-projections` |
| `codex/auth-31-critical-review` | `cfd8faf` | `codex/review-auth-06-public-projections` |
| `codex/auth-32-morning-handoff` | `808e29f` | `codex/review-auth-06-public-projections` |
| `codex/auth-33-public-views` | `9e80f23` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-34-public-api` | `3837d09` | `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-05-payments-off`, `codex/review-auth-06-public-projections` |
| `codex/auth-35-node-runtime` | `f6534a7` | `codex/review-auth-01-test-infra`, `codex/review-auth-06-public-projections` |
| `codex/auth-36-lifetime-guard` | `22ab645` | `codex/review-auth-03-provider-sessions`, `codex/review-auth-06-public-projections` |
| `codex/auth-37-hook-admission` | `a170083` | `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-04-sms-budgets`, `codex/review-auth-06-public-projections` |
| `codex/auth-38-otp-fallback` | `888e843` | `codex/review-auth-01-test-infra`, `codex/review-auth-04-sms-budgets`, `codex/review-auth-06-public-projections` |
| `codex/auth-39-public-company-links` | `167c083` | `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-06-public-projections` |
| `codex/auth-40-claim-observability` | `f2855d4` | `codex/review-auth-01-test-infra`, `codex/review-auth-02-contacts-m1-m2`, `codex/review-auth-03-provider-sessions`, `codex/review-auth-06-public-projections` |
| `codex/auth-41-review-ci` | `43b69c5` | `codex/review-auth-01-test-infra`, `codex/review-auth-06-public-projections` |

## Linux CI fixture follow-up

The complete i18n composition passed native OTP and DB jobs; its full suite failed because a random 40000�44999 startup-probe port collided with an occupied listener. The auth-only branch also retains the five existing Hindi assertions until composed with the separate i18n PR. Startup probes now request port 0 for atomic OS binding. A locally occupied IPv6 socket reproduced the exact EADDRINUSE failure before the fix; the first IPv4-only control did not reproduce it on Windows and is not claimed as a red. Mailbox availability beyond four seconds has a separate deterministic red; readiness is bounded at 15 seconds with abortable reads and still requires a real extracted OTP/provider verification. Original startup/OTP assertions are unchanged. Native observation files now move to phase-specific artifacts even after failure, preventing lost or stale evidence. Local checks: 22 focused PASS, 12 pgTAP PASS, 7 native OTP PASS / one mode skip, 26 offline guards PASS. No application runtime/auth behavior was changed by these fixture fixes.
