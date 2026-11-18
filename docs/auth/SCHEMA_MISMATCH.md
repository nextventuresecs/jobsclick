# AUTH v2.1 follow-up conflicts

2026-11-17. Stop only the conflicting item; continue independent work.

- **Step 1.1 case 14 / Step 4.1 separate failure-audit wrapper:** the tested v2.1 public claim RPC already calls the private transactional claim/finish design. Expected rejection returns a structured outcome and commits its audit in the same call; successful mapping and audit roll back together. There is no public arbitrary-reason attempt-audit wrapper. Do not invent a new exposed audit-fabrication endpoint or double-audit API failures. Preserve the reviewed contract, test outer rollback versus a fresh committed attempt explicitly, and record the exact remaining mismatch in M2-COVERAGE.md. A change to the audit contract requires a separate decision.
- **Step 4.2 every other endpoint requires a link:** public discovery, auth initiation and authenticated provider/worker webhooks deliberately do not require an application link. S6 must retain the approved endpoint classes. The literal all-endpoints rule is stopped; it cannot replace those established exceptions.
- **Step 2.3 provider IP fallback:** AGENTS.md Hard Invariant 4 still requires device/IP limits before send. If native GoTrue sees only the BFF IP, record that result. Phone/global/CAPTCHA controls do not silently waive the BFF ingress/device/IP requirement. No new trusted forwarding header or broad private-network trust is inferred.

Google/nullable-phone CSV remain disabled. Email OTP may be used solely as a disposable provider-proof fixture; general email OTP login remains unapproved. Payment fixes stay disabled local drafts. No hosted operation, merge or push is authorised.

## Step 3.1 payment consumption and transaction contract — resolved local draft

The 2026-11-17 STOPPED status is superseded by the user's explicit 2026-11-18 instruction to resolve payment reuse and crash atomicity. New forward migrations introduce canonical append-only payment receipts and service-only transactional RPCs; trusted purpose/target binding prevents wallet-to-sponsorship reuse. Captured status, ledger or sponsorship grant, receipt and mandatory audit now commit together. The original seven attacker test bodies remain byte-identical, and the formerly failing cases pass in the final selected 382-test run. Native backend termination proves rollback and safe exact retry.

External Razorpay capture cannot share a PostgreSQL transaction. Failed local settlement is retryable using verified webhook/callback facts; captured legacy rows without receipts require human reconciliation. No data was backfilled, no automatic reconciler/public sponsorship checkout was introduced, and the payment flag stays OFF. This resolves the local schema mismatch, not human review or hosted enablement. [Contract, evidence and runbook](PAYMENT_TRANSACTION_PLAN.md), [current packet](REVIEW_PACKET.md).
