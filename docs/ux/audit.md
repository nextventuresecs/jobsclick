# Jobsclick Phase 0 UX audit

Baseline `96a6875` on the isolated UX branch. This audit covers the source at that revision. See the [run report](morning-report.md) for runtime evidence and unavailable checks. Relevant requirements include AUTH-02, AUTH-07, JS-01, JS-02, JS-05, EMP-01, EMP-02, EMP-05, JOB-01 to JOB-03, INT-01 and BULK-01 to BULK-05. The client decisions place Hindi in launch scope.

## Route and screen inventory

Paths in this table are relative to `apps/web/src/app`. Hindi URLs reuse the same page modules through `apps/web/src/middleware.ts:97`. English-prefixed URLs redirect to the default URLs. Navbar, footer, locale-switching, error and auth dialogs cross route boundaries.

| Route | Screen and controls |
| --- | --- |
| `/` | Public home. Search with keyword and location, categories, recent job card links, how-it-works preview, role CTAs. `page.tsx:117,127,245,302,465,526`. |
| `/jobs` | SSR job results, keyword/location GET form, category and employment-type links, hidden minimum pay parameter, feature-gated saved-search alert, job cards, reset and empty states. `jobs/page.tsx:50,115,163,192,237,250,332`. |
| `/jobs/[id]` | SSR job detail, company links, Apply controls and JobPosting JSON-LD. `jobs/[id]/page.tsx:38,72,153,288`. |
| `/company` | Employer directory, text search and company cards. `company/page.tsx:23,110,151`. |
| `/company/[id]` | SSR public company profile, location, QR and open-job links. `company/[id]/page.tsx:34,163,245`. |
| `/company/bulk-onboard` | Employer/MSME upload. XLSX/CSV templates, source/file fields, preview and row review. `company/bulk-onboard/page.tsx:61,230,344,418,493`. |
| `/institutions` | Institution directory, search, type filters, cards and role CTA. `institutions/page.tsx:45,212,250,342,429`. |
| `/institution/[id]` | SSR institution profile, QR, website, public sections and flag-controlled enquiry form. `institution/[id]/page.tsx:40,174,232`, `components/workspaces/institution/PublicInstitutionTabs.tsx:351`. |
| `/how-it-works` | Existing public explainer with seeker, employer and institution sections. `how-it-works/page.tsx:29,156,163,170`. |
| `/privacy` | Privacy page. `privacy/page.tsx:3`. Route changes to consent/legal copy to human review. |
| `/workspace` | Authenticated role router. `workspace/page.tsx:29,45`. Nested screens below. |
| `/auth/callback` | Google callback and callback/error state. `auth/callback/page.tsx:9`. |
| `/auth/verify-email` | Email verification and status. `auth/verify-email/page.tsx:7,49`. |

Dedicated employer/institution/seeker marketing landings, About and Contact have no corresponding checked-in page modules. Existing directories and explainer anchors cover some of that intent. Shared navigation and footer destinations are in `components/layout/Navbar.tsx:60,190` and `components/layout/Footer.tsx:49,120`. Use approved destinations and preserve existing working links.

### Role screens inside the workspace

Component paths are relative to `apps/web/src/components`.

| Role | Screen and form inventory |
| --- | --- |
| Employer/MSME | Overview, company profile and governance/social editor, jobs list and promotion, post job, applicant table and detail/interview modal, walk-in QR. `workspaces/EmployerWorkspace.tsx:48,76`. Forms are under `workspaces/employer/`. |
| Institution | Overview, profile and governance editor, student directory, quick add, placement dashboard, roster upload/paste/review, invite-wave scheduler, campus QR, flag-gated CMS and inquiry. `workspaces/InstitutionWorkspace.tsx:89,120`. Forms are under `workspaces/institution/`. |
| Student | Seeker overview, applications, profile with demographics, education, institution, optional identity and skills/preferences, digital CV/PDF. `workspaces/SeekerWorkspace.tsx:50,76`, `workspaces/seeker/SeekerProfileForm.tsx:32` and `SeekerDemographicsFields.tsx:66`. |
| Individual | Same seeker workspace and forms with individual type default and no required institution affiliation. `workspaces/seeker/useSeekerWorkspace.ts:21`, `SeekerKycAndEduFields.tsx:87`. |
| MSME admin | Default tab/title differ by role. Shared admin console includes overview, broadcast targeting and confirmation, district reports, job and business views, audit log search. `workspaces/AdminWorkspace.tsx:25,138,166,218,260,297`, `workspaces/admin/MsmeBroadcastConsole.tsx:315,546`, `DistrictReports.tsx:176`. |
| Platform admin | Same admin shell with role-dependent entry. Business view uses sample data in source. Audit log, job moderation and export permissions need real role fixtures for verification. `workspaces/AdminWorkspace.tsx:117,142,171,270,297`. |

