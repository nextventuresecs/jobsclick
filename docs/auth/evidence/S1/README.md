> Historical outputs from the earlier persistent dev target are retained for audit only and are not acceptable disposable-run evidence. See docs/auth/evidence/review/ for the replacement fresh Supabase runs.

# S1 / M1 - Contact safety

PASS locally: shared phone/email normalization, literal email lookup, provided CSV-email validation, SQL contact constraints, cross-column reservation, concurrency and guarded rollback. See [verification.txt](verification.txt) (121 tests) and [checks.txt](checks.txt) (six typechecks, lint and migration sync); final combined evidence is [integration](../integration/verification.txt).

Red outputs in this directory reproduce missing normalization, malformed phones, missing contact constraints, email/pending-email collisions, invalid CSV email and literal-underscore lookup. Failed implementation attempts are retained, including the corrected Zod chain and string escaping. The real local PostgREST lookup test found that `ilike` treated `_` as a wildcard; the fix escapes LIKE metacharacters rather than matching another account.

SQL: [M1](../../../db/drafts/auth-contacts-v21.sql) and [down](../../../db/drafts/auth-contacts-v21.down.sql). Existing phone/email indexes are preserved. A private, default-deny reservation table serializes ownership across confirmed/pending email, including separate repeatable-read transactions. Local pgTAP validates the contract and actual role privileges.

Down refuses NULL-phone users or dependent identity mappings; it never removes users or invents phones. Existing `DEL_...` tombstones remain compatible. Existing-data canonicalization/reconciliation needs human review before execution. This draft is not applied to the application's public schema or staging. Email-only CSV admission and generated-type/consumer changes remain disabled until S12.
