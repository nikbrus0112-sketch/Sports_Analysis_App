import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { MOTION_TYPES } from './lib/motionTypes'
import type { PoseSequence } from './lib/poseTypes'

const mockEstimateSequence = vi.fn()
const mockUseReferenceComparison = vi.fn()

vi.mock('./hooks/usePoseEstimation', () => ({
  usePoseEstimation: () => ({ estimateSequence: mockEstimateSequence }),
}))
vi.mock('./hooks/useReferenceComparison', () => ({
  useReferenceComparison: (...args: unknown[]) => mockUseReferenceComparison(...args),
}))

const fakeSequence: PoseSequence = {
  videoDurationMs: 1000,
  videoWidth: 640,
  videoHeight: 480,
  targetFps: 30,
  frameCount: 30,
  frames: [],
  modelInfo: { variant: 'full', delegate: 'GPU' },
}

beforeEach(() => {
  mockEstimateSequence.mockReset()
  mockUseReferenceComparison.mockReset().mockReturnValue({ status: 'no-reference-available' })
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

describe('App', () => {
  it('starts in idle state showing the file upload input', () => {
    render(<App />)
    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
  })

  it('shows processing progress after a file is selected', async () => {
    mockEstimateSequence.mockReturnValue(new Promise(() => {}))
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument())
  })

  it('transitions to ready state once estimateSequence resolves', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('Try another video')).toBeInTheDocument())
  })

  it('returns to the upload screen instead of hanging forever when pose estimation rejects', async () => {
    mockEstimateSequence.mockRejectedValue(new Error('Video failed to load before metadata was available'))
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByTestId('file-upload-input')).toBeInTheDocument())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('resets to idle and revokes the object URL on "Try another video"', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)
    await waitFor(() => screen.getByText('Try another video'))

    await userEvent.click(screen.getByText('Try another video'))

    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('shows the existing single-video viewer with a friendly message when no reference clip is available', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('No reference clip available yet for Freestyle.')).toBeInTheDocument())
    expect(screen.getByTestId('scrubber')).toBeInTheDocument() // VideoPoseViewer's own scrubber
    expect(screen.getByText('Try another video')).toBeInTheDocument()
  })

  it('renders ComparisonView once the reference comparison is ready', async () => {
    mockUseReferenceComparison.mockReturnValue({
      status: 'ready',
      referenceVideoUrl: '/reference-clips/freestyle/clip-1/video.mp4',
      referenceSequence: fakeSequence,
      path: [[0, 0]],
      flags: [],
      referenceClips: [
        {
          id: 'clip-1',
          motion_type: 'freestyle',
          video_url: '/reference-clips/freestyle/clip-1/video.mp4',
          pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
          camera_angle_note: '',
          source_or_license_note: '',
        },
      ],
      selectedClipIndex: 0,
      selectReferenceClip: vi.fn(),
    })
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByTestId('comparison-scrubber')).toBeInTheDocument())
    expect(screen.getByTestId('user-video-pane')).toBeInTheDocument()
    expect(screen.getByTestId('reference-video-pane')).toBeInTheDocument()
    expect(screen.getByText('Try another video')).toBeInTheDocument()
  })

  it('shows cycling controls when the reference comparison has multiple clips', async () => {
    mockUseReferenceComparison.mockReturnValue({
      status: 'ready',
      referenceVideoUrl: '/reference-clips/freestyle/clip-1/video.mp4',
      referenceSequence: fakeSequence,
      path: [[0, 0]],
      flags: [],
      referenceClips: [
        {
          id: 'clip-1',
          motion_type: 'freestyle',
          video_url: '/reference-clips/freestyle/clip-1/video.mp4',
          pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
          camera_angle_note: '',
          source_or_license_note: '',
        },
        {
          id: 'clip-2',
          motion_type: 'freestyle',
          video_url: '/reference-clips/freestyle/clip-2/video.mp4',
          pose_data_url: '/reference-clips/freestyle/clip-2/pose.json',
          camera_angle_note: '',
          source_or_license_note: '',
        },
      ],
      selectedClipIndex: 0,
      selectReferenceClip: vi.fn(),
    })
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('Clip 1 of 2')).toBeInTheDocument())
    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.getByText('Prev')).toBeInTheDocument()
  })

  it('shows a motion picker on the idle screen with both options, defaulting to Freestyle', () => {
    render(<App />)
    const select = screen.getByTestId('motion-type-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    for (const { label } of MOTION_TYPES) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
    expect(select.value).toBe('freestyle')
  })

  it('passes the selected motion type through to useReferenceComparison and shows its label in the no-reference message', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    await userEvent.selectOptions(screen.getByTestId('motion-type-select'), 'butterfly')

    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('No reference clip available yet for Butterfly.')).toBeInTheDocument())
    expect(mockUseReferenceComparison).toHaveBeenLastCalledWith(fakeSequence, 'butterfly')
  })
})
