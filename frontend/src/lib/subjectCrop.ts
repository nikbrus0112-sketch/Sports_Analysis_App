import type { CSSProperties } from 'react'
import { OneEuroFilter } from './oneEuroFilter'
import type { Landmark, PoseSequence } from './poseTypes'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface ComputeSubjectBoxOptions {
  visibilityThreshold?: number
  percentile?: number
  padding?: number
}

const DEFAULT_VISIBILITY_THRESHOLD = 0.5
const DEFAULT_PERCENTILE = 5
const DEFAULT_PADDING = 0.15

// MediaPipe BlazePose 33-point topology: 0-10 are face landmarks (irrelevant
// for framing a swimmer/athlete), 11-32 are shoulders through feet.
const BODY_LANDMARK_START = 11
const BODY_LANDMARK_END = 32

function percentile(sortedValues: number[], p: number): number {
  const index = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length))
  return sortedValues[index]
}

function fullFrameBox(videoWidth: number, videoHeight: number): Box {
  return { x: 0, y: 0, width: videoWidth, height: videoHeight }
}

// Slides a box into [0,videoWidth]x[0,videoHeight], preserving its full size
// whenever it fits — only shrinks a dimension that's literally bigger than
// the video. A naive min/max-based clamp would truncate padding right back
// off at the edges instead of just repositioning the box.
export function clampBoxToVideo(box: Box, videoWidth: number, videoHeight: number): Box {
  const width = Math.min(box.width, videoWidth)
  const height = Math.min(box.height, videoHeight)
  const x = Math.min(Math.max(box.x, 0), videoWidth - width)
  const y = Math.min(Math.max(box.y, 0), videoHeight - height)
  return { x, y, width, height }
}

export function boxCenter(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// Shared by computeSubjectBox (whole-clip percentile) and computeSubjectCenters
// (per-frame centroid): the qualifying body-landmark points (11-32, excludes
// the 11 face landmarks, visibility-gated) for one frame, in pixel space.
function frameBodyPoints(
  landmarks: Landmark[] | null,
  videoWidth: number,
  videoHeight: number,
  visibilityThreshold: number
): Point[] {
  if (!landmarks) return []
  const points: Point[] = []
  for (let i = BODY_LANDMARK_START; i <= BODY_LANDMARK_END; i++) {
    const lm = landmarks[i]
    if (!lm) continue
    if (lm.visibility !== undefined && lm.visibility < visibilityThreshold) continue
    points.push({ x: lm.x * videoWidth, y: lm.y * videoHeight })
  }
  return points
}

/**
 * Whole-clip subject bounding box, in the sequence's own native pixel space.
 * Uses a percentile (not raw min/max) over all body landmarks across every
 * frame to reject outlier/misdetected frames, then pads and clamps.
 */
export function computeSubjectBox(sequence: PoseSequence, options: ComputeSubjectBoxOptions = {}): Box {
  const visibilityThreshold = options.visibilityThreshold ?? DEFAULT_VISIBILITY_THRESHOLD
  const p = options.percentile ?? DEFAULT_PERCENTILE
  const padding = options.padding ?? DEFAULT_PADDING
  const { videoWidth, videoHeight } = sequence

  const xs: number[] = []
  const ys: number[] = []
  for (const frame of sequence.frames) {
    for (const p of frameBodyPoints(frame.landmarksSmoothed, videoWidth, videoHeight, visibilityThreshold)) {
      xs.push(p.x)
      ys.push(p.y)
    }
  }

  if (xs.length === 0) return fullFrameBox(videoWidth, videoHeight)

  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)

  const x0 = percentile(xs, p)
  const x1 = percentile(xs, 100 - p)
  const y0 = percentile(ys, p)
  const y1 = percentile(ys, 100 - p)
  const rawWidth = x1 - x0
  const rawHeight = y1 - y0

  if (rawWidth <= 0 || rawHeight <= 0) return fullFrameBox(videoWidth, videoHeight)

  const padX = rawWidth * padding
  const padY = rawHeight * padding
  const padded: Box = {
    x: x0 - padX,
    y: y0 - padY,
    width: rawWidth + 2 * padX,
    height: rawHeight + 2 * padY,
  }

  return clampBoxToVideo(padded, videoWidth, videoHeight)
}

