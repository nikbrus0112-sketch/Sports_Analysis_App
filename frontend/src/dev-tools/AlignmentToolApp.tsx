import { useEffect, useRef, useState } from 'react'
import { FileUpload } from '../components/FileUpload'
import { ProcessingProgress } from '../components/ProcessingProgress'
import { usePoseEstimation } from '../hooks/usePoseEstimation'
import { computeFeatureVectors } from '../lib/featureVector'
import { dtw } from '../lib/dtw'
import type { PoseSequence } from '../lib/poseTypes'

const TARGET_FPS = 30

interface ClipSlotProps {
  label: string
  testId: string
  disabled: boolean
  videoUrl: string | null
  progress: { current: number; total: number }
  sequence: PoseSequence | null
  onFileSelected: (file: File) => void
  onVideoElementReady: (video: HTMLVideoElement) => void
}

function ClipSlot({
  label,
  testId,
  disabled,
  videoUrl,
  progress,
  sequence,
  onFileSelected,
  onVideoElementReady,
}: ClipSlotProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!videoUrl) return
    const video = videoRef.current
    if (video) onVideoElementReady(video)
    // Same mount-effect wiring VideoPoseViewer uses (milestone 1) — fires on
    // mount rather than waiting for the real `loadedmetadata` DOM event, which
    // is also why this is testable in jsdom without dispatching fake events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl])

  return (
    <div>
      <h2>{label}</h2>
      {!videoUrl && <FileUpload testId={testId} disabled={disabled} onFileSelected={onFileSelected} />}
      {videoUrl && !sequence && (
        <>
          <video ref={videoRef} src={videoUrl} style={{ display: 'none' }} />
          <ProcessingProgress current={progress.current} total={progress.total} />
        </>
      )}
      {sequence && (
        <p>
          {label} processed: {sequence.frameCount} frames
        </p>
      )}
    </div>
  )
}

export function AlignmentToolApp() {
  const [userUrl, setUserUrl] = useState<string | null>(null)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [userProgress, setUserProgress] = useState({ current: 0, total: 0 })
  const [referenceProgress, setReferenceProgress] = useState({ current: 0, total: 0 })
  const [userSequence, setUserSequence] = useState<PoseSequence | null>(null)
  const [referenceSequence, setReferenceSequence] = useState<PoseSequence | null>(null)
  const [path, setPath] = useState<[number, number][] | null>(null)
  const { estimateSequence } = usePoseEstimation()

  const handleUserVideoReady = (video: HTMLVideoElement) => {
    estimateSequence(video, {
      targetFps: TARGET_FPS,
      onProgress: (current, total) => setUserProgress({ current, total }),
    }).then(setUserSequence)
  }

  const handleReferenceVideoReady = (video: HTMLVideoElement) => {
    estimateSequence(video, {
      targetFps: TARGET_FPS,
      onProgress: (current, total) => setReferenceProgress({ current, total }),
    }).then(setReferenceSequence)
  }

  useEffect(() => {
    if (!userSequence || !referenceSequence) return
    const userVectors = computeFeatureVectors(userSequence)
    const referenceVectors = computeFeatureVectors(referenceSequence)
    setPath(dtw(userVectors, referenceVectors).path)
  }, [userSequence, referenceSequence])

  return (
    <div>
      <h1>DTW alignment tool (dev only)</h1>
      <p>
        Pick two local clips. The reference clip&apos;s input stays disabled until the user clip finishes —
        MediaPipe&apos;s VIDEO mode expects one video&apos;s timestamps at a time on a shared PoseLandmarker
        instance, so processing is sequential, not parallel.
      </p>
      <ClipSlot
        label="User clip"
        testId="user-file-upload-input"
        disabled={false}
        videoUrl={userUrl}
        progress={userProgress}
        sequence={userSequence}
        onFileSelected={(file) => setUserUrl(URL.createObjectURL(file))}
        onVideoElementReady={handleUserVideoReady}
      />
      <ClipSlot
        label="Reference clip"
        testId="reference-file-upload-input"
        disabled={!userSequence}
        videoUrl={referenceUrl}
        progress={referenceProgress}
        sequence={referenceSequence}
        onFileSelected={(file) => setReferenceUrl(URL.createObjectURL(file))}
        onVideoElementReady={handleReferenceVideoReady}
      />
      {path && (
        <table>
          <thead>
            <tr>
              <th>User frame</th>
              <th>Reference frame</th>
            </tr>
          </thead>
          <tbody>
            {path.map(([userIdx, refIdx], i) => (
              <tr key={i}>
                <td>{userIdx}</td>
                <td>{refIdx}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
