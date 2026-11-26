# Jobsclick UX, accessibility and location workflow

## Start a run

Use this prompt in Codex from the dedicated UX branch:

> Run the Jobsclick redesign unattended using `docs/ux/agentic-workflow.md` and the supplied Jobsclick redesign brief. Read the repo rules, PRD and client decisions first. Create the audit from an isolated local build with synthetic test accounts. Keep the current palette. Give the coordinator ownership of the plan and evidence ledger, have specialists inventory the app, and send the finished audit to a fresh reviewer. Record anything you could not observe. Complete Phase 0 first. Then execute ready slices and verify each change. Park blocked slices, continue independent work, and produce one morning completion report.

Supply the original brief to the run, or use its approved GitHub issue transcription once available. The brief describes future product work. This workflow starts that work only when explicitly invoked. Use the checked-out commit as the source of truth for routes, tokens and commands. Read `AGENTS.md`, `docs/PRD.md`, `docs/decisions/001-client-decisions.md` and `docs/agents/issue-tracker.md`. Cite confirmed requirement IDs in issues and branch names. Use WS numbers for brief-specific requirements without PRD IDs.

Use Superpowers brainstorming and writing plans at the approved issue's scope, gstack plan review before the slice, Superpowers TDD and subagent-driven development during implementation, and verification-before-completion with gstack QA before merge. Use Hallmark audit in Phase 0 and redesign with “keep the palette” for UI passes. App polish keeps layout except where an approved workstream changes it. Marketing follows WS6's approved layout. Follow Hallmark's Floor and record any Reflex exception. Use mattpocock's TypeScript and Zod discipline for shared contracts.

## Team and permissions

| Role | Assignment |
| --- | --- |
| Coordinator | Own the branch plan, ordered issue queue, file assignments, decisions and evidence ledger. Compare actual diff and results before advancing. Route release and product decisions to Pj. |
| UX and Hindi specialist | Inventory real routes and role-specific screens, check design tokens and user effort, and flag translation, low-literacy, content and accessibility issues. Read-only during audit and review. |
| Implementation agent | Own one approved slice and an explicit file list. Work test-first. For location and search, assign a NestJS/Postgres specialist. For UI and i18n, assign a Next.js specialist. Same-file work runs serially. |
| Independent verifier | Start in a fresh context with acceptance criteria, base and candidate revisions, changed routes and local test instructions. Inspect the diff, run tests and render the actual flows. Report pass, fail or blocked per check with evidence. |
| Pj and required human reviewers | Review the final escalation list, approve human-only changes per `AGENTS.md`, and validate user-testing evidence before affected work is release-ready. |

The coordinator may parallelize independent read-only audits and checks. Parallel writers require disjoint file ownership and isolated worktrees. Serialize changes to shared tokens, message catalogs, Zod contracts, migrations and lockfiles. Give each agent the task contract below and only relevant repository context. Reuse the implementer for a targeted fix and use a fresh reviewer for independent approval. Keep the coordinator the sole writer of the evidence ledger. Use a second specialist only when the slice spans distinct contracts or the reviewer needs expertise.

Use separate issue branches and an isolated local environment. Preserve current palette values and logo treatment. Keep existing auth, wallet, Razorpay, audit and RLS behavior outside the redesign. Reuse the fixed stack, translation catalogs and shared contracts. Use disposable data, stub outbound providers and verify test configuration before running any flow that sends messages, logs in, uploads data or writes to a database. Keep private data out of logs, screenshots and fixtures. A legitimate test failure never permits switching to staging. Any hosted preview or deployment needs separate authorization.

## Phase 0 and rollout order

Phase 0 tracks only `docs/ux/audit.md`. Inventory any role that lacks a safe local test fixture from source and mark runtime coverage blocked. Include the following in the audit.

