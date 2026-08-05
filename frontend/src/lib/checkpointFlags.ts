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
