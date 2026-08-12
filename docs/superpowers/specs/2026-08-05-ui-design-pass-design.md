# Frontend UI Design Pass — Design

## Goal

Seven feature milestones have shipped with zero visual design — every screen uses raw inline `style={{}}` or unstyled native HTML. This is the first real design pass across all 4 user-facing screens (idle/upload, processing, single-video fallback, full comparison view), using the `ui-ux-pro-max` skill's data-backed design-system search rather than freehand aesthetic choices.

## Process

Ran `~/.claude/skills/ui-ux-pro-max/scripts/search.py --design-system` with several keyword combinations. The skill's own landing-page-oriented pattern recommendations (Hero-Centric, Video-First Hero, Real-Time Operations Landing) don't apply — this app has no marketing page, it's a single functional tool — so those were discarded in favor of applying the STYLE/COLOR/TYPOGRAPHY/UX-rule outputs directly to the app's real 4 screens.

## Design system

**Styling stack: Tailwind CSS v4** via `@tailwindcss/vite`. Confirmed 10/10 framework compatibility with both the "Dark Mode (OLED)" and "Data-Dense Dashboard" style entries the skill returned. No `postcss.config.js` or `tailwind.config.js` needed — Tailwind v4's Vite plugin reads theme tokens from a CSS `@theme` block.

**Dark-mode-first.** Background `#0f172a`. Multiple search results (Data-Dense Dashboard's full dark-mode support, Dark Mode OLED's own entry, and the "Modern Dark" mobile-app entry) converged on dark backgrounds being the right call specifically because video and skeleton-overlay content — half this app's real estate — reads better against dark than light.

**Colors**, adapted from the skill's "Analytics Dashboard" palette (blue-driven, technical/precise) but swapped to dark-first instead of its light-first default:

| Token | Value | Notes |
|---|---|---|
| `background` | `#0f172a` | |
| `card` | `#1e293b` | surface one step up from background |
| `foreground` | `#f8fafc` | |
| `muted-foreground` | `#94a3b8` | |
| `border` | `rgba(255,255,255,0.08)` | subtle, matches Dark Mode OLED's border token |
| `primary` | `#3b82f6` | blue — technical, and a genuine thematic fit for swimming/water |
| `primary-emphasis` | `#1e40af` | deeper blue, used where solid-fill contrast matters (see below) |
| `accent` | `#d97706` | amber — flagged deviations, "this is what's off" |
| `destructive` | `#dc2626` | reserved for low-opacity tints/borders, not text (see below) |

Blue's swimming association wasn't the primary driver (the skill's own "Analytics Dashboard" result led with blue for its "technical/precise" data-tool framing, independent of this app's specific sport) — it's a bonus, not the justification.

**Typography — "Dashboard Data" pairing**: Fira Code (mono) + Fira Sans (UI text), over the also-considered "Sports/Fitness" pairing (Barlow Condensed/Barlow — more athletic-branded, less suited to dense numeric data). Fira Code isn't decorative: the skill's own `number-tabular` UX rule ("use tabular/monospaced figures for data columns... to prevent layout shift") applies directly to the checkpoint-flags table's angle/delta columns, which today reflow with the browser's default proportional font — a real, existing problem this fixes.

## Real contrast findings (computed, not assumed)

Choosing a palette from a design-system tool doesn't guarantee every combination is accessible — the specific pairings this app actually uses had to be checked against the real hex values:

- **White text on `#3b82f6` (primary) = 3.68:1 — fails WCAG AA** (needs 4.5:1 for normal-size text). This app puts white button text directly on primary-colored fills (Play/Pause, Try another video) at normal text sizes, so this isn't a theoretical edge case.
  - **Fix**: solid-fill buttons use `primary-emphasis` (`#1e40af`, 8.72:1 — comfortably passes) as their resting fill instead. `primary` (`#3b82f6`) stays for contexts that don't carry small white text: focus rings, `accent-color` on native range/progress inputs, borders, and as text color on dark backgrounds (passes independently at 4.85:1).
- **`#dc2626` (destructive) text on background = 3.70:1 — fails WCAG AA.**
  - **Fix**: the error banner's text uses Tailwind's stock `red-400` (6.45:1, passes) instead of the brand `destructive` token; `destructive` stays reserved for low-opacity borders/background tints (`border-destructive/40`, `bg-destructive/10`), where the text-contrast rule doesn't apply.

## Scope

All 4 real user-facing states, one coherent pass: idle (motion picker + upload), processing (progress bar), single-video fallback (shown whenever no reference clip is available — the app's actual default state today), and the full comparison view (side-by-side players + overlay canvas + checkpoint-flags table + clip cycling).

**Explicitly out of scope**: the two dev-only tools (`reference-tool.html`, `alignment-tool.html`) — internal tooling for seeding the reference library, never meant to be polished product UI.

## Constraints this pass respects

- **Zero behavior change.** Every `data-testid`, every test-asserted text string, every prop/state/effect/handler stays byte-identical. Only `className` and purely-presentational wrapper elements are added. The existing 93 tests are the regression guard — no new test files, no new test cases, because no new behavior exists for a test to cover.
- **No delta-severity color gradient in the checkpoint-flags table.** Every row shown is already binarily "flagged" by `checkpointFlags.ts`'s threshold (itself documented as an uncalibrated first draft). Adding a color gradient (redder = worse) would invent new semantic meaning not backed by any real calibration — out of scope for "make the existing information look good." A defensible future enhancement once real threshold calibration exists, not a styling-pass concern.
- **Motion picker stays a native `<select>`**, not a nicer-looking segmented toggle — `App.test.tsx` asserts `getByRole('option', {name})` for each motion, a hard DOM-shape constraint from the zero-behavior-change rule.

## Implementation notes

- `FileUpload`'s unstyleable native `<input type="file">` gets the standard accessible treatment: `sr-only` input wrapped in a styled `<label>` (browsers forward label clicks to the wrapped control natively, no JS needed) — verified safe against the existing test's `getByTestId`/`userEvent.upload`/`toBeDisabled()` queries, since `sr-only` (unlike `display:none`) doesn't fail `user-event`'s visibility check.
- The comparison view's overlay canvas (a fixed 400×400 JS-set attribute, per `normalizeSkeleton.ts`'s square-canvas requirement) is wrapped in a CSS `aspect-square` box so `w-full h-full` on the canvas itself never distorts the 1:1 drawing at any viewport width.
- The checkpoint-flags table gets an `overflow-x-auto` wrapper — currently a bare unwrapped `<table>` that would break on a 375px screen.
- Two dead CSS files (`App.css`, `index.css` — leftover `npm create vite@latest` scaffolding, confirmed zero imports anywhere in the codebase) are cleaned up: `App.css` deleted outright (nothing reusable in its purple-logo/hero/docs-footer boilerplate), `index.css` repurposed as the single Tailwind entry point.
