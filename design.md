# Jobsclick design lock

The UX redesign uses the current Jobsclick palette, type, spacing, radius and logo. The Phase 0 baseline and exact source references are in [the UX audit](docs/ux/audit.md). This record locks the visual identity for Hallmark and names the existing sources of truth.

| Token family | Locked values and source |
| --- | --- |
| Brand | `brand.orange #C2410C`, `brand.orange-hover #9A3412`, `brand.orange-light #FFF0E5`, `brand.yellow #FBBF24`, `brand.yellow-light #FFFBEB` |
| Charcoal | `charcoal #1F2937`, `charcoal.dark #111827` |
| Gray | `gray.light #E5E7EB`, `gray.soft #F3F4F6`, `gray.text #374151`, `gray.muted #6B7280`, `gray.surface #F9FAFB` |
| State | `success #15803D`, `warning #B45309`, `error #DC2626`, `info #475569` |
| Fonts | Local Inter Variable and Noto Sans Devanagari Variable. Hindi letter spacing and heading line height are defined in `apps/web/src/app/globals.css`. Retain the existing system fallbacks. |
| Spacing, radius and type | Existing Tailwind scale. At the default root, common body sizes are `text-base` 16px and `text-lg` 18px. Common gaps are 8/12/20px. `rounded-md/lg/xl/2xl` map to 6/8/12/16px. Use existing scale values when increasing tap targets or font size. |
| Logo | Use `packages/ui/src/JobsClickLogo.tsx` as supplied, including all four variants, gradient stops and wordmark. |

Palette tokens live in `apps/web/tailwind.config.js`. Use the existing tokens for UI states and text contrast. Track existing artwork and literal colors as baseline exceptions in any future palette guard. Preserve current public layout wiring and use an applicable existing color pair if a source pairing fails contrast.
