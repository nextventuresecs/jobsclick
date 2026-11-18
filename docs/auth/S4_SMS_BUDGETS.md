# AUTH-03 SMS hook-side policy draft

Unregistered; no live gateway or hosted configuration changes. A validated constructor policy supplies a dedicated 32-byte phone HMAC key, per-number daily limit (at most 10), cooldown, global daily budget, conservative per-message cost and blocked national-number prefixes. Prefixes are configuration, not hardcoded policy numbers. No permissive fallback exists for missing/invalid policy.

One Redis Lua reservation checks signed-event replay, per-phone daily count, cooldown and global spend before dispatch. All keys use the same cluster hash tag. Day buckets are UTC; counters expire after the day plus cleanup grace. Native/server clocks must be synchronised. Phone keys use keyed SHA-256 HMAC; event IDs are hashed. Redis errors/corrupt counter values fail closed. Reservations/cost are retained on ambiguous sender failure; no refund or duplicate retry is inferred.

The budget bounds configured cost units, not independently verified provider invoices: the configured per-send cost must conservatively include template segmentation/pricing. At 80% usage and on circuit opening, PII-free records are queued in a bounded Redis alert stream. A reviewed alert consumer/delivery integration is still required; no alert was sent.

Native provider CAPTCHA, resend/update/MFA denial paths, GoTrue-to-hook signatures, real OTP chains and ingress IP findings are separate tests. This policy does not claim that valid signatures prove CAPTCHA, device identity or original browser IP. Phone-change ambiguity remains denied pending its separate onboarding/method-completion path.
