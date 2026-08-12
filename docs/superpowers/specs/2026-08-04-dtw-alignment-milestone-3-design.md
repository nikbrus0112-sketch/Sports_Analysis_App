# DTW Alignment (Milestone 3) — Design

## Goal

Per `sports-motion-comparison-spec.md`'s suggested build order, step 3: "DTW alignment between the user's clip and one reference clip — verify the mapping visually before building UI around it." This milestone proves the alignment math works. It does not build the side-by-side comparison UI — that's build-order step 4.

## Constraints

- Feature vector must be biomechanical (joint angles + angular velocity + angular acceleration), not raw x/y, per spec section 4.
- Output is a frame-index mapping between the two clips, not naive frame-N-to-frame-N.
- No new dependencies.
- Manual verification must not depend on a real reference clip existing in the backend library (milestone 2 currently has zero clips committed).

## Design

### Feature vector: joint angles + velocity + acceleration

**Joint set (first draft, not final):** 8 bilateral angles — left/right elbow, shoulder, hip, knee. For freestyle specifically: elbow angle captures the high-elbow catch and early-vertical-forearm pull; shoulder angle captures the recovery arc and body-roll contribution; hip angle captures body undulation/roll and hip-drive timing; knee angle captures flutter-kick amplitude and bend. Bilateral is deliberate — freestyle's arm/leg action alternates left/right, so a single-side angle would silently discard half the motion's temporal signature. The spec leaves the joint set open by design; this is a first-draft decision to refine later, same spirit as the spec's own note about bootstrapping checkpoint thresholds later.

**Angle computation:** `angleBetweenPoints(a, b, c)` — the angle at `b`, in the x/y plane, via `atan2(|cross|, dot)` rather than `acos(dot / (|v1||v2|))`. The atan2 form stays numerically stable at the 0°/180° extremes, where an acos ratio can drift fractionally outside `[-1, 1]` from floating-point error and produce `NaN`.

**2D, not 3D:** MediaPipe's `z` is a noisier monocular depth estimate than `x, y`. Reference clips are shot side-on (per milestone 2's `camera_angle_note` convention), so the biomechanically relevant motion is already captured in the image plane. Angle-between-vectors is inherently invariant to in-plane camera rotation regardless of dimensionality, so including `z` doesn't uniquely solve a problem 2D leaves open — it just adds noise.

**`landmarksSmoothed`, not `landmarksRaw`:** matches the spec's explicit instruction to smooth before computing angles, and matches how `VideoPoseViewer.tsx` already consumes pose data downstream.

**Velocity/acceleration:** finite difference at nominal `1/targetFps` spacing (frames are extracted at a fixed rate per milestone 1's seek-based extraction, so nominal spacing is simple and accurate enough — not re-derived from per-frame timestamp deltas).

**Gap handling (documented simplifications, not silently fixed):**
- A null-landmark frame (detection failure) holds the last valid angle vector forward. This reads as "assume no visible motion during a dropout," not a claim of accuracy — flagged inline with a `ponytail:` comment naming the upgrade path (linear interpolation) if gaps turn out to be long/frequent in practice.
- Leading null frames (before the first valid detection) fall back to an all-zero angle vector, since there's nothing yet to carry forward. Flagged separately — if a clip commonly starts with a long detection gap, dropping those leading frames entirely would be the fix.

**Known, unfixed limitation:** the 24 feature dimensions (angles ~0-180°, velocity in deg/s, acceleration in deg/s²) have very different natural magnitudes, and DTW's Euclidean distance has no per-dimension normalization. This could make the alignment cost dominated by whichever dimension has the largest raw magnitude (likely acceleration). This is deliberately left unfixed until manual verification (Task 5) shows it's an actual problem — normalizing preemptively would solve a problem not yet observed. If the resulting alignment path looks noise-dominated, z-score normalizing each dimension across a sequence before `dtw()` is the fix.

### DTW: generic, hand-rolled

Standard O(n·m) dynamic programming — cost matrix + full backtrace, Euclidean local distance. No Sakoe-Chiba warping-window constraint (fine for clips of comparable length/phase; add one only if very-different-length clips produce pathological alignments in practice). No DTW/math npm package exists in `frontend/package.json`; the algorithm is small enough (~40 lines) not to warrant adding one.

### Manual verification: two local clips, no backend dependency

A dev-only tool (`alignment-tool.html`) processes TWO local video files through the existing `usePoseEstimation` hook (sequentially — MediaPipe's `VIDEO` mode expects one video's strictly-increasing timestamps at a time on a shared `PoseLandmarker` instance, so the reference slot stays disabled until the user clip finishes), then runs DTW between the resulting feature vectors and renders the frame-index mapping as a plain table.

This was chosen over fetching a clip from the backend `GET /api/reference-clips` registry because that registry currently has zero real clips committed (milestone 2's Task 4 is still pending real footage) — the two-local-files approach is testable today with any two clips and doesn't block on that. It deliberately does not reuse `VideoPoseViewer` (skeleton overlay + scrubber) — that component's UI IS the side-by-side comparison view this milestone explicitly defers; the dev tool only needs a hidden `<video>` element to drive `usePoseEstimation`.

## Out of scope (deferred, not built)

- Any synchronized/side-by-side video playback UI — build-order step 4.
- Per-dimension feature normalization — add only if manual verification shows the alignment path is noise-dominated.
- A Sakoe-Chiba warping-window constraint on DTW — add only if very-different-length clips misbehave.
- Fetching reference clips from the backend registry in the dev tool — revisit once milestone 2's Task 4 has real committed clips.
- Checkpoint rules, LLM feedback — build-order steps 5+.

## Testing strategy

`jointAngles.ts`, `featureVector.ts`, and `dtw.ts` are pure functions with no DOM/MediaPipe dependency — full unit-test coverage with hand-computed expected values, same pattern as milestone 1's `oneEuroFilter.ts`/`frameExtraction.ts`/`drawSkeleton.ts`. `AlignmentToolApp` is tested the same way `ReferenceToolApp` was: mock `usePoseEstimation`, `computeFeatureVectors`, and `dtw` at the module boundary, never let real MediaPipe/DTW execution happen in tests. Real MediaPipe processing stays a manual-verification concern (Task 5), same reasoning as every prior milestone.
