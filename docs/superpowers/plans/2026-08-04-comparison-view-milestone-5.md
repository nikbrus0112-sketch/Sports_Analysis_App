# Comparison View (Milestone 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement build-order step 4 of `sports-motion-comparison-spec.md` — "Side-by-side synced player with skeleton overlay" — as the first milestone that wires the real app (`App.tsx`) to the real backend (`GET /api/reference-clips`) instead of a dev-only, locally-picked-files tool. After the user's clip finishes processing, `App.tsx` fetches a reference clip for the hardcoded `freestyle` motion, runs the existing DTW + checkpoint-flags pipeline (milestones 3–4, unchanged) against it, and renders a new `ComparisonView`: two synced video+skeleton panes driven by one shared scrubber, a superimposed "in-depth analysis" canvas with both skeletons normalized for scale/position (spec section 6), and a checkpoint-flags panel filtered to the current scrubbed frame pair. The reference-clip library is still empty in this repo today, so a `'no-reference-available'` fallback (the existing single-video `VideoPoseViewer`) is a first-class, always-exercised path, not a hypothetical edge case.

**Architecture:**
- `frontend/src/lib/normalizeSkeleton.ts` (new): pure function that recenters landmarks on the hip midpoint and rescales by torso length, so `drawSkeleton` (unchanged, already supports a `color` option) can draw two differently-scaled/framed skeletons comparably on one canvas.
- `frontend/src/api/referenceClips.ts` (new): thin `fetch()` wrappers — `fetchReferenceClips`, `fetchPoseSequence` — using relative paths only, no base URL.
- `frontend/vite.config.ts` (modified): dev-only `server.proxy` for `/api` and `/reference-clips`, so those relative paths resolve to the backend in dev; in prod the frontend is served BY FastAPI (already-existing static mount), so no CORS code is ever needed.
- `frontend/src/hooks/useReferenceComparison.ts` (new): orchestrates fetch → DTW → checkpoint flags behind a discriminated-union status (`idle | loading | ready | no-reference-available | error`), so consumers narrow by `status` with no parallel boolean flags.
- `frontend/src/components/ComparisonView.tsx` (new): the synced side-by-side + superimposed-overlay + flags-panel component. Deliberately does **not** reuse `VideoPoseViewer` (it has no external-time-sync hook and is exempted from unit tests as browser/MediaPipe-dependent) — instead reuses the low-level pieces directly: `drawSkeleton`, `frameTimestampMs`/`seekTo` from `frameExtraction.ts`, and `POSE_CONNECTION_TUPLES` (newly exported from `VideoPoseViewer.tsx`, one-line change, zero behavior change there).
- `frontend/src/App.tsx` (modified): calls `useReferenceComparison(poseSequence)`, branches render on its `status` — `'ready'` → `ComparisonView`; anything else while `state === 'ready'` → the existing `VideoPoseViewer` plus a status message, preserving today's real (empty-library) behavior as the default path.