- Actual routes, screens, dialogs and forms for employer/MSME, institution, student, individual, MSME admin and platform admin. Include public marketing, job cards and filters. Include nested workspace screens and distinguish source inventory from exercised flows.
- Sources and measured values for colors, typography, spacing and radius. Start with `apps/web/src/app/globals.css`, `apps/web/tailwind.config.js`, `packages/ui/src` and both catalogs under `apps/web/messages`. Capture logo treatments and all active theme modes.
- Location, address, institution, state, city, district and PIN fields by route and role, including read/write paths, legacy address behavior, and candidate dataset paths and provenance.
- Findings with route, role, viewport, locale, evidence, impact and proposed workstream. Check targets under 48px, text under 16px, contrast below 4.5:1 for normal text and 3:1 for large text or applicable UI, labels, focus, color-only errors, hardcoded strings and forms with more than five fields per screen. Record Hallmark findings and any environments or roles unavailable for rendering.
- Map each brief clause to a proposed issue and measurable acceptance criterion, or to a decision with an owner. Reconcile the map against the brief before submitting proposed issues, PR sequencing, confirmed PRD IDs, baseline failures and the decisions below. Have the verifier check the audit and start the first ready slice. Put unresolved product questions in the relevant issue or local issue draft.

| Order | Scope | Evidence that allows advancement |
| --- | --- | --- |
| 0 | Audit and proposed PR order | Independent audit review and an issue map identifying ready work and decisions that block specific slices |
| 1 | WS1 foundations and WS9 tooling | Root `design.md` locks existing token values, fonts, radii and spacing. Palette check, PR template, Playwright and axe run locally and in verification-only CI. |
| 2 | WS2 India location and institution fields | Approved datasets and scope, shared address types and validation, API/RLS and legacy-address evidence, accessible bilingual picker flows, every address/location/institution input migrated or explicitly resolved, timing and bundle-size measurements |
| 3 | WS4 Hindi and English | Catalog coverage, locale persistence, up to 40% text expansion, Indian number/date/currency formatting, and Devanagari clipping checks. Record `REVIEW-HI` by catalog key in `docs/ux/hindi-review.md` so message JSON stays valid. |
| 4 | WS7 jobs, then WS8 search | Working apply/save wiring, contact privacy, persisted URL filters, keyboard and TalkBack use, measured search and task effort, flags |
| 5 | WS3 role onboarding | Employer, institution, student and individual flows, drafts and error recovery, first-screen and persistent language choice, flags |
| 6 | WS6 public marketing | Real content and supplied imagery, role CTAs, SSR and bilingual SEO, preserved JobPosting JSON-LD, performance measurements, flags and `docs/ux/copy-needed.md` where needed |
| 7 | WS5 accessibility sweep | Documented WCAG 2.2 AA evidence by flow, open findings, and `docs/ux/a11y-checklist.md` with manual checks |

Apply WS9 to every UI slice. Run targeted checks after each coherent change and the full gate on the candidate for review. Record pending human evidence on the affected slice and continue independent work.

### Decisions for Phase 0

- The brief says “3 Small PRs” and lists nine workstreams. Propose small issue-linked slices in dependency order. Flag the aggregate PR count in the final report. Follow the repo's one issue, one branch, one PR workflow and approximate 400-line target.
- The brief requires staging links for UX tests. Current authorization excludes staging. Use local evidence now and mark hosted evidence blocked. Before any external user test, confirm an authorized way to access the exact candidate.
- The brief protects existing RLS and calls for RLS on new data. Inventory existing policies and address consumers. Route any migration, policy addition or backfill to human review and confirm scope before editing. If India geo seed files are missing, complete the Phase 0 audit, report the absent paths and request the approved dataset. Block WS2 seeding and dependent migration work until the approved inputs arrive. The institution free-text fallback is distinct and needs review of its write and moderation path.
- Confirm whether optional geolocation, browser voice input or speech synthesis can meet the brief's privacy rules. Browser capabilities alone do not prove local processing. Hold those features until compatible behavior can be verified and scope confirmed. Keep P2/P3 logic out unless authorized by issue label. Verify “10 free applications” against approved, enabled product behavior before publishing the claim.
- Reconcile requested marketing destinations with actual routes. Flag any destination, support contact, copy claim, or feature flag capability without a verified source. Optimistic feedback may show pending status. Show success only after the server confirms. Before advertising Undo for Apply, confirm an approved backend action and its semantics. Treat OTP UI behavior that changes submission or resend as part of the human-review-only auth flow.

