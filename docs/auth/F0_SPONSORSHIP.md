# F0-d / WAL-05 / INT-04 local payment drafts

Red-first attacker suite reproduced underpayment (including larger requested tier), free-text cross-institution grants, expired boolean access, alternate-reference replay and a partial grant on injected write failure. The amount/association/expiry controls are amended; the last two remain deliberately failing release gates, not skipped or weakened. This stack is not mergeable.

Minimum payment uses an INR captured amount compared against the server quote; the effective quoted count cannot be below UUID-associated enrolled students. No rates or GST/legal text changed. Both repository lookups/updates and activation use institution_id only. Wallet checks require student membership, current institution expiry and an active current grant; dependency errors propagate. A separate native service-role RPC regression found its own stale-boolean bypass and tests active, expired, missing and other-institution grants against the shipped migration.

The positive legacy suite's inputs are corrected to include explicit INR (the real database's default) and a current institutional grant rather than a bare is_sponsored boolean. Assertions are preserved. A local FIFO lock test is not evidence of cross-process transactional atomicity. Human review of payments and the migration is mandatory. ENABLE_P2_PAYMENTS remains default OFF; no flag was enabled in application config. Test-only service fixtures are under per-run JSON storage.

Open: canonical payment consumption/unique constraint, payment purpose/quote binding, concurrent invoice/replay policy, capture/grant transaction+reconciliation, audit atomicity, idempotency expiry handling and production transaction verification. See SCHEMA_MISMATCH.md. No capture or real payment ran.
