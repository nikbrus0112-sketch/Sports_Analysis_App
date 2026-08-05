import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComparisonView } from './ComparisonView'
import type { CheckpointFlag } from '../lib/checkpointFlags'
import type { PoseSequence } from '../lib/poseTypes'

function fakeSequence(frameCount: number): PoseSequence {
  return {
    videoDurationMs: frameCount * (1000 / 30),
    videoWidth: 640,
    videoHeight: 480,
    targetFps: 30,
    frameCount,
    frames: Array.from({ length: frameCount }, (_, i) => ({
      frameIndex: i,
      timestampMs: i * (1000 / 30),
      landmarksRaw: null,
      landmarksSmoothed: null,
    })),
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

const path: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 2],
]

const flags: CheckpointFlag[] = [{ phase: 1, joint: 'leftElbow', userValue: 110, referenceValue: 90, delta: 20 }]

function renderView(overrides: Partial<Parameters<typeof ComparisonView>[0]> = {}) {
  render(
    <ComparisonView
      userVideoUrl="blob:user"
      userSequence={fakeSequence(3)}
      referenceVideoUrl="blob:reference"
      referenceSequence={fakeSequence(3)}
      path={path}
      flags={flags}
      {...overrides}
    />
  )
}

describe('ComparisonView', () => {
  it('renders both video panes and a scrubber starting at pair 0', () => {
    renderView()
    expect(screen.getByTestId('user-video-pane')).toBeInTheDocument()
    expect(screen.getByTestId('reference-video-pane')).toBeInTheDocument()
    expect(screen.getByTestId('comparison-scrubber')).toHaveValue('0')
  })

  it('shows "No flags at this frame." when the current pair has no matching flags', () => {
    renderView()
    expect(screen.getByText('No flags at this frame.')).toBeInTheDocument()
  })

  it('scrubbing to a pair whose referenceFrameIdx matches a flag updates the flags panel', () => {
    renderView()
    fireEvent.change(screen.getByTestId('comparison-scrubber'), { target: { value: '1' } })

    expect(screen.getByText('leftElbow')).toBeInTheDocument()
    expect(screen.getByText('110.0')).toBeInTheDocument()
    expect(screen.getByText('90.0')).toBeInTheDocument()
    expect(screen.getByText('20.0')).toBeInTheDocument()
    expect(screen.queryByText('No flags at this frame.')).not.toBeInTheDocument()
  })

  it('renders a fallback message instead of a scrubber when path is empty', () => {
    renderView({ path: [] })
    expect(screen.getByText('No aligned frames to compare.')).toBeInTheDocument()
    expect(screen.queryByTestId('comparison-scrubber')).not.toBeInTheDocument()
  })
})
