import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPoseSequence, fetchReferenceClips } from './referenceClips'
import type { PoseSequence } from '../lib/poseTypes'

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchReferenceClips', () => {
  it('requests /api/reference-clips with the motion_type query param and returns the parsed JSON', async () => {
    const clips = [
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: '/reference-clips/freestyle/clip-1/video.mp4',
        pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
        camera_angle_note: 'side, water level',
        source_or_license_note: 'self-filmed',
      },
    ]
    const fetchMock = fakeFetch(clips)
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchReferenceClips('freestyle')

    expect(fetchMock).toHaveBeenCalledWith('/api/reference-clips?motion_type=freestyle')
    expect(result).toEqual(clips)
  })

  it('throws (including the status code) when the response is not ok', async () => {
    vi.stubGlobal('fetch', fakeFetch([], false, 500))
    await expect(fetchReferenceClips('freestyle')).rejects.toThrow('500')
  })
})

describe('fetchPoseSequence', () => {
  it('fetches the given URL as-is and returns the parsed JSON', async () => {
    const sequence: PoseSequence = {
      videoDurationMs: 1000,
      videoWidth: 640,
      videoHeight: 480,
      targetFps: 30,
      frameCount: 30,
      frames: [],
      modelInfo: { variant: 'full', delegate: 'GPU' },
    }
    const fetchMock = fakeFetch(sequence)
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchPoseSequence('/reference-clips/freestyle/clip-1/pose.json')

    expect(fetchMock).toHaveBeenCalledWith('/reference-clips/freestyle/clip-1/pose.json')
    expect(result).toEqual(sequence)
  })

  it('throws (including the status code) when the response is not ok', async () => {
    vi.stubGlobal('fetch', fakeFetch(null, false, 404))
    await expect(fetchPoseSequence('/x/pose.json')).rejects.toThrow('404')
  })
})
