import { PoseLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { drawSkeleton } from '../lib/drawSkeleton'
import { frameIndexForTime } from '../lib/frameExtraction'
import type { PoseSequence } from '../lib/poseTypes'

interface VideoPoseViewerProps {
  videoUrl: string
  poseSequence: PoseSequence | null
  onVideoElementReady: (video: HTMLVideoElement) => void
}

// PoseLandmarker.POSE_CONNECTIONS is Connection[] ({ start, end }), not [number, number][].
// drawSkeleton expects tuples, so we adapt the shape here rather than in the (already
// unit-tested) drawSkeleton helper.
export const POSE_CONNECTION_TUPLES: readonly (readonly [number, number])[] = PoseLandmarker.POSE_CONNECTIONS.map(
  (connection) => [connection.start, connection.end] as const
)

export function VideoPoseViewer({ videoUrl, poseSequence, onVideoElementReady }: VideoPoseViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (video) onVideoElementReady(video)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !poseSequence) return
    canvas.width = poseSequence.videoWidth
    canvas.height = poseSequence.videoHeight
  }, [poseSequence])

  const drawCurrentFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !poseSequence) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const frameIndex = frameIndexForTime(video.currentTime, poseSequence.targetFps, poseSequence.frameCount)
    const frame = poseSequence.frames[frameIndex]

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSkeleton(ctx, frame?.landmarksSmoothed ?? null, canvas.width, canvas.height, POSE_CONNECTION_TUPLES)
  }

  useEffect(() => {
    if (!isPlaying || !poseSequence) return
    const loop = () => {
      drawCurrentFrame()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, poseSequence])

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play()
      setIsPlaying(true)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Number(e.target.value)
    drawCurrentFrame()
  }

  return (
    <div
      className="relative mx-auto max-w-full overflow-hidden rounded-xl border border-border bg-card"
      style={{ width: poseSequence?.videoWidth ?? '100%' }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="block w-full"
        onLoadedMetadata={drawCurrentFrame}
        onError={() => console.error('Video failed to load — check the file is a supported mp4/mov codec.')}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" />
      {poseSequence && (
        <div className="flex items-center gap-3 border-t border-border p-3">
          <button
            onClick={handlePlayPause}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary-emphasis px-4 text-sm font-medium text-white transition-colors hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={poseSequence.videoDurationMs / 1000}
            step={1 / poseSequence.targetFps}
            onChange={handleSeek}
            data-testid="scrubber"
            className="h-11 flex-1 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>
      )}
    </div>
  )
}
