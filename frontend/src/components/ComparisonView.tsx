import { useEffect, useRef, useState } from 'react'
import type { CheckpointFlag } from '../lib/checkpointFlags'
import { drawSkeleton } from '../lib/drawSkeleton'
import { frameTimestampMs, seekTo } from '../lib/frameExtraction'
import { normalizeSkeletonForOverlay } from '../lib/normalizeSkeleton'
import type { PoseSequence } from '../lib/poseTypes'
import { POSE_CONNECTION_TUPLES } from './VideoPoseViewer'

// Overlay canvas is a fixed square, independent of either clip's native video
// aspect ratio — normalizeSkeletonForOverlay scales x/y by one shared factor,
// so a non-square canvas would distort the silhouette (see normalizeSkeleton.ts).
const OVERLAY_CANVAS_SIZE = 400
const USER_COLOR = '#3B82F6' // blue
const REFERENCE_COLOR = '#F97316' // orange

interface ComparisonViewProps {
  userVideoUrl: string
  userSequence: PoseSequence
  referenceVideoUrl: string
  referenceSequence: PoseSequence
  path: [number, number][]
  flags: CheckpointFlag[]
  referenceClipCount: number
  selectedClipIndex: number
  onSelectReferenceClip: (index: number) => void
}

export function ComparisonView({
  userVideoUrl,
  userSequence,
  referenceVideoUrl,
  referenceSequence,
  path,
  flags,
  referenceClipCount,
  selectedClipIndex,
  onSelectReferenceClip,
}: ComparisonViewProps) {
  const userVideoRef = useRef<HTMLVideoElement>(null)
  const referenceVideoRef = useRef<HTMLVideoElement>(null)
  const userCanvasRef = useRef<HTMLCanvasElement>(null)
  const referenceCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const [pairIndex, setPairIndex] = useState(0)

  const [userFrameIdx, referenceFrameIdx] = path[pairIndex] ?? [0, 0]

  // A clip switch that hits the pose-data cache (see useReferenceComparison)
  // updates props without unmounting this component — reset the scrubber so
  // it doesn't keep pointing at a pair index that means something different
  // (or doesn't exist) in the newly selected clip's path.
  useEffect(() => {
    setPairIndex(0)
  }, [path])

  useEffect(() => {
    const userCanvas = userCanvasRef.current
    if (userCanvas) {
      userCanvas.width = userSequence.videoWidth
      userCanvas.height = userSequence.videoHeight
    }
    const referenceCanvas = referenceCanvasRef.current
    if (referenceCanvas) {
      referenceCanvas.width = referenceSequence.videoWidth
      referenceCanvas.height = referenceSequence.videoHeight
    }
    const overlayCanvas = overlayCanvasRef.current
    if (overlayCanvas) {
      overlayCanvas.width = OVERLAY_CANVAS_SIZE
      overlayCanvas.height = OVERLAY_CANVAS_SIZE
    }
  }, [userSequence, referenceSequence])

  useEffect(() => {
    // Skeleton drawing depends only on sequence data + the current pair, not
    // on whether the <video> has actually finished seeking — so canvas draws
    // happen synchronously here; the video seeks below are fire-and-forget,
    // purely to keep the visible video frame roughly in sync.
    const userCanvas = userCanvasRef.current
    if (userCanvas) {
      const ctx = userCanvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, userCanvas.width, userCanvas.height)
        const frame = userSequence.frames[userFrameIdx]
        drawSkeleton(ctx, frame?.landmarksSmoothed ?? null, userCanvas.width, userCanvas.height, POSE_CONNECTION_TUPLES)
      }
    }

    const referenceCanvas = referenceCanvasRef.current
    if (referenceCanvas) {
      const ctx = referenceCanvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height)
        const frame = referenceSequence.frames[referenceFrameIdx]
        drawSkeleton(
          ctx,
          frame?.landmarksSmoothed ?? null,
          referenceCanvas.width,
          referenceCanvas.height,
          POSE_CONNECTION_TUPLES
        )
      }
    }

    const overlayCanvas = overlayCanvasRef.current
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        const userLandmarks = normalizeSkeletonForOverlay(userSequence.frames[userFrameIdx]?.landmarksSmoothed ?? null)
        const referenceLandmarks = normalizeSkeletonForOverlay(
          referenceSequence.frames[referenceFrameIdx]?.landmarksSmoothed ?? null
        )
        drawSkeleton(ctx, userLandmarks, overlayCanvas.width, overlayCanvas.height, POSE_CONNECTION_TUPLES, {
          color: USER_COLOR,
        })
        drawSkeleton(ctx, referenceLandmarks, overlayCanvas.width, overlayCanvas.height, POSE_CONNECTION_TUPLES, {
          color: REFERENCE_COLOR,
        })
      }
    }

    const userVideo = userVideoRef.current
    if (userVideo) seekTo(userVideo, frameTimestampMs(userFrameIdx, userSequence.targetFps) / 1000)
    const referenceVideo = referenceVideoRef.current
    if (referenceVideo) seekTo(referenceVideo, frameTimestampMs(referenceFrameIdx, referenceSequence.targetFps) / 1000)
  }, [userFrameIdx, referenceFrameIdx, userSequence, referenceSequence])

  const currentFlags = flags.filter((f) => f.phase === referenceFrameIdx)

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-card" data-testid="user-video-pane">
          <video ref={userVideoRef} src={userVideoUrl} className="block w-full" />
          <canvas ref={userCanvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" />
        </div>
        <div
          className="relative flex-1 overflow-hidden rounded-xl border border-border bg-card"
          data-testid="reference-video-pane"
        >
          <video ref={referenceVideoRef} src={referenceVideoUrl} className="block w-full" />
          <canvas ref={referenceCanvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" />
        </div>
      </div>

      {referenceClipCount >= 2 && (
        <div className="mt-4 flex items-center justify-center gap-4" data-testid="reference-clip-cycler">
          <button
            onClick={() => onSelectReferenceClip((selectedClipIndex - 1 + referenceClipCount) % referenceClipCount)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Prev
          </button>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            Clip {selectedClipIndex + 1} of {referenceClipCount}
          </span>
          <button
            onClick={() => onSelectReferenceClip((selectedClipIndex + 1) % referenceClipCount)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Next
          </button>
        </div>
      )}

      {path.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          No aligned frames to compare.
        </p>
      ) : (
        <input
          type="range"
          min={0}
          max={path.length - 1}
          step={1}
          value={pairIndex}
          onChange={(e) => setPairIndex(Number(e.target.value))}
          data-testid="comparison-scrubber"
          className="mt-4 h-11 w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-foreground">In-depth analysis</h2>
      <div className="mx-auto aspect-square w-full max-w-[400px] overflow-hidden rounded-xl border border-border bg-card">
        <canvas ref={overlayCanvasRef} data-testid="overlay-canvas" className="block h-full w-full" />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-foreground">Checkpoint flags at this frame</h2>
      {currentFlags.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Joint</th>
                <th className="px-4 py-2 text-right font-medium">Your angle</th>
                <th className="px-4 py-2 text-right font-medium">Reference angle</th>
                <th className="px-4 py-2 text-right font-medium">Delta</th>
              </tr>
            </thead>
            <tbody>
              {currentFlags.map((f, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{f.joint}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">
                    {f.userValue.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">
                    {f.referenceValue.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-accent">{f.delta.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          No flags at this frame.
        </p>
      )}
    </div>
  )
}
