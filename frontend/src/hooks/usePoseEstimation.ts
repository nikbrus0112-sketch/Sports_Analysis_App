import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef } from 'react'
import { computeFrameCount, frameTimestampMs, seekTo } from '../lib/frameExtraction'
import { smoothSequence } from '../lib/oneEuroFilter'
import type { PoseFrame, PoseSequence } from '../lib/poseTypes'

const MEDIAPIPE_VERSION = '0.10.14'
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

export interface EstimateSequenceOptions {
  targetFps: number
  onProgress?: (current: number, total: number) => void
}

async function createPoseLandmarker(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL)
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}

export function usePoseEstimation() {
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const delegateRef = useRef<'GPU' | 'CPU'>('GPU')

  useEffect(() => {
    return () => {
      landmarkerRef.current?.close()
    }
  }, [])

  const ensureLandmarker = useCallback(async (): Promise<PoseLandmarker> => {
    if (landmarkerRef.current) return landmarkerRef.current
    try {
      landmarkerRef.current = await createPoseLandmarker('GPU')
      delegateRef.current = 'GPU'
    } catch (err) {
      console.warn('GPU delegate init failed, falling back to CPU', err)
      try {
        landmarkerRef.current = await createPoseLandmarker('CPU')
        delegateRef.current = 'CPU'
      } catch (cpuErr) {
        throw new Error(`Failed to initialize MediaPipe PoseLandmarker on both GPU and CPU: ${String(cpuErr)}`)
      }
    }
    console.info(`PoseLandmarker initialized with delegate=${delegateRef.current}`)
    return landmarkerRef.current
  }, [])

  const estimateSequence = useCallback(
    async (video: HTMLVideoElement, options: EstimateSequenceOptions): Promise<PoseSequence> => {
      const { targetFps, onProgress } = options
      const landmarker = await ensureLandmarker()

      const durationSec = video.duration
      const frameCount = computeFrameCount(durationSec, targetFps)
      const frames: PoseFrame[] = []

      for (let i = 0; i < frameCount; i++) {
        const targetTimeSec = Math.min(i / targetFps, durationSec - 0.05)
        await seekTo(video, targetTimeSec)

        const timestampMs = frameTimestampMs(i, targetFps)
        const result = landmarker.detectForVideo(video, timestampMs)

        frames.push({
          frameIndex: i,
          timestampMs,
          landmarksRaw: result.landmarks[0] ?? null,
          landmarksSmoothed: null,
          worldLandmarksRaw: result.worldLandmarks[0] ?? null,
        })

        onProgress?.(i + 1, frameCount)
      }

      return {
        videoDurationMs: durationSec * 1000,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        targetFps,
        frameCount,
        frames: smoothSequence(frames),
        modelInfo: { variant: 'full', delegate: delegateRef.current },
      }
    },
    [ensureLandmarker]
  )

  return { estimateSequence }
}
