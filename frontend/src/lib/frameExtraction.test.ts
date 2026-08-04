import { describe, expect, it } from 'vitest'
import { computeFrameCount, frameIndexForTime, frameTimestampMs } from './frameExtraction'

describe('computeFrameCount', () => {
  it('multiplies duration by target fps, floored', () => {
    expect(computeFrameCount(10, 30)).toBe(300)
  })

  it('always returns at least 1 frame for a non-zero duration', () => {
    expect(computeFrameCount(0.01, 30)).toBe(1)
  })
})

describe('frameTimestampMs', () => {
  it('converts a frame index to a millisecond timestamp at the target fps', () => {
    expect(frameTimestampMs(30, 30)).toBe(1000)
    expect(frameTimestampMs(0, 30)).toBe(0)
  })
})

describe('frameIndexForTime', () => {
  it('maps a playback time to the nearest frame index', () => {
    expect(frameIndexForTime(5, 30, 300)).toBe(150)
  })

  it('clamps to 0 for negative time', () => {
    expect(frameIndexForTime(-1, 30, 300)).toBe(0)
  })

  it('clamps to the last frame for time past the end', () => {
    expect(frameIndexForTime(100, 30, 300)).toBe(299)
  })
})
