# Follow-up 2 review packet

Authorisation: direct user decisions in [Follow-up 2](CODEX_AUTH_FOLLOWUP_2_PROMPT.md), including the follow-up reply that supplies items B/C/E/G/H and section 15. Old design questions are superseded. Local drafts and testing proceed; hosted apply/enablement/merge remain human-owned. Staging and persistent dev data are unchanged.

## A1 — private projection migration and native ERROR gate

Status: DB sub-slice PASS; **A overall incomplete until API/SSR integration A2 passes**. New publication flags default false; no existing row is declared published by migration. Existing random UUID route identifiers remain opaque slugs; no identity rewrite. All three projections retain their reviewed explicit columns, gain security_invoker=true, require active eligible owners and publication, and are read-only for service_role. PUBLIC/anon/authenticated lose direct access. Disabled/invited/erased and unpublished owners are excluded; actual anonymise_user verifies erasure visibility.

Verification: **12 native projection/advisor tests PASS**, including real SQL/PostgREST role denial, exact three-view allowlist snapshot and an injected ERROR that makes the real CLI fail, then removal restores zero exit. Also **12 pgTAP + 2 native Auth PASS**. Generated type freshness, catalog, security drill, 25 HTTP smoke cases and native advisors (all categories, fail-on error) PASS. [Native](evidence/followup/followup2/views-contract-green.txt), [pgTAP](evidence/followup/followup2/views-contract-green-pgtap.txt), [Auth](evidence/followup/followup2/views-contract-green-native-auth.txt), [advisor gate](evidence/followup/followup2/views-green-final-security-advisors.txt). No hosted apply or security reversal.

The red showed exposed view grants, missing invoker/publication state and three pre-existing advisor ERRORs. Test-authoring dependency/tombstone/required-field errors were corrected separately without changing expected policy. Earlier failed outputs remain evidence, not PASS results. The erased fixture now exercises the real erasure RPC rather than fabricating an invalid active tombstone.

### Deliberate assertion changes for PR/sign-off

- scripts/smoke-postgrest.ts: old cases 5/6/7 expected HTTP 200 on anon/authenticated projections. Approved Option A replaces these with exact 401 (anon) / 403 (authenticated), code 42501, for **all three** projections and both roles. Existing base-table/RPC/status/column tests stay. Case 22 still requires exact service-role public_jobs columns. This expands the smoke count from 22 to 25; it is a changed public contract, not a relaxed assertion.
- scripts/db-catalog-check.ts check 5: old six client SELECT grants are replaced by three invoker projections with **zero effective client SELECT** and retained service read. The role checks include inherited PUBLIC access. Other catalog security predicates stay.
- scripts/db-security-drill.ts: privileged projection filter/column assertions remain, now run as service_role. Six explicit SQL role denials are added. Public-data fixtures explicitly publish their owned company; unrelated security assertions are unchanged.
- New snapshot packages/database/test/fixtures/public-view-columns.json independently fixes the three ordered column lists. Adding a view column fails until the snapshot change is reviewed. Existing privacy assertions from auth-27 will also be enumerated in the packaging PR notes; none are hidden by this contract update.

Manual rollback refuses automatic reopening of client grants. Apply and publication of existing data require human review. API/read-path wiring is the next A sub-slice, before B. No claim that the DB-only checkpoint completes public pages.
