# AUTH-01/06 bounded provider issue-clock draft

Real GoTrue iat was one second ahead of the Windows host (retained native diagnostic). This explains the earlier intermittent AUTH_PROVIDER_INVALID positive case. New tests first reproduced rejection at +1/+2 seconds and acceptance of a signed 901-second lifetime. The server draft now tolerates at most two seconds of future issue time and independently requires exp-iat <=900 seconds. Expiry has zero grace; issuer, audience, algorithms, signatures, ban/deletion/anonymous and current identity checks remain mandatory.

The encrypted store can receive accessIssuedAt from the verified server adapter so it measures the same 900-second issue lifetime rather than adding host skew to that lifetime. Inputs without issue time keep the prior now+900 ceiling; all original 0/901 create/refresh rejection assertions remain unchanged. Server refresh carries the verified issue time. Future cutover code must carry verified issue time on creation too; this optional field is never accepted from browser input.

No retries, test sleeps or credentials logging were added. Two-second skew is a local draft, not an operational substitute for synchronized clocks. The 7-day ordinary/12-hour admin absolute deadlines are unchanged and never refreshed. Human auth review remains required before cutover.

## Follow-up 2 B — deployment guard and readiness

When AUTH_PROVIDER=supabase, startup and /health/ready require an explicit integer SUPABASE_ACCESS_TOKEN_LIFETIME_SECONDS between 1 and 900. Missing/malformed/fractional/zero/over-limit values fail with AUTH_PROVIDER_LIFETIME_MISCONFIGURED. The provider adapter can feed verified observed lifetimes into the shared policy; a mismatch latches readiness unavailable until configuration repair and restart. A subsequent short token cannot hide the mismatch. Expired credentials still get no grace; maximum issue skew remains two seconds.

**Authoritative hosted setting:** Supabase Auth > Settings > JWT Settings > JWT expiry limit must be <=900 seconds (recommended 900). Operational owner verifies it against the deployment declaration before enabling the migration and after every provider-config change. Local GoTrue config uses jwt_expiry=900 and native token tests verify that provider. The public GoTrue settings response does not supply a trustworthy expiry-config API; this guard does not pretend the environment declaration alone proves hosted configuration. Do not put a high-privilege Supabase Management API token in the application to poll this setting. A provider-config/monitoring attestation belongs in the release control plane; hosted check remains pending and staging is unchanged.

The migration is disabled by default. Legacy custom JWT configuration is not reinterpreted as the Supabase provider setting. Readiness supplements credential validation; it never extends token expiry or absolute server-session deadlines.
