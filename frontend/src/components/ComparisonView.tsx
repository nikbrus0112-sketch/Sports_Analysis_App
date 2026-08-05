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
}

export function ComparisonView({
  userVideoUrl,
  userSequence,
  referenceVideoUrl,
  referenceSequence,
  path,
  flags,
}: ComparisonViewProps) {
  const userVideoRef = useRef<HTMLVideoElement>(null)
  const referenceVideoRef = useRef<HTMLVideoElement>(null)
  const userCanvasRef = useRef<HTMLCanvasElement>(null)
  const referenceCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const [pairIndex, setPairIndex] = useState(0)

  const [userFrameIdx, referenceFrameIdx] = path[pairIndex] ?? [0, 0]

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
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ position: 'relative', flex: 1 }} data-testid="user-video-pane">
          <video ref={userVideoRef} src={userVideoUrl} style={{ width: '100%', display: 'block' }} />
          <canvas ref={userCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        </div>
        <div style={{ position: 'relative', flex: 1 }} data-testid="reference-video-pane">
          <video ref={referenceVideoRef} src={referenceVideoUrl} style={{ width: '100%', display: 'block' }} />
          <canvas
            ref={referenceCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />
        </div>
      </div>

      {path.length === 0 ? (
        <p>No aligned frames to compare.</p>
      ) : (
        <input
          type="range"
          min={0}
          max={path.length - 1}
          step={1}
          value={pairIndex}
          onChange={(e) => setPairIndex(Number(e.target.value))}
          data-testid="comparison-scrubber"
        />
      )}

      <h2>In-depth analysis</h2>
      <canvas ref={overlayCanvasRef} data-testid="overlay-canvas" />

      <h2>Checkpoint flags at this frame</h2>
      {currentFlags.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Joint</th>
              <th>Your angle</th>
              <th>Reference angle</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {currentFlags.map((f, i) => (
              <tr key={i}>
                <td>{f.joint}</td>
                <td>{f.userValue.toFixed(1)}</td>
                <td>{f.referenceValue.toFixed(1)}</td>
                <td>{f.delta.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No flags at this frame.</p>
      )}
    </div>
  )
}
