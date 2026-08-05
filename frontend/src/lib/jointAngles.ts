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

// Bilateral elbow/shoulder/hip/knee — see milestone-3 plan's Task 1 design
// notes for the freestyle-specific rationale per joint. Order here fixes
// feature-vector column order everywhere downstream (featureVector.ts, dtw.ts).
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
