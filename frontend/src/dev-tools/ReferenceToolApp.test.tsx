import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenceToolApp } from './ReferenceToolApp'
import type { PoseSequence } from '../lib/poseTypes'

const mockEstimateSequence = vi.fn()

vi.mock('../hooks/usePoseEstimation', () => ({
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

describe('ReferenceToolApp', () => {
  it('starts in idle state showing the file upload input', () => {
    render(<ReferenceToolApp />)
    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
  })

  it('shows processing progress after a file is selected', async () => {
    mockEstimateSequence.mockReturnValue(new Promise(() => {}))
    render(<ReferenceToolApp />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument())
  })

  it('shows a download link for pose.json once processing finishes', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<ReferenceToolApp />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    const link = await waitFor(() => screen.getByText('Download pose.json'))
    expect(link).toHaveAttribute('download', 'pose.json')
    expect(link).toHaveAttribute('href', 'blob:mock-url')
  })

  it('revokes both the video and download object URLs when resetting', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<ReferenceToolApp />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)
    await waitFor(() => screen.getByText('Download pose.json'))

    await userEvent.click(screen.getByText('Process another clip'))

    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})
