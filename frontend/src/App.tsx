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
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Stroke Analysis</h1>
          <p className="text-sm text-muted-foreground">Compare your swim stroke against a reference clip</p>
        </header>

        {state === 'idle' && (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="motion-type-select" className="text-sm font-medium text-muted-foreground">
                Motion
              </label>
              <select
                id="motion-type-select"
                data-testid="motion-type-select"
                value={motionType}
                onChange={(e) => setMotionType(e.target.value)}
                className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {MOTION_TYPES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <FileUpload onFileSelected={handleFileSelected} />
          </div>
        )}
        {(state === 'processing' || state === 'ready') && videoUrl && (
          <>
            {state === 'processing' && (
              <div className="rounded-xl border border-border bg-card p-6">
                <ProcessingProgress current={progress.current} total={progress.total} />
              </div>
            )}
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
              <div className="flex flex-col gap-4">
                {state === 'ready' && comparison.status === 'loading' && (
                  <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    Loading reference comparison…
                  </p>
                )}
                {state === 'ready' && comparison.status === 'no-reference-available' && (
                  <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    No reference clip available yet for{' '}
                    {MOTION_TYPES.find((m) => m.value === motionType)?.label ?? motionType}.
                  </p>
                )}
                {state === 'ready' && comparison.status === 'error' && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-400">
                    Something went wrong loading the reference comparison.
                  </p>
                )}
                <VideoPoseViewer
                  videoUrl={videoUrl}
                  poseSequence={poseSequence}
                  onVideoElementReady={handleVideoElementReady}
                />
              </div>
            )}
            {state === 'ready' && (
              <button
                onClick={handleReset}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-emphasis px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Try another video
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
