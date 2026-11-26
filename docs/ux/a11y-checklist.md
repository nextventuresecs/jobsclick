# Jobsclick accessibility checklist

Use an exact candidate and record route, role, locale, viewport, device, browser, flags and fixture. Attach the observed result and mark blocked checks with an owner. The product target is WCAG 2.2 AA with Jobsclick's 48px minimum controls and 16px minimum text.

- [ ] Keyboard only. Reach every action in order. Focus is always visible, including in dialogs and on controls near sticky bars. Enter/Space activate the expected action. Escape closes overlays and focus returns to the opener.
- [ ] Forms. Every control has a visible, associated label. Required and optional states are clear. Invalid submit moves focus to the first error, which is linked and explains the fix in words.
- [ ] Screen reader. Verify labels, page language, headings, landmarks, result and error announcements, combobox operation, disabled/loading states and controls with icons. Test TalkBack on low-end Android.
- [ ] 200% zoom and narrow screens. Read content and use every action without clipped text, overlapping controls or horizontal scrolling in single-axis content.
- [ ] English and Hindi. Run 360×640, 412×915 and 1280×800. Check Devanagari glyphs, +40% text expansion, Indian formatting, translated labels and errors, and Hindi read-aloud.
- [ ] Motion and gestures. Reduced motion disables nonessential transitions. Drag-based controls also have buttons. No hover-only information or automatic motion while reading.
- [ ] Contrast. Measure text and functional boundaries in normal, focus, error and disabled states as applicable. Check high contrast or forced colors where supported.
- [ ] Low-literacy task. Observe unaided first tap, comprehension, time, taps and recovery. Record anonymized results in the PR verification file.
- [ ] Automated evidence. Attach axe and lint results, screenshots, throttled flow evidence and public Lighthouse metrics where applicable.

Record the screen, input method and steps for each failure. Keep human and device checks open until exercised on the candidate.
