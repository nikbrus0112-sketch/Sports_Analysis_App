# Swim Stroke UI Design Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the confirmed dark-mode-first Tailwind v4 design system to all four real user-facing screens (idle, processing, single-video fallback, full comparison view) as a pure styling pass — zero behavior, prop, state, or test-observable-text changes. The two dev-only tools (`ReferenceToolApp.tsx`, `AlignmentToolApp.tsx`) are untouched.

**Design tokens (from `@theme`, defined once in Task 1, reused by class name everywhere after):**

| Token | Value | Tailwind utility examples |
|---|---|---|
| `--color-background` | `#0f172a` | `bg-background` |
| `--color-foreground` | `#f8fafc` | `text-foreground` |
| `--color-card` | `#1e293b` | `bg-card` |
| `--color-primary` | `#3b82f6` | `bg-primary`, `text-primary`, `ring-primary`, `accent-primary` |
| `--color-primary-emphasis` | `#1e40af` | `bg-primary-emphasis` |
| `--color-accent` | `#d97706` | `text-accent` |
| `--color-destructive` | `#dc2626` | `border-destructive/40` (borders/tints only — see contrast note below) |
| `--color-muted` | `#1e293b` (reuses `card`) | `bg-muted` |
| `--color-muted-foreground` | `#94a3b8` | `text-muted-foreground` |
| `--color-border` | `rgba(255,255,255,0.08)` | `border-border` |
| `--font-sans` | `'Fira Sans', ui-sans-serif, system-ui, sans-serif` | `font-sans` (default) |
| `--font-mono` | `'Fira Code', ui-monospace, 'SFMono-Regular', monospace` | `font-mono` |

**Contrast finding from this planning pass (WCAG 2.1 AA, computed against the actual hex values, not assumed):**

