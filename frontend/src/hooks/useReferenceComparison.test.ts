import { renderHook, waitFor } from '@testing-library/react'
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
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
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
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
    expect(mockFetchPoseSequence).not.toHaveBeenCalled()
  })

  it('resolves to ready with the computed reference sequence, path, and flags on the happy path', async () => {
    mockFetchReferenceClips.mockResolvedValue([
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: '/reference-clips/freestyle/clip-1/video.mp4',
        pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
        camera_angle_note: '',
        source_or_license_note: '',
      },
    ])
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

    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceVideoUrl).toBe('/reference-clips/freestyle/clip-1/video.mp4')
    expect(result.current.referenceSequence).toBe(referenceSequence)
    expect(result.current.path).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(result.current.flags).toEqual([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])
  })

  it('resolves to error when fetchReferenceClips rejects', async () => {
    mockFetchReferenceClips.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
