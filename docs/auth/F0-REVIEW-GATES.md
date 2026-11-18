# F0 legacy exploit gates before cutover

2026-11-18. Local drafts only. No hosted closure claim. F0 was the original master prompt's S1 open-holes group. Existing positive results are not deployment evidence; a default-off flag is not an exploit fix.

| Gate | Requirement / attack | Status and retained evidence | Remaining release gate |
| --- | --- | --- | --- |
| F0-a | AUTH-01/03: static OTP and expiry/replay bypass | Selected OTP predictability/logging and auth regressions PASS in [344-test run](evidence/followup/final/combined.txt); generator uses crypto.randomInt. | S4's deployment/provider-direct admission and real single-use controls remain open. |
| F0-b | PRN-03 / AUTH-05: public privileged SECURITY DEFINER RPC execution | Actual anon/authenticated HTTP denials, catalog and security drill PASS in the final fresh run; service path preserved. | Hosted grants NOT RUN. Do not blanket-revoke unrelated public discovery functions. |
| F0-c | WAL-01: direct client credit-ledger INSERT | Actual anon/authenticated Data API inserts denied; native grants/policies and privileged path checks PASS in final run. | Payments stay disabled; hosted state NOT RUN. |
| F0-d | WAL-03/05 / INT-04: underpayment, replay, expiry, name association, crash | **LOCAL PASS**, included in [382-test final run](evidence/followup/payments/final-combined.txt); [26 focused financial tests](evidence/followup/payments/green-payment-boundaries.txt) cover native termination, audit failure, exact retry and actual API-to-PostgREST paths. Canonical receipts and trusted purpose/target enforce one grant; capture/grant/audit commit together. Original seven attacker bodies unchanged. | Human payment/migration/RLS review; captured legacy reconciliation; hosted and real gateway lifecycle NOT RUN. Flag stays OFF. [Contract and limits](F0_SPONSORSHIP.md), [runbook](PAYMENT_TRANSACTION_PLAN.md). |
| F0-e | AUTH-05 / Invariant 1: phone-derived IDs in rendered public/workspace/QR output | Three QR leaks reproduced red; shared UUID path admission fixes them. Actual public detail/directory/home/jobs, five workspace roles, populated contact views, masks, QR path positive/negative and API stripping: **25 PASS**. [Output](evidence/followup/F0-e/green-expanded-public-pages.txt). | Full browser QR-image/toast interactions NOT RUN. [Scope](F0_OPAQUE_RENDER.md). |
| Additional V1 | PRN-03 / Invariant 5: public projection views | **LOCAL PASS under approved Option A**: service-only invoker projections, explicit columns/publication, API/SSR wiring, client denials, native advisor zero findings and ERROR CI gate. [Current review](FOLLOWUP_2_REVIEW.md). | Draft SQL, hosted apply and publication review remain human; no hosted closure claim. |

Follow-up 2 full local regression is 1,160 PASS / 14 conditional skips. The former F0-d failures now pass in the selected local suite; remote CI is NOT RUN. S6 is not started while other S4/auth prerequisites remain open. Google and nullable-phone CSV admission stay disabled. Staging is unchanged.

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
