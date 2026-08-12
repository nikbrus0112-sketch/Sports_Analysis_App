import { describe, expect, it } from 'vitest'
import { normalizeSkeletonForOverlay } from './normalizeSkeleton'
import { LEFT_HIP, LEFT_SHOULDER, RIGHT_HIP, RIGHT_SHOULDER } from './jointAngles'
import type { Landmark } from './poseTypes'

function landmark(x: number, y: number, z = 0): Landmark {
  return { x, y, z }
}

const NUM_LANDMARKS = 33
const NOSE = 0

function buildLandmarks(overrides: Partial<Record<number, Landmark>>): Landmark[] {
  return Array.from({ length: NUM_LANDMARKS }, (_, i) => overrides[i] ?? landmark(0, 0))
}

describe('normalizeSkeletonForOverlay', () => {
  it('passes null through unchanged', () => {
    expect(normalizeSkeletonForOverlay(null)).toBeNull()
  })

  it('recenters the hip midpoint to (0.5, 0.5) and scales torso length to exactly 0.3', () => {
    const landmarks = buildLandmarks({
      [LEFT_HIP]: landmark(0.4, 0.6),
      [RIGHT_HIP]: landmark(0.6, 0.6),
      [LEFT_SHOULDER]: landmark(0.4, 0.4),
      [RIGHT_SHOULDER]: landmark(0.6, 0.4),
    })
    const normalized = normalizeSkeletonForOverlay(landmarks)!

    const hipMidX = (normalized[LEFT_HIP].x + normalized[RIGHT_HIP].x) / 2
    const hipMidY = (normalized[LEFT_HIP].y + normalized[RIGHT_HIP].y) / 2
    expect(hipMidX).toBeCloseTo(0.5, 5)
    expect(hipMidY).toBeCloseTo(0.5, 5)

    const shoulderMidX = (normalized[LEFT_SHOULDER].x + normalized[RIGHT_SHOULDER].x) / 2
    const shoulderMidY = (normalized[LEFT_SHOULDER].y + normalized[RIGHT_SHOULDER].y) / 2
    const torsoLength = Math.hypot(shoulderMidX - hipMidX, shoulderMidY - hipMidY)
    expect(torsoLength).toBeCloseTo(0.3, 5)
  })

  it('normalizes two skeletons of very different apparent scale/position but identical relative geometry to near-identical output', () => {
    // Skeleton A: small torso, off-center. "Nose" placed 1.5x the (hip->shoulder)
    // vector above the hips — an arbitrary but fixed relative offset.
    const a = buildLandmarks({
      [LEFT_HIP]: landmark(0.4, 0.6),
      [RIGHT_HIP]: landmark(0.6, 0.6),
      [LEFT_SHOULDER]: landmark(0.4, 0.4),
      [RIGHT_SHOULDER]: landmark(0.6, 0.4),
      [NOSE]: landmark(0.5, 0.3), // hipMid(0.5,0.6) + 1.5*(shoulderMid-hipMid)=(0,-0.2) = (0.5, 0.3)
    })
    // Skeleton B: same relative geometry, 3x larger torso, translated far away.
    const b = buildLandmarks({
      [LEFT_HIP]: landmark(1.2, 2.0),
      [RIGHT_HIP]: landmark(1.8, 2.0),
      [LEFT_SHOULDER]: landmark(1.2, 1.4),
      [RIGHT_SHOULDER]: landmark(1.8, 1.4),
      [NOSE]: landmark(1.5, 1.1), // hipMid(1.5,2.0) + 1.5*(0,-0.6) = (1.5, 1.1)
    })

    const normalizedA = normalizeSkeletonForOverlay(a)!
    const normalizedB = normalizeSkeletonForOverlay(b)!

    expect(normalizedA[NOSE].x).toBeCloseTo(0.5, 5)
    expect(normalizedA[NOSE].y).toBeCloseTo(0.05, 5)
    expect(normalizedB[NOSE].x).toBeCloseTo(normalizedA[NOSE].x, 5)
    expect(normalizedB[NOSE].y).toBeCloseTo(normalizedA[NOSE].y, 5)
  })

  it('does not throw or produce NaN when torso length is zero (degenerate hip/shoulder overlap)', () => {
    const landmarks = buildLandmarks({
      [LEFT_HIP]: landmark(0.5, 0.5),
      [RIGHT_HIP]: landmark(0.5, 0.5),
      [LEFT_SHOULDER]: landmark(0.5, 0.5),
      [RIGHT_SHOULDER]: landmark(0.5, 0.5),
    })
    const normalized = normalizeSkeletonForOverlay(landmarks)!
    expect(normalized.every((l) => !Number.isNaN(l.x) && !Number.isNaN(l.y))).toBe(true)
    expect(normalized[LEFT_HIP].x).toBeCloseTo(0.5, 5)
    expect(normalized[LEFT_HIP].y).toBeCloseTo(0.5, 5)
  })

  it('passes landmarks through unchanged when the anchor indices are missing (defensive, not expected from real MediaPipe output)', () => {
    const shortLandmarks: Landmark[] = [landmark(0.1, 0.2)]
    expect(normalizeSkeletonForOverlay(shortLandmarks)).toBe(shortLandmarks)
  })
})
