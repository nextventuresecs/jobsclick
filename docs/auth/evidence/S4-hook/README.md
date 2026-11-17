# AUTH-01/03 S4 hook authentication foundation

Disabled, unregistered server component. Not a complete SMS delivery slice. No AuthModule registration, new endpoint, provider configuration, MSG91 call or real notification.

- First red: red-unsigned.txt records missing hook module; it is a feature-absence failure, not a reached assertion.
- green-signature.txt is a retained failed attempt: nine cases passed and one used a matcher unsupported by Vitest 2.1.9. It is not green evidence. No assertion was removed; the equivalent call-count and argument assertions replaced that matcher.
- green-signature-compatible-matchers.txt: all 10 signature/payload cases passed.
- red-replay.txt: cross-instance replay incorrectly resolved and dispatched twice.
- green-replay.txt: all 13 cases passed using actual disposable Redis, including a fresh module instance, concurrent duplicate/ambiguous sender failure and Redis outage.

Every run used its own fresh Supabase/Redis project and destroyed it. Bodies are bounded, exact UTF-8 bytes are verified with pinned standardwebhooks 1.0.0, signature timestamps must be canonical, duplicate headers are rejected, and no parsed-body serialization fallback exists. Payloads are India-only; user metadata cannot select role/language; phone-change ambiguity is rejected. The shared SET NX marker is reserved before dispatch and kept for 660 seconds even on sender failure. Keys contain only a hashed webhook ID; values do not contain phone, OTP or credentials. Responses are empty success or safe error codes.

This is not native GoTrue hook-signature/direct-endpoint proof: the signatures in these tests use the standard verifier library's signer, and SMS delivery is fake. Shared replay state by itself cannot prevent an attacker from obtaining new signed hook events through direct Auth requests. Redis command deadlines depend on a bounded client configuration; gateway timeout/abort, send permits, per-number cooldown/daily cap, global budget/spend alerts, trusted IP/device/Turnstile integration, native resend/update/MFA paths and the permit-race limitation remain S4 gates. Keep this component unregistered, and do not move to S6 wiring yet.
