## Scope

- Issue and requirement IDs
- Changes and affected roles/routes
- Deferred items and rollback or flag behavior

## Verification

Link the exact candidate and evidence. Keep failed or blocked checks open and record the owner and next step.

- [ ] Typecheck, lint including JSX accessibility checks, unit tests and relevant API/data tests pass.
- [ ] Playwright verifies changed screens at 360×640, 412×915 and 1280×800 in English and Hindi.
- [ ] axe reports zero serious or critical issues on changed flows.
- [ ] Palette guard passes and focus, hover and error use existing tokens.
- [ ] Before and after screenshots are attached for every affected route, viewport and locale.
- [ ] Changed public pages meet Lighthouse accessibility, performance and CLS targets.
- [ ] Slow 3G and 4× CPU run is usable, with no blocking spinner over three seconds.
- [ ] Task times and taps are recorded against applicable targets.
- [ ] Hallmark rendered check passes. Redesigns pass the wiring comparison and include independent review and any Reflex decisions.
- [ ] Keyboard, focus, 200% zoom, reduced motion, high contrast and TalkBack evidence is recorded.
- [ ] Flow verification record contains scenarios, anonymized observations and the authorized candidate link.
- [ ] Required human reviews and real-user task tests passed on this candidate before release.
- [ ] Applicable feature flags verified in both states and rollback recorded.

For an inapplicable item, write the reason. Use the [workflow](../docs/ux/agentic-workflow.md) for thresholds and evidence.
