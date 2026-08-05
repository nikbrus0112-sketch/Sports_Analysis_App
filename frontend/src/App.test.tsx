import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
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

    await waitFor(() => expect(screen.getByText('No reference clip available yet for freestyle.')).toBeInTheDocument())
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
})
