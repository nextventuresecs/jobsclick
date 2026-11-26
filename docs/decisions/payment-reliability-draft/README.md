# Payment reliability draft for human review

## Failed gateway attempts (WAL-03)

The signed `payment.failed` webhook records the provider attempt and event ID in the append-only audit log. It leaves the order eligible for a later capture and reconciliation. Existing capture and refund handlers continue to apply their verified state transitions. With this draft, a late failure cannot rewrite settlement, credits, or the invoice's eligibility.

Review historical orders showing `failed` with settlement evidence against authoritative gateway state, the ledger, and any refunds before proposing a repair.

## Invoice delivery (WAL-03)

The worker verifies private PDF storage, persists the PDF path, and verifies provider acceptance when a billing email exists. It persists `emailed_at` before marking the outbox item done. When retrying, it uses the same attachment and Resend idempotency key, and skips a send already recorded in the invoice. Review `complete-outbox.sql` as a forward migration. The SQL guards against stale acknowledgements reopening a completed row and stays outside the migration directory until approved.

The existing claim RPC holds locks only for its database transaction. Before allowing multiple consumers, review a durable lease acquired in that transaction, with an expiry and a claim token checked by completion. In the interim, the draft assumes a single invoice consumer. Resend deduplicates within a 24-hour window. If an email result remains ambiguous beyond that window, reconcile it with the provider before replay. Provider acceptance does not confirm inbox delivery.

Review historical completed entries with missing PDFs or missing email acknowledgements before any replay. The regression fixtures use synthetic gateway and provider responses and a disposable PostgreSQL database.
