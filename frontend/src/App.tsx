import { useCallback, useState } from 'react'
import { FileUpload } from './components/FileUpload'
import { ProcessingProgress } from './components/ProcessingProgress'
import { VideoPoseViewer } from './components/VideoPoseViewer'
import { usePoseEstimation } from './hooks/usePoseEstimation'
import type { PoseSequence } from './lib/poseTypes'

const TARGET_FPS = 30

type AppState = 'idle' | 'processing' | 'ready'

export function App() {
  const [state, setState] = useState<AppState>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [poseSequence, setPoseSequence] = useState<PoseSequence | null>(null)
  const { estimateSequence } = usePoseEstimation()

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
      {state === 'idle' && <FileUpload onFileSelected={handleFileSelected} />}
      {(state === 'processing' || state === 'ready') && videoUrl && (
        <>
          {state === 'processing' && <ProcessingProgress current={progress.current} total={progress.total} />}
          <VideoPoseViewer
            videoUrl={videoUrl}
            poseSequence={poseSequence}
            onVideoElementReady={handleVideoElementReady}
          />
          {state === 'ready' && <button onClick={handleReset}>Try another video</button>}
        </>
      )}
    </div>
  )
}
