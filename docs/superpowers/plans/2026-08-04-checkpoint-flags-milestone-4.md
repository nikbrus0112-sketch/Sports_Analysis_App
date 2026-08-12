# Checkpoint Flags (Milestone 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stage A of `sports-motion-comparison-spec.md` section "5. Comparison / feedback generation" — build-order step 5, "Hand-code checkpoint rules for that one motion; wire up per-frame flags" — as a pure, deterministic, fully unit-tested comparison between a user clip and a reference clip at each DTW-aligned frame pair. This milestone builds directly on milestone 3's alignment output; build-order step 4 (synced side-by-side video player) stays deliberately skipped, same "prove the math first" pattern already established twice.

**Architecture:** One small export change to an existing module, one new pure module, and an extension to the existing dev tool — no new dev tool, no new Vite entry point:
- `frontend/src/lib/featureVector.ts`: export the already-existing gap-filled angle-rows helper (rename `computeAngleRowsWithGapFill` → `computeAngleRows`) instead of duplicating gap-fill logic elsewhere.
- `frontend/src/lib/checkpointFlags.ts` (new): `computeCheckpointFlags(userSequence, referenceSequence, path, thresholdDeg?)` — for each `(userFrameIdx, referenceFrameIdx)` pair in the DTW `path`, for each of the 8 joints, compares the user's angle to the reference clip's angle at that same pair and emits a `CheckpointFlag` when `|delta| > thresholdDeg`.
- `frontend/src/dev-tools/AlignmentToolApp.tsx` (modified): the DTW `useEffect` already has `userSequence`, `referenceSequence`, and the computed `path` together — it now also calls `computeCheckpointFlags` there and renders a second plain HTML table below the existing mapping table.

**Comparison method (per decisions already confirmed):** reference-clip-relative, not hand-authored `expected_angle_range`s — the spec leaves `phase_name` completely undefined, and inventing phase-boundary detection (catch/pull/push/recovery) is unscoped new work. `phase` is populated with the reference clip's frame index, documented as a deliberate simplification. This milestone is Stage A only — structured `{phase, joint, user_value, reference_value, delta}` records, no LLM call, no coaching-tip text.

**Tech Stack:** Same as milestones 1–3 — React 19, Vite, TypeScript, Vitest + RTL. No new dependencies.

See `docs/superpowers/specs/2026-08-04-checkpoint-flags-milestone-4-design.md` for the design rationale.

## Global Constraints

- No new frontend dependencies.
- 2-space indentation for TypeScript.
- `landmarksSmoothed` (post one-euro-filter) only, never `landmarksRaw` — same convention as every prior milestone.
- `computeCheckpointFlags` and the `featureVector.ts` export change are pure, DOM-free, MediaPipe-free logic — full TDD unit coverage, no mocking needed for either.
- `AlignmentToolApp.tsx` stays tested the milestone-3 way: `usePoseEstimation`, `../lib/featureVector`, `../lib/dtw` mocked at the module boundary, plus one new mock for `../lib/checkpointFlags`. Real MediaPipe/DTW/flag execution stays a manual-verification concern (Task 4).
- Reuse over rebuild: the gap-filled angle rows are exported and reused, not reimplemented; the existing dev tool is extended, not replaced with a fourth Vite entry point.
- No LLM call, no coaching-tip generation, no named-phase segmentation — all explicitly out of scope, deferred to a later milestone.

---

## File Structure

```
Sports_Analysis_App/
└── frontend/
    └── src/
        ├── dev-tools/
        │   ├── AlignmentToolApp.tsx                     # modified: compute + render checkpoint flags
        │   └── AlignmentToolApp.test.tsx                # modified: new mock, 2 new tests
        └── lib/
            ├── featureVector.ts                         # modified: export computeAngleRows
            ├── featureVector.test.ts                    # modified: 1 new test, 5 existing unchanged
            ├── checkpointFlags.ts                        # new
            └── checkpointFlags.test.ts                   # new
```

---

### Task 1: Export the gap-filled angle rows from `featureVector.ts`

**Files:**
- Modify: `frontend/src/lib/featureVector.ts`
- Modify: `frontend/src/lib/featureVector.test.ts`

