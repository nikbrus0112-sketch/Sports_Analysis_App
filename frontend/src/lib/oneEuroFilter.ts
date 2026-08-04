import type { PoseFrame } from './poseTypes'

class LowPassFilter {
  private y: number | null = null
  private s: number | null = null

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value
    } else {
      this.s = alpha * value + (1 - alpha) * (this.s as number)
    }
    this.y = value
    return this.s as number
  }

  lastValue(): number | null {
    return this.y
  }
}

function smoothingFactor(cutoff: number, dt: number): number {
  const r = 2 * Math.PI * cutoff * dt
  return r / (r + 1)
}

export interface OneEuroFilterOptions {
  minCutoff?: number
  beta?: number
  dCutoff?: number
}

export class OneEuroFilter {
  private minCutoff: number
  private beta: number
  private dCutoff: number
  private xFilter = new LowPassFilter()
  private dxFilter = new LowPassFilter()
  private lastTimestampMs: number | null = null

  constructor(options: OneEuroFilterOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1.0
    this.beta = options.beta ?? 0.007
    this.dCutoff = options.dCutoff ?? 1.0
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs
      this.xFilter.filter(value, 1)
      return value
    }

    const dt = Math.max((timestampMs - this.lastTimestampMs) / 1000, 1e-3)
    this.lastTimestampMs = timestampMs

    const prevValue = this.xFilter.lastValue() ?? value
    const dx = (value - prevValue) / dt
    const edx = this.dxFilter.filter(dx, smoothingFactor(this.dCutoff, dt))

    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.xFilter.filter(value, smoothingFactor(cutoff, dt))
  }
}

const NUM_LANDMARKS = 33
const AXES = ['x', 'y', 'z'] as const

export function smoothSequence(frames: PoseFrame[]): PoseFrame[] {
  const filters: OneEuroFilter[][] = Array.from({ length: NUM_LANDMARKS }, () =>
    AXES.map(() => new OneEuroFilter())
  )

  return frames.map((frame) => {
    if (!frame.landmarksRaw) {
      return { ...frame, landmarksSmoothed: null }
    }

    const landmarksSmoothed = frame.landmarksRaw.map((landmark, i) => ({
      x: filters[i][0].filter(landmark.x, frame.timestampMs),
      y: filters[i][1].filter(landmark.y, frame.timestampMs),
      z: filters[i][2].filter(landmark.z, frame.timestampMs),
      visibility: landmark.visibility,
    }))

    return { ...frame, landmarksSmoothed }
  })
}
