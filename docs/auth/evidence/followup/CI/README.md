# AUTH-01 local CI verification

Source and generated types are separate commits in codex/auth-11-disposable-ci; no push/hosted action. The source workflow is not a claim GitHub Actions ran.

- Workflow-policy regression: four failures before the change, four passes after. Shared endpoints/keys removed; deployment placeholders fail explicitly.
- Focused job: 296 tests / 30 files passed, including both 50k imports; native pgTAP 12 and existing GoTrue 2 passed.
- Exact database job: all 87 database tests / 6 files, native pgTAP 12 and existing GoTrue 2 passed. Generated schema freshness, catalog, security attack drill and all 22 HTTP smoke checks passed.
- Offline target/filesystem/standalone/workflow safeguards: 16 passed.
- Type generation originally rejected CLI output before any source write. The current CLI text starts with a blank line; AST validation plus deterministic whitespace normalisation accepts valid generated types and refuses non-TypeScript output. Raw and canonical generator hashes are recorded. A whitespace check stopped the first snapshot commit; whitespace was canonicalised before committing. No type declaration was hand edited.
- One earlier native positive-auth attempt returned AUTH_PROVIDER_INVALID after the DB tools. It did not recur in the diagnostic, focused or exact-job runs. Sanitised claim-shape/timing diagnostics are retained. **Root cause remains unresolved; this is not a production-ready sign-off.** No JWT assertion, issuer rule, future-iat rejection, expiry policy or concurrency test was weakened, and no retry was added to conceal that failure.

The full broad verify job and container builds were not executed in GitHub Actions. All listed projects were created fresh and destroyed by the runner; no persistent dev rows were changed.