**Interfaces:**
- Renames the private `computeAngleRowsWithGapFill(sequence: PoseSequence): number[][]` to a public, exported `computeAngleRows(sequence: PoseSequence): number[][]`. `computeFeatureVectors` calls it internally, unchanged behavior. Consumed by `checkpointFlags.ts` (Task 2).

**Design notes (read before implementing):**
- This is a pure rename + `export` keyword addition — the gap-fill algorithm itself (carry-forward last valid angle vector across null-landmark frames, zero-fill leading gaps) is untouched, so it does not need re-testing here; `checkpointFlags.test.ts`'s gap test (Task 2) only needs to confirm this module doesn't throw/NaN when handed a gap, not re-verify the gap-fill algorithm's correctness in depth — that's already fully covered by `featureVector.test.ts`'s existing gap-related tests.
- The 5 existing `featureVector.test.ts` tests import and test only `computeFeatureVectors`/`FEATURE_VECTOR_LENGTH`, never the internal helper by name — so the rename is safe and they must pass **unmodified**.
- One new test is added (TDD: write it first, watch it fail because `computeAngleRows` isn't exported yet) that checks `computeAngleRows`'s output is exactly the angle-only (first 8-column) slice of `computeFeatureVectors`'s output.

- [ ] **Step 1: Write the failing test**

Update the import line at the top of `frontend/src/lib/featureVector.test.ts`:

```ts
import { computeAngleRows, computeFeatureVectors, FEATURE_VECTOR_LENGTH } from './featureVector'
```

Add a new `describe` block (existing tests untouched):

```ts
describe('computeAngleRows', () => {
  it('returns just the angle portion (first NUM_ANGLES columns), matching computeFeatureVectors', () => {
    const seq = sequence([frame(0, poseWithLeftElbowAngle(90)), frame(1, poseWithLeftElbowAngle(120))])
    const angleRows = computeAngleRows(seq)
    const featureRows = computeFeatureVectors(seq)
    expect(angleRows).toEqual(featureRows.map((row) => row.slice(0, NUM_ANGLES)))
  })
})
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `cd frontend && npm run test -- featureVector`
Expected: FAIL — `computeAngleRows` is not exported (TS error / undefined import).

- [ ] **Step 3: Rename and export in the implementation**

`frontend/src/lib/featureVector.ts` — rename `computeAngleRowsWithGapFill` to `computeAngleRows` and add `export`, update the one call site in `computeFeatureVectors`:

```ts
import { computeJointAngles, JOINT_ANGLE_NAMES } from './jointAngles'
import type { PoseSequence } from './poseTypes'

const NUM_ANGLES = JOINT_ANGLE_NAMES.length
export const FEATURE_VECTOR_LENGTH = NUM_ANGLES * 3 // angles + velocity + acceleration

/**
 * Per-frame 8-angle vector across a whole sequence, with null-landmark gaps
 * carried forward. Exported so checkpointFlags.ts (milestone 4) can reuse the
 * exact same gap-filled angle data computeFeatureVectors uses internally,
 * instead of duplicating this logic.
 */
export function computeAngleRows(sequence: PoseSequence): number[][] {
  // ponytail: holds last valid angle vector across null-landmark gaps instead of
  // interpolating — revisit if gaps are long/frequent in practice.
  let lastValid = new Array(NUM_ANGLES).fill(0)
  return sequence.frames.map((frame) => {
    const angles = computeJointAngles(frame.landmarksSmoothed)
    // ponytail: leading null frames (before the first valid detection) fall back
    // to a zero vector — fine for short gaps, revisit if a clip starts with a
    // long one (e.g. drop leading frames instead).
    if (angles) lastValid = angles
    return lastValid
  })
}

function finiteDifference(rows: number[][], dtSec: number): number[][] {
  return rows.map((row, i) => {
    const prev = i === 0 ? row : rows[i - 1] // no prior row -> zero derivative
    return row.map((value, k) => (value - prev[k]) / dtSec)
  })
}

/**
 * Per-frame feature vector: 8 joint angles + 8 angular velocities + 8 angular
 * accelerations = 24 dims. NOTE: dimensions are not scale-normalized before
 * DTW's Euclidean distance — see the milestone-3 plan for why, and what to
 * check if the DTW path looks off.
 */
export function computeFeatureVectors(sequence: PoseSequence): number[][] {
  const dtSec = 1 / sequence.targetFps
  const angleRows = computeAngleRows(sequence)
  const velocityRows = finiteDifference(angleRows, dtSec)
  const accelerationRows = finiteDifference(velocityRows, dtSec)
  return angleRows.map((angles, i) => [...angles, ...velocityRows[i], ...accelerationRows[i]])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- featureVector`
Expected: PASS (6 tests — 5 existing unchanged + 1 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/lib/featureVector.ts frontend/src/lib/featureVector.test.ts
git commit -m "refactor(frontend): export gap-filled angle rows from featureVector.ts for reuse"
```

---

### Task 2: `checkpointFlags.ts` — deterministic per-joint checkpoint flags

**Files:**
- Create: `frontend/src/lib/checkpointFlags.ts`
- Create: `frontend/src/lib/checkpointFlags.test.ts`

**Interfaces:**
- Consumes: `computeAngleRows` from `./featureVector` (Task 1); `JOINT_ANGLE_NAMES` from `./jointAngles`; `PoseSequence` from `./poseTypes`.
- Produces: `CheckpointFlag` interface; `DEFAULT_THRESHOLD_DEG: number`; `computeCheckpointFlags(userSequence: PoseSequence, referenceSequence: PoseSequence, path: [number, number][], thresholdDeg?: number): CheckpointFlag[]` — used by `AlignmentToolApp.tsx` (Task 3).

**Design notes (read before implementing):**
- **Reference-clip-relative comparison, not hand-authored ranges** (confirmed decision): for each `[userFrameIdx, referenceFrameIdx]` in `path`, for each of the 8 joints (same fixed order as `JOINT_ANGLE_NAMES`), `delta = userAngle - referenceAngle`; emit a flag only when `Math.abs(delta) > thresholdDeg`.
- **`phase` field is `referenceFrameIdx`, not a named phase** — no phase-boundary segmentation (catch/pull/push/recovery) exists anywhere in this codebase or spec. Using the reference clip's frame index is the natural available proxy. Deliberate, documented simplification.
- **`DEFAULT_THRESHOLD_DEG = 15`:** see design doc — sits above typical one-euro-filtered landmark-angle jitter while catching a visibly real form deviation. Not a precise biomechanics claim.
- **Reuses `computeAngleRows`, does not duplicate gap-fill logic** — this is the entire reason Task 1 exported it. `computeCheckpointFlags` calls it once per sequence up front, then indexes into the resulting gap-filled rows by `path`'s frame indices; no null checks needed inside the per-pair loop, since `computeAngleRows` never returns `null` rows.
- **No bounds-checking on `path` indices against sequence length** — `path` always comes from `dtw()` over feature vectors derived from these exact sequences (see `AlignmentToolApp.tsx`, Task 3), so indices are always in range by construction, same trust boundary `dtw.ts` itself already relies on for its own inputs.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/checkpointFlags.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeCheckpointFlags, DEFAULT_THRESHOLD_DEG } from './checkpointFlags'
import { LEFT_ANKLE, LEFT_ELBOW, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, LEFT_WRIST } from './jointAngles'
import type { Landmark, PoseFrame, PoseSequence } from './poseTypes'

function landmark(x: number, y: number): Landmark {
  return { x, y, z: 0 }
}

function buildLandmarks(overrides: Partial<Record<number, Landmark>>): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => overrides[i] ?? landmark(0, 0))
}

