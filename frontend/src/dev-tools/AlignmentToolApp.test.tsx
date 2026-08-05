import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlignmentToolApp } from './AlignmentToolApp'
import type { PoseSequence } from '../lib/poseTypes'

const mockEstimateSequence = vi.fn()
const mockComputeFeatureVectors = vi.fn()
const mockDtw = vi.fn()

vi.mock('../hooks/usePoseEstimation', () => ({
  usePoseEstimation: () => ({ estimateSequence: mockEstimateSequence }),
}))
vi.mock('../lib/featureVector', () => ({
  computeFeatureVectors: (...args: unknown[]) => mockComputeFeatureVectors(...args),
}))
vi.mock('../lib/dtw', () => ({
  dtw: (...args: unknown[]) => mockDtw(...args),
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
  mockEstimateSequence.mockReset()
  mockComputeFeatureVectors.mockReset().mockReturnValue([[0]])
  mockDtw.mockReset().mockReturnValue({ path: [[0, 0]], cost: 0 })
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
})

describe('AlignmentToolApp', () => {
  it('starts idle with the reference slot disabled until the user clip is processed', () => {
    render(<AlignmentToolApp />)
    expect(screen.getByTestId('user-file-upload-input')).toBeEnabled()
    expect(screen.getByTestId('reference-file-upload-input')).toBeDisabled()
  })

  it('shows processing progress for the user clip while it is estimating, reference slot stays disabled', async () => {
    mockEstimateSequence.mockReturnValue(new Promise(() => {}))
    render(<AlignmentToolApp />)
    const file = new File(['dummy'], 'user.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('user-file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument())
    expect(screen.getByTestId('reference-file-upload-input')).toBeDisabled()
  })

  it('enables the reference slot once the user clip finishes, then renders the DTW mapping once both finish', async () => {
    mockEstimateSequence.mockResolvedValueOnce(fakeSequence(10)).mockResolvedValueOnce(fakeSequence(12))
    mockDtw.mockReturnValue({
      path: [
        [0, 0],
        [1, 1],
        [2, 1],
      ],
      cost: 4.2,
    })

    render(<AlignmentToolApp />)
    await userEvent.upload(
      screen.getByTestId('user-file-upload-input'),
      new File(['dummy'], 'user.mp4', { type: 'video/mp4' })
    )

    await waitFor(() => expect(screen.getByTestId('reference-file-upload-input')).toBeEnabled())

    await userEvent.upload(
      screen.getByTestId('reference-file-upload-input'),
      new File(['dummy'], 'reference.mp4', { type: 'video/mp4' })
    )

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4)) // header + 3 mapping rows
    expect(mockComputeFeatureVectors).toHaveBeenCalledTimes(2)
    const cells = screen.getAllByRole('cell').map((c) => c.textContent)
    expect(cells).toEqual(['0', '0', '1', '1', '2', '1'])
  })
})
