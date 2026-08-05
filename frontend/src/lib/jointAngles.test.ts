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