Shared AuthModal provides role selection, sign-in entry, OTP and alternate channels. LinkPhoneModal provides send and verify. Existing wallet surfaces are flag-controlled. Auth/OTP, payments and audit behavior are protected. `auth/AuthModal.tsx:408,575,705`, `auth/LinkPhoneModal.tsx:200,238`.

## Current design system

Source lock candidates are `apps/web/tailwind.config.js:11–37`, `apps/web/src/app/globals.css:6–35`, `apps/web/src/app/layout.tsx:1–2,60` and `packages/ui/src/JobsClickLogo.tsx:3–108`.

| Role | Existing configured values |
| --- | --- |
| Brand | Orange `#C2410C`, hover `#9A3412`, orange light `#FFF0E5`, yellow `#FBBF24`, yellow light `#FFFBEB`, charcoal `#1F2937`, charcoal dark `#111827` |
| Grays | Light `#E5E7EB`, soft `#F3F4F6`, text `#374151`, muted `#6B7280`, surface `#F9FAFB` |
| States | Success `#15803D`, warning `#B45309`, error `#DC2626`, info `#475569` |
| Typography | Local Inter Variable and Noto Sans Devanagari Variable. Hindi resets tracking and uses 1.35 heading line height. Tailwind defaults include 12/14/16/18px for xs/sm/base/lg at a 16px root. Home H1 uses 30/36/48px across breakpoints. |
| Spacing and radius | Default Tailwind scale. Frequent horizontal padding 16/24/32px, gaps 8/12/20px, radii 6/8/12/16px. Shared button variants are 38/44/50px minimum heights. |
| Logo | Full, icon, mono and dark variants. Heights 28/36/44/56px. Artwork uses orange gradient `#FB923C` / `#F97316` / `#EA580C`, brand gold, mono grays, and white dark wordmark. Wordmark declares Plus Jakarta Sans with system fallback. Keep artwork as supplied. |

No site-wide theme switch found. Some protected surfaces have `dark:` styles. Keep those existing variants and measure actual mode behavior once a local app can be launched.

## Location and institution inventory

| Surface | Current data and handoff |
| --- | --- |
| Seeker profile | Street, city, district, state and PIN in `SeekerDemographicsFields.tsx:72–125`. Free-text institution in `SeekerKycAndEduFields.tsx:87–97`. `seekerApi.ts:41–47` sends the address shape, `packages/validation/src/profiles.ts:21–27` validates it and `apps/api/src/profiles/profiles.service.ts:214–245` maps it. |
| Seeker work preferences | Separate comma-separated preferred locations in `SeekerSkillsAndPrefsFields.tsx:91–108`. Stored as an array through `useSeekerWorkspace.ts:132–155` and `profiles.service.ts:250`. Preserve distinction between residence, current location and work preferences. |
| Employer company | Premise, city, district and state in `CompanyBasicDetailsFields.tsx:104–124`, payload `employerApi.ts:140–143`. Current form/contract has no employer PIN. API `profiles.service.ts:318–337`. |
| Job posting | Inputs in `JobPostFormFields.tsx:95–117`. `useEmployerWorkspace.ts:79–90` persists city/district and derives state from company. Plant/worksite text appears in UI state and is omitted from this write payload. Resolve intended worksite behavior under JOB-01 before changing the contract. |
| Institution campus | Street, city, district, state and PIN in `InstitutionProfileForm.tsx:115–140`. The form submits through `useInstitutionWorkspace.ts:247–255`. The shared schema validates it in `profiles.ts:111–117` and the API maps it in `profiles.service.ts:515–542`. |
| Public institution enquiry | City input and institution-derived state in `PublicInstitutionTabs.tsx:65–77,437–449`. Verify current feature scope and preserve enquiry wiring. |
| Public search and directories | Home forwards location. Jobs results forward a city term. The current RPC uses case-insensitive exact city matching. Company and institution directories include location in their existing text filters. `app/page.tsx:148`, `app/jobs/page.tsx:52,63,131,239`, `app/company/page.tsx:74–84`, `app/institutions/page.tsx:72–80`, `supabase/migrations/20261122130000_search_jobs_invoker_hardening.sql:85`. |
| Bulk, broadcast, reports | Check employer CSV city/district defaults in `app/company/bulk-onboard/page.tsx:103–135`. Admin broadcast district selection `MsmeBroadcastConsole.tsx:35–44,310–325` and report filter `DistrictReports.tsx:56,174–183` carry distinct meanings. Preserve import source, invite boundaries and audit behavior. |