| Pair | Ratio | Verdict |
|---|---|---|
| `foreground` / `background` | 17.06:1 | pass |
| `muted-foreground` / `background` | 6.96:1 | pass |
| `muted-foreground` / `card` | 5.71:1 | pass |
| white text / `primary` (#3B82F6) fill | **3.68:1** | **fails** AA-normal (needs 4.5:1) |
| white text / `primary-emphasis` (#1E40AF) fill | 8.72:1 | pass |
| `primary` text / `background` | 4.85:1 | pass |
| `primary` text / `card` | 3.98:1 | pass for large/bold text only |
| `accent` / `card`, `accent` / `background` | 4.59:1, 5.60:1 | pass |
| `destructive` (#DC2626) text / `background` | **3.70:1** | **fails** AA-normal |
| stock Tailwind `red-400` (#F87171) / `background`, `/card` | 6.45:1, 5.29:1 | pass |

Two consequences baked into the tasks below:
1. **Solid-fill CTA buttons (Try another video, Play/Pause) use `bg-primary-emphasis` as their resting state, not `bg-primary`.** White text directly on `#3B82F6` fails AA at the sizes this app uses. `primary` (#3B82F6) is reserved for contexts that don't need to carry small white text: focus rings, `accent-color` on native range/progress inputs, borders, and text-on-dark (where it independently passes at 4.85:1). This inverts the spec's "default/pressed" framing for buttons specifically — it's not a stylistic preference, it's the arithmetic — everywhere else `primary`/`primary-emphasis` are used as spec'd (emphasis = deeper/pressed).
2. **The error banner uses Tailwind's stock `red-400` for text color, not the custom `destructive` token.** `destructive` (#DC2626) stays reserved for low-opacity borders/backgrounds (`border-destructive/40`, `bg-destructive/10`) where WCAG's text-contrast rule doesn't apply; the *text* inside that banner needs an AA-passing color, and the brand-token red doesn't pass at 4.5:1 on this background. This is a common dark-UI pattern (semantic token for accents, a lighter tint of the same hue family for body text) — not a new dependency, `red-400` ships in Tailwind's default palette already.

**Tech stack:** React 19, Vite 8, TypeScript. New dev dependencies: `tailwindcss` and `@tailwindcss/vite` only (already confirmed with user). No component libraries, no CSS-in-JS, no new runtime dependencies — Tailwind utility classes are additive `className` strings on existing JSX, nothing structural beyond purely-presentational wrapper `<div>`s.

See `docs/superpowers/specs/2026-08-05-ui-design-pass-design.md` for the design rationale.

## Global Constraints

- **Zero behavior changes.** Every `data-testid`, every test-asserted text string, every prop, state variable, effect, and event-handler signature stays byte-identical. Only `className` props, purely-presentational wrapper elements, and the Tailwind/font setup are added.
- **No new test files, no new test cases.** The existing 93 frontend tests are the regression guard for this milestone — they exercise behavior and DOM-queryable text/testids, none of which change. Each task's verification step is `npx tsc -b && npm run test` expecting the same 93/93 pass count; a test going red means a `className`-only edit accidentally touched structure/text/props and must be reverted, not "fixed" with a new test.
- **`npx tsc -b`** (not `--noEmit`) for every type-check step.
- 2-space indentation, no semicolons in `.ts`/`.tsx` — standard CSS syntax (semicolons required) in `.css`.
- No new non-styling dependencies.

## File Structure

```
frontend/
├── package.json                          # modified: +tailwindcss, +@tailwindcss/vite (devDeps)
├── vite.config.ts                        # modified: +tailwindcss() plugin
├── index.html                            # modified: title, font <link>s
└── src/
    ├── main.tsx                          # modified: +import './index.css'
    ├── index.css                         # modified: Tailwind entry point + @theme
    ├── App.css                           # deleted
    ├── App.tsx                           # modified: +className only
    └── components/
        ├── FileUpload.tsx                # modified: +label wrapper, +className
        ├── ProcessingProgress.tsx        # modified: +className
        ├── VideoPoseViewer.tsx           # modified: className replaces most inline style
        └── ComparisonView.tsx            # modified: className replaces most inline style
```

---

### Task 1: Tailwind v4 setup — dependency, Vite plugin, theme tokens, fonts

**Files:**
- Modify: `frontend/package.json` (via `npm install`)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css` (repurposed)
- Delete: `frontend/src/App.css`

**Decision — delete `App.css`, repurpose `index.css`:** Both files are dead code today (zero `.css` imports anywhere in `.tsx`, confirmed). `App.css` is 100% unrelated Vite-template boilerplate (purple logo/hero/docs-footer styling) — nothing in it is reusable, so it's deleted outright. `index.css` is the conventional Tailwind entry point (every Tailwind+Vite guide uses this exact filename) and gets repurposed rather than inventing a new file — one CSS file for the whole app, imported once from `main.tsx`.

**Decision — Google Fonts via `<link>` in `index.html`, not `@import` in CSS:** a `<link rel="stylesheet">` is discoverable by the browser's preload scanner while it's still parsing raw HTML, before any CSS has been fetched or parsed — the font CSS (and, once that's parsed, the actual `.woff2` files) starts downloading in parallel with everything else. An `@import` inside `index.css` is only discovered *after* `index.css` itself has been fetched and parsed, adding a full request round-trip of delay before font loading even starts. `<link rel="preconnect">` for both `fonts.googleapis.com` and `fonts.gstatic.com` shaves the DNS/TLS handshake off that first request further. Also note: `display=swap` is **not implicit** when omitted from the CSS2 API URL — it must be passed explicitly as a query param to guarantee FOUT (visible fallback-font text immediately, swapped to the webfont on load) rather than leaving the browser's default (historically closer to FOIT — invisible text until the font loads or a timeout fires) in charge.

- [ ] **Step 1: Install Tailwind v4**

```bash
cd frontend && npm install -D tailwindcss@^4 @tailwindcss/vite@^4
```

- [ ] **Step 2: Wire the Vite plugin**

`frontend/vite.config.ts` (full file — only the import and one plugin-array entry change):

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only cross-origin fix: Vite serves the frontend on :5173, FastAPI runs
// separately on :8000 in development. In production the frontend is served BY
// FastAPI itself (see backend/app/main.py's frontend_dist_dir static mount) —
// same origin, so this proxy (and no CORS middleware) is all dev needs; the
// frontend can use relative fetch() paths unmodified in both environments.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/reference-clips': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
  },
})
```

- [ ] **Step 3: Delete `App.css`, repurpose `index.css`**

Delete `frontend/src/App.css`.

Replace all contents of `frontend/src/index.css` with:

```css
@import "tailwindcss";

@theme {
  --color-background: #0f172a;
  --color-foreground: #f8fafc;
  --color-card: #1e293b;
  --color-primary: #3b82f6;
  --color-primary-emphasis: #1e40af;
  --color-accent: #d97706;
  --color-destructive: #dc2626;
  --color-muted: #1e293b;
  --color-muted-foreground: #94a3b8;
  --color-border: rgba(255, 255, 255, 0.08);
  --font-sans: 'Fira Sans', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Fira Code', ui-monospace, 'SFMono-Regular', monospace;
}

:root {
  color-scheme: dark;
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
}
```

`color-scheme: dark` on `:root` tells the browser to render its own native UI (scrollbars, `<select>` dropdown chrome, `<input type="range">`/`<progress>` default rendering where not overridden) using its dark-theme form-control palette instead of light — this app has no light-mode toggle, so a static `dark` value (not `light dark`) is correct.

- [ ] **Step 4: Import the stylesheet**

`frontend/src/main.tsx` — add one import line, nothing else changes:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 5: Fonts + title in `index.html`**

`frontend/index.html` (full file):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <title>Stroke Analysis</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Verify**

```bash
cd frontend && npx tsc -b && npm run test
```
Expected: same 93/93 passing — this task touches zero `.ts`/`.tsx` logic.

```bash
cd frontend && npm run dev
```
Boot with no console errors; open devtools, confirm `body` computed `background-color` is `rgb(15, 23, 42)` and `font-family` starts with `Fira Sans`.

- [ ] **Step 7: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/index.html frontend/src/main.tsx frontend/src/index.css
git rm frontend/src/App.css
git commit -m "feat(frontend): add Tailwind v4 setup with dark-mode design tokens"
```

---

### Task 2: Shared component house style — `FileUpload`, `ProcessingProgress`

**Files:**
- Modify: `frontend/src/components/FileUpload.tsx`
- Modify: `frontend/src/components/ProcessingProgress.tsx`

**`FileUpload` decision — `<label>` wraps a `sr-only` input, not an absolutely-positioned overlay:** native `<input type="file">` renders an unstyleable OS-chrome button; the standard accessible pattern is to make the input itself invisible-but-present (Tailwind's built-in `sr-only` utility: `position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0)` — no `display:none`, no `visibility:hidden`, no `opacity:0`) and let a `<label>` wrapping it be the visible styled control. Browsers natively forward clicks anywhere on a `<label>` to its wrapped control — no JS needed. This is verified safe for the existing tests: `FileUpload.test.tsx` calls `userEvent.upload(screen.getByTestId('file-upload-input'), file)` directly against the input element by testid, and RTL's `getByTestId`/`toBeDisabled()` queries work identically whether or not the input is visually hidden, since `sr-only` doesn't set `display:none` and doesn't break `userEvent.upload`'s internal visibility check (which only rejects `display:none`/`visibility:hidden`/`opacity:0`, none of which `sr-only` sets).

- [ ] **Step 1: `FileUpload.tsx`**

```tsx
interface FileUploadProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
  testId?: string
}

export function FileUpload({ onFileSelected, disabled, testId = 'file-upload-input' }: FileUploadProps) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      Choose video file
      <input
        type="file"
        accept="video/mp4,video/quicktime"
        disabled={disabled}
        data-testid={testId}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
        }}
      />
    </label>
  )
}
```
`min-h-11` = 44px, satisfies the touch-target-size rule. `focus-within:ring-*` on the label (not `focus-visible` on the hidden input, which wouldn't be visible) gives keyboard-Tab users a visible ring. `disabled` state gets both `cursor-not-allowed` and dimmed `opacity-50`.

- [ ] **Step 2: `ProcessingProgress.tsx`**

```tsx
interface ProcessingProgressProps {
  current: number
  total: number
}

