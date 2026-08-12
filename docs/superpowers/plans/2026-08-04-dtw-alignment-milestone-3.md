# DTW Alignment Between User and Reference Clips (Milestone 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement DTW alignment between two `PoseSequence`s (a biomechanical feature vector per frame — joint angles + angular velocity + angular acceleration — fed into a hand-rolled DTW), and a dev-only tool to run it on two local clips and inspect the resulting frame-index mapping, per `sports-motion-comparison-spec.md`'s build-order step 3 and spec section "4. Temporal alignment". This milestone proves the alignment math works; it explicitly does not build the side-by-side comparison UI (that's build-order step 4).

**Architecture:** Three new pure, fully-unit-tested TypeScript modules under `frontend/src/lib/` — `jointAngles.ts` (per-frame biomechanical feature extraction from landmarks), `featureVector.ts` (assembles the angle/velocity/acceleration vector per frame across a whole `PoseSequence`), `dtw.ts` (generic DTW over `number[][]`) — plus a third, isolated dev-only Vite entry point (`alignment-tool.html` / `AlignmentToolApp.tsx`), following the exact idiom `reference-tool.html` established in milestone 2. The dev tool reuses `FileUpload`, `ProcessingProgress`, and `usePoseEstimation` verbatim; it deliberately does **not** reuse `VideoPoseViewer` (that component's skeleton-overlay + scrubber UI is the "side-by-side video player with overlay" the spec says is out of scope this milestone) — instead it mounts a minimal hidden `<video>` per clip, using the exact same ref/mount-effect wiring `VideoPoseViewer` already uses, purely to feed `usePoseEstimation`.

**Tech Stack:** Same as milestones 1–2 — React 19, Vite, TypeScript, Vitest + RTL. No new dependencies. DTW and angle math are hand-rolled (no npm math/DTW library exists in `frontend/package.json`, and this is small enough not to warrant one).

See `docs/superpowers/specs/2026-08-04-dtw-alignment-milestone-3-design.md` for the design rationale (joint set choice, 2D-vs-3D, gap-handling, unnormalized-feature-scale tradeoff).

## Global Constraints

- No new frontend dependencies. DTW, angle math, and finite-difference velocity/acceleration are hand-rolled pure TypeScript.
- 2-space indentation for TypeScript.
- The dev tool is a third, isolated Vite HTML entry point (`frontend/alignment-tool.html`), no router — same idiom as `reference-tool.html`.
- This milestone is decoupled from the backend reference-clip registry entirely — both clips are arbitrary local files run through `usePoseEstimation` live, exactly like `ReferenceToolApp.tsx` already does for one file. No dependency on milestone 2's Task 4 (real committed clips).
- Explicitly out of scope: any synchronized/side-by-side video playback UI, checkpoint rules, LLM feedback. The dev tool renders the frame-index mapping as a plain table — nothing else.
- `landmarksSmoothed` (post one-euro-filter) is the field used for angle computation, never `landmarksRaw` — matches milestone 1's established convention.
- Joint angles are computed in 2D (`x, y` only), not 3D. Justification: MediaPipe's `z` is a noisier monocular depth estimate than `x, y`; reference clips are shot side-on per milestone 2's `camera_angle_note` convention, so the biomechanically relevant motion is already captured in the image plane; and angle-between-vectors is inherently invariant to in-plane camera rotation regardless of dimensionality, so 3D doesn't uniquely solve a problem 2D leaves open. Documented as a first-draft decision, not re-litigated per-task.

---

## File Structure

```
Sports_Analysis_App/
└── frontend/
    ├── alignment-tool.html                        # new: third Vite entry point
    └── src/
        ├── components/
        │   ├── FileUpload.tsx                      # modified: optional `testId` prop
        │   └── FileUpload.test.tsx                 # modified: one new test
        ├── dev-tools/
        │   ├── alignment-tool-main.tsx              # new
        │   ├── AlignmentToolApp.tsx                 # new
        │   └── AlignmentToolApp.test.tsx            # new
        └── lib/
            ├── jointAngles.ts, jointAngles.test.ts        # new
            ├── featureVector.ts, featureVector.test.ts    # new
            └── dtw.ts, dtw.test.ts                        # new
```

**Testing strategy note:** every new module in `frontend/src/lib/` is pure math/logic with no DOM or MediaPipe dependency — full TDD unit coverage, same as `oneEuroFilter.ts`/`frameExtraction.ts`/`drawSkeleton.ts` in milestone 1. `AlignmentToolApp.tsx` is tested the same way `ReferenceToolApp.tsx` was: mock `usePoseEstimation`, `computeFeatureVectors`, and `dtw` at the module boundary, never let real MediaPipe/DTW execution happen in tests. Real MediaPipe processing stays a manual-verification concern (Task 5), same reasoning as every prior milestone.

---

### Task 1: `jointAngles.ts` — landmark constants, `angleBetweenPoints`, per-frame joint-angle vector

**Files:**
- Create: `frontend/src/lib/jointAngles.ts`
- Create: `frontend/src/lib/jointAngles.test.ts`

**Interfaces:**
- Consumes: `Landmark` from `./poseTypes`
- Produces: named landmark-index constants; `angleBetweenPoints(a: Landmark, b: Landmark, c: Landmark): number` (degrees, angle at `b`); `JOINT_ANGLE_NAMES: string[]`; `computeJointAngles(landmarks: Landmark[] | null): number[] | null` — used by `featureVector.ts` (Task 2).

**Design notes (read before implementing):**
- **Joint angle set — 8 bilateral angles, confirmed as proposed:** left/right elbow, shoulder, hip, knee. For freestyle specifically: elbow angle captures the high-elbow catch and early-vertical-forearm pull pattern; shoulder angle captures the arm's recovery arc and contribution to body roll; hip angle captures body undulation/roll and hip-drive timing; knee angle captures flutter-kick amplitude and bend. Bilateral (not just one side) is deliberate, not redundant: freestyle's arm/leg action alternates left/right, so a single-side angle would silently discard half the motion's temporal signature — DTW needs both traces to distinguish, e.g., "left arm mid-pull" from "right arm mid-pull."
- **Exact triplets** (angle at the middle/vertex landmark, per MediaPipe's 33-point index topology):

  | Angle | `a` | vertex (`b`) | `c` |
  |---|---|---|---|
  | leftElbow | `LEFT_SHOULDER` (11) | `LEFT_ELBOW` (13) | `LEFT_WRIST` (15) |
  | rightElbow | `RIGHT_SHOULDER` (12) | `RIGHT_ELBOW` (14) | `RIGHT_WRIST` (16) |
  | leftShoulder | `LEFT_ELBOW` (13) | `LEFT_SHOULDER` (11) | `LEFT_HIP` (23) |
  | rightShoulder | `RIGHT_ELBOW` (14) | `RIGHT_SHOULDER` (12) | `RIGHT_HIP` (24) |
  | leftHip | `LEFT_SHOULDER` (11) | `LEFT_HIP` (23) | `LEFT_KNEE` (25) |
  | rightHip | `RIGHT_SHOULDER` (12) | `RIGHT_HIP` (24) | `RIGHT_KNEE` (26) |
  | leftKnee | `LEFT_HIP` (23) | `LEFT_KNEE` (25) | `LEFT_ANKLE` (27) |
  | rightKnee | `RIGHT_HIP` (24) | `RIGHT_KNEE` (26) | `RIGHT_ANKLE` (28) |

- **`angleBetweenPoints` uses `atan2(|cross|, dot)`, not `acos`:** for 2D vectors `v1 = a - b`, `v2 = c - b`, `angle = atan2(|v1.x·v2.y − v1.y·v2.x|, v1.x·v2.x + v1.y·v2.y)`. This is numerically stable at the 0°/180° extremes where an `acos`-based approach can produce `NaN` from floating-point values that drift fractionally outside `[-1, 1]`.
- **Null handling — whole-frame, not per-landmark:** `landmarksSmoothed` is `Landmark[] | null` at the *frame* level (MediaPipe either detects all 33 landmarks or none — this codebase has no notion of a partially-null landmark array; `NUM_LANDMARKS = 33` is already an established invariant in `oneEuroFilter.ts`). So `computeJointAngles` only needs one null check: `landmarks === null` → return `null` for the whole angle vector. This mirrors `Landmark[] | null`'s own nullability idiom rather than inventing a new sentinel (e.g. `NaN`).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/jointAngles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  angleBetweenPoints,
  computeJointAngles,
  JOINT_ANGLE_NAMES,
  LEFT_ELBOW,
  LEFT_SHOULDER,
  LEFT_WRIST,
} from './jointAngles'
import type { Landmark } from './poseTypes'

function landmark(x: number, y: number): Landmark {
  return { x, y, z: 0 }
}

describe('angleBetweenPoints', () => {
  it('returns 90 for a right angle', () => {
    expect(angleBetweenPoints(landmark(1, 0), landmark(0, 0), landmark(0, 1))).toBeCloseTo(90, 5)
  })

  it('returns 180 for three collinear points with b in the middle', () => {
    expect(angleBetweenPoints(landmark(-1, 0), landmark(0, 0), landmark(1, 0))).toBeCloseTo(180, 5)
  })

  it('returns 0 when a and c are in the same direction from b', () => {
    expect(angleBetweenPoints(landmark(1, 0), landmark(0, 0), landmark(2, 0))).toBeCloseTo(0, 5)
  })

  it('returns 45 for a known 45-degree geometry', () => {
    expect(angleBetweenPoints(landmark(1, 0), landmark(0, 0), landmark(1, 1))).toBeCloseTo(45, 5)
  })
})

const NUM_LANDMARKS = 33

function buildLandmarks(overrides: Partial<Record<number, Landmark>>): Landmark[] {
  return Array.from({ length: NUM_LANDMARKS }, (_, i) => overrides[i] ?? landmark(0, 0))
}

describe('computeJointAngles', () => {
  it('returns null when landmarks is null', () => {
    expect(computeJointAngles(null)).toBeNull()
  })

  it('returns one angle per JOINT_ANGLE_NAMES entry, in that order', () => {
    const landmarks = buildLandmarks({
      [LEFT_SHOULDER]: landmark(0, 0),
      [LEFT_ELBOW]: landmark(1, 0),
      [LEFT_WRIST]: landmark(1, 1),
    })
    const angles = computeJointAngles(landmarks)
    expect(angles).toHaveLength(JOINT_ANGLE_NAMES.length)
    expect(angles?.[JOINT_ANGLE_NAMES.indexOf('leftElbow')]).toBeCloseTo(90, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- jointAngles`
Expected: FAIL — `jointAngles.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/lib/jointAngles.ts`:

```ts
import type { Landmark } from './poseTypes'

// MediaPipe BlazePose 33-point topology — only the indices this module uses.
export const LEFT_SHOULDER = 11
export const RIGHT_SHOULDER = 12
export const LEFT_ELBOW = 13
export const RIGHT_ELBOW = 14
export const LEFT_WRIST = 15
export const RIGHT_WRIST = 16
export const LEFT_HIP = 23
export const RIGHT_HIP = 24
export const LEFT_KNEE = 25
export const RIGHT_KNEE = 26
export const LEFT_ANKLE = 27
export const RIGHT_ANKLE = 28

/** Angle at `b` (degrees, 0-180), between vectors b->a and b->c, in the x/y plane. */
export function angleBetweenPoints(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x
  const v1y = a.y - b.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const cross = v1x * v2y - v1y * v2x
  // atan2(|cross|, dot) instead of acos(dot / (|v1||v2|)) — stays finite/stable
  // at the 0deg/180deg extremes where an acos ratio can drift past +/-1.
  const radians = Math.atan2(Math.abs(cross), dot)
  return (radians * 180) / Math.PI
}

interface JointAngleDefinition {
  name: string
  a: number
  vertex: number
  c: number
}

// Bilateral elbow/shoulder/hip/knee — see Task 1 design notes for the
// freestyle-specific rationale per joint. Order here fixes feature-vector
// column order everywhere downstream (featureVector.ts, dtw.ts).
const JOINT_ANGLES: JointAngleDefinition[] = [
  { name: 'leftElbow', a: LEFT_SHOULDER, vertex: LEFT_ELBOW, c: LEFT_WRIST },
  { name: 'rightElbow', a: RIGHT_SHOULDER, vertex: RIGHT_ELBOW, c: RIGHT_WRIST },
  { name: 'leftShoulder', a: LEFT_ELBOW, vertex: LEFT_SHOULDER, c: LEFT_HIP },
  { name: 'rightShoulder', a: RIGHT_ELBOW, vertex: RIGHT_SHOULDER, c: RIGHT_HIP },
  { name: 'leftHip', a: LEFT_SHOULDER, vertex: LEFT_HIP, c: LEFT_KNEE },
  { name: 'rightHip', a: RIGHT_SHOULDER, vertex: RIGHT_HIP, c: RIGHT_KNEE },
  { name: 'leftKnee', a: LEFT_HIP, vertex: LEFT_KNEE, c: LEFT_ANKLE },
  { name: 'rightKnee', a: RIGHT_HIP, vertex: RIGHT_KNEE, c: RIGHT_ANKLE },
]

export const JOINT_ANGLE_NAMES = JOINT_ANGLES.map((j) => j.name)

/** 8-element angle vector for one frame's landmarks, or null if the frame has no detection. */
export function computeJointAngles(landmarks: Landmark[] | null): number[] | null {
  if (!landmarks) return null
  return JOINT_ANGLES.map(({ a, vertex, c }) => angleBetweenPoints(landmarks[a], landmarks[vertex], landmarks[c]))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- jointAngles`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/lib/jointAngles.ts frontend/src/lib/jointAngles.test.ts
git commit -m "feat(frontend): add pure joint-angle math for DTW feature vectors"
```

---

### Task 2: `featureVector.ts` — angles + angular velocity + angular acceleration per frame

**Files:**
- Create: `frontend/src/lib/featureVector.ts`
- Create: `frontend/src/lib/featureVector.test.ts`

**Interfaces:**
- Consumes: `computeJointAngles`, `JOINT_ANGLE_NAMES` from `./jointAngles` (Task 1); `PoseSequence` from `./poseTypes`
- Produces: `computeFeatureVectors(sequence: PoseSequence): number[][]` (one 24-dim row per frame: 8 angles, then 8 angular velocities, then 8 angular accelerations); `FEATURE_VECTOR_LENGTH: number` — used by `dtw.ts`'s tests indirectly and by `AlignmentToolApp.tsx` (Task 4).

**Design notes (read before implementing):**
- **Row layout:** `[angle_0..angle_7, velocity_0..velocity_7, acceleration_0..acceleration_7]`, in `JOINT_ANGLE_NAMES` order. `dtSec = 1 / sequence.targetFps` — the nominal frame spacing, not a measured per-frame timestamp delta. Frames are extracted at a fixed `targetFps` (milestone 1's seek-based extraction), so nominal spacing is simple and good enough; this is a documented simplification, not re-derived from `frameTimestampMs` deltas.
- **First-frame boundary (no prior frame to difference against):** rather than special-casing `i === 0` with an explicit branch, `finiteDifference` compares each row against itself when there is no previous row (`prev = i === 0 ? row : rows[i - 1]`). This makes velocity and (by the same trick, one level up) acceleration naturally zero at the start with no separate boundary logic — one `i === 0` ternary handles both the "first angle frame" and "first velocity frame" cases uniformly.
- **Null-landmark gap handling — carry forward last valid feature vector:**
  ```ts
  // ponytail: holds last valid angle vector across null-landmark gaps instead of
  // interpolating — revisit (e.g. linear interpolation across the gap) if gaps
  // turn out to be long/frequent in practice.
  ```
  A run of null frames repeats the last valid angle vector, which also means velocity/acceleration read as flat (zero) across the gap — a defensible "assume no visible motion during a detection dropout" approximation, not a claim of accuracy.
- **Leading null frames (before any valid detection exists yet):** fall back to an all-zero angle vector — there is nothing to carry forward yet. Documented as a second, separate simplification: fine for short startup gaps; if a clip commonly starts with a long detection gap, dropping those leading frames from the sequence entirely (rather than feeding DTW a run of fabricated zero-angle rows) would be the fix.
- **Known limitation, not fixed here — unnormalized feature scales:** angles (~0-180), angular velocity (deg/s), and angular acceleration (deg/s²) have very different natural magnitudes, and `dtw.ts` (Task 3) computes plain Euclidean distance across all 24 dimensions with no per-dimension normalization. This means DTW cost will likely be dominated by whichever dimension has the largest raw magnitude (probably acceleration). This is a deliberate first-draft simplification — flagged again in Task 5's manual verification as the first thing to suspect if the resulting alignment path looks noise-dominated or ignores the angle signal.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/featureVector.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeFeatureVectors, FEATURE_VECTOR_LENGTH } from './featureVector'
import { JOINT_ANGLE_NAMES, LEFT_ELBOW, LEFT_SHOULDER, LEFT_WRIST } from './jointAngles'
import type { Landmark, PoseFrame, PoseSequence } from './poseTypes'

const NUM_ANGLES = JOINT_ANGLE_NAMES.length // 8
const leftElbowIdx = JOINT_ANGLE_NAMES.indexOf('leftElbow')

function landmark(x: number, y: number): Landmark {
  return { x, y, z: 0 }
}

function buildLandmarks(overrides: Partial<Record<number, Landmark>>): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => overrides[i] ?? landmark(0, 0))
}

// LEFT_ELBOW is the vertex at the origin; LEFT_SHOULDER sits along +x, so the
// left-elbow angle equals `angleDeg` exactly (see jointAngles.test.ts's
// angleBetweenPoints coverage for why).
function poseWithLeftElbowAngle(angleDeg: number): Landmark[] {
  const radians = (angleDeg * Math.PI) / 180
  return buildLandmarks({
    [LEFT_SHOULDER]: landmark(1, 0),
    [LEFT_ELBOW]: landmark(0, 0),
    [LEFT_WRIST]: landmark(Math.cos(radians), Math.sin(radians)),
  })
}

function frame(index: number, landmarks: Landmark[] | null): PoseFrame {
  return {
    frameIndex: index,
    timestampMs: index * (1000 / 30),
    landmarksRaw: landmarks,
    landmarksSmoothed: landmarks,
  }
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

describe('computeFeatureVectors', () => {
  it('returns FEATURE_VECTOR_LENGTH (24) numbers per frame', () => {
    const rows = computeFeatureVectors(sequence([frame(0, poseWithLeftElbowAngle(90))]))
    expect(FEATURE_VECTOR_LENGTH).toBe(NUM_ANGLES * 3)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(FEATURE_VECTOR_LENGTH)
  })

  it('zero-pads velocity and acceleration on the first frame', () => {
    const rows = computeFeatureVectors(sequence([frame(0, poseWithLeftElbowAngle(90))]))
    expect(rows[0][NUM_ANGLES + leftElbowIdx]).toBe(0)
    expect(rows[0][2 * NUM_ANGLES + leftElbowIdx]).toBe(0)
  })

  it('computes angular velocity via finite difference at targetFps', () => {
    const rows = computeFeatureVectors(
      sequence([frame(0, poseWithLeftElbowAngle(90)), frame(1, poseWithLeftElbowAngle(120))])
    )
    // delta = 30deg over dt = 1/30s -> 900 deg/s
    expect(rows[1][NUM_ANGLES + leftElbowIdx]).toBeCloseTo(900, 5)
  })

  it('holds the last valid feature vector across a null-landmark gap, without NaN', () => {
    const rows = computeFeatureVectors(
      sequence([frame(0, poseWithLeftElbowAngle(90)), frame(1, null), frame(2, poseWithLeftElbowAngle(90))])
    )
    expect(rows[1][leftElbowIdx]).toBeCloseTo(90, 5)
    expect(rows[1][NUM_ANGLES + leftElbowIdx]).toBe(0)
    expect(rows.flat().some(Number.isNaN)).toBe(false)
  })

  it('falls back to a zero vector for leading null frames', () => {
    const rows = computeFeatureVectors(sequence([frame(0, null), frame(1, poseWithLeftElbowAngle(90))]))
    expect(rows[0][leftElbowIdx]).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- featureVector`
Expected: FAIL — `featureVector.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/lib/featureVector.ts`:

```ts
import { computeJointAngles, JOINT_ANGLE_NAMES } from './jointAngles'
import type { PoseSequence } from './poseTypes'

const NUM_ANGLES = JOINT_ANGLE_NAMES.length
export const FEATURE_VECTOR_LENGTH = NUM_ANGLES * 3 // angles + velocity + acceleration

function computeAngleRowsWithGapFill(sequence: PoseSequence): number[][] {
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
 * DTW's Euclidean distance — see featureVector.ts's design notes in the
 * milestone-3 plan for why, and what to check if the DTW path looks off.
 */
export function computeFeatureVectors(sequence: PoseSequence): number[][] {
  const dtSec = 1 / sequence.targetFps
  const angleRows = computeAngleRowsWithGapFill(sequence)
  const velocityRows = finiteDifference(angleRows, dtSec)
  const accelerationRows = finiteDifference(velocityRows, dtSec)
  return angleRows.map((angles, i) => [...angles, ...velocityRows[i], ...accelerationRows[i]])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- featureVector`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/lib/featureVector.ts frontend/src/lib/featureVector.test.ts
git commit -m "feat(frontend): add per-frame biomechanical feature vector (angles + velocity + acceleration)"
```

---

### Task 3: `dtw.ts` — generic dynamic time warping

**Files:**
- Create: `frontend/src/lib/dtw.ts`
- Create: `frontend/src/lib/dtw.test.ts`

**Interfaces:**
- Produces: `dtw(seqA: number[][], seqB: number[][]): { path: [number, number][]; cost: number }` — generic, no dependency on pose types; used by `AlignmentToolApp.tsx` (Task 4).

**Design notes (read before implementing):**
- Standard O(n·m) DP: `cost[i][j] = d(seqA[i-1], seqB[j-1]) + min(cost[i-1][j], cost[i][j-1], cost[i-1][j-1])`, with `cost[0][0] = 0` and every other boundary cell (`cost[0][j>0]`, `cost[i>0][0]`) initialized to `Infinity`. That boundary choice matters for the backtrace: it forces the DP to reach row/column 0 only via the diagonal from `(1,1)` to `(0,0)`, which means the backtrace loop can safely run `while (i > 0 && j > 0)` — `i` and `j` are guaranteed to hit `0` on the same step, no separate edge-case branch needed for "only one index at the boundary."
- Local cost is plain Euclidean distance between the two rows (matching `dtw`'s generic `number[][]` signature — it has no idea the rows came from `featureVector.ts`, so no normalization happens here either).
- ```ts
  // ponytail: no Sakoe-Chiba warping-window constraint — this is unconstrained
  // O(n*m) DTW. Fine for clips of comparable length/phase; add a window if
  // very-different-length clips produce pathological alignments in practice.
  ```

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/dtw.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dtw } from './dtw'

describe('dtw', () => {
  it('returns an empty path and zero cost for an empty input sequence', () => {
    expect(dtw([], [[1]])).toEqual({ path: [], cost: 0 })
  })

  it('handles a single frame on each side: cost is the direct distance, path is [[0,0]]', () => {
    expect(dtw([[0]], [[3]])).toEqual({ path: [[0, 0]], cost: 3 })
  })

  it('aligns identical (strictly monotonic) sequences with an identity path and zero cost', () => {
    const seq = [[0], [1], [2], [3]]
    const result = dtw(seq, seq)
    expect(result.cost).toBeCloseTo(0, 10)
    expect(result.path).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ])
  })

  it('aligns a stretched sequence with a many-to-one path on the longer side', () => {
    const seqA = [[0], [1], [2]]
    const seqB = [[0], [0], [1], [1], [2], [2]] // each seqA value repeated twice
    const result = dtw(seqA, seqB)
    expect(result.cost).toBeCloseTo(0, 10)
    expect(result.path).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
      [2, 5],
    ])
  })

  it('aligns a compressed sequence with a many-to-one path on the longer side (mirror of the stretched case)', () => {
    const seqA = [[0], [0], [1], [1], [2], [2]]
    const seqB = [[0], [1], [2]]
    const result = dtw(seqA, seqB)
    expect(result.cost).toBeCloseTo(0, 10)
    expect(result.path).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
    ])
  })
})
```

(All five expected results above were hand-derived by working the DP table by hand, not guessed — see this task's PR/commit description if the numbers ever need re-deriving.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- dtw`
Expected: FAIL — `dtw.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/lib/dtw.ts`:

```ts
export interface DtwResult {
  path: [number, number][]
  cost: number
}

function euclideanDistance(a: number[], b: number[]): number {
  let sumSquares = 0
  for (let k = 0; k < a.length; k++) {
    const diff = a[k] - b[k]
    sumSquares += diff * diff
  }
  return Math.sqrt(sumSquares)
}

/**
 * Standard O(n*m) dynamic time warping. Local cost is Euclidean distance
 * between rows — no per-dimension normalization (see featureVector.ts's
 * design notes for why that matters when rows come from computeFeatureVectors).
 *
 * ponytail: no Sakoe-Chiba warping-window constraint — unconstrained DTW.
 * Fine for clips of comparable length/phase; add a window if very
 * different-length clips produce pathological alignments in practice.
 */
export function dtw(seqA: number[][], seqB: number[][]): DtwResult {
  const n = seqA.length
  const m = seqB.length
  if (n === 0 || m === 0) return { path: [], cost: 0 }

  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity))
  cost[0][0] = 0

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = euclideanDistance(seqA[i - 1], seqB[j - 1])
      cost[i][j] = d + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1])
    }
  }

  // cost[0][j>0] and cost[i>0][0] are Infinity, so the only way to reach row/
  // column 0 is the diagonal step from (1,1) to (0,0) — i and j always hit 0
  // on the same iteration, so this loop never needs a separate edge case.
  const path: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1])
    const diag = cost[i - 1][j - 1]
    const up = cost[i - 1][j]
    const left = cost[i][j - 1]
    if (diag <= up && diag <= left) {
      i--
      j--
    } else if (up < left) {
      i--
    } else {
      j--
    }
  }
  path.reverse()

  return { path, cost: cost[n][m] }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- dtw`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/lib/dtw.ts frontend/src/lib/dtw.test.ts
git commit -m "feat(frontend): add generic dynamic time warping (dtw.ts)"
```

---

### Task 4: Dev-only DTW alignment tool

**Files:**
- Modify: `frontend/src/components/FileUpload.tsx` (add optional `testId` prop)
- Modify: `frontend/src/components/FileUpload.test.tsx` (one new test)
- Create: `frontend/alignment-tool.html`
- Create: `frontend/src/dev-tools/alignment-tool-main.tsx`
- Create: `frontend/src/dev-tools/AlignmentToolApp.tsx`
- Create: `frontend/src/dev-tools/AlignmentToolApp.test.tsx`

**Interfaces:**
- Consumes: `FileUpload` (extended), `ProcessingProgress` (unchanged) from `../components`; `usePoseEstimation` (unchanged, mocked in tests); `computeFeatureVectors` from `../lib/featureVector` (Task 2, mocked in tests); `dtw` from `../lib/dtw` (Task 3, mocked in tests); `PoseSequence` from `../lib/poseTypes`
- Produces: `<AlignmentToolApp />`, mounted by `alignment-tool-main.tsx` into `alignment-tool.html`, a third Vite entry point isolated from `index.html` and `reference-tool.html`.

**Design notes (read before implementing):**
- **`FileUpload`'s `data-testid` is currently hardcoded to `'file-upload-input'`.** This tool needs two independently-selectable file inputs, so `getByTestId` needs two distinct IDs. Smallest possible change: an optional `testId` prop defaulting to the existing literal, so every prior consumer (`App.tsx`, `ReferenceToolApp.tsx`, both their tests) is unaffected. No new component needed for "a two-slot variant" — the existing `FileUpload` genuinely fits, reused twice.
- **Why not reuse `VideoPoseViewer`:** it bundles skeleton-canvas overlay + play/pause + scrubber — exactly the "side-by-side video player with overlay" the spec says is explicitly out of scope this milestone. This tool only needs a real `<video>` DOM element to hand to `usePoseEstimation`; it renders it hidden (`display: none`) rather than pulling in playback UI nobody asked for.
- **Mount-effect wiring, not the real `loadedmetadata` DOM event:** `VideoPoseViewer` (milestone 1) calls `onVideoElementReady(video)` from a `useEffect` keyed on the video URL, fired on mount — not gated on the real `loadedmetadata` event. This is exactly why `App.test.tsx`/`ReferenceToolApp.test.tsx` work in jsdom without manually dispatching video events (jsdom doesn't implement real media loading). `ClipSlot` below reuses that identical ref/effect pattern for the same reason — it's the only tested way this codebase drives `usePoseEstimation` from a mounted `<video>`.
- **Why the reference slot is disabled until the user clip finishes, not just a UX nicety:** `usePoseEstimation()` holds one `PoseLandmarker` instance (see `frontend/src/hooks/usePoseEstimation.ts`) running in MediaPipe's `'VIDEO'` mode, which expects strictly increasing timestamps *for a single video stream*. Feeding it two different videos concurrently through `detectForVideo` would violate that and corrupt its internal temporal state. Processing must be sequential — enforced here by disabling the second `FileUpload` until `userSequence` exists, not by an unenforced convention.
- Feature-vector computation + `dtw()` run once both sequences exist, in a `useEffect`.

- [ ] **Step 1: Extend `FileUpload` with an optional `testId` prop**

`frontend/src/components/FileUpload.tsx` (replace):

```tsx
interface FileUploadProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
  testId?: string
}

export function FileUpload({ onFileSelected, disabled, testId = 'file-upload-input' }: FileUploadProps) {
  return (
    <input
      type="file"
      accept="video/mp4,video/quicktime"
      disabled={disabled}
      data-testid={testId}
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onFileSelected(file)
      }}
    />
  )
}
```

Add to `frontend/src/components/FileUpload.test.tsx`:

```tsx
it('uses a custom data-testid when provided', () => {
  render(<FileUpload onFileSelected={vi.fn()} testId="reference-file-upload-input" />)
  expect(screen.getByTestId('reference-file-upload-input')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run `FileUpload` tests to confirm the extension is backward-compatible**

Run: `cd frontend && npm run test -- FileUpload`
Expected: PASS (3 tests — 2 existing + 1 new). The two pre-existing tests must pass unmodified, confirming the default `testId` value preserves every existing caller's behavior.

- [ ] **Step 3: Write the failing tests for `AlignmentToolApp`**

`frontend/src/dev-tools/AlignmentToolApp.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlignmentToolApp } from './AlignmentToolApp'
import type { PoseSequence } from '../lib/poseTypes'

const mockEstimateSequence = vi.fn()
const mockComputeFeatureVectors = vi.fn()
const mockDtw = vi.fn()

vi.mock('../hooks/usePoseEstimation', () => ({
  usePoseEstimation: () => ({ estimateSequence: mockEstimateSequence }),
}))
vi.mock('../lib/featureVector', () => ({
  computeFeatureVectors: (...args: unknown[]) => mockComputeFeatureVectors(...args),
}))
vi.mock('../lib/dtw', () => ({
  dtw: (...args: unknown[]) => mockDtw(...args),
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
  mockEstimateSequence.mockReset()
  mockComputeFeatureVectors.mockReset().mockReturnValue([[0]])
  mockDtw.mockReset().mockReturnValue({ path: [[0, 0]], cost: 0 })
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
})

describe('AlignmentToolApp', () => {
  it('starts idle with the reference slot disabled until the user clip is processed', () => {
    render(<AlignmentToolApp />)
    expect(screen.getByTestId('user-file-upload-input')).toBeEnabled()
    expect(screen.getByTestId('reference-file-upload-input')).toBeDisabled()
  })

  it('shows processing progress for the user clip while it is estimating, reference slot stays disabled', async () => {
    mockEstimateSequence.mockReturnValue(new Promise(() => {}))
    render(<AlignmentToolApp />)
    const file = new File(['dummy'], 'user.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('user-file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument())
    expect(screen.getByTestId('reference-file-upload-input')).toBeDisabled()
  })

  it('enables the reference slot once the user clip finishes, then renders the DTW mapping once both finish', async () => {
    mockEstimateSequence.mockResolvedValueOnce(fakeSequence(10)).mockResolvedValueOnce(fakeSequence(12))
    mockDtw.mockReturnValue({
      path: [
        [0, 0],
        [1, 1],
        [2, 1],
      ],
      cost: 4.2,
    })

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

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4)) // header + 3 mapping rows
    expect(mockComputeFeatureVectors).toHaveBeenCalledTimes(2)
    const cells = screen.getAllByRole('cell').map((c) => c.textContent)
    expect(cells).toEqual(['0', '0', '1', '1', '2', '1'])
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npm run test -- AlignmentToolApp`
Expected: FAIL — `AlignmentToolApp.tsx` does not exist yet.

- [ ] **Step 5: Write the implementation**

`frontend/src/dev-tools/AlignmentToolApp.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { FileUpload } from '../components/FileUpload'
import { ProcessingProgress } from '../components/ProcessingProgress'
import { usePoseEstimation } from '../hooks/usePoseEstimation'
import { computeFeatureVectors } from '../lib/featureVector'
import { dtw } from '../lib/dtw'
import type { PoseSequence } from '../lib/poseTypes'

const TARGET_FPS = 30

interface ClipSlotProps {
  label: string
  testId: string
  disabled: boolean
  videoUrl: string | null
  progress: { current: number; total: number }
  sequence: PoseSequence | null
  onFileSelected: (file: File) => void
  onVideoElementReady: (video: HTMLVideoElement) => void
}

function ClipSlot({
  label,
  testId,
  disabled,
  videoUrl,
  progress,
  sequence,
  onFileSelected,
  onVideoElementReady,
}: ClipSlotProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!videoUrl) return
    const video = videoRef.current
    if (video) onVideoElementReady(video)
    // Same mount-effect wiring VideoPoseViewer uses (milestone 1) — fires on
    // mount rather than waiting for the real `loadedmetadata` DOM event, which
    // is also why this is testable in jsdom without dispatching fake events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl])

  return (
    <div>
      <h2>{label}</h2>
      {!videoUrl && <FileUpload testId={testId} disabled={disabled} onFileSelected={onFileSelected} />}
      {videoUrl && !sequence && (
        <>
          <video ref={videoRef} src={videoUrl} style={{ display: 'none' }} />
          <ProcessingProgress current={progress.current} total={progress.total} />
        </>
      )}
      {sequence && (
        <p>
          {label} processed: {sequence.frameCount} frames
        </p>
      )}
    </div>
  )
}

export function AlignmentToolApp() {
  const [userUrl, setUserUrl] = useState<string | null>(null)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [userProgress, setUserProgress] = useState({ current: 0, total: 0 })
  const [referenceProgress, setReferenceProgress] = useState({ current: 0, total: 0 })
  const [userSequence, setUserSequence] = useState<PoseSequence | null>(null)
  const [referenceSequence, setReferenceSequence] = useState<PoseSequence | null>(null)
  const [path, setPath] = useState<[number, number][] | null>(null)
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
    setPath(dtw(userVectors, referenceVectors).path)
  }, [userSequence, referenceSequence])

  return (
    <div>
      <h1>DTW alignment tool (dev only)</h1>
      <p>
        Pick two local clips. The reference clip's input stays disabled until the user clip finishes — MediaPipe's
        VIDEO mode expects one video's timestamps at a time on a shared PoseLandmarker instance, so processing is
        sequential, not parallel.
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
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm run test -- AlignmentToolApp`
Expected: PASS (3 tests)

- [ ] **Step 7: Wire the third Vite entry point**

`frontend/alignment-tool.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DTW Alignment Tool (dev only)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dev-tools/alignment-tool-main.tsx"></script>
  </body>
</html>
```

`frontend/src/dev-tools/alignment-tool-main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AlignmentToolApp } from './AlignmentToolApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AlignmentToolApp />
  </StrictMode>
)
```

No `vite.config.ts` change, same reasoning as `reference-tool.html` (milestone 2, Task 3, Step 6): the dev server resolves any root `.html` file by path automatically; `vite build`'s default single-entry behavior just means this tool stays out of the production bundle, which is correct for a dev-only tool.

- [ ] **Step 8: Type-check and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: no type errors; all tests from milestones 1–2 plus this milestone's new tests (`jointAngles`, `featureVector`, `dtw`, extended `FileUpload`, `AlignmentToolApp`) all PASS.

- [ ] **Step 9: Manually confirm the dev server serves the new page**

Run: `cd frontend && npm run dev`, then open `http://localhost:5173/alignment-tool.html`.
Expected: two file inputs render, the second one disabled; `/` and `/reference-tool.html` are unaffected.

- [ ] **Step 10: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/components/FileUpload.tsx frontend/src/components/FileUpload.test.tsx \
        frontend/alignment-tool.html frontend/src/dev-tools/alignment-tool-main.tsx \
        frontend/src/dev-tools/AlignmentToolApp.tsx frontend/src/dev-tools/AlignmentToolApp.test.tsx
git commit -m "feat(frontend): add dev-only DTW alignment tool (third Vite entry point)"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Tasks 1–4 together with two real local clips, per the spec's explicit instruction: "verify the mapping visually before building UI around it."

- [ ] **Step 1: Run the full automated suite one more time**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: all PASS, matching the milestone-1/2 baseline plus this milestone's new tests.

- [ ] **Step 2: Process two real clips through the dev tool**

```bash
cd frontend && npm run dev
```

Open `/alignment-tool.html`. Two reasonable choices for a first pass, since no reference clips are committed yet (per milestone 2):
- Two different takes of a similar-length freestyle stroke cycle, or
- The same clip uploaded twice (as "user" and "reference") — the trivial sanity check: the resulting path should be close to the identity diagonal (`[0,0], [1,1], [2,2], ...`), since `dtw.test.ts`'s identical-sequence case proved this in theory; this confirms the same holds end-to-end with real MediaPipe output, not just synthetic data.

- [ ] **Step 3: Sanity-check the resulting mapping**

Read the rendered table. Confirm:
- The path is monotonic in both columns (no index ever decreases as you scan down the table) — a basic DTW correctness property.
- The path's first row is `[0, ...]`/`[..., 0]` and its last row ends at each sequence's final frame index — full coverage, no gaps at the ends.
- For the same-clip-twice case: the path stays close to the diagonal (`user frame i ↔ reference frame i`), not wildly displaced.
- For two different takes: the path looks like a plausible phase alignment (e.g., roughly diagonal but with some stretching/compression where one take is briefly faster/slower), not something that jumps around erratically.

If the path looks noise-dominated or ignores the angle signal entirely (e.g., it looks driven by acceleration spikes rather than any recognizable stroke-phase correspondence), that's the unnormalized-feature-scale limitation flagged in Task 2/3's design notes — the fix (z-score normalize each feature dimension across a sequence before running `dtw()`) is deliberately not built until this check shows it's actually needed.

---

## Self-Review Notes

- **Spec coverage:** DTW over biomechanical (angle/velocity/acceleration) feature vectors, not raw coordinates (Tasks 1-2); frame-index mapping output, not naive frame-N-to-frame-N (Task 3); visual verification before any comparison UI is built (Task 5, explicitly stops short of build-order step 4).
- **Joint angle set is a stated first draft, not a final answer:** 8 bilateral angles (elbow/shoulder/hip/knee), justified per-joint for freestyle specifically in Task 1's design notes — same "refine later" spirit as the spec's own bootstrapped-checkpoint-thresholds note. `JOINT_ANGLE_NAMES`'s fixed order is the only thing anything downstream depends on, so adding/removing an angle later is a localized change to `jointAngles.ts`.
- **No new dependencies:** confirmed against `frontend/package.json` — DTW and angle math are both under 60 lines each, hand-rolled per the ladder ("does this need a library" — no).
- **Reuse over rebuild:** `FileUpload`, `ProcessingProgress`, `usePoseEstimation` reused verbatim (or via one small backward-compatible prop addition); `VideoPoseViewer` deliberately *not* reused, since pulling it in would smuggle back the out-of-scope side-by-side overlay UI.
- **Known, documented limitation carried forward, not silently fixed:** unnormalized feature-vector scales going into Euclidean-distance DTW (Task 2/3) — flagged in both tasks' design notes and re-surfaced as the first thing to check in Task 5's manual verification, rather than either ignored or prematurely solved with an unrequested normalization layer.
- **Deferred, not built:** a Sakoe-Chiba warping-window constraint on `dtw()`, per-dimension feature normalization, and any synchronized video-playback UI are all explicitly left undone with reasoning given inline — add any of them only if Task 5's manual check shows a concrete need.

### Critical Files for Implementation
- frontend/src/lib/jointAngles.ts
- frontend/src/lib/featureVector.ts
- frontend/src/lib/dtw.ts
- frontend/src/dev-tools/AlignmentToolApp.tsx
- frontend/src/components/FileUpload.tsx