`git ls-files -- data/geo data/institutions` returned zero files. WS2 production reference data needs approved bilingual LGD state/district data and India Post PIN/post-office mappings with versions, origin and license. Institution roster can be supplied separately. Free-text intake with pending approval requires ownership, moderation and duplicate rules. Existing P3 location-node schema is separate. Plan read-only lookup RLS and legacy migration review, preserving unmatched historical address text and preventing contact/location leaks through public projections. Verify extension availability against a disposable database. Cover multiple localities per PIN, unknown PIN, mixed scripts, stale lookups, manual overrides and keyboard use with reproducible fixtures.

## Source findings and verification targets

All findings here are source or palette calculations. The requested browser matrix is 360×640, 412×915 and 1280×800 in English and Hindi. Pass status requires rendered measurements.

| Scope | Evidence and impact | Owner |
| --- | --- | --- |
| Public home/jobs | Placeholder-dependent search fields and suppressed outline on inputs. Visible focus and label association need repair. `app/page.tsx:127–151`, `app/jobs/page.tsx:115–139`. | WS1/WS8 |
| Shared controls | Default button min-height 44px and small 38px. Utility type reaches 12/14px. Jobs filter links use 12px with 4–6px vertical padding. Confirm rendered target size and improve reusable states. `packages/ui/src/button.tsx:24–45`, `app/jobs/page.tsx:177,208`. | WS1 |
| Public cards and search | Job cards expose more than five facts. Empty state nests interactive controls, and an API failure becomes an empty result. Multiple apply controls without requested mobile sticky treatment. `app/jobs/page.tsx:73–86,250–338`, `app/jobs/[id]/page.tsx:175,303`. | WS7/WS8 |
| Forms | Seeker form and post-job form exceed five fields per screen, with sibling labels lacking explicit associations on several controls. Institution profile is similarly dense. `SeekerProfileForm.tsx:32–80`, `SeekerDemographicsFields.tsx:23,72–128`, `JobPostFormFields.tsx:15–165`, `InstitutionProfileForm.tsx:90–151`. | WS1/WS3 |
| Contrast | Static WCAG ratios from existing pairs: white/orange 5.18:1, charcoal/yellow 8.79:1, yellow/white 1.67:1, muted gray on gray-soft 4.39:1, and gray-light/white 1.24:1 where it is the only functional boundary. Jobs uses gray-400 on white (~2.54:1) at `app/jobs/page.tsx:315`. Reuse existing compliant pairs and check computed states. | WS1/WS5 |
| English/Hindi | Catalog key parity does not cover hardcoded English. Examples are jobs placeholders/empty copy, navigation menu label, auth inputs, inquiry submit state and how-it-works examples. `app/jobs/page.tsx:118,332`, `Navbar.tsx:174–181`, `AuthModal.tsx:599,622,724`, `PublicInstitutionTabs.tsx:483`, `app/how-it-works/page.tsx:346`. | WS4 |
| First-visit Hindi | A new local GET to `/hi` and `/hi/jobs` with no `NEXT_LOCALE` cookie returned `<html lang="en">` in both dev and a production build. Production responses set the Hindi cookie. The same routes rendered `lang="hi"` once Chrome carried the Hindi preference. Existing middleware unit tests pass. Draft AUTH-07 acceptance criterion: a fresh browser or crawler with no cookie receives Hindi content and `lang="hi"` on both routes. | WS4 |
| Public claims | The home source uses a static category count table (`app/page.tsx:47–55`). Verify a live source or remove the numeric claim in the marketing slice. | WS6 |
| Status/focus review | Existing auth dialog has initial focus/trap logic. Dynamic validation, keyboard order, color-only states, modal close behavior, screen-reader result announcements, sticky-bar overlap, zoom and reduced motion require rendered and manual validation. `AuthModal.tsx:66–88,408–410`. | WS5 |
| Hallmark | Static scan of `apps/web/src` returned exit 1, 211 Floor failures, 18 Reflex findings and 83 warnings across 74 files. Examples are gradient flags on institutions and district reports, broad transitions, and tracked eyebrow copy on home. These are baseline signals to triage against actual renders and brand rules. | WS1/WS5/WS6 |

## Issue map and proposed order

The brief names nine workstreams and asks for three small PRs. Use small issue-linked slices following repository rules, retain the acceptance map, and defer the aggregate PR-count decision to the report. Order follows dependencies with independent slices available in parallel. This map is at workstream level. Each implementation issue needs the exact brief clauses and their corresponding evidence before dispatch.

