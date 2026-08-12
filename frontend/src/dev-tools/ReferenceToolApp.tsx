import { useCallback, useState } from 'react'
import { FileUpload } from '../components/FileUpload'
import { ProcessingProgress } from '../components/ProcessingProgress'
import { VideoPoseViewer } from '../components/VideoPoseViewer'
import { usePoseEstimation } from '../hooks/usePoseEstimation'
import type { PoseSequence } from '../lib/poseTypes'

const TARGET_FPS = 30

type ToolState = 'idle' | 'processing' | 'ready'

export function ReferenceToolApp() {
  const [state, setState] = useState<ToolState>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
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
        setDownloadUrl(URL.createObjectURL(new Blob([JSON.stringify(sequence)], { type: 'application/json' })))
        setState('ready')
      }
      run()
    },
    [estimateSequence]
  )

  const handleReset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setVideoUrl(null)
    setDownloadUrl(null)
    setPoseSequence(null)
    setState('idle')
  }

  return (
    <div>
      <h1>Reference clip pose tool (dev only)</h1>
      <p>
        Pick a local clip, let it process, then download pose.json and place it under
        backend/reference_clips/&lt;motion_type&gt;/&lt;clip_id&gt;/ alongside a video file and a hand-written
        metadata.json.
      </p>
      {state === 'idle' && <FileUpload onFileSelected={handleFileSelected} />}
      {(state === 'processing' || state === 'ready') && videoUrl && (
        <>
          {state === 'processing' && <ProcessingProgress current={progress.current} total={progress.total} />}
          <VideoPoseViewer
            videoUrl={videoUrl}
            poseSequence={poseSequence}
            onVideoElementReady={handleVideoElementReady}
          />
          {state === 'ready' && downloadUrl && (
            <>
              <a href={downloadUrl} download="pose.json">
                Download pose.json
              </a>
              <button onClick={handleReset}>Process another clip</button>
            </>
          )}
        </>
      )}
    </div>
  )
}
