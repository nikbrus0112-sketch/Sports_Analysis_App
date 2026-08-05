import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReferenceComparison } from './useReferenceComparison'
import type { PoseSequence } from '../lib/poseTypes'

const mockFetchReferenceClips = vi.fn()
const mockFetchPoseSequence = vi.fn()
const mockComputeFeatureVectors = vi.fn()
const mockDtw = vi.fn()
const mockComputeCheckpointFlags = vi.fn()

vi.mock('../api/referenceClips', () => ({
  fetchReferenceClips: (...args: unknown[]) => mockFetchReferenceClips(...args),
  fetchPoseSequence: (...args: unknown[]) => mockFetchPoseSequence(...args),
}))
vi.mock('../lib/featureVector', () => ({
  computeFeatureVectors: (...args: unknown[]) => mockComputeFeatureVectors(...args),
}))
vi.mock('../lib/dtw', () => ({
  dtw: (...args: unknown[]) => mockDtw(...args),
}))
vi.mock('../lib/checkpointFlags', () => ({
  computeCheckpointFlags: (...args: unknown[]) => mockComputeCheckpointFlags(...args),
}))

function fakeSequence(frameCount: number): PoseSequence {
  return {
    videoDurationMs: 1000,
    videoWidth: 640,
    videoHeight: 480,
    targetFps: 30,
    frameCount,
    frames: [],
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

function clipFixture(id: string) {
  return {
    id,
    motion_type: 'freestyle',
    video_url: `/reference-clips/freestyle/${id}/video.mp4`,
    pose_data_url: `/reference-clips/freestyle/${id}/pose.json`,
    camera_angle_note: '',
    source_or_license_note: '',
  }
}

beforeEach(() => {
  mockFetchReferenceClips.mockReset()
  mockFetchPoseSequence.mockReset()
  mockComputeFeatureVectors.mockReset().mockReturnValue([[0]])
  mockDtw.mockReset().mockReturnValue({ path: [[0, 0]], cost: 0 })
  mockComputeCheckpointFlags.mockReset().mockReturnValue([])
})

describe('useReferenceComparison', () => {
  it('stays idle when userSequence is null', () => {
    const { result } = renderHook(() => useReferenceComparison(null))
    expect(result.current.status).toBe('idle')
    expect(mockFetchReferenceClips).not.toHaveBeenCalled()
  })

  it('resolves to no-reference-available when the library has zero clips', async () => {
    mockFetchReferenceClips.mockResolvedValue([])
    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
  })

  it('resolves to no-reference-available when clips exist but none have both a video and pose data URL', async () => {
    mockFetchReferenceClips.mockResolvedValue([
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: null,
        pose_data_url: null,
        camera_angle_note: '',
        source_or_license_note: '',
      },
    ])
    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
    expect(mockFetchPoseSequence).not.toHaveBeenCalled()
  })

  it('resolves to ready with the computed reference sequence, path, flags, and clip list on the happy path', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1')])
    const referenceSequence = fakeSequence(12)
    mockFetchPoseSequence.mockResolvedValue(referenceSequence)
    mockDtw.mockReturnValue({
      path: [
        [0, 0],
        [1, 1],
      ],
      cost: 1,
    })
    mockComputeCheckpointFlags.mockReturnValue([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])

    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceVideoUrl).toBe('/reference-clips/freestyle/clip-1/video.mp4')
    expect(result.current.referenceSequence).toBe(referenceSequence)
    expect(result.current.path).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(result.current.flags).toEqual([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])
    expect(result.current.referenceClips).toEqual([clipFixture('clip-1')])
    expect(result.current.selectedClipIndex).toBe(0)
  })

  it('resolves to error when fetchReferenceClips rejects', async () => {
    mockFetchReferenceClips.mockRejectedValue(new Error('network down'))
    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('exposes every valid clip in referenceClips when the library has more than one', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1'), clipFixture('clip-2'), clipFixture('clip-3')])
    mockFetchPoseSequence.mockResolvedValue(fakeSequence(10))

    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceClips).toHaveLength(3)
    expect(result.current.selectedClipIndex).toBe(0)
  })

  it('selectReferenceClip switches to another clip, fetching its pose data and recomputing the alignment', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1'), clipFixture('clip-2'), clipFixture('clip-3')])
    const sequenceA = fakeSequence(10)
    const sequenceB = fakeSequence(20)
    mockFetchPoseSequence.mockImplementation((url: string) =>
      Promise.resolve(url.includes('clip-1') ? sequenceA : sequenceB)
    )
    mockDtw
      .mockReturnValueOnce({ path: [[0, 0]], cost: 0 })
      .mockReturnValueOnce({
        path: [
          [0, 0],
          [1, 1],
        ],
        cost: 1,
      })
    mockComputeCheckpointFlags
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])

    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockFetchPoseSequence).toHaveBeenCalledTimes(1)

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(1)
    })
    await waitFor(() => expect(mockFetchPoseSequence).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(1)
    })

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceSequence).toBe(sequenceB)
    expect(result.current.path).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(result.current.flags).toEqual([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])
  })

  it('does not refetch pose data when re-selecting an already-fetched clip index (cache hit)', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1'), clipFixture('clip-2')])
    mockFetchPoseSequence.mockImplementation((url: string) =>
      Promise.resolve(fakeSequence(url.includes('clip-1') ? 10 : 20))
    )

    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(1)
    })
    await waitFor(() => expect(mockFetchPoseSequence).toHaveBeenCalledTimes(2))

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(0)
    })
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(0)
    })

    expect(mockFetchPoseSequence).toHaveBeenCalledTimes(2) // clip-1 was cached, not refetched
  })

  it('wraps an out-of-range selectReferenceClip index via modulo, both above and below the valid range', async () => {
    mockFetchReferenceClips.mockResolvedValue([
      clipFixture('clip-1'),
      clipFixture('clip-2'),
      clipFixture('clip-3'),
      clipFixture('clip-4'),
    ])
    mockFetchPoseSequence.mockResolvedValue(fakeSequence(10))

    const userSequence = fakeSequence(10)
    const { result } = renderHook(() => useReferenceComparison(userSequence))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(5) // 5 % 4 === 1
    })
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(1)
    })

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(-1) // wraps to the last clip
    })
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(3)
    })
  })
})