| Slice | Acceptance evidence | Dependencies and scope decisions |
| --- | --- | --- |
| WS1 + WS9 foundation | Lock token/logo values, 48px controls, visible focus, 16px minimum text, spacing and real labels. Prove palette guard passes existing tokens and fails forbidden values. Browser/axe, a11y lint, PR evidence checklist and local-only gates. | Start after audit review. Fast checks first. Keep deployment jobs out of the verification path. |
| WS2 address UI and data | Accessible bilingual combobox, dependent state/district, PIN and locality fill, invalid fallback, editable values, all field consumers mapped. Cache/latency, ≤30s task and <15KB gzip. | Generic UI and synthetic tests independent. Production lookup, seed, RLS and legacy backfill require source data and human review. Optional location/voice capabilities need local-processing evidence and scope decision. |
| WS4 Hindi | Localized copy and metadata, locale preference and Hindi rendering, +40% expansion, Indian formats, catalog coverage and review file. | Existing catalogs and fonts available. Sensitive and uncertain language needs human review before publication. |
| WS7 cards/detail | Five visible facts, accessible controls, stable apply/save transitions, truthful server status, privacy, loading/error/empty, pagination, and feature flag on/off. | Reuse existing server contract. Undo Apply and wallet claims depend on separately approved semantics and actual enabled product features. |
| WS8 filters | Shareable URL and back behavior, results/count announcements, no-results recovery, keyboard sheet, measured query latency, voice privacy where applicable. | Static layout independent. District filtering consumes WS2 data. Shared server changes require contract and latency verification. |
| WS3 onboarding | One task per step, visible progress, small-screen keyboard/draft recovery, role-specific flows, Hindi, plain feedback and safe help links. | No auth/OTP adoption without required review. Preserve apply and profile contracts, approved role route destinations and feature flags. |
| WS6 marketing | Home sections and approved audience destinations, credible content and supplied imagery, responsive SSR, bilingual metadata/hreflang, public structured data and performance. | Preserve current destinations until new paths and copy are sourced. Any source-dependent claims remain out of publication. |
| WS5 final sweep | WCAG 2.2 AA evidence per flow, zero serious/critical axe findings, keyboard/zoom/TalkBack and Hindi reading checks, Lighthouse thresholds and manual checklist. | Run automated checks as slices land. Record real-user and assistive-technology evidence before release. |

Issues can be drafted locally. Questions for Pj are limited to missing materials, sensitive decisions and approvals. Staging remains excluded.

### Brief cross-check for issue drafting

| Brief clauses | Draft issue coverage |
| --- | --- |
| Rules and Hallmark | WS1/WS9 own theme lock, dependency review, before/after and wiring evidence. WS5 owns motion and focus review. Use supplied images and verified claims in WS6. State changes that depend on the server require a confirmed response. |
| Shared foundations | WS1 owns visible labels, contrast, typography, target sizes, visible focus, disabled/loading and reduced-motion defaults. WS3 and WS6 own primary-action placement per flow and public page. |
| Geo schema, lookup, picker and institutions | WS2 needs separate issues for sourced reference data and read policies, validated/cached/rate-limited API, keyboard/mobile picker, legacy field replacement, and institution seed or pending-intake path. Protect editable overrides and unknown-PIN fallback. |
| Low-literacy interaction | WS3 owns per-role wizard, accessible feedback, progress, draft recovery, choices, optional fields and persistent language placement. Route OTP changes to human review. Put unsupported speech, location and unpublished help contacts into the decision log. |
| Hindi and accessibility | WS4 owns catalog extraction, copy review and locale formats. WS5 owns labels, errors, landmarks, focus order, device and zoom tests. WS9 owns error-level JSX checks, automated scan coverage and reproducible viewport and network settings. |
| Marketing | WS6 owns actual role destinations, verified values and trust content, section order and FAQs, sticky CTA, images and footers, bilingual SEO, structured data, bundle/LCP/CLS and accessible states. Require a verified source for free-application terms. |
| Job surface and filters | WS7 owns card fact order, Apply/Save, privacy, disclosure/loading/retry, sharing and paging. WS8 owns filter choices, URL/history, result count and keyboard sheet, recent searches, safe zero-results relaxation and indexed latency. Require product confirmation for new undo, voice or credit behavior. |
| Evidence and rollout | WS9 owns separable checks for type/lint/unit, browser matrix, axe, palette, screenshots, Lighthouse, network/CPU, task effort, Hallmark, human study and flags. Keep any feedback prompt proposal-only until authorized. |