export function ProcessingProgress({ current, total }: ProcessingProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <progress
        value={current}
        max={total}
        data-testid="progress-bar"
        className="h-2 w-full flex-1 accent-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-card [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
      />
      <span className="w-12 text-right font-mono text-sm tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  )
}
```
`accent-color` (via Tailwind's `accent-primary`) is the cross-browser baseline. The `[&::-webkit-progress-bar]`/`[&::-webkit-progress-value]` arbitrary-variant overrides are added on top because WebKit/Blink's `accent-color` support tints only the value/fill, not the track background, which otherwise defaults to a light gray that clashes with the dark theme. `font-mono` + `tabular-nums` on the percentage.

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc -b && npm run test -- FileUpload ProcessingProgress
```
Expected: same tests pass — `getByTestId('file-upload-input')`, `toBeDisabled()`, `toHaveBeenCalledWith(file)`, `getByText('25%')`, `getByText('0%')` all unaffected by className/wrapper additions.

- [ ] **Step 4: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/components/FileUpload.tsx frontend/src/components/ProcessingProgress.tsx
git commit -m "feat(frontend): style FileUpload and ProcessingProgress"
```

---

### Task 3: `App.tsx` shell + idle screen + status messages

**Files:**
- Modify: `frontend/src/App.tsx`

**Decision — motion picker stays a native `<select>`:** `App.test.tsx` asserts `screen.getByTestId('motion-type-select')` is an `HTMLSelectElement`, iterates `MOTION_TYPES` asserting `screen.getByRole('option', { name: label })` for each, and reads `select.value`. A segmented two-button toggle would replace the `<select>`/`<option>` DOM shape entirely and break every one of those queries. Since this task must not change test-observable structure, the native `<select>` stays — styled with the same border/background/focus-ring treatment as everything else.

- [ ] **Step 1: Full `App.tsx` replacement**

```tsx
import { useCallback, useState } from 'react'
import { ComparisonView } from './components/ComparisonView'
import { FileUpload } from './components/FileUpload'
import { ProcessingProgress } from './components/ProcessingProgress'
import { VideoPoseViewer } from './components/VideoPoseViewer'
import { usePoseEstimation } from './hooks/usePoseEstimation'
import { useReferenceComparison } from './hooks/useReferenceComparison'
import { DEFAULT_MOTION_TYPE, MOTION_TYPES } from './lib/motionTypes'
import type { PoseSequence } from './lib/poseTypes'