## Task contract and verification loop

Before dispatch, record issue and requirement IDs, exact approved brief clauses, base commit, allowed files, role and affected routes/states, dependencies, acceptance criteria, exact commands and expected results, and human gates. Record a fallback or rollback for flag-controlled work. Map each criterion to a test or measurement and identify dependencies that must already have evidence.

1. **Baseline.** Read the latest ledger checkpoint and inspect branch, worktree and diff. Run the affected flow locally with the same fixtures and flags planned for after evidence. Capture before screenshots and Hallmark wiring for redesigns. Record baseline failures with commands and reproduction. Investigate failures before using the baseline as proof.
2. **Red.** Add the smallest test that proves the acceptance criterion. Run it and record the expected assertion failure. For visual criteria, record the baseline render and measured failure.
3. **Green and verify.** Change only the owned slice. Run the targeted test, affected-flow smoke and relevant lint, type, palette and accessibility checks after each coherent edit or fix. On a shared component, cover consumers and both locales. A failure sends the slice back to diagnosis. Keep acceptance assertions unless the approved criterion changes.
4. **Independent review.** Freeze the candidate diff. Reviewer checks requirements, wiring, palette, privacy and accessibility, runs the changed flow, and reports actionable failures with evidence. Reviewer has no write ownership. Any material fix invalidates affected evidence and runs the same loop again. Run the full WS9 gate on the exact final candidate.
5. **Adjudicate.** After two unsuccessful repair rounds, or sooner if attempts repeat the same failure, record the last passing checkpoint, reproduction, impacts and owner. Hold the slice for a coordinator decision or human input. Critical failures, missing required checks and unresolved scope questions block that slice and any dependent slices. Known baseline failures stay visible in the ledger and never count as passes.
6. **Checkpoint.** Record candidate revision, artifacts, remaining findings and pending approvals in the issue or its local draft. Before any code commit, require zero errors from `pnpm typecheck` and `pnpm lint`. Before push, confirm required green checks and branch/deployment conditions. Publishing issue comments, PRs or test artifacts uses the existing repo workflow and authorization. No shared-environment deploy, merge or progression past a human gate follows from a reviewer pass.

Run Next.js dev, production builds, and typechecks that read `.next/types` serially in the same checkout. Other worktrees may run these independently. A changing build directory can cause missing generated types or load stale webpack output.

```text
Issue / requirement / workstream:
Base -> candidate SHA (or exact local diff hash):
Role, route, locale, viewport, flags, fixture and tool versions:
Criterion | command/steps | expected | actual/exit | artifact | pass/fail/blocked
Independent verifier / findings / repair round:
Pj decision or required reviewer / timestamp / exact candidate:
Next authorized step / owner:
```

Use the issue for durable decisions and the verification record for PR evidence. Update PRD or decision docs in the implementation PR if behavior changes. On resume, check the last checkpoint against the actual revision and open findings, rerun an affected smoke test, and take the next authorized step. If code or relevant configuration changed, recapture affected evidence before advancing. Do not carry a pass across different candidate revisions without verifying the evidence still applies.

## WS9 gate for every UI PR

