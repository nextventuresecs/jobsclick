# AUTH-01/03 S4 SMS hook draft

Disabled local draft; no active AuthModule, hosted configuration or MSG91 changes.

1. Verify exact raw-body Standard Webhooks signature and timestamp; unsigned/tampered/stale bodies send nothing. Use pinned standardwebhooks 1.0.0.
2. Validate India-only delivery destination and payload; ignore user-controlled metadata. Phone-change ambiguity is rejected. MFA support/denial is not proved and must be tested separately before exposure.
3. Atomically reserve one delivery in shared Redis, enforcing replay rejection, per-number cooldown/daily cap and global send cap. Require a short-lived server-created send permit, never a client field/header. Errors fail closed, ambiguous delivery is not retried/refunded.
4. Fake-delivery tests use a new Supabase/Redis project for every run. Verify actual GoTrue signatures/direct requests separately before S6; unit signatures are not that proof.

The hook lacks trusted browser IP/device/Turnstile context. A phone-scoped permit can bound costs but cannot cryptographically bind a provider request to the BFF: a concurrent direct request might consume a legitimate permit. Keep the new path disabled until native CAPTCHA, trusted ingress/IP/device limits and all provider-direct paths are verified and this race/DoS limitation is reviewed. Do not claim BFF-only limits protect direct Auth.

References: [Supabase SMS hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook), [provider CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [GoTrue v2.197.0 phone flow](https://github.com/supabase/auth/blob/v2.197.0/internal/api/phone.go).

Current verified sub-slice: exact-body authentication, timestamp checks, +91-only validation and shared event replay reservation. Permit/cooldown/global budgets, gateway deadlines, native GoTrue hook signatures and provider-direct abuse tests are not yet implemented. The repository contains the gstack router but no plan-eng-review skill file; no automated gstack plan-review result is claimed. Local plan review considered missing raw bytes, duplicated headers, mutable metadata, cross-instance retry/Redis failure and the lack of trusted provider client context. No merge QA or sign-off is claimed.
