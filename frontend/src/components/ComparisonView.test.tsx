import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComparisonView } from './ComparisonView'
import type { CheckpointFlag } from '../lib/checkpointFlags'
import type { Landmark, PoseSequence } from '../lib/poseTypes'

const FACE_LANDMARK_COUNT = 11
const BODY_LANDMARK_COUNT = 22

function landmark(x: number, y: number): Landmark {
  return { x, y, z: 0 }
}

function frameWithBody(x: number, y: number): Landmark[] {
  const face = Array.from({ length: FACE_LANDMARK_COUNT }, () => landmark(0, 0))
  const body = Array.from({ length: BODY_LANDMARK_COUNT }, () => landmark(x, y))
  return [...face, ...body]
}

// 46 frames with the subject clustered at one side of the frame, then 46 at
// the other — gives computeSubjectBox a real (smaller-than-full-frame) box to
// pan within, and gives frame 0 vs. frame 91 clearly different raw centroids
// to prove the crop actually follows the subject over time.
function movingSequence(): PoseSequence {
  const low = Array.from({ length: 46 }, () => frameWithBody(0.3, 0.3))
  const high = Array.from({ length: 46 }, () => frameWithBody(0.7, 0.7))
  const landmarks = [...low, ...high]
  return {
    videoDurationMs: landmarks.length * (1000 / 30),
    videoWidth: 1000,
    videoHeight: 1000,
    targetFps: 30,
    frameCount: landmarks.length,
    frames: landmarks.map((l, i) => ({ frameIndex: i, timestampMs: i * (1000 / 30), landmarksRaw: l, landmarksSmoothed: l })),
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

function fakeSequence(frameCount: number, videoWidth = 640, videoHeight = 480): PoseSequence {
  return {
    videoDurationMs: frameCount * (1000 / 30),
    videoWidth,
    videoHeight,
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
      referenceClipCount={1}
      selectedClipIndex={0}
      onSelectReferenceClip={vi.fn()}
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

  it('renders no cycling controls when there is only one reference clip', () => {
    renderView()
    expect(screen.queryByTestId('reference-clip-cycler')).not.toBeInTheDocument()
  })

  it('renders cycling controls with the current position when there are multiple reference clips', () => {
    renderView({ referenceClipCount: 3, selectedClipIndex: 0 })
    expect(screen.getByTestId('reference-clip-cycler')).toBeInTheDocument()
    expect(screen.getByText('Clip 1 of 3')).toBeInTheDocument()
  })

  it('clicking Next calls onSelectReferenceClip with the next index', () => {
    const onSelectReferenceClip = vi.fn()
    renderView({ referenceClipCount: 3, selectedClipIndex: 0, onSelectReferenceClip })
    fireEvent.click(screen.getByText('Next'))
    expect(onSelectReferenceClip).toHaveBeenCalledWith(1)
  })

  it('clicking Prev at index 0 wraps around to call onSelectReferenceClip with the last index', () => {
    const onSelectReferenceClip = vi.fn()
    renderView({ referenceClipCount: 3, selectedClipIndex: 0, onSelectReferenceClip })
    fireEvent.click(screen.getByText('Prev'))
    expect(onSelectReferenceClip).toHaveBeenCalledWith(2)
  })

  it('resets the scrubber to pair 0 when the path prop changes (e.g. after switching reference clips)', () => {
    const { rerender } = render(
      <ComparisonView
        userVideoUrl="blob:user"
        userSequence={fakeSequence(3)}
        referenceVideoUrl="blob:reference"
        referenceSequence={fakeSequence(3)}
        path={path}
        flags={flags}
        referenceClipCount={2}
        selectedClipIndex={0}
        onSelectReferenceClip={vi.fn()}
      />
    )
    fireEvent.change(screen.getByTestId('comparison-scrubber'), { target: { value: '1' } })
    expect(screen.getByTestId('comparison-scrubber')).toHaveValue('1')

    const newPath: [number, number][] = [
      [0, 0],
      [1, 1],
    ]
    rerender(
      <ComparisonView
        userVideoUrl="blob:user"
        userSequence={fakeSequence(3)}
        referenceVideoUrl="blob:reference-2"
        referenceSequence={fakeSequence(2)}
        path={newPath}
        flags={flags}
        referenceClipCount={2}
        selectedClipIndex={1}
        onSelectReferenceClip={vi.fn()}
      />
    )
    expect(screen.getByTestId('comparison-scrubber')).toHaveValue('0')
  })

  it('shows the skeleton toggle on by default and toggles its label/aria-pressed on click', () => {
    renderView()
    const toggle = screen.getByRole('button', { name: 'Hide skeleton' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Show skeleton' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('gives both panes a matching CSS aspect-ratio even for sequences with very different native resolutions', () => {
    renderView({
      userSequence: fakeSequence(3, 720, 1280),
      referenceSequence: fakeSequence(3, 854, 476),
    })
    const userPane = screen.getByTestId('user-video-pane')
    const referencePane = screen.getByTestId('reference-video-pane')
    const userAR = userPane.style.aspectRatio.split('/').map(Number)
    const referenceAR = referencePane.style.aspectRatio.split('/').map(Number)
    expect(userAR[0] / userAR[1]).toBeCloseTo(referenceAR[0] / referenceAR[1], 10)
  })

  it('toggles overlap mode: swaps the two pane test ids for a single overlap-pane and back', () => {
    renderView()
    expect(screen.getByTestId('user-video-pane')).toBeInTheDocument()
    expect(screen.getByTestId('reference-video-pane')).toBeInTheDocument()
    expect(screen.queryByTestId('overlap-pane')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Overlap' }))

    expect(screen.getByTestId('overlap-pane')).toBeInTheDocument()
    expect(screen.queryByTestId('user-video-pane')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reference-video-pane')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }))
    expect(screen.getByTestId('user-video-pane')).toBeInTheDocument()
    expect(screen.queryByTestId('overlap-pane')).not.toBeInTheDocument()
  })

  describe('Play/Pause auto-advance', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('is disabled when there are no aligned frames', () => {
      renderView({ path: [] })
      expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    })

    it('advances pairIndex over time while playing, and auto-stops at the end of the path', () => {
      renderView()
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(1000 / 30))
      expect(screen.getByTestId('comparison-scrubber')).toHaveValue('1')

      act(() => vi.advanceTimersByTime(1000 / 30))
      expect(screen.getByTestId('comparison-scrubber')).toHaveValue('2')

      // path has 3 pairs (indices 0-2) — advancing further should not go past the end,
      // and playback should auto-stop (button reverts to "Play").
      act(() => vi.advanceTimersByTime(1000 / 30))
      expect(screen.getByTestId('comparison-scrubber')).toHaveValue('2')
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    })

    it('pauses when the scrubber is dragged manually', () => {
      renderView()
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

      fireEvent.change(screen.getByTestId('comparison-scrubber'), { target: { value: '1' } })
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

      // No further auto-advance after pausing.
      act(() => vi.advanceTimersByTime(1000 / 30))
      expect(screen.getByTestId('comparison-scrubber')).toHaveValue('1')
    })

    it('restarts from pair 0 when Play is clicked again after reaching the end', () => {
      renderView()
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      act(() => vi.advanceTimersByTime((1000 / 30) * 3)) // run past the end (path has 3 pairs)
      expect(screen.getByTestId('comparison-scrubber')).toHaveValue('2')

      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      expect(screen.getByTestId('comparison-scrubber')).toHaveValue('0')
    })
  })

  it('pans the crop to follow the subject as the scrubber moves, without changing the pane aspect ratio', () => {
    const movingPath: [number, number][] = [
      [0, 0],
      [91, 91],
    ]
    renderView({
      userSequence: movingSequence(),
      referenceSequence: movingSequence(),
      path: movingPath,
    })
    const pane = screen.getByTestId('user-video-pane')
    const video = pane.querySelector('video') as HTMLVideoElement
    const initialLeft = video.style.left
    const initialAspectRatio = pane.style.aspectRatio

    fireEvent.change(screen.getByTestId('comparison-scrubber'), { target: { value: '1' } })

    expect(video.style.left).not.toBe(initialLeft)
    expect(pane.style.aspectRatio).toBe(initialAspectRatio)
  })

  it('caps each pane width so a narrow/tall crop cannot produce a pane taller than the configured max height', () => {
    renderView({
      userSequence: movingSequence(),
      referenceSequence: movingSequence(),
    })
    const pane = screen.getByTestId('user-video-pane')
    // movingSequence's box collapses to a square-ish AR (46@0.3 + 46@0.7 on both axes
    // identically), so maxWidth should equal the configured max pane height exactly.
    expect(pane.style.maxWidth).toBe('500px')
  })

  it('applies the same size cap to the single wrapper box in overlap mode (regression: grid-stacking previously collapsed to ~0px)', () => {
    renderView({
      userSequence: movingSequence(),
      referenceSequence: movingSequence(),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Overlap' }))
    const overlapPane = screen.getByTestId('overlap-pane')
    expect(overlapPane.style.maxWidth).toBe('500px')
    expect(overlapPane.style.aspectRatio).not.toBe('')
  })
})
