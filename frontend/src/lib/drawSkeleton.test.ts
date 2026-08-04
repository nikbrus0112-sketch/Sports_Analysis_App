import { describe, expect, it, vi } from 'vitest'
import { drawSkeleton } from './drawSkeleton'
import type { Landmark } from './poseTypes'

function createMockContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
  }
}

describe('drawSkeleton', () => {
  it('does nothing when landmarks is null', () => {
    const ctx = createMockContext()
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, null, 100, 100, [])
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  it('draws a line for each connection, scaled to canvas size', () => {
    const ctx = createMockContext()
    const landmarks: Landmark[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, landmarks, 200, 100, [[0, 1]])
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 100)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('draws a dot for every landmark', () => {
    const ctx = createMockContext()
    const landmarks: Landmark[] = [
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.25, y: 0.75, z: 0 },
    ]
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, landmarks, 100, 100, [])
    expect(ctx.arc).toHaveBeenCalledTimes(2)
  })

  it('skips connections that reference a missing landmark index instead of throwing', () => {
    const ctx = createMockContext()
    const landmarks: Landmark[] = [{ x: 0, y: 0, z: 0 }]
    expect(() =>
      drawSkeleton(ctx as unknown as CanvasRenderingContext2D, landmarks, 100, 100, [[0, 5]])
    ).not.toThrow()
    expect(ctx.moveTo).not.toHaveBeenCalled()
  })
})
