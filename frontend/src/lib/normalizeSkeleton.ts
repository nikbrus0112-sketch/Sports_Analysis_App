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
