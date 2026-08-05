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
 * DTW's Euclidean distance — see the milestone-3 design doc for why, and what
 * to check if the DTW path looks off.
 */
export function computeFeatureVectors(sequence: PoseSequence): number[][] {
  const dtSec = 1 / sequence.targetFps
  const angleRows = computeAngleRowsWithGapFill(sequence)
  const velocityRows = finiteDifference(angleRows, dtSec)
  const accelerationRows = finiteDifference(velocityRows, dtSec)
  return angleRows.map((angles, i) => [...angles, ...velocityRows[i], ...accelerationRows[i]])
}
