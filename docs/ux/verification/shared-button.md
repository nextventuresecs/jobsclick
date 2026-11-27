# Shared button verification

Issue draft WS1.1. Related surfaces include JOB-02 (public search), JOB-03 (apply), EMP-05 (employer workspace), and JS-02 (seeker profile). The change updates the shared Button component. Native buttons and consumer-specific size overrides need their own audit.

## Local evidence

| Check | Result |
| --- | --- |
| Red phase | Five targeted regressions failed on baseline for missing target, focus and reduced-motion classes. |
| Independent review | Found that changing the arbitrary brand utility to a named utility altered CSS source order and overrode an existing amber action. The final implementation resolves the original palette tokens through arbitrary utilities and retains caller precedence. A generated stylesheet regression check covers both amber and orange overrides. |
| Component browser fixture | Chrome passed six viewport and language combinations. Actual rendered minimum was 48px high, text was 16px, Tab showed a solid 2px outline, the loading icon stopped in reduced-motion mode, and both default and custom colors matched. The fixture used the actual component and Tailwind config. Screenshots are component fixtures. |
| Public route browser smoke | Chrome passed 12 checks across home and jobs search, with English and Hindi preferences at three viewports. Search targets remained at least 48px high, text was 16px, Tab applied a 2px outline, and reduced motion suppressed transition. First-visit Hindi HTML without a locale cookie still needs the AUTH-07 follow-up in the audit. |
| Palette source check | Tailwind token config, global font stylesheet and logo source have no diff. |
| Release checks | Tracked in the PR verification checklist and [Phase 0 audit](../audit.md). |

## User tasks for the affected flows

Use a future authorized candidate on a low-end Android phone. Ask participants to attempt each assigned role task unassisted.

| Scenario | Success criterion |
| --- | --- |
| Find a job by typing a word and tapping Search. | Finds Search on the first attempt and reaches results. |
| Open a job and find its Apply button. | Identifies the action without help and can reach it with keyboard or TalkBack as applicable. |
| Open a profile and find the Save changes button. | Reaches the correct button, reads it aloud in the assigned language and recognizes when submission is busy. |

Record the time and taps per user and task, mistakes, hesitations, and anonymized comments. Record five-second comprehension, first-tap accuracy and Hindi read-aloud. Use five participants per changed flow or three for a small change, including at least two low-literacy participants. Pass when ≥80% complete each task independently, median meets the flow target and at most one user gets stuck at any step.

| Participant code | Task and locale | Completed alone | First tap correct | Seconds | Taps | Errors / hesitation / comment |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

Human test and authorized build link are pending. Use a local or isolated preview approved by Pj. Staging is excluded.
