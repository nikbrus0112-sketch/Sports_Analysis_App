import { describe, expect, it } from 'vitest'
import { computeSubjectBox, computeSubjectCenters, cropStyle, positionBoxAt, unifyAspectRatio } from './subjectCrop'
import type { Landmark, PoseFrame, PoseSequence } from './poseTypes'

const BODY_LANDMARK_COUNT = 22 // indices 11-32
const FACE_LANDMARK_COUNT = 11 // indices 0-10

function landmark(x: number, y: number, visibility?: number): Landmark {
  return { x, y, z: 0, visibility }
}

function frameWithBody(x: number, y: number, visibility?: number): Landmark[] {
  const face = Array.from({ length: FACE_LANDMARK_COUNT }, () => landmark(0, 0))
  const body = Array.from({ length: BODY_LANDMARK_COUNT }, () => landmark(x, y, visibility))
  return [...face, ...body]
}

function makeSequence(
  videoWidth: number,
  videoHeight: number,
  frameLandmarks: (Landmark[] | null)[]
): PoseSequence {
  const frames: PoseFrame[] = frameLandmarks.map((landmarks, i) => ({
    frameIndex: i,
    timestampMs: i * (1000 / 30),
    landmarksRaw: landmarks,
    landmarksSmoothed: landmarks,
  }))
  return {
    videoDurationMs: frames.length * (1000 / 30),
    videoWidth,
    videoHeight,
    targetFps: 30,
    frameCount: frames.length,
    frames,
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

// 46 frames at x=y=0.3 and 46 frames at x=y=0.7 (normalized), videoWidth=videoHeight=1000.
// p5 lands exactly on the 0.3 group, p95 exactly on the 0.7 group (see plan's hand-derivation),
// giving a clean pre-padding box of x:300,y:300,width:400,height:400, and after 15% padding +
// clamping to [0,1000]x[0,1000]: {x:240,y:240,width:520,height:520}.
function baselineClusterFrames(): (Landmark[] | null)[] {
  const low = Array.from({ length: 46 }, () => frameWithBody(0.3, 0.3))
  const high = Array.from({ length: 46 }, () => frameWithBody(0.7, 0.7))
  return [...low, ...high]
}

const BASELINE_BOX = { x: 240, y: 240, width: 520, height: 520 }

describe('computeSubjectBox', () => {
  it('falls back to the full frame when every frame has null landmarks', () => {
    const sequence = makeSequence(640, 480, [null, null, null])
    expect(computeSubjectBox(sequence)).toEqual({ x: 0, y: 0, width: 640, height: 480 })
  })

  it('falls back to the full frame when the percentiled box degenerates to zero size', () => {
    const frames = Array.from({ length: 10 }, () => frameWithBody(0.5, 0.5))
    const sequence = makeSequence(640, 480, frames)
    expect(computeSubjectBox(sequence)).toEqual({ x: 0, y: 0, width: 640, height: 480 })
  })

  it('computes a padded, percentile-based box for a typical cluster of landmarks', () => {
    const sequence = makeSequence(1000, 1000, baselineClusterFrames())
    expect(computeSubjectBox(sequence)).toEqual(BASELINE_BOX)
  })

  it('rejects outlier frames via percentiling instead of raw min/max', () => {
    const lowOutliers = Array.from({ length: 4 }, () => frameWithBody(0.01, 0.01))
    const highOutliers = Array.from({ length: 4 }, () => frameWithBody(0.99, 0.99))
    const frames = [...lowOutliers, ...baselineClusterFrames(), ...highOutliers]
    const sequence = makeSequence(1000, 1000, frames)
    // Same exact box as the outlier-free baseline — the 4-frame outlier groups on each
    // end are small enough (4 of 100 frames) to fall entirely outside the 5th/95th
    // percentile cutoffs and have zero effect on the result.
    expect(computeSubjectBox(sequence)).toEqual(BASELINE_BOX)
  })

  it('excludes landmarks whose visibility is below the threshold', () => {
    const lowVisibilityOutliers = Array.from({ length: 20 }, () => frameWithBody(0.99, 0.99, 0.4))
    const sequence = makeSequence(1000, 1000, [...baselineClusterFrames(), ...lowVisibilityOutliers])
    expect(computeSubjectBox(sequence)).toEqual(BASELINE_BOX)
  })

  it('includes landmarks whose visibility is above the threshold, and undefined visibility behaves the same as above-threshold', () => {
    const aboveThreshold = makeSequence(1000, 1000, [
      ...baselineClusterFrames(),
      ...Array.from({ length: 20 }, () => frameWithBody(0.99, 0.99, 0.6)),
    ])
    const undefinedVisibility = makeSequence(1000, 1000, [
      ...baselineClusterFrames(),
      ...Array.from({ length: 20 }, () => frameWithBody(0.99, 0.99, undefined)),
    ])
    const aboveThresholdBox = computeSubjectBox(aboveThreshold)
    const undefinedVisibilityBox = computeSubjectBox(undefinedVisibility)

    // Both "counts" cases should agree with each other...
    expect(undefinedVisibilityBox).toEqual(aboveThresholdBox)
    // ...and both should differ from the baseline (the extra high-value points pulled the box outward).
    expect(aboveThresholdBox.x + aboveThresholdBox.width).toBeGreaterThan(BASELINE_BOX.x + BASELINE_BOX.width)
  })

  it('never lets face landmarks (indices 0-10) affect the box', () => {
    const frames = baselineClusterFrames().map((landmarks) => {
      if (!landmarks) return landmarks
      const withExtremeFace = landmarks.map((lm, i) => (i < FACE_LANDMARK_COUNT ? landmark(1, 1) : lm))
      return withExtremeFace
    })
    const sequence = makeSequence(1000, 1000, frames)
    expect(computeSubjectBox(sequence)).toEqual(BASELINE_BOX)
  })

  it('shifts the padded box to stay in bounds rather than truncating it, when the video is big enough', () => {
    const low = Array.from({ length: 46 }, () => frameWithBody(0.01, 0.01)) // pixel 10
    const high = Array.from({ length: 46 }, () => frameWithBody(0.11, 0.11)) // pixel 110
    const sequence = makeSequence(1000, 1000, [...low, ...high])
    // Pre-padding box: x:10, width:100. Padding (15%): x:-5, width:130 — would go negative.
    // Shift-preserving clamp brings x to 0 while keeping the full width:130 (not truncated to 125).
    expect(computeSubjectBox(sequence)).toEqual({ x: 0, y: 0, width: 130, height: 130 })
  })

  it('caps the box at the full video size when the padded box is bigger than the video itself', () => {
    const low = Array.from({ length: 46 }, () => frameWithBody(0.1, 0.1)) // pixel 10 of 100
    const high = Array.from({ length: 46 }, () => frameWithBody(0.9, 0.9)) // pixel 90 of 100
    const sequence = makeSequence(100, 100, [...low, ...high])
    // Pre-padding box: x:10, width:80. Padded: x:-2, width:104 — wider than the 100px video.
    expect(computeSubjectBox(sequence)).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })
})

describe('unifyAspectRatio', () => {
  const boxA = { x: 50, y: 25, width: 200, height: 100 } // AR 2
  const boxB = { x: 25, y: 30, width: 100, height: 100 } // AR 1

  it('expands the narrower box to match the wider box, keeping its center and never touching height', () => {
    const [outA, outB] = unifyAspectRatio(boxA, 300, 150, boxB, 300, 200)
    expect(outA).toEqual(boxA)
    expect(outB).toEqual({ x: 0, y: 30, width: 200, height: 100 })
  })

  it('is symmetric: expands whichever box is passed as the narrower one', () => {
    const [outB, outA] = unifyAspectRatio(boxB, 300, 200, boxA, 300, 150)
    expect(outA).toEqual(boxA)
    expect(outB).toEqual({ x: 0, y: 30, width: 200, height: 100 })
  })

  it('never shrinks width and never changes height', () => {
    const [outA, outB] = unifyAspectRatio(boxA, 300, 150, boxB, 300, 200)
    expect(outA.width).toBeGreaterThanOrEqual(boxA.width)
    expect(outB.width).toBeGreaterThanOrEqual(boxB.width)
    expect(outA.height).toBe(boxA.height)
    expect(outB.height).toBe(boxB.height)
  })

  it('crops height (instead of silently reverting the aspect ratio) when the video is not even wide enough to pad to the target width', () => {
    const [, outB] = unifyAspectRatio(boxA, 300, 150, boxB, 180, 200)
    // boxB would need width 200 to hit AR 2, but its video is only 180px wide — so
    // height crops down to 90 (180/2) instead, recentered, and the result still has
    // EXACTLY the target aspect ratio (never silently mismatched).
    expect(outB).toEqual({ x: 0, y: 35, width: 180, height: 90 })
    expect(outB.width / outB.height).toBeCloseTo(2, 10)
  })

  it('always produces exactly matching aspect ratios on both boxes, even when one video cannot accommodate width padding', () => {
    // Mirrors the real app's two clips: a 720x1280 portrait phone video vs an
    // 854x476 landscape clip — the portrait video's own width (720) can never be
    // padded out to landscape's implied width, so this must crop height instead.
    const portraitBox = { x: 0, y: 0, width: 720, height: 1280 }
    const landscapeBox = { x: 0, y: 0, width: 854, height: 476 }
    const [outPortrait, outLandscape] = unifyAspectRatio(portraitBox, 720, 1280, landscapeBox, 854, 476)
    expect(outPortrait.width / outPortrait.height).toBeCloseTo(outLandscape.width / outLandscape.height, 10)
  })

  it('does not shrink either box on near-equal, floating-point-noise aspect ratios', () => {
    const almostA = { x: 50, y: 25, width: 200.0000001, height: 100 }
    const [outAlmostA, outB] = unifyAspectRatio(almostA, 300, 150, boxB, 300, 200)
    expect(outAlmostA.width).toBeGreaterThanOrEqual(almostA.width)
    expect(outB.width).toBeGreaterThanOrEqual(boxB.width)
  })
})

describe('cropStyle', () => {
  it('is the identity transform when the box is the full video', () => {
    expect(cropStyle({ x: 0, y: 0, width: 640, height: 480 }, 640, 480)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      maxWidth: 'none',
      maxHeight: 'none',
    })
  })

  it('computes width/height/left/top percentages for a cropped box', () => {
    expect(cropStyle({ x: 0, y: 0, width: 100, height: 100 }, 200, 100)).toEqual({
      position: 'absolute',
      width: '200%',
      height: '100%',
      left: '0%',
      top: '0%',
      maxWidth: 'none',
      maxHeight: 'none',
    })
  })

  it('computes a negative left offset for a box shifted away from the origin', () => {
    expect(cropStyle({ x: 50, y: 0, width: 100, height: 100 }, 200, 100)).toEqual({
      position: 'absolute',
      width: '200%',
      height: '100%',
      left: '-50%',
      top: '0%',
      maxWidth: 'none',
      maxHeight: 'none',
    })
  })

  it('handles a non-trivial box on a differently-sized video', () => {
    expect(cropStyle({ x: 60, y: 15, width: 150, height: 75 }, 300, 150)).toEqual({
      position: 'absolute',
      width: '200%',
      height: '200%',
      left: '-40%',
      top: '-20%',
      maxWidth: 'none',
      maxHeight: 'none',
    })
  })

  it('overrides Tailwind preflight max-width/max-height so the zoomed-in crop is not silently clamped', () => {
    const style = cropStyle({ x: 0, y: 0, width: 100, height: 100 }, 400, 400)
    expect(style.maxWidth).toBe('none')
    expect(style.maxHeight).toBe('none')
  })
})

describe('computeSubjectCenters', () => {
  it('returns the fallback for every frame when landmarks are always null', () => {
    const sequence = makeSequence(640, 480, [null, null, null])
    const fallback = { x: 100, y: 200 }
    expect(computeSubjectCenters(sequence, fallback)).toEqual([fallback, fallback, fallback])
  })

  it('converges to and stays at the exact position of a fully stationary subject', () => {
    const frames = Array.from({ length: 5 }, () => frameWithBody(0.5, 0.5))
    const sequence = makeSequence(1000, 1000, frames)
    const centers = computeSubjectCenters(sequence, { x: 0, y: 0 })
    // OneEuroFilter's low-pass recurrence collapses to exactly the input value once the
    // new raw value equals the previous smoothed value (see plan derivation) — safe to
    // assert exact equality here, not toBeCloseTo.
    expect(centers).toEqual(Array(5).fill({ x: 500, y: 500 }))
  })

  it('holds the last smoothed center across a mid-sequence gap instead of falling back', () => {
    const frames = [frameWithBody(0.5, 0.5), null, null, frameWithBody(0.5, 0.5)]
    const sequence = makeSequence(1000, 1000, frames)
    // fallback deliberately different from the real position, so a bug that returns
    // fallback during the gap (instead of holding) would be caught.
    const centers = computeSubjectCenters(sequence, { x: 1, y: 1 })
    expect(centers[0]).toEqual({ x: 500, y: 500 })
    expect(centers[1]).toEqual(centers[0])
    expect(centers[2]).toEqual(centers[0])
    expect(centers[3]).toEqual(centers[0])
  })

  it('returns the fallback through a leading gap, then the raw value on first detection', () => {
    const frames = [null, null, frameWithBody(0.5, 0.3)]
    const sequence = makeSequence(1000, 1000, frames)
    const fallback = { x: 1, y: 1 }
    const centers = computeSubjectCenters(sequence, fallback)
    expect(centers[0]).toEqual(fallback)
    expect(centers[1]).toEqual(fallback)
    // First-ever real detection: OneEuroFilter's first call returns the raw value unchanged.
    expect(centers[2]).toEqual({ x: 500, y: 300 })
  })

  it('lags behind a sudden position change instead of jumping to it instantly', () => {
    const stationary = Array.from({ length: 5 }, () => frameWithBody(0.1, 0.1))
    const jump = frameWithBody(0.3, 0.1)
    const sequence = makeSequence(1000, 1000, [...stationary, jump])
    const centers = computeSubjectCenters(sequence, { x: 0, y: 0 })
    expect(centers[4]).toEqual({ x: 100, y: 100 })
    expect(centers[5].x).toBeGreaterThan(100)
    expect(centers[5].x).toBeLessThan(300)
    expect(centers[5].y).toBe(100) // y never changed, so it stays exactly constant
  })

  it('never lets face landmarks (indices 0-10) affect the centroid', () => {
    const withExtremeFace = baselineClusterFrames().map((landmarks) => {
      if (!landmarks) return landmarks
      return landmarks.map((lm, i) => (i < FACE_LANDMARK_COUNT ? landmark(1, 1) : lm))
    })
    const sequenceA = makeSequence(1000, 1000, withExtremeFace)
    const sequenceB = makeSequence(1000, 1000, baselineClusterFrames())
    const fallback = { x: 0, y: 0 }
    expect(computeSubjectCenters(sequenceA, fallback)).toEqual(computeSubjectCenters(sequenceB, fallback))
  })

  it('excludes low-visibility landmarks from the per-frame centroid; above-threshold and undefined both count', () => {
    function mixedFrame(outlierVisibility: number | undefined): Landmark[] {
      const face = Array.from({ length: FACE_LANDMARK_COUNT }, () => landmark(0, 0))
      const body = Array.from({ length: BODY_LANDMARK_COUNT }, (_, i) =>
        i < 11 ? landmark(0.5, 0.5, 0.9) : landmark(0.99, 0.99, outlierVisibility)
      )
      return [...face, ...body]
    }
    const belowThreshold = makeSequence(1000, 1000, Array.from({ length: 3 }, () => mixedFrame(0.4)))
    const aboveThreshold = makeSequence(1000, 1000, Array.from({ length: 3 }, () => mixedFrame(0.6)))
    const undefinedVisibility = makeSequence(1000, 1000, Array.from({ length: 3 }, () => mixedFrame(undefined)))
    const fallback = { x: 0, y: 0 }

    // Only the 11 "core" landmarks (0.5,0.5 = pixel 500,500) count when the other 11 are excluded.
    expect(computeSubjectCenters(belowThreshold, fallback)).toEqual(Array(3).fill({ x: 500, y: 500 }))
    // Above-threshold and undefined both include the outlier half, pulling the centroid up, and agree with each other.
    const aboveCenters = computeSubjectCenters(aboveThreshold, fallback)
    const undefinedCenters = computeSubjectCenters(undefinedVisibility, fallback)
    expect(undefinedCenters).toEqual(aboveCenters)
    expect(aboveCenters[0].x).toBeGreaterThan(500)
  })
})

describe('positionBoxAt', () => {
  it('leaves the box unchanged when the target center already matches its own center', () => {
    const box = { x: 100, y: 50, width: 200, height: 100 }
    expect(positionBoxAt(box, { x: 200, y: 100 }, 1000, 1000)).toEqual(box)
  })

  it('shifts the box by the delta between the target center and its own center', () => {
    const box = { x: 100, y: 50, width: 200, height: 100 }
    expect(positionBoxAt(box, { x: 300, y: 150 }, 1000, 1000)).toEqual({ x: 200, y: 100, width: 200, height: 100 })
  })

  it('shifts to stay in bounds (shift-preserving clamp) rather than shrinking, near a video edge', () => {
    const box = { x: 100, y: 100, width: 200, height: 200 }
    expect(positionBoxAt(box, { x: 10, y: 10 }, 1000, 1000)).toEqual({ x: 0, y: 0, width: 200, height: 200 })
  })

  it('caps the box at the full video size when it is bigger than the video itself', () => {
    const box = { x: 0, y: 0, width: 200, height: 200 }
    expect(positionBoxAt(box, { x: 50, y: 50 }, 100, 100)).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })
})