// Expands box width to reach targetAspectRatio, preferring to pad (never
// touching height) when the video is wide enough to hold the padded width.
// If the video itself isn't wide enough — e.g. a portrait phone clip paired
// against a wide landscape clip, where no amount of padding within the
// portrait video's own pixels can reach a landscape ratio — the only way to
// actually reach targetAspectRatio is to crop height down to what the full
// video width supports, recentered on the box's original vertical center.
// This guarantees the output ALWAYS has exactly targetAspectRatio (never
// silently falls back to a mismatched ratio), which is what the shared CSS
// aspect-ratio container relies on.
function fitToAspectRatio(box: Box, targetAspectRatio: number, videoWidth: number, videoHeight: number): Box {
  const desiredWidth = box.height * targetAspectRatio
  if (desiredWidth <= box.width) return box

  const centerX = box.x + box.width / 2

  if (desiredWidth <= videoWidth) {
    return clampBoxToVideo({ x: centerX - desiredWidth / 2, y: box.y, width: desiredWidth, height: box.height }, videoWidth, videoHeight)
  }

  const centerY = box.y + box.height / 2
  const width = videoWidth
  const height = width / targetAspectRatio
  return clampBoxToVideo({ x: centerX - width / 2, y: centerY - height / 2, width, height }, videoWidth, videoHeight)
}

/**
 * Fits each box to a shared aspect ratio (the wider of the two), preferring
 * to pad width without touching height, but cropping height when the
 * video's own width can't accommodate enough padding. Re-clamps each into
 * its own (possibly differently-sized) video's bounds.
 */
export function unifyAspectRatio(
  boxA: Box,
  videoWidthA: number,
  videoHeightA: number,
  boxB: Box,
  videoWidthB: number,
  videoHeightB: number
): [Box, Box] {
  const targetAspectRatio = Math.max(boxA.width / boxA.height, boxB.width / boxB.height)
  const fittedA = fitToAspectRatio(boxA, targetAspectRatio, videoWidthA, videoHeightA)
  const fittedB = fitToAspectRatio(boxB, targetAspectRatio, videoWidthB, videoHeightB)
  return [fittedA, fittedB]
}

/**
 * Percentage-based CSS to crop+zoom a video/canvas element to `box`. Relies
 * on the containing element having `aspect-ratio: box.width / box.height`
 * set — that equality is what forces the width-scale and height-scale
 * percentages below to represent one uniform scale (a true crop, not a
 * stretch). Apply the identical style to both the <video> and its sibling
 * skeleton <canvas> so they stay pixel-aligned.
 *
 * maxWidth/maxHeight: 'none' overrides Tailwind's preflight `max-width:100%`
 * reset on <video> elements, which otherwise silently caps the zoomed-in
 * width (often >100%) while height scales correctly, producing a distorted,
 * mispositioned crop — confirmed live against real footage.
 */
export function cropStyle(box: Box, videoWidth: number, videoHeight: number): CSSProperties {
  return {
    position: 'absolute',
    width: `${(videoWidth / box.width) * 100}%`,
    height: `${(videoHeight / box.height) * 100}%`,
    left: `${-(box.x / box.width) * 100}%`,
    top: `${-(box.y / box.height) * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
  }
}

export interface ComputeSubjectCentersOptions {
  visibilityThreshold?: number
}

/**
 * Per-frame subject centroid, smoothed over time with a OneEuroFilter per
 * axis (same class/defaults already used for landmark smoothing in
 * oneEuroFilter.ts). On a frame with no qualifying landmarks, holds the last
 * smoothed center (or `fallback` if none has occurred yet) without advancing
 * the filter — matches computeAngleRows' established "hold last valid value
 * across null-landmark gaps" convention. Always returns exactly
 * `sequence.frames.length` entries, never null.
 */
export function computeSubjectCenters(
  sequence: PoseSequence,
  fallback: Point,
  options: ComputeSubjectCentersOptions = {}
): Point[] {
  const visibilityThreshold = options.visibilityThreshold ?? DEFAULT_VISIBILITY_THRESHOLD
  const { videoWidth, videoHeight } = sequence
  const xFilter = new OneEuroFilter()
  const yFilter = new OneEuroFilter()
  let lastSmoothed: Point | null = null

  // ponytail: per-frame mean, not percentile — a single frame's ~22 body
  // points don't have the population size percentile trimming needs; the
  // temporal smoothing below already dampens single-frame outlier noise.
  return sequence.frames.map((frame) => {
    const points = frameBodyPoints(frame.landmarksSmoothed, videoWidth, videoHeight, visibilityThreshold)
    if (points.length === 0) return lastSmoothed ?? fallback

    const rawX = points.reduce((sum, p) => sum + p.x, 0) / points.length
    const rawY = points.reduce((sum, p) => sum + p.y, 0) / points.length
    lastSmoothed = { x: xFilter.filter(rawX, frame.timestampMs), y: yFilter.filter(rawY, frame.timestampMs) }
    return lastSmoothed
  })
}

/** Re-centers a fixed-size box on `center`, clamped into the video's bounds. */
export function positionBoxAt(box: Box, center: Point, videoWidth: number, videoHeight: number): Box {
  return clampBoxToVideo(
    { x: center.x - box.width / 2, y: center.y - box.height / 2, width: box.width, height: box.height },
    videoWidth,
    videoHeight
  )
}
