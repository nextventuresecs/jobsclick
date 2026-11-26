# Jobsclick redesign completion report

26 November 2026 · Branch `codex/js-02-js-05-ux-workflow`

The home page, jobs search and cards, job detail and seeker profile editor are implemented on the UX branch. Tests ran against a local production build and disposable services. Staging and the existing local development services were untouched. The branch is a local review candidate.

## Completed

| Requirement | Delivered |
| --- | --- |
| WS0, WS1, WS9 | Phase 0 audit for six roles. Unattended coordinator, specialist and verifier workflow. Shared button target, typography, focus and reduced-motion defaults. PR verification checklist and documented palette and logo baseline. |
| WS6, public home | Labelled job search, entry points for job seekers, employers and colleges, live job previews, and bilingual heading, FAQs and metadata. Removed static category counts and unsupported proof claims. The shared header has a compact menu at narrow and tablet widths. Header and footer links preserve Hindi URLs. The footer retains role, privacy and category links. Reused the existing logo, colors, typography and audience destinations. |
| JOB-02, WS7 and WS8 | Shareable bilingual search URLs, removable filters, result counts, server pagination, distinct empty and failure states, and retry with filters retained. Cards link to the localized detail and Apply section. Employment type checks the first 20 results within the current API contract. |
| JOB-03, WS7 | One responsive Apply control for open jobs, clear closed and unavailable states, bilingual detail landmarks, public company and share links, and JobPosting structured data for open listings. |
| JS-02, WS3 | Three seeker profile steps, focus moved to the new step, required-field validation, associated field labels, appropriate keyboard and autofill hints, and in-session draft state on Back. Existing save, cancel and PDF actions remain available. |
| AUTH-07, WS4 | Direct first visits to `/hi` and `/hi/jobs` return server-rendered Hindi, including visitors with an English preference. |
| WS2, India location sources | Collected and validated official LGD state and district references and India Post PIN data offline. Recorded provenance and checksums for 36 states and UTs, 785 district codes and 19,300 PINs. Production integration requires refreshed exports and mapped district names. [Source record](../../data/geo/README.md) |

Workflow and evidence records are in the [agent workflow](agentic-workflow.md), [Phase 0 audit](audit.md), [shared-button verification](verification/shared-button.md) and [client decisions](../decisions/001-client-decisions.md).

## Tested

| Check | Result |
| --- | --- |
| Build and static gates | Production Next.js build, workspace `pnpm lint`, `pnpm typecheck` and Git whitespace check passed. The theme configuration, global stylesheet, shared UI package and public assets match the start of this slice. English and Hindi have the same 1,054 message keys. |
| Web | **273 passed** across **39 files**, including 8 production startup tests. Regressions cover first-load Hindi, labelled search, localized links, feed and detail outages, missing and closed jobs, a single Apply control and JobPosting data. |
| Headless Chrome | **9 public route checks** across two mobile window sizes and desktop. Checked fresh Hindi navigation, fixture content and the Apply anchor. English jobs passed the HTTP baseline. The seeker form fixture passed label association, required fields, step focus, draft retention, final submission, Cancel and PDF action. |
| Responsive and axe | The Hindi home, search and detail screens had zero horizontal overflow at 320, 768 and 1024 CSS pixels with the menu open and closed. The menu and language controls measured at least 48 × 48 CSS pixels and opened and closed in the fixture. Axe found zero WCAG 2.2 A/AA-tagged violations in 12 initial public-page states across English and Hindi at 360 and 1280 pixels. |
| Hallmark | Rendered three public routes and captured 15 screenshots on the final sweep. Floor failures dropped from 8 to 0. Hallmark still exits nonzero with 15 Reflex findings and 8 warnings, including copy density, layout density and control states. |
| Local performance | One cold 360px run per public route and language, with 1.6 Mbps download, 150 ms latency and 4× CPU slowdown. The six runs recorded LCP between 0.90 and 1.26 seconds and initial layout shift up to 0.041. Lighthouse and real-device release measurements remain open. |
| Isolated Postgres and Supabase | **53 passed** in 6 database files on disposable Supabase CLI 3.1.0 with tracked migrations. |
| Isolated API and worker | **124 passed** in 15 files. Covered public job discovery, persistence, contact visibility, queue coalescing, health and controlled payment and sponsorship fixtures. |
| Additional endpoint-adapted tests | **28 passed, 2 failed** across four files using only scratch endpoint overrides and a real-Redis worker retry. The existing mock path lacks Redis Lua `cmsgpack`. With real Redis, the cluster suite passed bulk import and showed two remaining fixture failures. Retry reported 4 where the assertion expected 3. Invite dispatch timed out after the worker rejected the batch with `INVITE_WAVE_BATCH_MISMATCH`. Repository worker code and tests were left as-is. |

Disposable Supabase and Redis used ports 56321, 56322 and 56379. The test preload blocked outbound service hosts and the existing default local ports. The disposable project and Redis container were removed after the run.

Local evidence is in the [public browser and screenshot folder](../../.scratch/jobsclick-public-ux) and the [disposable service logs](../../.scratch/jobsclick-services-ux-7f2a).

## Needs your input

1. **Production location data.** Supply or authorize fresh bilingual LGD district and India Post PIN exports. Confirm an authoritative crosswalk for the 38 mismatched postal district pairs and the owner of the institution roster and duplicate review. Review the location RLS and any legacy-address migration before adoption.
2. **Product decisions.** Confirm employer and institution onboarding destinations, approved support and marketing material, and whether to scope Apply Undo, wallet messaging, voice or location features. Auth and OTP, payments and consent proposals remain subject to human review.
3. **Release evidence.** Confirm access to an isolated preview and identify testers for Hindi copy, TalkBack and low-end Android task trials.

## Remaining engineering

Full bilingual and accessibility coverage across role workspaces, employer and institution onboarding, nationwide location UI and persistence, server-side employment-type and district filters, full-flow Playwright and failure-state testing, Lighthouse and slow-network measurements, and automated palette and release gates remain open. The worker cluster failures are a separate test-maintenance issue. The local redesign has not completed the full release gate.
