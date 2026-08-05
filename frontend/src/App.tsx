import { useCallback, useState } from 'react'
import { ComparisonView } from './components/ComparisonView'
import { FileUpload } from './components/FileUpload'
import { ProcessingProgress } from './components/ProcessingProgress'
import { VideoPoseViewer } from './components/VideoPoseViewer'
import { usePoseEstimation } from './hooks/usePoseEstimation'
import { useReferenceComparison } from './hooks/useReferenceComparison'
import { DEFAULT_MOTION_TYPE, MOTION_TYPES } from './lib/motionTypes'
import type { PoseSequence } from './lib/poseTypes'

const TARGET_FPS = 30

type AppState = 'idle' | 'processing' | 'ready'

export function App() {
  const [state, setState] = useState<AppState>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [poseSequence, setPoseSequence] = useState<PoseSequence | null>(null)
  const [motionType, setMotionType] = useState(DEFAULT_MOTION_TYPE)
  const { estimateSequence } = usePoseEstimation()
  const comparison = useReferenceComparison(poseSequence, motionType)

  const handleFileSelected = (file: File) => {
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setPoseSequence(null)
    setProgress({ current: 0, total: 0 })
    setState('processing')
  }

  const handleVideoElementReady = useCallback(
    (video: HTMLVideoElement) => {
      const run = async () => {
        const sequence = await estimateSequence(video, {
          targetFps: TARGET_FPS,
          onProgress: (current, total) => setProgress({ current, total }),
        })
        video.currentTime = 0
        setPoseSequence(sequence)
        setState('ready')
      }
      run()
    },
    [estimateSequence]
  )

  const handleReset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(null)
    setPoseSequence(null)
    setState('idle')
  }

  return (
    <div>
      {state === 'idle' && (
        <>
          <label htmlFor="motion-type-select">Motion</label>
          <select
            id="motion-type-select"
            data-testid="motion-type-select"
            value={motionType}
            onChange={(e) => setMotionType(e.target.value)}
          >
            {MOTION_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <FileUpload onFileSelected={handleFileSelected} />
        </>
      )}
      {(state === 'processing' || state === 'ready') && videoUrl && (
        <>
          {state === 'processing' && <ProcessingProgress current={progress.current} total={progress.total} />}
          {state === 'ready' && comparison.status === 'ready' && poseSequence ? (
            <ComparisonView
              userVideoUrl={videoUrl}
              userSequence={poseSequence}
              referenceVideoUrl={comparison.referenceVideoUrl}
              referenceSequence={comparison.referenceSequence}
              path={comparison.path}
              flags={comparison.flags}
              referenceClipCount={comparison.referenceClips.length}
              selectedClipIndex={comparison.selectedClipIndex}
              onSelectReferenceClip={comparison.selectReferenceClip}
            />
          ) : (
            <>
              {state === 'ready' && comparison.status === 'loading' && <p>Loading reference comparison…</p>}
              {state === 'ready' && comparison.status === 'no-reference-available' && (
                <p>
                  No reference clip available yet for{' '}
                  {MOTION_TYPES.find((m) => m.value === motionType)?.label ?? motionType}.
                </p>
              )}
              {state === 'ready' && comparison.status === 'error' && (
                <p>Something went wrong loading the reference comparison.</p>
              )}
              <VideoPoseViewer
                videoUrl={videoUrl}
                poseSequence={poseSequence}
                onVideoElementReady={handleVideoElementReady}
              />
            </>
          )}
          {state === 'ready' && <button onClick={handleReset}>Try another video</button>}
        </>
      )}
    </div>
  )
}
