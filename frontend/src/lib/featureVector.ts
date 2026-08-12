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
  const perFrameAngles = sequence.frames.map((frame) => computeJointAngles(frame.landmarksSmoothed))
  // Leading null frames (before the first valid detection) backward-fill from
  // that first detection instead of a zero vector — a zero angle is nonsensical
  // (falsely flags every joint as ~90deg off) and creates a spurious velocity
  // spike at the null->valid boundary. Only a whole-sequence-null clip (no
  // detection anywhere) falls back to zero.
  const firstValid = perFrameAngles.find((angles): angles is number[] => angles !== null) ?? new Array(NUM_ANGLES).fill(0)
  let lastValid = firstValid
  return perFrameAngles.map((angles) => {
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
 * DTW's Euclidean distance — see the milestone-3 design doc for why, and what
 * to check if the DTW path looks off.
 */
export function computeFeatureVectors(sequence: PoseSequence): number[][] {
  const dtSec = 1 / sequence.targetFps
  const angleRows = computeAngleRows(sequence)
  const velocityRows = finiteDifference(angleRows, dtSec)
  const accelerationRows = finiteDifference(velocityRows, dtSec)
  return angleRows.map((angles, i) => [...angles, ...velocityRows[i], ...accelerationRows[i]])
}
