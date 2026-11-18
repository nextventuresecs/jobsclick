# AUTH v2.1 follow-up conflicts

2026-11-17. Stop only the conflicting item; continue independent work.

- **RESOLVED by Follow-up 2 §15 — case 14:** the approved contract is transaction-local audit for expected rejections and successful claims. No separate attempt wrapper exists or is required. Audit/mapping rollback together; infrastructure failures use safe logging/alerts, without claiming database-outage audit durability. The existing SQL tests remain unchanged.
- **Step 4.2 every other endpoint requires a link:** public discovery, auth initiation and authenticated provider/worker webhooks deliberately do not require an application link. S6 must retain the approved endpoint classes. The literal all-endpoints rule is stopped; it cannot replace those established exceptions.
- **Step 2.3 provider IP fallback:** AGENTS.md Hard Invariant 4 still requires device/IP limits before send. If native GoTrue sees only the BFF IP, record that result. Phone/global/CAPTCHA controls do not silently waive the BFF ingress/device/IP requirement. No new trusted forwarding header or broad private-network trust is inferred.

Google/nullable-phone CSV remain disabled. Email OTP may be used solely as a disposable provider-proof fixture; general email OTP login remains unapproved. Payment fixes stay disabled local drafts. No hosted operation or merge is authorised. Follow-up 2 separately authorises clean review-branch pushes for remote CI; that supersedes the older no-push status.

## Step 3.1 payment consumption and transaction contract — resolved local draft

The 2026-11-17 STOPPED status is superseded by the user's explicit 2026-11-18 instruction to resolve payment reuse and crash atomicity. New forward migrations introduce canonical append-only payment receipts and service-only transactional RPCs; trusted purpose/target binding prevents wallet-to-sponsorship reuse. Captured status, ledger or sponsorship grant, receipt and mandatory audit now commit together. The original seven attacker test bodies remain byte-identical, and the formerly failing cases pass in the final selected 382-test run. Native backend termination proves rollback and safe exact retry.

External Razorpay capture cannot share a PostgreSQL transaction. Failed local settlement is retryable using verified webhook/callback facts; captured legacy rows without receipts require human reconciliation. No data was backfilled, no automatic reconciler/public sponsorship checkout was introduced, and the payment flag stays OFF. This resolves the local schema mismatch, not human review or hosted enablement. [Contract, evidence and runbook](PAYMENT_TRANSACTION_PLAN.md), [current packet](REVIEW_PACKET.md).