**Tech Stack:** Same as milestones 1–4 — React 19, Vite, TypeScript, Vitest + RTL. No new dependencies: native `fetch`, no axios/react-query (one clip-list fetch + one JSON fetch doesn't justify a data-fetching library).

See `docs/superpowers/specs/2026-08-04-comparison-view-milestone-5-design.md` for the design rationale.

## Global Constraints

- No new frontend dependencies.
- 2-space indentation, no semicolons — matches every existing `.ts`/`.tsx` file in this repo.
- `landmarksSmoothed`, never `landmarksRaw`, throughout.
- Pure logic (`normalizeSkeleton.ts`, `useReferenceComparison.ts`'s non-DOM parts, `referenceClips.ts`) gets full TDD unit coverage. `ComparisonView.tsx` is prop-driven (no mocking needed) and gets real RTL tests, unlike `VideoPoseViewer` — same exemption logic as milestone 1, but this component's testability is strictly better because it's driven by an external scrubber, not native video playback.
- Reuse over rebuild: `drawSkeleton` gets zero changes (its existing `color` option is exactly what superimposing needs); `POSE_CONNECTION_TUPLES` is exported and reused, not re-derived; the DTW+flags `useEffect` pattern from `AlignmentToolApp.tsx` is mirrored, not reinvented.
- The empty reference-clip library (`backend/reference_clips/` has zero real clips today) is a first-class state (`'no-reference-available'`), not a crash or an unhandled edge case — this is the literal state a fresh `git pull` + `npm run dev` is in today.
- Vite dev-server proxy (not backend CORS middleware) bridges the :5173/:8000 dev-time origin split — see Task 3's design notes for the full reasoning.

---

## File Structure

```
Sports_Analysis_App/
└── frontend/
    ├── vite.config.ts                                    # modified: server.proxy
    └── src/
        ├── api/
        │   ├── referenceClips.ts                         # new
        │   └── referenceClips.test.ts                    # new
        ├── lib/
        │   ├── normalizeSkeleton.ts                       # new
        │   └── normalizeSkeleton.test.ts                  # new
        ├── hooks/
        │   ├── useReferenceComparison.ts                  # new
        │   └── useReferenceComparison.test.ts             # new
        ├── components/
        │   ├── VideoPoseViewer.tsx                        # modified: export POSE_CONNECTION_TUPLES
        │   ├── ComparisonView.tsx                         # new
        │   └── ComparisonView.test.tsx                    # new
        ├── App.tsx                                        # modified
        └── App.test.tsx                                   # modified
```

---

### Task 1: `normalizeSkeleton.ts` — recenter/rescale for the superimposed overlay

**Files:**
- Create: `frontend/src/lib/normalizeSkeleton.ts`
- Create: `frontend/src/lib/normalizeSkeleton.test.ts`

**Interfaces:**
- Consumes: `LEFT_HIP`, `RIGHT_HIP`, `LEFT_SHOULDER`, `RIGHT_SHOULDER` from `./jointAngles`; `Landmark` from `./poseTypes`.
- Produces: `normalizeSkeletonForOverlay(landmarks: Landmark[] | null): Landmark[] | null` — used by `ComparisonView.tsx` (Task 5).

**Design notes (read before implementing):**
- **Scheme:** recenter on the hip midpoint (average of `LEFT_HIP`/`RIGHT_HIP`), rescale by torso length (hip-midpoint-to-shoulder-midpoint distance) so torso length maps to a fixed fraction (`TARGET_TORSO_FRACTION = 0.3`) of the `[0,1]`-ish space `drawSkeleton` already expects. The hip midpoint always lands at exactly `(0.5, 0.5)` regardless of input scale/position — this is the anchor the whole scheme is built around.
- **Why hip-to-shoulder, not e.g. bounding-box height:** both anchors are already-defined joint indices (`jointAngles.ts`), always present together (no separate visibility/confidence check needed beyond "the array has these 4 indices"), and torso length is far less sensitive to limb articulation (a raised arm doesn't change torso length, but would change a bounding box) — a stabler normalization reference across frames of the same clip.
- **Square-canvas requirement (important, feeds into Task 5):** `drawSkeleton` multiplies `x` by `canvasWidth` and `y` by `canvasHeight` independently. Because this scheme scales x and y by the *same* factor (torso length is a single scalar), the output is only undistorted if drawn on a canvas with `width === height`. `ComparisonView.tsx`'s overlay canvas must be square regardless of either clip's native video aspect ratio — noted again in Task 5.
- **Null passthrough:** `null` in, `null` out (mirrors `drawSkeleton`'s and `computeJointAngles`'s existing null handling).
- **Degenerate torso (length 0):** recenter only, `scale = 1` — avoids a divide-by-zero; documented as a `ponytail:` corner case, not expected from real MediaPipe output but cheap to guard.
- **Malformed short landmark arrays** (missing the 4 anchor indices): pass the array through unchanged rather than throwing. This pipeline always hands the full 33-point MediaPipe array here in practice — dead code for real input, cheap defensive guard for a fetched/hand-edited `pose.json`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/normalizeSkeleton.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeSkeletonForOverlay } from './normalizeSkeleton'
import { LEFT_HIP, LEFT_SHOULDER, RIGHT_HIP, RIGHT_SHOULDER } from './jointAngles'
import type { Landmark } from './poseTypes'

function landmark(x: number, y: number, z = 0): Landmark {
  return { x, y, z }
}

const NUM_LANDMARKS = 33
const NOSE = 0

function buildLandmarks(overrides: Partial<Record<number, Landmark>>): Landmark[] {
  return Array.from({ length: NUM_LANDMARKS }, (_, i) => overrides[i] ?? landmark(0, 0))
}

describe('normalizeSkeletonForOverlay', () => {
  it('passes null through unchanged', () => {
    expect(normalizeSkeletonForOverlay(null)).toBeNull()
  })

  it('recenters the hip midpoint to (0.5, 0.5) and scales torso length to exactly 0.3', () => {
    const landmarks = buildLandmarks({
      [LEFT_HIP]: landmark(0.4, 0.6),
      [RIGHT_HIP]: landmark(0.6, 0.6),
      [LEFT_SHOULDER]: landmark(0.4, 0.4),
      [RIGHT_SHOULDER]: landmark(0.6, 0.4),
    })
    const normalized = normalizeSkeletonForOverlay(landmarks)!

    const hipMidX = (normalized[LEFT_HIP].x + normalized[RIGHT_HIP].x) / 2
    const hipMidY = (normalized[LEFT_HIP].y + normalized[RIGHT_HIP].y) / 2
    expect(hipMidX).toBeCloseTo(0.5, 5)
    expect(hipMidY).toBeCloseTo(0.5, 5)

    const shoulderMidX = (normalized[LEFT_SHOULDER].x + normalized[RIGHT_SHOULDER].x) / 2
    const shoulderMidY = (normalized[LEFT_SHOULDER].y + normalized[RIGHT_SHOULDER].y) / 2
    const torsoLength = Math.hypot(shoulderMidX - hipMidX, shoulderMidY - hipMidY)
    expect(torsoLength).toBeCloseTo(0.3, 5)
  })

  it('normalizes two skeletons of very different apparent scale/position but identical relative geometry to near-identical output', () => {
    // Skeleton A: small torso, off-center. "Nose" placed 1.5x the (hip->shoulder)
    // vector above the hips — an arbitrary but fixed relative offset.
    const a = buildLandmarks({
      [LEFT_HIP]: landmark(0.4, 0.6),
      [RIGHT_HIP]: landmark(0.6, 0.6),
      [LEFT_SHOULDER]: landmark(0.4, 0.4),
      [RIGHT_SHOULDER]: landmark(0.6, 0.4),
      [NOSE]: landmark(0.5, 0.3), // hipMid(0.5,0.6) + 1.5*(shoulderMid-hipMid)=(0,-0.2) = (0.5, 0.3)
    })
    // Skeleton B: same relative geometry, 3x larger torso, translated far away.
    const b = buildLandmarks({
      [LEFT_HIP]: landmark(1.2, 2.0),
      [RIGHT_HIP]: landmark(1.8, 2.0),
      [LEFT_SHOULDER]: landmark(1.2, 1.4),
      [RIGHT_SHOULDER]: landmark(1.8, 1.4),
      [NOSE]: landmark(1.5, 1.1), // hipMid(1.5,2.0) + 1.5*(0,-0.6) = (1.5, 1.1)
    })

    const normalizedA = normalizeSkeletonForOverlay(a)!
    const normalizedB = normalizeSkeletonForOverlay(b)!

    expect(normalizedA[NOSE].x).toBeCloseTo(0.5, 5)
    expect(normalizedA[NOSE].y).toBeCloseTo(0.05, 5)
    expect(normalizedB[NOSE].x).toBeCloseTo(normalizedA[NOSE].x, 5)
    expect(normalizedB[NOSE].y).toBeCloseTo(normalizedA[NOSE].y, 5)
  })

  it('does not throw or produce NaN when torso length is zero (degenerate hip/shoulder overlap)', () => {
    const landmarks = buildLandmarks({
      [LEFT_HIP]: landmark(0.5, 0.5),
      [RIGHT_HIP]: landmark(0.5, 0.5),
      [LEFT_SHOULDER]: landmark(0.5, 0.5),
      [RIGHT_SHOULDER]: landmark(0.5, 0.5),
    })
    const normalized = normalizeSkeletonForOverlay(landmarks)!
    expect(normalized.every((l) => !Number.isNaN(l.x) && !Number.isNaN(l.y))).toBe(true)
    expect(normalized[LEFT_HIP].x).toBeCloseTo(0.5, 5)
    expect(normalized[LEFT_HIP].y).toBeCloseTo(0.5, 5)
  })

  it('passes landmarks through unchanged when the anchor indices are missing (defensive, not expected from real MediaPipe output)', () => {
    const shortLandmarks: Landmark[] = [landmark(0.1, 0.2)]
    expect(normalizeSkeletonForOverlay(shortLandmarks)).toBe(shortLandmarks)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- normalizeSkeleton`
Expected: FAIL — `normalizeSkeleton.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/lib/normalizeSkeleton.ts`:

```ts
import { LEFT_HIP, LEFT_SHOULDER, RIGHT_HIP, RIGHT_SHOULDER } from './jointAngles'
import type { Landmark } from './poseTypes'

// Fraction of the normalized [0,1] canvas one torso-length (hip-mid to
// shoulder-mid distance) should map to. 0.3 keeps a full body comfortably
// inside the canvas for typical human proportions without per-motion tuning.
const TARGET_TORSO_FRACTION = 0.3

function midpoint(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

/**
 * Recenters + rescales a landmark set so two clips shot at different camera
 * distances/framing become visually comparable when drawn superimposed on one
 * canvas (spec section 6, "in-depth analysis" overlay). Recenters on the hip
 * midpoint (always lands at (0.5, 0.5)), rescales by torso length (hip-mid to
 * shoulder-mid distance) to a fixed fraction of the space. Output feeds
 * straight into the existing drawSkeleton with zero changes to it — but
 * MUST be drawn on a square canvas (x and y share one scale factor here; a
 * non-square canvas would distort the silhouette non-uniformly).
 */
export function normalizeSkeletonForOverlay(landmarks: Landmark[] | null): Landmark[] | null {
  if (!landmarks) return null

  const leftHip = landmarks[LEFT_HIP]
  const rightHip = landmarks[RIGHT_HIP]
  const leftShoulder = landmarks[LEFT_SHOULDER]
  const rightShoulder = landmarks[RIGHT_SHOULDER]
  // ponytail: defensive pass-through for malformed/short landmark arrays —
  // this pipeline always hands MediaPipe's full 33-point array here, so this
  // path is untested-by-design dead code for real input, not a silent bug.
  if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) return landmarks

  const hipMid = midpoint(leftHip, rightHip)
  const shoulderMid = midpoint(leftShoulder, rightShoulder)
  const torsoLength = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y)
  // Degenerate torso (identical hip/shoulder landmarks) — recenter only,
  // skip rescale rather than divide by zero.
  const scale = torsoLength > 0 ? TARGET_TORSO_FRACTION / torsoLength : 1

  return landmarks.map((landmark) => ({
    x: 0.5 + (landmark.x - hipMid.x) * scale,
    y: 0.5 + (landmark.y - hipMid.y) * scale,
    z: landmark.z * scale,
    visibility: landmark.visibility,
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- normalizeSkeleton`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/lib/normalizeSkeleton.ts frontend/src/lib/normalizeSkeleton.test.ts
git commit -m "feat(frontend): add skeleton normalization for the superimposed overlay canvas"
```

---

### Task 2: `api/referenceClips.ts` — fetch wrappers

**Files:**
- Create: `frontend/src/api/referenceClips.ts`
- Create: `frontend/src/api/referenceClips.test.ts`

**Interfaces:**
- Consumes: `PoseSequence` from `../lib/poseTypes`.
- Produces: `ReferenceClip` interface; `fetchReferenceClips(motionType: string): Promise<ReferenceClip[]>`; `fetchPoseSequence(poseDataUrl: string): Promise<PoseSequence>` — used by `useReferenceComparison.ts` (Task 4).

**Design notes (read before implementing):**
- **Field naming: snake_case, matching the backend's wire format exactly** (`id, motion_type, video_url, pose_data_url, camera_angle_note, source_or_license_note` — confirmed against `backend/app/main.py`'s `_list_reference_clips` and `backend/tests/test_reference_clips.py`'s exact JSON assertions). This repo has no case-conversion utility (confirmed: no `caseConvert`/interceptor pattern anywhere in `frontend/src`) and this frontend has never talked to its backend before this milestone — there's no established convention to break. A camelCase interface would require a mapping function used nowhere else in this codebase for two thin wrappers; snake_case-as-received is the lazier and equally correct choice.
- **`video_url`/`pose_data_url` are `string | null`** — the backend emits `null` for a clip directory missing a video file or `pose.json` (see `main.py`'s ternaries). `useReferenceComparison` (Task 4) is responsible for filtering these out; this module just reflects the wire shape.
- **No base URL, relative paths only** — relies entirely on the Vite dev proxy (Task 3) in development and same-origin static serving in production (see Task 3's design notes for the full reasoning). `fetchPoseSequence` takes the exact `pose_data_url` string the backend returned and fetches it as-is — it's already a root-relative path like `/reference-clips/freestyle/clip-1/pose.json`.
- **Error handling:** both functions throw on a non-ok response, including the HTTP status in the message — cheap, sufficient for `useReferenceComparison`'s catch block (Task 4) to route to `'error'` status. No retry logic — YAGNI for a first integration.

- [ ] **Step 1: Write the failing tests**

`frontend/src/api/referenceClips.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPoseSequence, fetchReferenceClips } from './referenceClips'
import type { PoseSequence } from '../lib/poseTypes'

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchReferenceClips', () => {
  it('requests /api/reference-clips with the motion_type query param and returns the parsed JSON', async () => {
    const clips = [
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: '/reference-clips/freestyle/clip-1/video.mp4',
        pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
        camera_angle_note: 'side, water level',
        source_or_license_note: 'self-filmed',
      },
    ]
    const fetchMock = fakeFetch(clips)
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchReferenceClips('freestyle')

    expect(fetchMock).toHaveBeenCalledWith('/api/reference-clips?motion_type=freestyle')
    expect(result).toEqual(clips)
  })

  it('throws (including the status code) when the response is not ok', async () => {
    vi.stubGlobal('fetch', fakeFetch([], false, 500))
    await expect(fetchReferenceClips('freestyle')).rejects.toThrow('500')
  })
})

describe('fetchPoseSequence', () => {
  it('fetches the given URL as-is and returns the parsed JSON', async () => {
    const sequence: PoseSequence = {
      videoDurationMs: 1000,
      videoWidth: 640,
      videoHeight: 480,
      targetFps: 30,
      frameCount: 30,
      frames: [],
      modelInfo: { variant: 'full', delegate: 'GPU' },
    }
    const fetchMock = fakeFetch(sequence)
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchPoseSequence('/reference-clips/freestyle/clip-1/pose.json')

    expect(fetchMock).toHaveBeenCalledWith('/reference-clips/freestyle/clip-1/pose.json')
    expect(result).toEqual(sequence)
  })

  it('throws (including the status code) when the response is not ok', async () => {
    vi.stubGlobal('fetch', fakeFetch(null, false, 404))
    await expect(fetchPoseSequence('/x/pose.json')).rejects.toThrow('404')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- referenceClips`
Expected: FAIL — `frontend/src/api/referenceClips.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/api/referenceClips.ts`:

```ts
import type { PoseSequence } from '../lib/poseTypes'

// Field names match the backend's wire format exactly (see
// backend/app/main.py's _list_reference_clips) — snake_case, no camelCase
// mapping layer. This frontend has never talked to a backend before this
// milestone, so there's no established case-conversion convention to
// follow, and one clip-list fetch doesn't justify inventing one.
export interface ReferenceClip {
  id: string
  motion_type: string
  video_url: string | null
  pose_data_url: string | null
  camera_angle_note: string
  source_or_license_note: string
}

// Relative paths only — resolved via the Vite dev proxy (vite.config.ts) in
// development and same-origin static serving in production. No base-URL
// config needed in either environment.
export async function fetchReferenceClips(motionType: string): Promise<ReferenceClip[]> {
  const response = await fetch(`/api/reference-clips?motion_type=${encodeURIComponent(motionType)}`)
  if (!response.ok) throw new Error(`Failed to fetch reference clips (HTTP ${response.status})`)
  return response.json()
}

export async function fetchPoseSequence(poseDataUrl: string): Promise<PoseSequence> {
  const response = await fetch(poseDataUrl)
  if (!response.ok) throw new Error(`Failed to fetch pose data from ${poseDataUrl} (HTTP ${response.status})`)
  return response.json()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- referenceClips`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/api/referenceClips.ts frontend/src/api/referenceClips.test.ts
git commit -m "feat(frontend): add fetch wrappers for the reference-clips API"
```

---

### Task 3: `vite.config.ts` — dev-server proxy to the backend

**Files:**
- Modify: `frontend/vite.config.ts`

**Interfaces:** none (config only) — makes `fetch('/api/...')` and `fetch('/reference-clips/...')` from `frontend/src/api/referenceClips.ts` (Task 2) resolve correctly when running `npm run dev` against a locally running backend.

**Design notes (read before implementing):**
- **Decision: Vite dev-server proxy, not backend CORS middleware.** In production, the frontend is served BY the same FastAPI app (`backend/app/main.py`'s existing guarded `frontend/dist` static mount) — same origin, so CORS is never actually needed in prod. A `server.proxy` config for `'/api'` and `'/reference-clips'`, both to `http://localhost:8000`, solves the dev-only cross-origin issue with **zero backend code changes**, and lets `referenceClips.ts` use relative paths that work unmodified in both dev (via proxy) and prod (same origin) — no environment-conditional base-URL config anywhere. Confirmed against the current `frontend/vite.config.ts` (no existing `server` key) and `backend/app/main.py` (no CORS middleware, confirming it's genuinely not needed).
- Vite dev on `:5173`, backend (`uvicorn`) on `:8000` — both proxy targets point there.
- **Not unit-testable** — a dev-server config has no meaningful assertion in Vitest. Verified manually in Task 7.

- [ ] **Step 1: Update the config**

`frontend/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only cross-origin fix: Vite serves the frontend on :5173, FastAPI runs
// separately on :8000 in development. In production the frontend is served BY
// FastAPI itself (see backend/app/main.py's frontend_dist_dir static mount) —
// same origin, so this proxy (and no CORS middleware) is all dev needs; the
// frontend can use relative fetch() paths unmodified in both environments.
export default defineConfig({
  plugins: [react()],
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

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: PASS — a `server` key has no effect on the Vitest test run.

- [ ] **Step 3: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/vite.config.ts
git commit -m "chore(frontend): proxy /api and /reference-clips to the backend in dev"
```

---

### Task 4: `useReferenceComparison.ts` — fetch + DTW + flags orchestration hook

**Files:**
- Create: `frontend/src/hooks/useReferenceComparison.ts`
- Create: `frontend/src/hooks/useReferenceComparison.test.ts`

**Interfaces:**
- Consumes: `fetchReferenceClips`, `fetchPoseSequence` from `../api/referenceClips` (Task 2, mocked in tests); `computeFeatureVectors` from `../lib/featureVector`; `dtw` from `../lib/dtw`; `computeCheckpointFlags` from `../lib/checkpointFlags`; `PoseSequence` from `../lib/poseTypes`.
- Produces: `ComparisonResult` (discriminated union on `status`) and `useReferenceComparison(userSequence: PoseSequence | null): ComparisonResult` — used by `App.tsx` (Task 6).

**Design notes (read before implementing):**
- **Discriminated union, not one flat interface with nullable fields.** `ComparisonResult` is `{ status: 'idle' } | { status: 'loading' } | { status: 'no-reference-available' } | { status: 'error' } | { status: 'ready', referenceVideoUrl, referenceSequence, path, flags }`. This is the cleanest way to avoid a "combinatorial explosion of state flags" in `App.tsx` (Task 6): checking `comparison.status === 'ready'` lets TypeScript narrow to the variant with all four non-null fields automatically — no manual null-checking of 4 separate optional fields at every call site.
- **Mirrors `AlignmentToolApp.tsx`'s DTW `useEffect` pattern**, but this milestone also owns the async fetch step ahead of it: fetch clips for the hardcoded motion → pick the first clip that has both `video_url` and `pose_data_url` (multi-reference cycling is explicitly out of scope, deferred per spec item 8 / build-order step 6) → fetch its pose data → compute feature vectors, DTW path, and checkpoint flags exactly as `AlignmentToolApp.tsx` already does.
- **`'no-reference-available'` is the expected, first-class result today** — `backend/reference_clips/` has zero real clips committed, so `fetchReferenceClips('freestyle')` returns `[]` in the real running app right now. This status covers both "zero clips returned" and "clips returned but none have both `video_url` and `pose_data_url`" (a clip directory that's mid-curation, e.g. video present but `pose.json` not yet generated).
- **`cancelled` guard against stale updates:** `main.tsx` renders under `<StrictMode>`, which double-invokes effects in dev; `userSequence` can also change (e.g. "Try another video") while a fetch is in flight. A local `cancelled` flag set in the effect's cleanup prevents a stale async response from overwriting a newer one — one guard variable, standard React idiom, not overengineering for a real double-fetch scenario StrictMode itself creates.
- **`MOTION_TYPE = 'freestyle'` is hardcoded**, with a comment explaining why: it's the only motion in the library, so the spec's "fixed list" requirement (build-order step 1) is trivially satisfied by there being exactly one option — a motion-picker UI is future work (build-order step 7, adding a second motion type).

- [ ] **Step 1: Write the failing tests**

`frontend/src/hooks/useReferenceComparison.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReferenceComparison } from './useReferenceComparison'
import type { PoseSequence } from '../lib/poseTypes'

const mockFetchReferenceClips = vi.fn()
const mockFetchPoseSequence = vi.fn()
const mockComputeFeatureVectors = vi.fn()
const mockDtw = vi.fn()
const mockComputeCheckpointFlags = vi.fn()

vi.mock('../api/referenceClips', () => ({
  fetchReferenceClips: (...args: unknown[]) => mockFetchReferenceClips(...args),
  fetchPoseSequence: (...args: unknown[]) => mockFetchPoseSequence(...args),
}))
vi.mock('../lib/featureVector', () => ({
  computeFeatureVectors: (...args: unknown[]) => mockComputeFeatureVectors(...args),
}))
vi.mock('../lib/dtw', () => ({
  dtw: (...args: unknown[]) => mockDtw(...args),
}))
vi.mock('../lib/checkpointFlags', () => ({
  computeCheckpointFlags: (...args: unknown[]) => mockComputeCheckpointFlags(...args),
}))

function fakeSequence(frameCount: number): PoseSequence {
  return {
    videoDurationMs: 1000,
    videoWidth: 640,
    videoHeight: 480,
    targetFps: 30,
    frameCount,
    frames: [],
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

beforeEach(() => {
  mockFetchReferenceClips.mockReset()
  mockFetchPoseSequence.mockReset()
  mockComputeFeatureVectors.mockReset().mockReturnValue([[0]])
  mockDtw.mockReset().mockReturnValue({ path: [[0, 0]], cost: 0 })
  mockComputeCheckpointFlags.mockReset().mockReturnValue([])
})

describe('useReferenceComparison', () => {
  it('stays idle when userSequence is null', () => {
    const { result } = renderHook(() => useReferenceComparison(null))
    expect(result.current.status).toBe('idle')
    expect(mockFetchReferenceClips).not.toHaveBeenCalled()
  })

  it('resolves to no-reference-available when the library has zero clips', async () => {
    mockFetchReferenceClips.mockResolvedValue([])
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
  })

  it('resolves to no-reference-available when clips exist but none have both a video and pose data URL', async () => {
    mockFetchReferenceClips.mockResolvedValue([
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: null,
        pose_data_url: null,
        camera_angle_note: '',
        source_or_license_note: '',
      },
    ])
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
    expect(mockFetchPoseSequence).not.toHaveBeenCalled()
  })

  it('resolves to ready with the computed reference sequence, path, and flags on the happy path', async () => {
    mockFetchReferenceClips.mockResolvedValue([
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: '/reference-clips/freestyle/clip-1/video.mp4',
        pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
        camera_angle_note: '',
        source_or_license_note: '',
      },
    ])
    const referenceSequence = fakeSequence(12)
    mockFetchPoseSequence.mockResolvedValue(referenceSequence)
    mockDtw.mockReturnValue({
      path: [
        [0, 0],
        [1, 1],
      ],
      cost: 1,
    })
    mockComputeCheckpointFlags.mockReturnValue([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])

    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceVideoUrl).toBe('/reference-clips/freestyle/clip-1/video.mp4')
    expect(result.current.referenceSequence).toBe(referenceSequence)
    expect(result.current.path).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(result.current.flags).toEqual([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])
  })

  it('resolves to error when fetchReferenceClips rejects', async () => {
    mockFetchReferenceClips.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- useReferenceComparison`
Expected: FAIL — `useReferenceComparison.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/hooks/useReferenceComparison.ts`:

```ts
import { useEffect, useState } from 'react'
import { fetchPoseSequence, fetchReferenceClips } from '../api/referenceClips'
import { computeCheckpointFlags, type CheckpointFlag } from '../lib/checkpointFlags'
import { dtw } from '../lib/dtw'
import { computeFeatureVectors } from '../lib/featureVector'
import type { PoseSequence } from '../lib/poseTypes'

// Only motion in the reference library so far — the spec's "fixed list"
// requirement (build-order step 1) is trivially satisfied by there being
// exactly one option. A motion picker is future work once a second motion
// type exists (build-order step 7).
const MOTION_TYPE = 'freestyle'

export type ComparisonResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no-reference-available' }
  | { status: 'error' }
  | {
      status: 'ready'
      referenceVideoUrl: string
      referenceSequence: PoseSequence
      path: [number, number][]
      flags: CheckpointFlag[]
    }

const IDLE: ComparisonResult = { status: 'idle' }
const LOADING: ComparisonResult = { status: 'loading' }
const NO_REFERENCE_AVAILABLE: ComparisonResult = { status: 'no-reference-available' }
const ERROR: ComparisonResult = { status: 'error' }

/**
 * Fetches a reference clip for the (currently hardcoded) motion type, then
 * computes DTW alignment + checkpoint flags against the user's sequence once
 * both pose sequences exist. Mirrors AlignmentToolApp.tsx's DTW useEffect,
 * plus the async fetch step this milestone adds. Multi-reference cycling
 * (spec item 8) is out of scope — always picks the first clip that has both
 * a video and pose data URL.
 */
export function useReferenceComparison(userSequence: PoseSequence | null): ComparisonResult {
  const [result, setResult] = useState<ComparisonResult>(IDLE)

  useEffect(() => {
    if (!userSequence) {
      setResult(IDLE)
      return
    }

    let cancelled = false
    setResult(LOADING)

    const run = async () => {
      try {
        const clips = await fetchReferenceClips(MOTION_TYPE)
        const clip = clips.find((c) => c.video_url && c.pose_data_url)
        if (!clip || !clip.video_url || !clip.pose_data_url) {
          if (!cancelled) setResult(NO_REFERENCE_AVAILABLE)
          return
        }

        const referenceSequence = await fetchPoseSequence(clip.pose_data_url)
        if (cancelled) return

        const userVectors = computeFeatureVectors(userSequence)
        const referenceVectors = computeFeatureVectors(referenceSequence)
        const path = dtw(userVectors, referenceVectors).path
        const flags = computeCheckpointFlags(userSequence, referenceSequence, path)

        setResult({ status: 'ready', referenceVideoUrl: clip.video_url, referenceSequence, path, flags })
      } catch (err) {
        console.error('Reference comparison failed', err)
        if (!cancelled) setResult(ERROR)
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [userSequence])

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- useReferenceComparison`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/hooks/useReferenceComparison.ts frontend/src/hooks/useReferenceComparison.test.ts
git commit -m "feat(frontend): add useReferenceComparison hook (fetch + DTW + flags)"
```

---

### Task 5: `ComparisonView.tsx` — synced side-by-side + superimposed overlay + flags panel

**Files:**
- Modify: `frontend/src/components/VideoPoseViewer.tsx` (export `POSE_CONNECTION_TUPLES`, no behavior change)
- Create: `frontend/src/components/ComparisonView.tsx`
- Create: `frontend/src/components/ComparisonView.test.tsx`

**Interfaces:**
- Consumes: `drawSkeleton` from `../lib/drawSkeleton`; `frameTimestampMs`, `seekTo` from `../lib/frameExtraction`; `normalizeSkeletonForOverlay` from `../lib/normalizeSkeleton` (Task 1); `POSE_CONNECTION_TUPLES` from `./VideoPoseViewer`; `CheckpointFlag` from `../lib/checkpointFlags`; `PoseSequence` from `../lib/poseTypes`.
- Produces: `ComparisonView({ userVideoUrl, userSequence, referenceVideoUrl, referenceSequence, path, flags }: ComparisonViewProps)` — used by `App.tsx` (Task 6).

**Design notes (read before implementing):**
- **Does NOT reuse `VideoPoseViewer`** — deliberate, not an oversight (see this plan's Architecture section). `VideoPoseViewer` owns its own internal scrubber, `isPlaying` state, and rAF play loop, reading `video.currentTime` live with no prop/callback for external time-sync. Retrofitting a second, differently-driven code path into an already-tested-by-omission component (exempted from unit tests since milestone 1 as browser/MediaPipe-dependent) risks destabilizing it. Instead this component is purpose-built, reusing only the low-level pieces.
- **`POSE_CONNECTION_TUPLES` export:** one-line change to `VideoPoseViewer.tsx` — add `export` to the existing `const POSE_CONNECTION_TUPLES = ...`. Zero behavior change to `VideoPoseViewer` itself, so no new test needed there (same test-exemption rationale as the rest of that file).
- **Scrubber-only interaction for v1 (explicit, named deferral):** the shared scrubber's value is a **pair index into `path`**, not a raw time value. Moving it calls `seekTo` on both `<video>` elements to `frameTimestampMs(frameIdx, sequence.targetFps) / 1000` and redraws all three canvases. Getting two independent `<video>` elements to play in perfect sync (shared play/pause, drift correction) is meaningfully harder than seeking them together on scrub — **deferred**, not built. Scrubbing is the only interaction this milestone ships.
- **Decoupling video-seek from skeleton drawing (this is what makes the component testable without real video playback):** the skeleton data for both raw side-by-side canvases and the overlay canvas comes entirely from `userSequence`/`referenceSequence`/`path` — plain data, independent of whether the `<video>` element has actually finished seeking. So canvas drawing and the flags-panel filter both happen synchronously off `pairIndex` state; the `seekTo(...).then(...)` calls that move the *visible video frame* are fire-and-forget from the scrub handler's perspective. In jsdom (no real media pipeline), `seekTo`'s returned promise never resolves — harmless, since nothing in the tests awaits it.
- **Overlay canvas must be square** (see Task 1's design notes) — a fixed `OVERLAY_CANVAS_SIZE = 400` px square, independent of either clip's native video aspect ratio.
- **Flags panel filter:** `flags.filter(f => f.phase === referenceFrameIdx)` for the current pair — `CheckpointFlag.phase` is defined as the reference clip's frame index (`checkpointFlags.ts`), which is exactly `path[pairIndex][1]`.
- **Empty-`path` guard:** `path.length === 0` renders a fallback message instead of an invalid `<input type="range" max={-1}>`. Not hypothetical — the backend's own test fixtures use `pose.json` bodies like `{"frames": []}`, so a malformed/placeholder reference clip producing an empty DTW path is a real trust-boundary concern for fetched data, not a theoretical one.
- **Colors:** blue (`#3B82F6`) for the user, orange (`#F97316`) for the reference — arbitrary but fixed, distinguishable, matches the spec's "flagged joint deviations" framing without inventing a color-legend system.

- [ ] **Step 1: Export `POSE_CONNECTION_TUPLES` from `VideoPoseViewer.tsx`**

In `frontend/src/components/VideoPoseViewer.tsx`, change:

```ts
const POSE_CONNECTION_TUPLES: readonly (readonly [number, number])[] = PoseLandmarker.POSE_CONNECTIONS.map(
```

to:

```ts
export const POSE_CONNECTION_TUPLES: readonly (readonly [number, number])[] = PoseLandmarker.POSE_CONNECTIONS.map(
```

No test change needed — `VideoPoseViewer` has no test file (milestone 1's browser/MediaPipe exemption) and this is a pure export addition with identical internal behavior.

- [ ] **Step 2: Write the failing tests**

`frontend/src/components/ComparisonView.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComparisonView } from './ComparisonView'
import type { CheckpointFlag } from '../lib/checkpointFlags'
import type { PoseSequence } from '../lib/poseTypes'

function fakeSequence(frameCount: number): PoseSequence {
  return {
    videoDurationMs: frameCount * (1000 / 30),
    videoWidth: 640,
    videoHeight: 480,
    targetFps: 30,
    frameCount,
    frames: Array.from({ length: frameCount }, (_, i) => ({
      frameIndex: i,
      timestampMs: i * (1000 / 30),
      landmarksRaw: null,
      landmarksSmoothed: null,
    })),
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

const path: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 2],
]

const flags: CheckpointFlag[] = [{ phase: 1, joint: 'leftElbow', userValue: 110, referenceValue: 90, delta: 20 }]

function renderView(overrides: Partial<Parameters<typeof ComparisonView>[0]> = {}) {
  render(
    <ComparisonView
      userVideoUrl="blob:user"
      userSequence={fakeSequence(3)}
      referenceVideoUrl="blob:reference"
      referenceSequence={fakeSequence(3)}
      path={path}
      flags={flags}
      {...overrides}
    />
  )
}

describe('ComparisonView', () => {
  it('renders both video panes and a scrubber starting at pair 0', () => {
    renderView()
    expect(screen.getByTestId('user-video-pane')).toBeInTheDocument()
    expect(screen.getByTestId('reference-video-pane')).toBeInTheDocument()
    expect(screen.getByTestId('comparison-scrubber')).toHaveValue('0')
  })

  it('shows "No flags at this frame." when the current pair has no matching flags', () => {
    renderView()
    expect(screen.getByText('No flags at this frame.')).toBeInTheDocument()
  })

  it('scrubbing to a pair whose referenceFrameIdx matches a flag updates the flags panel', () => {
    renderView()
    fireEvent.change(screen.getByTestId('comparison-scrubber'), { target: { value: '1' } })

    expect(screen.getByText('leftElbow')).toBeInTheDocument()
    expect(screen.getByText('110.0')).toBeInTheDocument()
    expect(screen.getByText('90.0')).toBeInTheDocument()
    expect(screen.getByText('20.0')).toBeInTheDocument()
    expect(screen.queryByText('No flags at this frame.')).not.toBeInTheDocument()
  })

  it('renders a fallback message instead of a scrubber when path is empty', () => {
    renderView({ path: [] })
    expect(screen.getByText('No aligned frames to compare.')).toBeInTheDocument()
    expect(screen.queryByTestId('comparison-scrubber')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm run test -- ComparisonView`
Expected: FAIL — `ComparisonView.tsx` does not exist yet.

- [ ] **Step 4: Write the implementation**

`frontend/src/components/ComparisonView.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { CheckpointFlag } from '../lib/checkpointFlags'
import { drawSkeleton } from '../lib/drawSkeleton'
import { frameTimestampMs, seekTo } from '../lib/frameExtraction'
import { normalizeSkeletonForOverlay } from '../lib/normalizeSkeleton'
import type { PoseSequence } from '../lib/poseTypes'
import { POSE_CONNECTION_TUPLES } from './VideoPoseViewer'

// Overlay canvas is a fixed square, independent of either clip's native video
// aspect ratio — normalizeSkeletonForOverlay scales x/y by one shared factor,
// so a non-square canvas would distort the silhouette (see normalizeSkeleton.ts).
const OVERLAY_CANVAS_SIZE = 400
const USER_COLOR = '#3B82F6' // blue
const REFERENCE_COLOR = '#F97316' // orange

interface ComparisonViewProps {
  userVideoUrl: string
  userSequence: PoseSequence
  referenceVideoUrl: string
  referenceSequence: PoseSequence
  path: [number, number][]
  flags: CheckpointFlag[]
}

export function ComparisonView({
  userVideoUrl,
  userSequence,
  referenceVideoUrl,
  referenceSequence,
  path,
  flags,
}: ComparisonViewProps) {
  const userVideoRef = useRef<HTMLVideoElement>(null)
  const referenceVideoRef = useRef<HTMLVideoElement>(null)
  const userCanvasRef = useRef<HTMLCanvasElement>(null)
  const referenceCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const [pairIndex, setPairIndex] = useState(0)

  const [userFrameIdx, referenceFrameIdx] = path[pairIndex] ?? [0, 0]

  useEffect(() => {
    const userCanvas = userCanvasRef.current
    if (userCanvas) {
      userCanvas.width = userSequence.videoWidth
      userCanvas.height = userSequence.videoHeight
    }
    const referenceCanvas = referenceCanvasRef.current
    if (referenceCanvas) {
      referenceCanvas.width = referenceSequence.videoWidth
      referenceCanvas.height = referenceSequence.videoHeight
    }
    const overlayCanvas = overlayCanvasRef.current
    if (overlayCanvas) {
      overlayCanvas.width = OVERLAY_CANVAS_SIZE
      overlayCanvas.height = OVERLAY_CANVAS_SIZE
    }
  }, [userSequence, referenceSequence])

  useEffect(() => {
    // Skeleton drawing depends only on sequence data + the current pair, not
    // on whether the <video> has actually finished seeking — so canvas draws
    // happen synchronously here; the video seeks below are fire-and-forget,
    // purely to keep the visible video frame roughly in sync.
    const userCanvas = userCanvasRef.current
    if (userCanvas) {
      const ctx = userCanvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, userCanvas.width, userCanvas.height)
        const frame = userSequence.frames[userFrameIdx]
        drawSkeleton(ctx, frame?.landmarksSmoothed ?? null, userCanvas.width, userCanvas.height, POSE_CONNECTION_TUPLES)
      }
    }

    const referenceCanvas = referenceCanvasRef.current
    if (referenceCanvas) {
      const ctx = referenceCanvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height)
        const frame = referenceSequence.frames[referenceFrameIdx]
        drawSkeleton(
          ctx,
          frame?.landmarksSmoothed ?? null,
          referenceCanvas.width,
          referenceCanvas.height,
          POSE_CONNECTION_TUPLES
        )
      }
    }

    const overlayCanvas = overlayCanvasRef.current
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        const userLandmarks = normalizeSkeletonForOverlay(userSequence.frames[userFrameIdx]?.landmarksSmoothed ?? null)
        const referenceLandmarks = normalizeSkeletonForOverlay(
          referenceSequence.frames[referenceFrameIdx]?.landmarksSmoothed ?? null
        )
        drawSkeleton(ctx, userLandmarks, overlayCanvas.width, overlayCanvas.height, POSE_CONNECTION_TUPLES, {
          color: USER_COLOR,
        })
        drawSkeleton(ctx, referenceLandmarks, overlayCanvas.width, overlayCanvas.height, POSE_CONNECTION_TUPLES, {
          color: REFERENCE_COLOR,
        })
      }
    }

    const userVideo = userVideoRef.current
    if (userVideo) seekTo(userVideo, frameTimestampMs(userFrameIdx, userSequence.targetFps) / 1000)
    const referenceVideo = referenceVideoRef.current
    if (referenceVideo) seekTo(referenceVideo, frameTimestampMs(referenceFrameIdx, referenceSequence.targetFps) / 1000)
  }, [userFrameIdx, referenceFrameIdx, userSequence, referenceSequence])

  const currentFlags = flags.filter((f) => f.phase === referenceFrameIdx)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ position: 'relative', flex: 1 }} data-testid="user-video-pane">
          <video ref={userVideoRef} src={userVideoUrl} style={{ width: '100%', display: 'block' }} />
          <canvas ref={userCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        </div>
        <div style={{ position: 'relative', flex: 1 }} data-testid="reference-video-pane">
          <video ref={referenceVideoRef} src={referenceVideoUrl} style={{ width: '100%', display: 'block' }} />
          <canvas
            ref={referenceCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />
        </div>
      </div>

      {path.length === 0 ? (
        <p>No aligned frames to compare.</p>
      ) : (
        <input
          type="range"
          min={0}
          max={path.length - 1}
          step={1}
          value={pairIndex}
          onChange={(e) => setPairIndex(Number(e.target.value))}
          data-testid="comparison-scrubber"
        />
      )}

      <h2>In-depth analysis</h2>
      <canvas ref={overlayCanvasRef} data-testid="overlay-canvas" />

      <h2>Checkpoint flags at this frame</h2>
      {currentFlags.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Joint</th>
              <th>Your angle</th>
              <th>Reference angle</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {currentFlags.map((f, i) => (
              <tr key={i}>
                <td>{f.joint}</td>
                <td>{f.userValue.toFixed(1)}</td>
                <td>{f.referenceValue.toFixed(1)}</td>
                <td>{f.delta.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No flags at this frame.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test -- ComparisonView`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/components/VideoPoseViewer.tsx frontend/src/components/ComparisonView.tsx frontend/src/components/ComparisonView.test.tsx
git commit -m "feat(frontend): add ComparisonView (synced side-by-side + superimposed overlay + flags panel)"
```

---

### Task 6: `App.tsx` integration

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `useReferenceComparison` from `./hooks/useReferenceComparison` (Task 4, mocked in tests); `ComparisonView` from `./components/ComparisonView` (Task 5, rendered for real in tests — no MediaPipe dependency beyond the already-proven-safe `POSE_CONNECTION_TUPLES` static array, same as `VideoPoseViewer` today).

**Design notes (read before implementing):**
- **Render branch derived from `useReferenceComparison`'s own status enum** — no new parallel boolean state in `App.tsx`. `comparison.status === 'ready'` renders `ComparisonView`; every other status (`idle`/`loading`/`no-reference-available`/`error`) while `state === 'ready'` renders the existing `VideoPoseViewer` plus a status-specific message. This is also literally today's real behavior by default (empty reference library → `'no-reference-available'` → old single-video view), not just a fallback for an edge case.
- **`useReferenceComparison(poseSequence)` is called unconditionally** (not gated on `state`) — it internally no-ops (`status: 'idle'`) while `poseSequence` is `null`, i.e. during `'idle'`/`'processing'`. `poseSequence` and `state` are set together (same synchronous function, batched) at the `'processing' → 'ready'` transition, so the hook's fetch begins at exactly that point, same trigger point the spec asks for ("after processing the user's uploaded clip").
- **"Try another video" button stays a single shared element**, gated only on `state === 'ready'`, outside the comparison-status branch — no duplication needed across branches, since resetting behaves identically regardless of which reference-comparison state the user was looking at.
- **Existing 4 `App.test.tsx` tests must pass unmodified in behavior** (assertions unchanged) — add a `useReferenceComparison` mock defaulting to `{ status: 'no-reference-available' }` in `beforeEach`, matching the real, literal state of this repo today. None of the 4 existing tests assert on the comparison branch's content, only on upload/progress/ready-button/reset, so this default is safe.

- [ ] **Step 1: Update `App.test.tsx` mocks and add the two new tests (write failing tests first)**

`frontend/src/App.test.tsx` — add the new mock near the top, alongside the existing `usePoseEstimation` mock:

```tsx
const mockUseReferenceComparison = vi.fn()

vi.mock('./hooks/useReferenceComparison', () => ({
  useReferenceComparison: (...args: unknown[]) => mockUseReferenceComparison(...args),
}))
```

Update `beforeEach`:

```tsx
beforeEach(() => {
  mockEstimateSequence.mockReset()
  mockUseReferenceComparison.mockReset().mockReturnValue({ status: 'no-reference-available' })
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})
```

Add two new tests inside `describe('App', ...)`, after the existing 4:

```tsx
it('shows the existing single-video viewer with a friendly message when no reference clip is available', async () => {
  mockEstimateSequence.mockResolvedValue(fakeSequence)
  render(<App />)
  const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
  await userEvent.upload(screen.getByTestId('file-upload-input'), file)

  await waitFor(() => expect(screen.getByText('No reference clip available yet for freestyle.')).toBeInTheDocument())
  expect(screen.getByTestId('scrubber')).toBeInTheDocument() // VideoPoseViewer's own scrubber
  expect(screen.getByText('Try another video')).toBeInTheDocument()
})

it('renders ComparisonView once the reference comparison is ready', async () => {
  mockUseReferenceComparison.mockReturnValue({
    status: 'ready',
    referenceVideoUrl: '/reference-clips/freestyle/clip-1/video.mp4',
    referenceSequence: fakeSequence,
    path: [[0, 0]],
    flags: [],
  })
  mockEstimateSequence.mockResolvedValue(fakeSequence)
  render(<App />)
  const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
  await userEvent.upload(screen.getByTestId('file-upload-input'), file)

  await waitFor(() => expect(screen.getByTestId('comparison-scrubber')).toBeInTheDocument())
  expect(screen.getByTestId('user-video-pane')).toBeInTheDocument()
  expect(screen.getByTestId('reference-video-pane')).toBeInTheDocument()
  expect(screen.getByText('Try another video')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify the 2 new tests fail, existing 4 still pass**

Run: `cd frontend && npm run test -- App.test`
Expected: 4 pre-existing tests PASS; 2 new tests FAIL, since `App.tsx` doesn't call `useReferenceComparison` or render `ComparisonView` yet.

- [ ] **Step 3: Update the implementation**

`frontend/src/App.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { ComparisonView } from './components/ComparisonView'
import { FileUpload } from './components/FileUpload'
import { ProcessingProgress } from './components/ProcessingProgress'
import { VideoPoseViewer } from './components/VideoPoseViewer'
import { usePoseEstimation } from './hooks/usePoseEstimation'
import { useReferenceComparison } from './hooks/useReferenceComparison'
import type { PoseSequence } from './lib/poseTypes'

const TARGET_FPS = 30

type AppState = 'idle' | 'processing' | 'ready'

export function App() {
  const [state, setState] = useState<AppState>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [poseSequence, setPoseSequence] = useState<PoseSequence | null>(null)
  const { estimateSequence } = usePoseEstimation()
  const comparison = useReferenceComparison(poseSequence)

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
    <div>
      {state === 'idle' && <FileUpload onFileSelected={handleFileSelected} />}
      {(state === 'processing' || state === 'ready') && videoUrl && (
        <>
          {state === 'processing' && <ProcessingProgress current={progress.current} total={progress.total} />}
          {state === 'ready' && comparison.status === 'ready' && poseSequence ? (
            <ComparisonView
              userVideoUrl={videoUrl}
              userSequence={poseSequence}
              referenceVideoUrl={comparison.referenceVideoUrl}
              referenceSequence={comparison.referenceSequence}
              path={comparison.path}
              flags={comparison.flags}
            />
          ) : (
            <>
              {state === 'ready' && comparison.status === 'loading' && <p>Loading reference comparison…</p>}
              {state === 'ready' && comparison.status === 'no-reference-available' && (
                <p>No reference clip available yet for freestyle.</p>
              )}
              {state === 'ready' && comparison.status === 'error' && (
                <p>Something went wrong loading the reference comparison.</p>
              )}
              <VideoPoseViewer
                videoUrl={videoUrl}
                poseSequence={poseSequence}
                onVideoElementReady={handleVideoElementReady}
              />
            </>
          )}
          {state === 'ready' && <button onClick={handleReset}>Try another video</button>}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- App.test`
Expected: PASS (6 tests — 4 existing unchanged + 2 new).

- [ ] **Step 5: Type-check and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: no type errors; all tests from milestones 1–4 plus this milestone's new/changed tests all PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): wire ComparisonView into App via useReferenceComparison"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Tasks 1–6 together against a real running backend, same "verify visually before shipping" pattern as milestones 3 and 4's final tasks.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: all PASS, matching the milestone-1/2/3/4 baseline plus this milestone's new/changed tests.

- [ ] **Step 2: Start both servers**

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Verify the empty-library fallback path (the current real state of this repo)**

Open the app at `http://localhost:5173`. Upload any local clip. Wait for pose estimation to finish.
Expected:
- The message **"No reference clip available yet for freestyle."** appears.
- The existing single-video `VideoPoseViewer` (with its own scrubber, `data-testid="scrubber"`) renders below it — the app does not hang, blank-screen, or throw.
- Open the browser devtools Network tab: confirm `GET /api/reference-clips?motion_type=freestyle` returns `200` with body `[]` (proxied correctly through Vite to `:8000`, per Task 3), and confirm there are no console errors.

- [ ] **Step 4: Add one real reference clip and verify the ready path**

Per milestone 2's still-outstanding manual Task 4: use `/reference-tool.html` to process a short local freestyle clip, download `pose.json`, and place it under `backend/reference_clips/freestyle/<some-id>/` alongside a `video.mp4` (or `.mov`) and a hand-written `metadata.json` (`camera_angle_note`, `source_or_license_note`).

Restart or let `uvicorn --reload` pick up the new files. Refresh the frontend, upload a user clip.
Expected:
- Both videos load and display side by side, each with its own skeleton overlay tracking its own footage.
- Dragging the shared scrubber moves **both** videos together and updates all three canvases.
- The "In-depth analysis" canvas shows two distinguishably-colored skeletons (blue user, orange reference) that look plausibly aligned in scale/position when the two clips show similar body positions at the corresponding scrub position — despite the two source clips likely having different camera distances/framing.
- The checkpoint-flags panel updates as you scrub, showing "No flags at this frame." at frames with close agreement and a populated table at frames with real form differences.
- No console/network errors; confirm `GET /reference-clips/freestyle/<id>/video.mp4` and `.../pose.json` both resolve `200` through the proxy.

---

## Self-Review Notes

- **Spec coverage:** build-order step 4 ("Side-by-side synced player with skeleton overlay") plus the "in-depth analysis" superimposed-and-normalized overlay and checkpoint-flags panel from spec section 6/item 7 — all delivered together in this milestone, matching the user's explicit scope. Multi-reference cycling (item 8 / build-order step 6) and a real motion picker (build-order step 7) are explicitly deferred, not built.
- **Reuse over rebuild:** `drawSkeleton` gets zero changes — its existing `color` option is exactly what superimposing needs. `POSE_CONNECTION_TUPLES` is exported and reused rather than re-derived. The DTW+flags computation is the exact same `computeFeatureVectors`/`dtw`/`computeCheckpointFlags` pipeline from milestones 3–4, called from a new orchestration layer, not reimplemented. `VideoPoseViewer` is deliberately NOT reused for the synced component — reasoning stated explicitly in Task 5, not an oversight.
- **No new dependencies:** confirmed against `frontend/package.json` — native `fetch()` only, no axios/react-query, no CORS library (Vite proxy decision explained in Task 3).
- **Empty-library handling is first-class, not an afterthought:** `'no-reference-available'` is a named status in the discriminated union (Task 4), has its own fallback render branch in `App.tsx` (Task 6), and is the literal default `beforeEach` mock value in `App.test.tsx` — because it's also the literal real state of this repo until a human completes milestone 2's outstanding manual clip-curation step (Task 7, Step 3 exercises exactly this).
- **Type safety over manual null-checking:** `ComparisonResult`'s discriminated union (Task 4) lets `App.tsx` (Task 6) narrow on `status === 'ready'` and get all four dependent fields as non-null, with no parallel boolean state and no repeated `!!x && !!y && !!z` guards.
- **Testability without a mocking gymnastics act:** `ComparisonView` (Task 5) decouples canvas/flags rendering (pure, synchronous, driven by `pairIndex` + props) from the async, never-resolving-in-jsdom `seekTo` calls — the component is fully testable with zero mocks, unlike `VideoPoseViewer`.
- **Deferred, explicitly:** synced play/pause across two `<video>` elements (scrubber-only for v1); multi-reference cycling; a real motion-picker UI; backend CORS middleware (proxy-only, since prod is same-origin).

### Critical Files for Implementation
- frontend/src/lib/normalizeSkeleton.ts
- frontend/src/api/referenceClips.ts
- frontend/src/hooks/useReferenceComparison.ts
- frontend/src/components/ComparisonView.tsx
- frontend/src/App.tsx
- frontend/vite.config.ts