- [ ] `pnpm typecheck`, `pnpm lint` with JSX accessibility rules, `pnpm test`, and relevant API/data tests pass. Use baseline CI's existing setup and commands. Add new browser, axe and palette commands in WS1 and document how to run them. Add a migration/type regeneration check where schema changes.
- [ ] Playwright exercises every changed screen in English and Hindi at 360×640, 412×915 and 1280×800. Include relevant loading, empty, failure and success states.
- [ ] Attach comparable before and after screenshots for every affected route, viewport and locale. Reuse Playwright fixtures and capture screenshots in the same runs where practical.
- [ ] Axe reports zero serious or critical findings. Cover sign-in, onboarding by role, post job, apply, bulk upload and profile as those flows are changed. Check keyboard, first-error focus, dialog behavior, 200% zoom, reduced motion, high contrast, TalkBack and Hindi reading independently. Assess against WCAG 2.2 AA, with 48px and 16px as product thresholds. Automated scans are only part of the accessibility evidence. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [ ] Palette guard compares the approved token declarations to base and checks new color uses in CSS, Tailwind, SVG and inline styles, catching utility and arbitrary color additions. Record any derived state use of existing tokens. Test the guard against one allowed token use and one forbidden addition.
- [ ] Lighthouse mobile on changed public pages reports Accessibility ≥95, Performance ≥80 and CLS <0.1. Measure marketing LCP <2.5 s on the specified 4G profile and record the repo's separate public-page <2 s target. Record build mode, data and throttling settings.
- [ ] Slow 3G with 4× CPU slowdown keeps changed flows usable with no blocking spinner over three seconds. Record taps and seconds for the main task. WS2 records full address in ≤30 seconds, cached search <300 ms and component bundle impact <15 KB gzip. WS8 records result times <300 ms on representative data. Treat the brief's six-tap apply example as a proposed budget until approved.
- [ ] Hallmark renders changed pages. For redesigns, capture `sloplint --render --before` before editing and run `sloplint --render --kept` on the same targets after, using the installed version's route and scope flags. Match login role, fixtures and flags. Use Playwright to verify links, fields, handlers and navigation Hallmark cannot exercise. Record Floor findings, Reflex decisions and fresh review. Missing Chrome/render support means rendered evidence is blocked.
- [ ] For a user-facing flow, `docs/ux/verification/<pr-name>.md` records role, change, three plain-language tasks, success thresholds, an observation sheet, screenshots and the authorized candidate build link or blocked status. Record time, taps, errors, hesitations and anonymized comments.
- [ ] Pj reports results from five users per changed flow, or three for a small change, with at least two low-literacy participants on a real low-end Android phone and real network. Include the five-second comprehension check, first-tap check and Hindi read-aloud. Require at least 80% unassisted completion per task, median within target and fewer than two users stuck at any step. Fix failures, rerun automated gates, and retest failed tasks before marking the affected flow release-ready.
- [ ] Major redesigns have approved flags for marketing home, job cards, filters and onboarding. Verify on and off paths, including that the flag can disable the redesign without a deploy. Future feedback prompt remains proposal-only pending Pj approval.

In WS1, create or update `.github/pull_request_template.md` with one checkbox per brief gate item. A blocked check stays unchecked with an owner and dependency. A public-page-only check can be marked inapplicable with the changed-surface rationale.

## Unattended decision and reporting rules

- Treat approved repo requirements and explicit brief criteria as implementation direction. Use reversible local defaults for routine engineering choices and record them in the ledger. For an unresolved product or policy requirement, add a question to the issue or its local draft and park the affected work.
- Use four states: ready, running, blocked and verified locally. Mark a slice release-ready only after all automated and applicable human checks pass on the candidate. Tests or drafts that need human review may be prepared locally. RLS, auth/OTP, existing-data migrations, payments and DPDP consent changes require human approval before adoption. Preserve staging and follow normal authorization for publishing, merge and deployment.
- Pick the next ready slice after an independent pass, a bounded repair, or a documented blocker. Continue while approved ready work exists. If every remaining slice depends on unavailable input or tooling, finish independent documentation, record the recoveries attempted and close the run with an explicit partial outcome.
- At the end, deliver one morning report in the chat. Link the branch, candidate commits and evidence. List completed work, exact tests and results, verified behavior, failed or unrun checks, parked work and the critical decisions or materials needed from Pj. State staging activity and whether publishing happened. Human UX studies, TalkBack and Hindi read-aloud require real evidence. Use the report to request any still-needed human step.


## Reference practices

Use a durable acceptance list, one verified increment at a time, and a recorded handoff. Borrow planner, worker and judge separation, while limiting parallelism to independent slices and keeping Pj's gates in control. [Anthropic's effective harnesses](https://www.anthropic.com/research/effective-harnesses-for-long-running-agents) · [Cursor's planner and worker research](https://cursor.com/blog/scaling-agents)