// Places a/vertex/c so the angle at `vertex` equals angleDeg exactly — same
// atan2-friendly construction featureVector.test.ts uses for a single joint.
function withAngle(vertex: number, a: number, c: number, angleDeg: number): Partial<Record<number, Landmark>> {
  const radians = (angleDeg * Math.PI) / 180
  return { [a]: landmark(1, 0), [vertex]: landmark(0, 0), [c]: landmark(Math.cos(radians), Math.sin(radians)) }
}

function poseWithLeftElbowAngle(angleDeg: number): Landmark[] {
  return buildLandmarks(withAngle(LEFT_ELBOW, LEFT_SHOULDER, LEFT_WRIST, angleDeg))
}

function poseWithLeftElbowAndKneeAngles(elbowDeg: number, kneeDeg: number): Landmark[] {
  return buildLandmarks({
    ...withAngle(LEFT_ELBOW, LEFT_SHOULDER, LEFT_WRIST, elbowDeg),
    ...withAngle(LEFT_KNEE, LEFT_HIP, LEFT_ANKLE, kneeDeg),
  })
}

function frame(index: number, landmarks: Landmark[] | null): PoseFrame {
  return { frameIndex: index, timestampMs: index * (1000 / 30), landmarksRaw: landmarks, landmarksSmoothed: landmarks }
}

