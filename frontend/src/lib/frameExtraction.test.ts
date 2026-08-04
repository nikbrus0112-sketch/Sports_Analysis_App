import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeFrameCount, frameIndexForTime, frameTimestampMs, seekTo } from './frameExtraction'

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

function createFakeVideo() {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    currentTime: 0,
    addEventListener: (event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
    },
    removeEventListener: (event: string, cb: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb)
    },
    dispatchSeeked: () => {
      ;(listeners['seeked'] ?? []).forEach((cb) => cb())
    },
  }
}

describe('seekTo', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets currentTime immediately and resolves after the seeked event fires', async () => {
    const fakeVideo = createFakeVideo()
    const promise = seekTo(fakeVideo as unknown as HTMLVideoElement, 1.5)

    expect(fakeVideo.currentTime).toBe(1.5)

    fakeVideo.dispatchSeeked()
    await expect(promise).resolves.toBeUndefined()
  })

  it('does not resolve before the seeked event fires', async () => {
    const fakeVideo = createFakeVideo()
    let resolved = false
    seekTo(fakeVideo as unknown as HTMLVideoElement, 2).then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)

    fakeVideo.dispatchSeeked()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(true)
  })
})
