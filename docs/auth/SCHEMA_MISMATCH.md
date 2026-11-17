# AUTH v2.1 follow-up conflicts

2026-11-17. Stop only the conflicting item; continue independent work.

- **Step 1.1 case 14 / Step 4.1 separate failure-audit wrapper:** the tested v2.1 public claim RPC already calls the private transactional claim/finish design. Expected rejection returns a structured outcome and commits its audit in the same call; successful mapping and audit roll back together. There is no public arbitrary-reason attempt-audit wrapper. Do not invent a new exposed audit-fabrication endpoint or double-audit API failures. Preserve the reviewed contract, test outer rollback versus a fresh committed attempt explicitly, and record the exact remaining mismatch in M2-COVERAGE.md. A change to the audit contract requires a separate decision.
- **Step 4.2 every other endpoint requires a link:** public discovery, auth initiation and authenticated provider/worker webhooks deliberately do not require an application link. S6 must retain the approved endpoint classes. The literal all-endpoints rule is stopped; it cannot replace those established exceptions.
- **Step 2.3 provider IP fallback:** AGENTS.md Hard Invariant 4 still requires device/IP limits before send. If native GoTrue sees only the BFF IP, record that result. Phone/global/CAPTCHA controls do not silently waive the BFF ingress/device/IP requirement. No new trusted forwarding header or broad private-network trust is inferred.

Google/nullable-phone CSV remain disabled. Email OTP may be used solely as a disposable provider-proof fixture; general email OTP login remains unapproved. Payment fixes stay disabled local drafts. No hosted operation, merge or push is authorised.

## Step 3.1 payment consumption and transaction contract

STOPPED: institution_sponsorships.payment_reference is nullable free text, not a canonical payments FK or unique consumed-payment record. payments supports credit packs but has no reviewed sponsorship quote/purpose binding. Its captured transition and wallet grant are separate PostgREST calls; sponsorship students/record/profile/audit are also separate writes. withLock is process-local JSON serialization, not SELECT FOR UPDATE or a database transaction. A single-use guarantee needs a canonical payment-id consumption constraint and transactional grant RPC; under a gateway crash it also needs reconciliation/outbox handling. An external Razorpay capture cannot share a PostgreSQL transaction. Do not invent a cross-service atomicity claim.

Retained attacker regressions remain FAIL for alternate-reference payment reuse and injected grant-write crash. Per the supplied follow-up's stop-on-schema-conflict rule, this item requires a reviewed payment-purpose/consumption/transaction design before implementation. Do not disable those tests or treat the default-off payment flag as a fix. Independent amount, UUID association and expiry checks remain reviewable drafts.
