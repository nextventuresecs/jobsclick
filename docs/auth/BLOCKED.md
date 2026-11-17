# AUTH v2.1 blocked gates

Local drafts only; no cutover, hosted apply, push or real notification.

## S4

Google native metadata and automatic-linking proof: NOT RUN. Pinned GoTrue Google provider hardcodes accounts.google.com and ignores configurable external URL; a fabricated provider=google Auth row would not test OAuth. Reviewed OAuth fixture and linking-denial evidence are required before enablement. [Pinned source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/provider/google.go).

Real Turnstile token single-use, production hostname/action and provider-direct device/IP admission: NOT RUN. Dummy always-pass keys cannot prove these. Missing-token and resend denial alone do not close the hard invariant.

MSG91 step 2.5 contract mismatch: its OTP API requires the provider's OTP template_id, which is distinct from a numeric DLT registration id. DLT templates must be mapped to their provider template/flow. No documented OTP idempotency key guarantee has been established. Do not invent a header or substitute a numeric DLT id as the API template. The legacy sender remains unchanged, new hook remains unregistered; real send is prohibited. Resolve approved EN/HI provider-to-DLT mapping and safe retry/ambiguity policy before implementing that adapter. [MSG91 SendOTP](https://docs.msg91.com/en/otp/sendotp), [DLT mapping](https://msg91.com/help/dlt-registration-in-india/map-approved-dlt-template-id-with-respective-flow-id-on-msg91-panel).

## S6

Not started: step 2 and step 3 must pass first. Separate-attempt-audit and literal all-endpoints link requirements also conflict with the existing contract; see SCHEMA_MISMATCH.md. HTTP copied-credential ban/disable proof and full new opaque-session workspace/application flows are NOT RUN. Existing adapter ban and legacy workspace regressions do not substitute for them.

## F0-d and native advisor findings

Payment reference replay and partial grant after an injected write crash remain two active failing tests. The schema has no canonical payment consumption/purpose/transaction contract; follow the stop-on-mismatch instruction in SCHEMA_MISMATCH.md. The native expiry RPC and independent amount/membership/expiry checks pass but do not close that gate.

Read-only native db advisors ran successfully with fail-on=none and reported three existing ERROR findings for the public owner-privilege projection views. This is not clean signoff. The original public-discovery design deliberately withholds base-table access; review its column-grant/RLS/projection contract before changing view semantics. No view was changed.
