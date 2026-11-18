# AUTH v2.1 blocked gates

Local drafts only; no cutover, hosted apply, push or real notification.

2026-11-18 continuation: 1,105 full-suite tests pass with 12 documented conditional skips; build/startup/native proofs pass. This does not waive the gates below. [Morning handoff](MORNING_HANDOFF.md), [separate critical review branch/decisions](CRITICAL_HUMAN_REVIEW.md).

## S4

Google native metadata and automatic-linking proof: NOT RUN. Pinned GoTrue Google provider hardcodes accounts.google.com and ignores configurable external URL; a fabricated provider=google Auth row would not test OAuth. Reviewed OAuth fixture and linking-denial evidence are required before enablement. [Pinned source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/provider/google.go).

Real Turnstile token single-use, production hostname/action and provider-direct device/IP admission: NOT RUN. Dummy always-pass keys cannot prove these. Missing-token and resend denial alone do not close the hard invariant.

MSG91 step 2.5 contract mismatch: its OTP API requires the provider's OTP template_id, which is distinct from a numeric DLT registration id. DLT templates must be mapped to their provider template/flow. No documented OTP idempotency key guarantee has been established. Do not invent a header or substitute a numeric DLT id as the API template. The legacy sender remains unchanged, new hook remains unregistered; real send is prohibited. Resolve approved EN/HI provider-to-DLT mapping and safe retry/ambiguity policy before implementing that adapter. [MSG91 SendOTP](https://docs.msg91.com/en/otp/sendotp), [DLT mapping](https://msg91.com/help/dlt-registration-in-india/map-approved-dlt-template-id-with-respective-flow-id-on-msg91-panel).

## S6

Not started: step 2 and step 3 must pass first. Separate-attempt-audit and literal all-endpoints link requirements also conflict with the existing contract; see SCHEMA_MISMATCH.md. HTTP copied-credential ban/disable proof and full new opaque-session workspace/application flows are NOT RUN. Existing adapter ban and legacy workspace regressions do not substitute for them.

## F0-d and native advisor findings

Resolved locally on 2026-11-18 under explicit user authorisation: canonical payment receipts, trusted purpose/target binding and atomic database settlement close the payment-reference replay and partial-grant crash failures. Original attacker assertions remain intact. The selected 382-test run includes these cases. Independent human payment/migration/RLS review and legacy receipt reconciliation remain release gates; payment enablement and real gateway capture are NOT RUN. See PAYMENT_TRANSACTION_PLAN.md and REVIEW_PACKET.md.

Read-only native db advisors ran successfully with fail-on=none and reported three existing ERROR findings for the public owner-privilege projection views. This is not clean signoff. The original public-discovery design deliberately withholds base-table access; review its column-grant/RLS/projection contract before changing view semantics. No view was changed.
