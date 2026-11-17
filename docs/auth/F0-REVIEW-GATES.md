# F0 - Legacy exploit regression gates before cutover

Status: selected local attacker regressions passed on fresh Supabase; no hosted security claim. The original master prompt called these **S1 Open holes**. They are F0-a through F0-e here, ahead of provider/session cutover. One review branch/PR per fix; preserve evidence when a reported exploit is already fixed rather than manufacturing a red test.

| Gate | Requirement / attack | Current finding | Required evidence before closure |
| --- | --- | --- | --- |
| F0-a | AUTH-01/03: static `123456` and expired-OTP bypass | Current generator uses `crypto.randomInt`; no literal bypass found in production auth source. Five OTP predictability/logging regressions passed in the fresh combined run; full expiry/replay requirements still apply. | Store a different OTP, reject `123456`; reject expired/replayed OTP; prove no production test-mode bypass. |
| F0-b | PRN-03 / AUTH-05: anon/authenticated calls to privileged public definer RPCs | Replayed migrations deny both roles on all ten public definer functions. [Fresh catalog](evidence/review/f0-catalog.json). Actual anon/authenticated HTTP denial regressions passed in the fresh combined run. | Actual anon-key HTTP RPC calls and database-role execution denied, including inherited PUBLIC grants; retain safe discovery access. Do not blanket-revoke unrelated public read functions. |
| F0-c | WAL-01: client credit-ledger INSERT | Fresh stack has no client INSERT grant or ledger policies. [Catalog](evidence/review/f0-catalog.json). Actual anon/authenticated ledger INSERT denial regressions passed in the fresh combined run. | Both anon and authenticated direct INSERT denied; legitimate privileged internal path preserved. Payment features stay disabled. |
| F0-d | WAL-05 / INT-04: sponsorship underpayment, replay, expiry and name-based student association | OPEN: source still associates by institution name and lacks a complete reviewed amount/single-use guarantee. Feature-flag protection is not a fix. | Draft attacker tests for underpayment, reused payment, expired sponsorship and same-name institution isolation; institution UUID only. Human payment/RLS review before merge/enablement. |
| F0-e | AUTH-05 / Hard Invariant 1: public `usr_<phone>` IDs | Production source scan has no such constructed IDs; legacy tests still contain these fixtures. Rendered-output regression pending. | Actual public/API-rendered output contains opaque IDs and no encoded phone/email. Do not infer this from a source grep alone. |

An existing fix in repository migrations is not proof it is deployed. Staging remains unchanged; no hosted grant/provider modification or real notification is authorized. The selected F0 regressions are in [the 259-test fresh run](evidence/review/stack-verification.txt). F0 remains a release/cutover gate until the corresponding attacker evidence is reviewed.

## Numbering crosswalk

| Original supplied master prompt | Current v2.1 execution ID |
| --- | --- |
| S0 preparation | S0 inventory + disposable target preflight |
| S1 open holes | F0-a through F0-e |
| S2 / M1 users | S1 / M1 contacts and reservations |
| S3 owner spike | S2 owner feasibility |
| S4 / M2 claims | S3 / M2 claims and audit |
| S5 claim API | S6 server-derived claim API / endpoint classes |
| S6 / M4 consent | S7 / M4 fixture-only storage |
| S7 / M3 activation | S8 / M3 activation |
| S8 / M5 erasure | S11 / M5 erasure |
| S9 / M6 registration and orphan job | S9 registration; S11 dry-run orphan report only |
| S10 / M7 add method | S10 explicit method linking |
| S11 session/BFF | S5 opaque server sessions/BFF |
| S12 end-to-end | S14 integrated E2E |
| Plan F4 SMS hook / F5 spend / F6 IP trust | S4 hook/abuse first; S5 trusted BFF ingress |
| Plan F11 RLS | S13 scoped repositories and RLS |

The team-approved v2.1 changes still govern: general email OTP and orphan deletion are excluded; no unapproved legal text; no automatic application-account linking by email. Next auth implementation order is S4 hook authentication/replay/+91/provider-direct abuse, then the remaining S5/S6 integration. Google and nullable-phone CSV stay disabled until their denial paths exist.
