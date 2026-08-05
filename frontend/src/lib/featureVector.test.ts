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