function sequence(frames: PoseFrame[]): PoseSequence {
  return {
    videoDurationMs: frames.length * (1000 / 30),
    videoWidth: 640,
    videoHeight: 480,
    targetFps: 30,
    frameCount: frames.length,
    frames,
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

describe('computeCheckpointFlags', () => {
  it('emits no flags for identical sequences', () => {
    const seq = sequence([frame(0, poseWithLeftElbowAngle(90))])
    expect(computeCheckpointFlags(seq, seq, [[0, 0]])).toEqual([])
  })

  it('flags a joint when the delta clearly exceeds the default threshold, with exact field values', () => {
    const user = sequence([frame(0, poseWithLeftElbowAngle(110))])
    const reference = sequence([frame(0, poseWithLeftElbowAngle(90))])
    const flags = computeCheckpointFlags(user, reference, [[0, 0]])
    expect(flags).toEqual([{ phase: 0, joint: 'leftElbow', userValue: 110, referenceValue: 90, delta: 20 }])
  })

  it('does not flag a delta just under the default threshold (boundary)', () => {
    const belowThresholdDelta = DEFAULT_THRESHOLD_DEG - 1
    const user = sequence([frame(0, poseWithLeftElbowAngle(90 + belowThresholdDelta))])
    const reference = sequence([frame(0, poseWithLeftElbowAngle(90))])
    expect(computeCheckpointFlags(user, reference, [[0, 0]])).toEqual([])
  })

  it('flags multiple joints independently within the same frame pair', () => {
    const user = sequence([frame(0, poseWithLeftElbowAndKneeAngles(110, 60))])
    const reference = sequence([frame(0, poseWithLeftElbowAndKneeAngles(90, 90))])
    const flags = computeCheckpointFlags(user, reference, [[0, 0]])
    expect(flags.map((f) => f.joint)).toEqual(['leftElbow', 'leftKnee'])
    expect(flags[0].delta).toBeCloseTo(20, 5)
    expect(flags[1].delta).toBeCloseTo(-30, 5)
  })

  it('does not throw or produce NaN when a sequence has a null-landmark gap (reuses gap-filled rows)', () => {
    const user = sequence([
      frame(0, poseWithLeftElbowAngle(90)),
      frame(1, null),
      frame(2, poseWithLeftElbowAngle(90)),
    ])
    const reference = sequence([
      frame(0, poseWithLeftElbowAngle(90)),
      frame(1, poseWithLeftElbowAngle(90)),
      frame(2, poseWithLeftElbowAngle(90)),
    ])
    const flags = computeCheckpointFlags(user, reference, [
      [0, 0],
      [1, 1],
      [2, 2],
    ])
    expect(flags.some((f) => Number.isNaN(f.delta))).toBe(false)
    expect(flags).toEqual([]) // carried-forward value still matches the reference at frame 1
  })

  it('accepts a custom thresholdDeg', () => {
    const user = sequence([frame(0, poseWithLeftElbowAngle(95))])
    const reference = sequence([frame(0, poseWithLeftElbowAngle(90))])
    expect(computeCheckpointFlags(user, reference, [[0, 0]], 3)).toEqual([
      { phase: 0, joint: 'leftElbow', userValue: 95, referenceValue: 90, delta: 5 },
    ])
    expect(computeCheckpointFlags(user, reference, [[0, 0]], 10)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- checkpointFlags`
Expected: FAIL — `checkpointFlags.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/lib/checkpointFlags.ts`:

```ts
import { computeAngleRows } from './featureVector'
import { JOINT_ANGLE_NAMES } from './jointAngles'
import type { PoseSequence } from './poseTypes'

// ponytail: 15deg is a first-draft, uncalibrated threshold, not a researched
// biomechanics claim — the spec's own "bootstrapping the checkpoint
// thresholds" note explicitly sanctions this. Chosen to sit above typical
// one-euro-filtered landmark-angle jitter (a few degrees, per milestone 1)
// while staying tight enough to catch a real visible form deviation.
// Revisit with real calibration data once this feeds anything beyond the dev tool.
export const DEFAULT_THRESHOLD_DEG = 15

export interface CheckpointFlag {
  /**
   * Reference clip's frame index at this DTW-aligned pair — used as a proxy
   * for "phase" since no named-phase segmentation (catch/pull/push/recovery)
   * exists anywhere in this codebase or spec. Deliberate simplification, not
   * a claim that real phase detection exists.
   */
  phase: number
  joint: string // one of JOINT_ANGLE_NAMES
  userValue: number
  referenceValue: number
  delta: number // userValue - referenceValue
}

/**
 * Stage A of spec section 5 ("Comparison / feedback generation"): deterministic,
 * unit-testable checkpoint-flag computation — no LLM, no phase-boundary
 * detection. For each (userFrameIdx, referenceFrameIdx) pair the DTW path
 * already aligned, compares each of the 8 joint angles between the user and
 * reference clip at that same pair, and flags joints whose |delta| exceeds
 * thresholdDeg.
 */
export function computeCheckpointFlags(
  userSequence: PoseSequence,
  referenceSequence: PoseSequence,
  path: [number, number][],
  thresholdDeg: number = DEFAULT_THRESHOLD_DEG
): CheckpointFlag[] {
  const userRows = computeAngleRows(userSequence)
  const referenceRows = computeAngleRows(referenceSequence)

  const flags: CheckpointFlag[] = []
  for (const [userFrameIdx, referenceFrameIdx] of path) {
    const userAngles = userRows[userFrameIdx]
    const referenceAngles = referenceRows[referenceFrameIdx]
    JOINT_ANGLE_NAMES.forEach((joint, k) => {
      const delta = userAngles[k] - referenceAngles[k]
      if (Math.abs(delta) > thresholdDeg) {
        flags.push({
          phase: referenceFrameIdx,
          joint,
          userValue: userAngles[k],
          referenceValue: referenceAngles[k],
          delta,
        })
      }
    })
  }
  return flags
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- checkpointFlags`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/lib/checkpointFlags.ts frontend/src/lib/checkpointFlags.test.ts
git commit -m "feat(frontend): add deterministic per-joint checkpoint flags (spec section 5, Stage A)"
```

---

### Task 3: Render checkpoint flags in the DTW alignment dev tool

**Files:**
- Modify: `frontend/src/dev-tools/AlignmentToolApp.tsx`
- Modify: `frontend/src/dev-tools/AlignmentToolApp.test.tsx`

**Interfaces:**
- Consumes: `computeCheckpointFlags`, `CheckpointFlag` from `../lib/checkpointFlags` (Task 2, mocked in tests) — added alongside the existing `computeFeatureVectors`/`dtw` imports.
- No new component, no new Vite entry point — same `<AlignmentToolApp />` extended in place.

**Design notes (read before implementing):**
- The existing DTW `useEffect` already has `userSequence`, `referenceSequence`, and computes `dtw(...).path` in one place — that's the natural spot to also call `computeCheckpointFlags(userSequence, referenceSequence, dtwPath)`, using the local `dtwPath` variable rather than the `path` state (avoids a stale-closure dependency on state that hasn't re-rendered yet).
- New `flags` state: `useState<CheckpointFlag[] | null>(null)`, same `null`-until-computed idiom as `path`.
- **Rendering: distinguish "not computed yet" from "computed, zero flags."** When `flags` is non-null, render the table if `flags.length > 0`, else render a plain `<p>No checkpoint flags.</p>`. This also means the existing 3rd test's `getAllByRole('row')` count (`4` = header + 3 mapping rows) stays correct unmodified, since the default mock (`[]`) renders a paragraph, not a second table with its own header row.
- New table columns, plain HTML matching the existing mapping table's plainness: "Phase (ref frame)" / "Joint" / "Your angle" / "Reference angle" / "Delta". Numeric values formatted with `.toFixed(1)` for readability — display-only, doesn't change the underlying data.
- Test mocks: add a fourth module mock for `../lib/checkpointFlags`, defaulting to `mockReturnValue([])` in `beforeEach`. Two new tests added: one confirming the flags table renders with correct cell values when `computeCheckpointFlags` returns flags, one confirming the "No checkpoint flags." message shows when it returns an empty array.

- [ ] **Step 1: Update the test mocks and add new tests (write failing tests first)**

`frontend/src/dev-tools/AlignmentToolApp.test.tsx` — add the new mock near the top:

```tsx
const mockComputeCheckpointFlags = vi.fn()

vi.mock('../lib/checkpointFlags', () => ({
  computeCheckpointFlags: (...args: unknown[]) => mockComputeCheckpointFlags(...args),
}))
```

Update `beforeEach`:

```tsx
beforeEach(() => {
  mockEstimateSequence.mockReset()
  mockComputeFeatureVectors.mockReset().mockReturnValue([[0]])
  mockDtw.mockReset().mockReturnValue({ path: [[0, 0]], cost: 0 })
  mockComputeCheckpointFlags.mockReset().mockReturnValue([])
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
})
```

Add two new tests inside `describe('AlignmentToolApp', ...)`, after the existing 3:

```tsx
it('renders the checkpoint flags table once computeCheckpointFlags returns flags', async () => {
  mockEstimateSequence.mockResolvedValueOnce(fakeSequence(10)).mockResolvedValueOnce(fakeSequence(12))
  mockComputeCheckpointFlags.mockReturnValue([
    { phase: 1, joint: 'leftElbow', userValue: 110, referenceValue: 90, delta: 20 },
  ])

  render(<AlignmentToolApp />)
  await userEvent.upload(
    screen.getByTestId('user-file-upload-input'),
    new File(['dummy'], 'user.mp4', { type: 'video/mp4' })
  )
  await waitFor(() => expect(screen.getByTestId('reference-file-upload-input')).toBeEnabled())
  await userEvent.upload(
    screen.getByTestId('reference-file-upload-input'),
    new File(['dummy'], 'reference.mp4', { type: 'video/mp4' })
  )

  await waitFor(() => expect(screen.getByText('leftElbow')).toBeInTheDocument())
  expect(screen.getByText('110.0')).toBeInTheDocument()
  expect(screen.getByText('90.0')).toBeInTheDocument()
  expect(screen.getByText('20.0')).toBeInTheDocument()
  expect(mockComputeCheckpointFlags).toHaveBeenCalledWith(
    expect.objectContaining({ frameCount: 10 }),
    expect.objectContaining({ frameCount: 12 }),
    [[0, 0]]
  )
})

it('shows "No checkpoint flags." once computeCheckpointFlags resolves with zero flags', async () => {
  mockEstimateSequence.mockResolvedValueOnce(fakeSequence(10)).mockResolvedValueOnce(fakeSequence(12))
  // mockComputeCheckpointFlags already defaults to [] via beforeEach

  render(<AlignmentToolApp />)
  await userEvent.upload(
    screen.getByTestId('user-file-upload-input'),
    new File(['dummy'], 'user.mp4', { type: 'video/mp4' })
  )
  await waitFor(() => expect(screen.getByTestId('reference-file-upload-input')).toBeEnabled())
  await userEvent.upload(
    screen.getByTestId('reference-file-upload-input'),
    new File(['dummy'], 'reference.mp4', { type: 'video/mp4' })
  )

  await waitFor(() => expect(screen.getByText('No checkpoint flags.')).toBeInTheDocument())
})
```

- [ ] **Step 2: Run tests to verify the two new tests fail, existing 3 still pass**

Run: `cd frontend && npm run test -- AlignmentToolApp`
Expected: the 3 pre-existing tests PASS; the 2 new tests FAIL, since `AlignmentToolApp.tsx` doesn't call `computeCheckpointFlags` or render the second table yet.

- [ ] **Step 3: Update the implementation**

`frontend/src/dev-tools/AlignmentToolApp.tsx` — add the import, new state, extend the DTW effect, add the second table (the `ClipSlot` component stays unchanged):

```tsx
import { useEffect, useRef, useState } from 'react'
import { FileUpload } from '../components/FileUpload'
import { ProcessingProgress } from '../components/ProcessingProgress'
import { usePoseEstimation } from '../hooks/usePoseEstimation'
import { computeFeatureVectors } from '../lib/featureVector'
import { dtw } from '../lib/dtw'
import { computeCheckpointFlags, type CheckpointFlag } from '../lib/checkpointFlags'
import type { PoseSequence } from '../lib/poseTypes'

const TARGET_FPS = 30

// ClipSlot component unchanged — keep as-is.

export function AlignmentToolApp() {
  const [userUrl, setUserUrl] = useState<string | null>(null)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [userProgress, setUserProgress] = useState({ current: 0, total: 0 })
  const [referenceProgress, setReferenceProgress] = useState({ current: 0, total: 0 })
  const [userSequence, setUserSequence] = useState<PoseSequence | null>(null)
  const [referenceSequence, setReferenceSequence] = useState<PoseSequence | null>(null)
  const [path, setPath] = useState<[number, number][] | null>(null)
  const [flags, setFlags] = useState<CheckpointFlag[] | null>(null)
  const { estimateSequence } = usePoseEstimation()

  const handleUserVideoReady = (video: HTMLVideoElement) => {
    estimateSequence(video, {
      targetFps: TARGET_FPS,
      onProgress: (current, total) => setUserProgress({ current, total }),
    }).then(setUserSequence)
  }

  const handleReferenceVideoReady = (video: HTMLVideoElement) => {
    estimateSequence(video, {
      targetFps: TARGET_FPS,
      onProgress: (current, total) => setReferenceProgress({ current, total }),
    }).then(setReferenceSequence)
  }

  useEffect(() => {
    if (!userSequence || !referenceSequence) return
    const userVectors = computeFeatureVectors(userSequence)
    const referenceVectors = computeFeatureVectors(referenceSequence)
    const dtwPath = dtw(userVectors, referenceVectors).path
    setPath(dtwPath)
    setFlags(computeCheckpointFlags(userSequence, referenceSequence, dtwPath))
  }, [userSequence, referenceSequence])

  return (
    <div>
      <h1>DTW alignment tool (dev only)</h1>
      <p>
        Pick two local clips. The reference clip&apos;s input stays disabled until the user clip finishes —
        MediaPipe&apos;s VIDEO mode expects one video&apos;s timestamps at a time on a shared PoseLandmarker
        instance, so processing is sequential, not parallel.
      </p>
      <ClipSlot
        label="User clip"
        testId="user-file-upload-input"
        disabled={false}
        videoUrl={userUrl}
        progress={userProgress}
        sequence={userSequence}
        onFileSelected={(file) => setUserUrl(URL.createObjectURL(file))}
        onVideoElementReady={handleUserVideoReady}
      />
      <ClipSlot
        label="Reference clip"
        testId="reference-file-upload-input"
        disabled={!userSequence}
        videoUrl={referenceUrl}
        progress={referenceProgress}
        sequence={referenceSequence}
        onFileSelected={(file) => setReferenceUrl(URL.createObjectURL(file))}
        onVideoElementReady={handleReferenceVideoReady}
      />
      {path && (
        <table>
          <thead>
            <tr>
              <th>User frame</th>
              <th>Reference frame</th>
            </tr>
          </thead>
          <tbody>
            {path.map(([userIdx, refIdx], i) => (
              <tr key={i}>
                <td>{userIdx}</td>
                <td>{refIdx}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {flags &&
        (flags.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Phase (ref frame)</th>
                <th>Joint</th>
                <th>Your angle</th>
                <th>Reference angle</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f, i) => (
                <tr key={i}>
                  <td>{f.phase}</td>
                  <td>{f.joint}</td>
                  <td>{f.userValue.toFixed(1)}</td>
                  <td>{f.referenceValue.toFixed(1)}</td>
                  <td>{f.delta.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No checkpoint flags.</p>
        ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- AlignmentToolApp`
Expected: PASS (5 tests — 3 existing unchanged + 2 new).

- [ ] **Step 5: Type-check and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: no type errors; all tests from milestones 1–3 plus this milestone's new/changed tests all PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/dev-tools/AlignmentToolApp.tsx frontend/src/dev-tools/AlignmentToolApp.test.tsx
git commit -m "feat(frontend): render checkpoint flags in the DTW alignment dev tool"
```

---

### Task 4: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Tasks 1–3 together with real local clips, same "verify visually before building UI around it" pattern as milestone 3's Task 5.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: all PASS, matching the milestone-1/2/3 baseline plus this milestone's new/changed tests.

- [ ] **Step 2: Process the same clip twice (trivial sanity check)**

```bash
cd frontend && npm run dev
```

Open `/alignment-tool.html`. Upload the same clip as both "User clip" and "Reference clip".
Expected: the DTW mapping table is close to the identity diagonal (per milestone 3's Task 5); the checkpoint flags table shows **"No checkpoint flags."** — deltas between a clip and itself should be ~0 for every joint at every aligned pair, well under `DEFAULT_THRESHOLD_DEG`.

- [ ] **Step 3: Process two different real clips**

Upload two different takes (or two different swimmers) as user/reference.
Expected: the checkpoint flags table shows a plausible, non-empty set of flagged joints — deltas that roughly correlate with visibly different form between the two clips at the corresponding stroke moments. Confirm:
- `phase` values increase in a roughly monotonic way down the table, tracking the reference clip's frame progression.
- No flag has `userValue`/`referenceValue`/`delta` that look nonsensical (e.g. no `NaN`, no wildly implausible values inconsistent with the video).
- If flags look noise-dominated (many small deltas just over threshold from landmark jitter rather than real form differences), that's a signal `DEFAULT_THRESHOLD_DEG = 15` may need raising — a calibration follow-up, not a bug in this milestone's logic.

---

## Self-Review Notes

- **Spec coverage:** Stage A only, per spec section 5 — structured `{phase, joint, user_value, reference_value, delta}` records computed deterministically from measured landmarks (Task 2); no LLM call, no coaching-tip text, matching the explicit scope decision. `phase` is documented as `referenceFrameIndex`, not a fabricated phase name.
- **Reuse over rebuild:** the gap-filled angle rows are exported from `featureVector.ts` (Task 1) and reused as-is in `checkpointFlags.ts` (Task 2) rather than reimplemented. The existing dev tool is extended (Task 3), not replaced with a fourth Vite entry point.
- **Threshold is a stated first draft, not a final answer:** `DEFAULT_THRESHOLD_DEG = 15` is justified against the spec's own "bootstrapping the checkpoint thresholds" note. Task 4's manual verification explicitly calls out what to watch for if it needs raising.
- **No new dependencies:** confirmed against `frontend/package.json` — `computeCheckpointFlags` is under 30 lines, pure loop + comparison logic.
- **Test safety for the existing 3 `AlignmentToolApp.test.tsx` tests:** the new `computeCheckpointFlags` mock defaults to `[]` in `beforeEach`, and the flags table only renders when `flags.length > 0` (else a `<p>` with no table markup) — so the existing `getAllByRole('row')` row-count assertion is unaffected.
- **Deferred, not built:** LLM-based coaching-tip generation, named-phase segmentation, and the side-by-side synced video player (build-order step 4) all remain explicitly out of scope.

### Critical Files for Implementation
- frontend/src/lib/featureVector.ts
- frontend/src/lib/checkpointFlags.ts
- frontend/src/lib/checkpointFlags.test.ts
- frontend/src/dev-tools/AlignmentToolApp.tsx
- frontend/src/dev-tools/AlignmentToolApp.test.tsx
