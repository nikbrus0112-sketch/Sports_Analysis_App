import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { PoseSequence } from './lib/poseTypes'

const mockEstimateSequence = vi.fn()

vi.mock('./hooks/usePoseEstimation', () => ({
  usePoseEstimation: () => ({ estimateSequence: mockEstimateSequence }),
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
})
