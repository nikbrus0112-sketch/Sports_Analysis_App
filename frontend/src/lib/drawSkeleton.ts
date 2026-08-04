import type { Landmark } from './poseTypes'

export interface DrawSkeletonOptions {
  color?: string
  radius?: number
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[] | null,
  canvasWidth: number,
  canvasHeight: number,
  connections: readonly (readonly [number, number])[],
  options: DrawSkeletonOptions = {}
): void {
  if (!landmarks) return

  const color = options.color ?? '#00FF00'
  const radius = options.radius ?? 3

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color

  for (const [startIdx, endIdx] of connections) {
    const start = landmarks[startIdx]
    const end = landmarks[endIdx]
    if (!start || !end) continue
    ctx.beginPath()
    ctx.moveTo(start.x * canvasWidth, start.y * canvasHeight)
    ctx.lineTo(end.x * canvasWidth, end.y * canvasHeight)
    ctx.stroke()
  }

  for (const landmark of landmarks) {
    ctx.beginPath()
    ctx.arc(landmark.x * canvasWidth, landmark.y * canvasHeight, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