const TARGET_FPS = 30

type AppState = 'idle' | 'processing' | 'ready'

export function App() {
  const [state, setState] = useState<AppState>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [poseSequence, setPoseSequence] = useState<PoseSequence | null>(null)
  const [motionType, setMotionType] = useState(DEFAULT_MOTION_TYPE)
  const { estimateSequence } = usePoseEstimation()
  const comparison = useReferenceComparison(poseSequence, motionType)

  const handleFileSelected = (file: File) => {
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setPoseSequence(null)
    setProgress({ current: 0, total: 0 })
    setState('processing')
  }

  const handleVideoElementReady = useCallback(
    (video: HTMLVideoElement) => {
      const run = async () => {
        const sequence = await estimateSequence(video, {
          targetFps: TARGET_FPS,
          onProgress: (current, total) => setProgress({ current, total }),
        })
        video.currentTime = 0
        setPoseSequence(sequence)
        setState('ready')
      }
      run()
    },
    [estimateSequence]
  )

  const handleReset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(null)
    setPoseSequence(null)
    setState('idle')
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Stroke Analysis</h1>
          <p className="text-sm text-muted-foreground">Compare your swim stroke against a reference clip</p>
        </header>

        {state === 'idle' && (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="motion-type-select" className="text-sm font-medium text-muted-foreground">
                Motion
              </label>
              <select
                id="motion-type-select"
                data-testid="motion-type-select"
                value={motionType}
                onChange={(e) => setMotionType(e.target.value)}
                className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {MOTION_TYPES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <FileUpload onFileSelected={handleFileSelected} />
          </div>
        )}
        {(state === 'processing' || state === 'ready') && videoUrl && (
          <>
            {state === 'processing' && (
              <div className="rounded-xl border border-border bg-card p-6">
                <ProcessingProgress current={progress.current} total={progress.total} />
              </div>
            )}
            {state === 'ready' && comparison.status === 'ready' && poseSequence ? (
              <ComparisonView
                userVideoUrl={videoUrl}
                userSequence={poseSequence}
                referenceVideoUrl={comparison.referenceVideoUrl}
                referenceSequence={comparison.referenceSequence}
                path={comparison.path}
                flags={comparison.flags}
                referenceClipCount={comparison.referenceClips.length}
                selectedClipIndex={comparison.selectedClipIndex}
                onSelectReferenceClip={comparison.selectReferenceClip}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {state === 'ready' && comparison.status === 'loading' && (
                  <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    Loading reference comparison…
                  </p>
                )}
                {state === 'ready' && comparison.status === 'no-reference-available' && (
                  <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    No reference clip available yet for{' '}
                    {MOTION_TYPES.find((m) => m.value === motionType)?.label ?? motionType}.
                  </p>
                )}
                {state === 'ready' && comparison.status === 'error' && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-400">
                    Something went wrong loading the reference comparison.
                  </p>
                )}
                <VideoPoseViewer
                  videoUrl={videoUrl}
                  poseSequence={poseSequence}
                  onVideoElementReady={handleVideoElementReady}
                />
              </div>
            )}
            {state === 'ready' && (
              <button
                onClick={handleReset}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-emphasis px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Try another video
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

Note: the `state === 'ready'` inner conditional structure, all `comparison.status` branches, and the outer `(state === 'processing' || state === 'ready') && videoUrl` gate are **unchanged** — only wrapped in presentational `<div>`s and given classNames.

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc -b && npm run test -- App
```
Expected: all `App.test.tsx` assertions pass unchanged.

- [ ] **Step 3: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/App.tsx
git commit -m "feat(frontend): style App shell, idle screen, and status messages"
```

---

### Task 4: `VideoPoseViewer` styling

**Files:**
- Modify: `frontend/src/components/VideoPoseViewer.tsx`

Only the JSX return block changes — no import, hook, ref, or handler changes.

- [ ] **Step 1: Replace the return block**

```tsx
  return (
    <div
      className="relative mx-auto max-w-full overflow-hidden rounded-xl border border-border bg-card"
      style={{ width: poseSequence?.videoWidth ?? '100%' }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="block w-full"
        onLoadedMetadata={drawCurrentFrame}
        onError={() => console.error('Video failed to load — check the file is a supported mp4/mov codec.')}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" />
      {poseSequence && (
        <div className="flex items-center gap-3 border-t border-border p-3">
          <button
            onClick={handlePlayPause}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary-emphasis px-4 text-sm font-medium text-white transition-colors hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={poseSequence.videoDurationMs / 1000}
            step={1 / poseSequence.targetFps}
            onChange={handleSeek}
            data-testid="scrubber"
            className="h-11 flex-1 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>
      )}
    </div>
  )
```
The dynamic `width: poseSequence?.videoWidth ?? '100%'` stays an inline `style` — it's a runtime value Tailwind can't express as a static class, and combining `style` + `className` is normal, not a "logic change." The range input keeps `h-11` (44px box height) purely to grow its clickable hit area to the touch-target minimum — the visible track/thumb render at their native small size in the middle of that taller box, no visual size change.

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc -b && npm run test
```
Expected: 93/93. (`VideoPoseViewer` has no dedicated test file — browser/MediaPipe-dependent, exempted since milestone 1 — so the full suite is what catches any regression through `App.test.tsx`'s indirect exercise of the "no reference" path, e.g. `getByTestId('scrubber')`.)

- [ ] **Step 3: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/components/VideoPoseViewer.tsx
git commit -m "feat(frontend): style VideoPoseViewer"
```

---

### Task 5: `ComparisonView` styling (the big one)

**Files:**
- Modify: `frontend/src/components/ComparisonView.tsx`

Only the JSX return block changes — all refs, effects, state, and the `POSE_CONNECTION_TUPLES`/`normalizeSkeletonForOverlay`/`drawSkeleton` calls are untouched.

**Decision — no delta-severity color gradient, defer it:** `currentFlags` is already pre-filtered by `checkpointFlags.ts` to only joints whose `|delta|` exceeds `DEFAULT_THRESHOLD_DEG` — every row in this table is, by construction, already "flagged." There's no color-only distinction being drawn *between* rows today. Adding a gradient (e.g., redder text the larger `|delta|` gets) would introduce new semantic meaning ("this flag is worse than that flag") that doesn't exist anywhere else in the app yet and isn't backed by any calibration (`checkpointFlags.ts`'s own comment already flags `DEFAULT_THRESHOLD_DEG = 15` as an uncalibrated first draft). Scope for this pass is "make the existing information look good," not invent new information — so the Delta column gets a single consistent `text-accent` treatment applied uniformly.

**Decision — overlay canvas stays square via `aspect-square` on its wrapper, not on the canvas element itself:** the canvas's `width`/`height` attributes are set to `400`/`400` by existing (unchanged) JS in a `useEffect`. Styling the canvas `w-full h-full` inside an `aspect-square` wrapper `<div>` means the wrapper is always square at any viewport width, and the canvas stretches to exactly fill that square box — never distorted at any breakpoint.

- [ ] **Step 1: Replace the return block**

```tsx
  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-card" data-testid="user-video-pane">
          <video ref={userVideoRef} src={userVideoUrl} className="block w-full" />
          <canvas ref={userCanvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" />
        </div>
        <div
          className="relative flex-1 overflow-hidden rounded-xl border border-border bg-card"
          data-testid="reference-video-pane"
        >
          <video ref={referenceVideoRef} src={referenceVideoUrl} className="block w-full" />
          <canvas ref={referenceCanvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" />
        </div>
      </div>

      {referenceClipCount >= 2 && (
        <div className="mt-4 flex items-center justify-center gap-4" data-testid="reference-clip-cycler">
          <button
            onClick={() => onSelectReferenceClip((selectedClipIndex - 1 + referenceClipCount) % referenceClipCount)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Prev
          </button>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            Clip {selectedClipIndex + 1} of {referenceClipCount}
          </span>
          <button
            onClick={() => onSelectReferenceClip((selectedClipIndex + 1) % referenceClipCount)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Next
          </button>
        </div>
      )}

      {path.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          No aligned frames to compare.
        </p>
      ) : (
        <input
          type="range"
          min={0}
          max={path.length - 1}
          step={1}
          value={pairIndex}
          onChange={(e) => setPairIndex(Number(e.target.value))}
          data-testid="comparison-scrubber"
          className="mt-4 h-11 w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-foreground">In-depth analysis</h2>
      <div className="mx-auto aspect-square w-full max-w-[400px] overflow-hidden rounded-xl border border-border bg-card">
        <canvas ref={overlayCanvasRef} data-testid="overlay-canvas" className="block h-full w-full" />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-foreground">Checkpoint flags at this frame</h2>
      {currentFlags.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Joint</th>
                <th className="px-4 py-2 text-right font-medium">Your angle</th>
                <th className="px-4 py-2 text-right font-medium">Reference angle</th>
                <th className="px-4 py-2 text-right font-medium">Delta</th>
              </tr>
            </thead>
            <tbody>
              {currentFlags.map((f, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{f.joint}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">
                    {f.userValue.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">
                    {f.referenceValue.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-accent">{f.delta.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          No flags at this frame.
        </p>
      )}
    </div>
  )
```

Breakpoint choice: video panes stack (`flex-col`) below `md` (768px) and go side-by-side (`md:flex-row`) at/above it — a 375px-wide phone screen split in half leaves ~180px per video, too cramped for skeleton overlays to read.

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc -b && npm run test -- ComparisonView
```
Expected: `ComparisonView.test.tsx`'s assertions pass unchanged — `getByTestId('user-video-pane')`/`'reference-video-pane'`, `getByTestId('comparison-scrubber')` with `toHaveValue('0')`, `getByText('No flags at this frame.')`, scrubbing to pair 1 revealing `getByText('leftElbow')`/`'110.0'`/`'90.0'`/`'20.0'`, `getByText('No aligned frames to compare.')` with scrubber absent, cycling-controls presence/absence by clip count.

- [ ] **Step 3: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/components/ComparisonView.tsx
git commit -m "feat(frontend): style ComparisonView"
```

---

### Final Task: Full regression verification

- [ ] **Step 1: Full type-check + test suite**

```bash
cd frontend && npx tsc -b && npm run test
```
Expected: 93/93 passing, identical count to the pre-styling baseline — no test file was created or edited across Tasks 1–5.

- [ ] **Step 2: Manual walkthrough — all 4 states**

```bash
cd frontend && npm run dev
```
1. **Idle:** motion `<select>` + `FileUpload` button render inside the card panel, header title shows, focus ring visible on Tab through select → upload button.
2. **Processing:** progress bar fills with `accent-primary`/webkit overrides, `0%`→`100%` text stays right-aligned and doesn't shift width (tabular-nums).
3. **Single-video fallback** (default state — reference library is empty today): status message banner renders legibly, `VideoPoseViewer`'s Play/Pause button and scrubber both meet the 44px tap-height, skeleton overlay canvas stays aligned over the video.
4. **Full comparison view** (requires a committed reference clip to reach): side-by-side panes stack correctly below 768px width, overlay canvas stays visually square at all widths, checkpoint-flags table scrolls horizontally rather than overflowing at 375px, Delta column reads in Fira Code.

- [ ] **Step 3: Spot-check contrast against the computed table above**

At 375px and desktop width, visually confirm: body/status text reads clearly against `bg-background`/`bg-card`, the "Try another video" and "Play/Pause" buttons (now `bg-primary-emphasis`) have clearly legible white text, the error-state banner shows legible `red-400` text.

- [ ] **Step 4: No commit** — this task is verification-only, nothing to stage.

---

## Self-Review Notes

- **Why zero new tests is correct, not a shortcut:** every edit across Tasks 1–5 is additive `className`/wrapper-only or global config. No new conditional rendering, no new derived state, no new event handler, no new data transformation was introduced anywhere — there is no new behavior for a test to cover.
- **Two contrast issues were caught and fixed during planning, not left to visual guesswork:** white-on-`primary` buttons (3.68:1) and `destructive`-token error text (3.70:1) both fail WCAG AA at the sizes this app uses; both were computed against the actual chosen hex values and resolved with `primary-emphasis` for solid button fills and stock `red-400` for error text.
- **`FileUpload`'s `sr-only` + `<label>` pattern was chosen over any absolute-positioning trick specifically because it's verifiable against the real test file.**
- **Motion picker stayed a native `<select>`, not a nicer-looking segmented toggle**, purely because `App.test.tsx` asserts `getByRole('option', { name: label })` — a hard DOM-shape constraint from the "zero test-observable changes" rule.
- **Severity color-coding for the checkpoint-flags table was deliberately deferred**, not omitted by oversight.
- **The `--color-muted` token intentionally reuses `--color-card`'s value** rather than inventing an undocumented third surface tone.

### Critical Files for Implementation
- frontend/src/index.css
- frontend/src/App.tsx
- frontend/src/components/ComparisonView.tsx
- frontend/src/components/VideoPoseViewer.tsx
- frontend/vite.config.ts
