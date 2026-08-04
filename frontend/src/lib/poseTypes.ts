export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export interface PoseFrame {
  frameIndex: number
  timestampMs: number
  landmarksRaw: Landmark[] | null
  landmarksSmoothed: Landmark[] | null
  worldLandmarksRaw?: Landmark[] | null
}

export interface PoseSequence {
  videoDurationMs: number
  videoWidth: number
  videoHeight: number
  targetFps: number
  frameCount: number
  frames: PoseFrame[]
  modelInfo: { variant: 'lite' | 'full' | 'heavy'; delegate: 'GPU' | 'CPU' }
}
