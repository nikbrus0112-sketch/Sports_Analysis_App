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
