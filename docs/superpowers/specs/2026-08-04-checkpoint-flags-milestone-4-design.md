# Checkpoint Flags (Milestone 4) — Design

## Goal

Build-order step 5 from `sports-motion-comparison-spec.md`: "Hand-code checkpoint rules for that one motion; wire up per-frame flags." This is Stage A of spec section 5 ("Comparison / feedback generation") — deterministic measurement, no LLM. Build-order step 4 (synced side-by-side video player) is deliberately skipped, same "prove the math first" pattern already used in milestones 2 and 3.

## Constraints

- No new dependencies.
- Pure, deterministic, fully unit-testable — matches every prior milestone's testing strategy.
- Builds directly on milestone 3's output (`computeFeatureVectors`, `dtw`), reusing rather than duplicating logic.

## Design

### Comparison method: reference-clip-relative, not hand-authored ranges

The spec's Stage A description names two alternatives in one sentence: compare the user's angle against a hand-authored `expected_angle_range`, "or against the reference clip's angle at the same phase." Only the first has a defined schema field (`MotionRules.checkpoints[].expected_angle_range`) and a defined bootstrapping process; `phase_name` itself is never given concrete meaning anywhere in the spec — no time boundaries, no named stroke phases (catch/pull/push/recovery or otherwise).

Hand-authoring phase-specific ranges would require inventing phase-boundary detection from scratch — real, unscoped work. Instead, this milestone uses the second alternative: for each DTW-aligned `(userFrameIdx, referenceFrameIdx)` pair (from milestone 3's `dtw()` output), compare the user's angle to the reference clip's angle at that same pair, per joint. `delta = userAngle - referenceAngle`; flag when `|delta|` exceeds a threshold.

**`phase` field:** since no named-phase segmentation exists, the `CheckpointFlag.phase` field is populated with the reference clip's frame index — the natural available proxy. Documented as a deliberate simplification, not a claim that real phase detection exists.

### Scope: Stage A only

Only the deterministic structured records (`{phase, joint, user_value, reference_value, delta}`) are built. Stage B (LLM-generated coaching tips from these records) is explicitly out of scope — it would introduce an API dependency and non-deterministic, non-unit-testable output, breaking the pattern every milestone so far has followed. It's a natural, clearly separate follow-up once Stage A's output exists to feed it.

### Threshold: a documented first draft

`DEFAULT_THRESHOLD_DEG = 15`. The spec's own "Bootstrapping the checkpoint thresholds" note explicitly sanctions treating an initial numeric value as a first draft requiring later calibration, not researched ground truth — the same reasoning applies to a single flat deviation threshold as to a table of per-phase ranges. 15° is chosen to sit above the few-degrees-scale jitter expected from one-euro-filtered landmark angles (milestone 1's smoothing pass), while remaining tight enough to catch a visibly real form deviation. Not a precise biomechanics claim.

### Implementation: reuse over rebuild

`frontend/src/lib/featureVector.ts` already computes gap-filled, null-free per-frame angle rows internally (`computeAngleRowsWithGapFill`) before differencing them into velocity/acceleration. That's exactly the per-frame angle data this milestone needs — exporting it (renamed `computeAngleRows`) avoids a second, potentially-drifting implementation of the same gap-fill logic (carry-forward last valid angle across detection dropouts, zero-fill leading gaps).

The new `computeCheckpointFlags` function and its rendering live alongside milestone 3's existing dev tool (`AlignmentToolApp.tsx`), which already computes both `PoseSequence`s and the DTW path in one place — extending it is simpler than standing up a fourth Vite entry point for what's fundamentally the same two-clip workflow.

## Out of scope (deferred, not built)

- Stage B: LLM-generated coaching tips from the flagged records.
- Named-phase segmentation (catch/pull/push/recovery boundaries) — `phase` stays a frame-index proxy until this exists.
- Hand-authored `expected_angle_range` checkpoints — the spec's other Stage A alternative, deferred until phase segmentation makes it meaningful.
- Build-order step 4: the synced side-by-side video player.
- Threshold calibration beyond the documented first-draft value — revisit once real clips are available for tuning (Task 4).

## Testing strategy

`computeCheckpointFlags` is pure logic with no DOM/MediaPipe dependency — full unit-test coverage with hand-constructed pose sequences, same pattern as `jointAngles.ts`/`featureVector.ts`/`dtw.ts` in milestone 3. The dev-tool extension is tested the same way the rest of `AlignmentToolApp` already is: mock `computeCheckpointFlags` at the module boundary, assert on rendered output. Real end-to-end behavior with genuine clips stays a manual-verification concern (Task 4), same reasoning as every prior milestone.
