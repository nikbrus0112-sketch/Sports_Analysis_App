import { describe, expect, it } from 'vitest'
import { OneEuroFilter, smoothSequence } from './oneEuroFilter'
import type { PoseFrame } from './poseTypes'

describe('OneEuroFilter', () => {
  it('returns the input value unchanged on the first sample', () => {
    const filter = new OneEuroFilter()
    expect(filter.filter(10, 0)).toBe(10)
  })

  it('holds steady on a constant signal', () => {
    const filter = new OneEuroFilter()
    filter.filter(5, 0)
    const result = filter.filter(5, 33)
    expect(result).toBeCloseTo(5, 5)
  })

  it('smooths a step change instead of jumping immediately', () => {
    const filter = new OneEuroFilter()
    filter.filter(0, 0)
    const firstResponse = filter.filter(100, 33)
    expect(firstResponse).toBeGreaterThan(0)
    expect(firstResponse).toBeLessThan(100)
  })

  it('converges toward a new constant value over repeated samples', () => {
    const filter = new OneEuroFilter()
    filter.filter(0, 0)
    let last = 0
    for (let t = 33; t <= 1000; t += 33) {
      last = filter.filter(100, t)
    }
    expect(last).toBeGreaterThan(95)
  })
})

describe('smoothSequence', () => {
  it('preserves null landmarksRaw frames as null smoothed', () => {
    const frames: PoseFrame[] = [
      { frameIndex: 0, timestampMs: 0, landmarksRaw: null, landmarksSmoothed: null },
    ]
    const result = smoothSequence(frames)
    expect(result[0].landmarksSmoothed).toBeNull()
  })

  it('produces smoothed landmarks matching the input shape', () => {
    const frames: PoseFrame[] = [
      {
        frameIndex: 0,
        timestampMs: 0,
        landmarksRaw: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })),
        landmarksSmoothed: null,
      },
    ]
    const result = smoothSequence(frames)
    expect(result[0].landmarksSmoothed).toHaveLength(33)
    expect(result[0].landmarksSmoothed?.[0].x).toBeCloseTo(0.5, 5)
  })
})
