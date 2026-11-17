# AUTH-01/03 native OTP draft findings

Local GoTrue v2.197.0, CLI 3.1.0, Mailpit v1.31.3; every invocation creates and destroys a new Supabase/Redis project. No persistent or hosted configuration changed. Hook/server-session/provider components remain unregistered. General email OTP login, Google and nullable-phone CSV admission remain disabled.

## Reproduction

- Positive/missing-token/resend/phone+email chains: `node scripts/testing/run-disposable.cjs --native-otp --auth-contracts packages/validation/test/auth-contacts.test.ts`.
- Provider validation rejection: same command plus `--captcha-reject`. This selects the unchanged invalid-token assertion on another fresh stack with Cloudflare's public always-fail secret. Other native cases are explicitly excluded from this mode.
- Initial provider-disabled/mailbox setup failures are retained and are NOT behavioral red evidence. CLI derives phone-enabled from an enabled adapter even with a hook. Disposable placeholder Twilio credentials are invalid; actual sends use only the signed hook and fake capture. Mailpit replaced Inbucket's API in this CLI.

With CAPTCHA disabled and phone actually enabled, missing and invalid tokens each caused one fake delivery; resend without CAPTCHA caused a second delivery. Real phone OTP -> signed hook -> fake capture -> verifyOtp -> M2 claim passed, preserving invited UUID, source and employer role despite user-controlled role=admin metadata. Hook replay 409, unsigned hook 401, no additional delivery. OTP absent from actual GoTrue container logs. Logger-disabled fixture server never logs request bodies; fake capture is memory-only.

CAPTCHA enabled rejected missing token before hook/delivery and rejected direct resend without CAPTCHA after the cooldown, sends=1. The public always-pass secret accepted an arbitrary nonempty string: this is a test-secret limitation, not evidence that production Turnstile accepts invalid tokens. Separate always-fail-secret invocation verifies failure propagation with zero sends. Dummy-token reuse is NOT proof of real single-use redemption; real deployment hostname/action binding and production token replay remain NOT RUN. See [Cloudflare test-key behavior](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) and [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

Supabase JS passes `options.captchaToken` as `gotrue_meta_security.captcha_token` to Auth. The controlled server-side API fixture forwards the received token using that option. It does not consume it separately at the BFF, which would invalidate the same token at Auth. No production BFF send endpoint is enabled here. The real BFF still needs reviewed device/IP admission and provider-direct bypass controls; a signed SMS hook contains no trusted end-user IP/device/Turnstile proof.

Real email OTP delivered only to disposable Mailpit, verified without an admin-confirmed seed, and claimed an email-only invited seeker with phone still null and no SMS. Actual metadata: phone provider=phone/providers=[phone]; email provider=email/providers=[email]. Google proof is NOT RUN: the pinned provider hardcodes Google issuer/endpoints; no reviewed real OAuth client/test fixture is supplied. Never fabricate Google metadata and call that native proof.

The enabled-CAPTCHA run also captured a real JWT iat exactly one second ahead of the host and rejected it at the strict provider timestamp guard. This reproduces the earlier CI-positive failure; it is a clock-boundary issue, not a reason to retry an auth operation or weaken ban/issuer/audience checks. Timestamp policy correction and fresh native verification are a separate review slice.

Remaining S4 gates: production single-use/hostname/device/IP denial proof, reviewed MSG91 provider-template versus numeric DLT mapping and idempotent transport contract, alert delivery consumer, hosted configuration. S6 cannot start until S4 and F0 gates pass.
