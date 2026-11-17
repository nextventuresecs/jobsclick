# AUTH-01/06 bounded provider issue-clock draft

Real GoTrue iat was one second ahead of the Windows host (retained native diagnostic). This explains the earlier intermittent AUTH_PROVIDER_INVALID positive case. New tests first reproduced rejection at +1/+2 seconds and acceptance of a signed 901-second lifetime. The server draft now tolerates at most two seconds of future issue time and independently requires exp-iat <=900 seconds. Expiry has zero grace; issuer, audience, algorithms, signatures, ban/deletion/anonymous and current identity checks remain mandatory.

The encrypted store can receive accessIssuedAt from the verified server adapter so it measures the same 900-second issue lifetime rather than adding host skew to that lifetime. Inputs without issue time keep the prior now+900 ceiling; all original 0/901 create/refresh rejection assertions remain unchanged. Server refresh carries the verified issue time. Future cutover code must carry verified issue time on creation too; this optional field is never accepted from browser input.

No retries, test sleeps or credentials logging were added. Two-second skew is a local draft, not an operational substitute for synchronized clocks. The 7-day ordinary/12-hour admin absolute deadlines are unchanged and never refreshed. Human auth review remains required before cutover.
