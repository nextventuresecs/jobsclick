# AUTH-01 M2 coverage matrix

2026-11-17. Zero MISSING test rows. PASS is local only. All table entries use **vitest**, file `packages/database/test/auth-claims-v21.local.test.ts`; `%s` indicates the exact parameterised declaration, with relevant values in brackets. [75-test run](../followup/M2/green-coverage.txt); [native pgTAP 12 assertions](../followup/M2/green-coverage-pgtap.txt); [existing real GoTrue adapter/ban 2 tests](../followup/M2/green-coverage-native-auth.txt). Superseded by migration replay evidence when available.

| # | Contract | Exact test declaration(s) | Runner | Status |
| --- | --- | --- | --- | --- |
| 1 | Client EXECUTE and link SELECT denied | denies direct RPC, private claim and audit-helper access to %s; denies v2.1 link SELECT to %s | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 2 | Backend wrapper allowed; link table SELECT only | allows service RPC but not direct audit fabrication; allows service_role only SELECT on the v2.1 link table | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 3 | Unverified phone/email rejected | commits a rejection audit for a %s provider identity without acquiring its invite [unverified]; rejects an unverified email-only identity | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 4 | Non-Indian phone never matches local digits | rejects a verified non-Indian phone that shares the invite local digits | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 5 | Anonymous, banned, deleted identity rejected | commits a rejection audit for a %s provider identity without acquiring its invite [anonymous,banned,deleted] | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 6 | Provider outside allowlist rejected | rejects a provider outside the allowlist despite verified contacts and spoofed user metadata; revalidates provider proof after the application lock on %s claim: %s [changed-provider] | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 7 | Invited employer and seeker; idempotent retry | claims an invited %s once and retries idempotently [employer,job_seeker] | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 8 | Elevated role / active / disabled not claimable | audits the rejected %s account without using the matched victim as actor [intermediary,admin,msme_admin,active,disabled] | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 9 | Two candidate accounts conflict | rejects two candidates when verified phone and email identify different invitees | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 10 | Phone A / email B conflict | rejects two candidates when verified phone and email identify different invitees | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 11 | Parallel invite claims produce one link | serializes same-provider claims and records one success plus one retry | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 12 | Second independent Auth identity conflicts | rejects a second independent provider instead of merging it into an already claimed account | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 13 | Linked disabled account rejected | does not accept a retry after the linked account is disabled | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 14 | Transaction-local success/retry/rejection audit; rollback/allowlist/no PII | audits both the first claim and idempotent retry without recording contacts or credentials; rolls back the new mapping if its success audit cannot be committed; commits a fresh rejected attempt after an outer rollback and rejects unapproved audit reasons | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 15 | Provider email whitespace/case canonicalisation | normalises provider email capitals and surrounding spaces before matching | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 16 | Erased contact never matches | never matches an erased application contact | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |

Cases 9 and 10 deliberately share a legal two-candidate fixture; existing uniqueness constraints prohibit manufacturing duplicate same-contact users.

**Case 14 — Follow-up 2 supersedes the old mismatch:** PASS under the approved transaction-local rule. Success/retry/expected rejection are audited in the claim transaction. Mapping and audit roll back together; invalid audit reasons are denied. The existing outer-rollback/fresh-committed-attempt test remains unchanged and does not claim autonomous transactions or database-outage durability. No separate attempt-audit function is required or added. New unexpected-error HTTP regression covers one safe log, safe alert and generic client error; the SQL assertions are not weakened.

## Real provider metadata proof

| Provider flow | Exact test / intended seam | Runner | Actual raw_app_meta_data provider | Status |
| --- | --- | --- | --- | --- |
| Email OTP through local mail catcher | apps/api/test/auth-native-otp.local.spec.ts: verifies email OTP from the local mail catcher and claims without inventing a phone | native GoTrue + vitest (--native-otp --auth-contracts) | provider=email; providers=[email] | PASS |
| Phone OTP through signed hook/fake delivery | apps/api/test/auth-native-otp.local.spec.ts: completes phone OTP through a real signed hook and claims the preserved invited UUID | native GoTrue + vitest (--native-otp --auth-contracts) | provider=phone; providers=[phone] | PASS |
| Google OAuth through local GoTrue | Native provider linking proof; no metadata hand-seeding accepted as proof | native GoTrue + vitest | Not yet observed | NOT RUN |

The SQL accepts server-owned provider identifiers `phone`, `email`, `google`. This is source eligibility, not evidence of the current login method, and never grants roles from metadata. The fixture rows use explicit provider metadata solely to exercise the SQL contract. Real phone/email OTP proof passed on jc-auth-test-71c56434; see ../followup/clock/green-native-otp-native-auth.txt and ../S4-native/observations.json. Google proof remains NOT RUN and Google stays disabled.

## Red evidence and fixture corrections

[Behavioral red](../followup/M2/red-provider-and-coverage.txt) reproduced three real failures: an unsupported provider, and first/retry claims after provider mutation during an application-lock wait. Forty other cases passed. The fourth failure was an oversized synthetic DEL tombstone; it was corrected to the repository's established 14-character tombstone shape without changing erasure constraints. Earlier files red-provider-allowlist and baseline-missing-coverage failed collection due to a fixture quoting error; they are retained but are **not behavioral-red evidence**. Metadata inserts now use bound parameters.
