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
| 14 | Audit success/rollback/rejection allowlist/no PII; separate attempt wrapper conflict | audits both the first claim and idempotent retry without recording contacts or credentials; rolls back the new mapping if its success audit cannot be committed; commits a fresh rejected attempt after an outer rollback and rejects unapproved audit reasons | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | NOT RUN |
| 15 | Provider email whitespace/case canonicalisation | normalises provider email capitals and surrounding spaces before matching | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |
| 16 | Erased contact never matches | never matches an erased application contact | vitest: `packages/database/test/auth-claims-v21.local.test.ts` | PASS |

Cases 9 and 10 deliberately share a legal two-candidate fixture; existing uniqueness constraints prohibit manufacturing duplicate same-contact users.

**Case 14:** implemented transactional success/retry/rejection/no-PII and invalid-reason tests PASS. The quoted requirement for a separate public attempt-audit wrapper remains NOT RUN / SCHEMA_MISMATCH: it does not exist in the reviewed contract. The new test proves an outer rollback removes that transaction's audit, then a fresh committed claim RPC records exactly one rejection. It does not claim an autonomous transaction or database-outage durability. See [contract conflicts](../../SCHEMA_MISMATCH.md).

## Real provider metadata proof

| Provider flow | Exact test / intended seam | Runner | Actual raw_app_meta_data provider | Status |
| --- | --- | --- | --- | --- |
| Email OTP through local mail catcher | Step 2.4 native OTP-to-claim chain | native GoTrue + vitest | Not yet observed from OTP flow | NOT RUN |
| Phone OTP through signed hook/fake delivery | Step 2.4 native OTP-to-claim chain | native GoTrue + vitest | Not yet observed from OTP flow | NOT RUN |
| Google OAuth through local GoTrue | Native provider linking proof; no metadata hand-seeding accepted as proof | native GoTrue + vitest | Not yet observed | NOT RUN |

The SQL accepts server-owned provider identifiers `phone`, `email`, `google`. This is source eligibility, not evidence of the current login method, and never grants roles from metadata. The fixture rows use explicit provider metadata solely to exercise the SQL contract. Real OTP/OAuth proof remains separate and must update this table; Google stays disabled.

## Red evidence and fixture corrections

[Behavioral red](../followup/M2/red-provider-and-coverage.txt) reproduced three real failures: an unsupported provider, and first/retry claims after provider mutation during an application-lock wait. Forty other cases passed. The fourth failure was an oversized synthetic DEL tombstone; it was corrected to the repository's established 14-character tombstone shape without changing erasure constraints. Earlier files red-provider-allowlist and baseline-missing-coverage failed collection due to a fixture quoting error; they are retained but are **not behavioral-red evidence**. Metadata inserts now use bound parameters.
