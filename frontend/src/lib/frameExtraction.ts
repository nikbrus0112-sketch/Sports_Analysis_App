export function computeFrameCount(durationSec: number, targetFps: number): number {
  return Math.max(1, Math.floor(durationSec * targetFps))
}

export function frameTimestampMs(frameIndex: number, targetFps: number): number {
  return Math.round(frameIndex * (1000 / targetFps))
}

export function frameIndexForTime(currentTimeSec: number, targetFps: number, frameCount: number): number {
  const idx = Math.round(currentTimeSec * targetFps)
  return Math.min(Math.max(idx, 0), frameCount - 1)
}

export function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      requestAnimationFrame(() => resolve())
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = timeSec
  })
}

const HAVE_METADATA_READY_STATE = 1

export function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HAVE_METADATA_READY_STATE) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onError)
    }
    const onLoadedMetadata = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video failed to load before metadata was available'))
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('error', onError)
  })
}
