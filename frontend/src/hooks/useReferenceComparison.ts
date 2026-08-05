import { useEffect, useState } from 'react'
import { fetchPoseSequence, fetchReferenceClips } from '../api/referenceClips'
import { computeCheckpointFlags, type CheckpointFlag } from '../lib/checkpointFlags'
import { dtw } from '../lib/dtw'
import { computeFeatureVectors } from '../lib/featureVector'
import type { PoseSequence } from '../lib/poseTypes'

// Only motion in the reference library so far — the spec's "fixed list"
// requirement (build-order step 1) is trivially satisfied by there being
// exactly one option. A motion picker is future work once a second motion
// type exists (build-order step 7).
const MOTION_TYPE = 'freestyle'

export type ComparisonResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no-reference-available' }
  | { status: 'error' }
  | {
      status: 'ready'
      referenceVideoUrl: string
      referenceSequence: PoseSequence
      path: [number, number][]
      flags: CheckpointFlag[]
    }

const IDLE: ComparisonResult = { status: 'idle' }
const LOADING: ComparisonResult = { status: 'loading' }
const NO_REFERENCE_AVAILABLE: ComparisonResult = { status: 'no-reference-available' }
const ERROR: ComparisonResult = { status: 'error' }

/**
 * Fetches a reference clip for the (currently hardcoded) motion type, then
 * computes DTW alignment + checkpoint flags against the user's sequence once
 * both pose sequences exist. Mirrors AlignmentToolApp.tsx's DTW useEffect,
 * plus the async fetch step this milestone adds. Multi-reference cycling
 * (spec item 8) is out of scope — always picks the first clip that has both
 * a video and pose data URL.
 */
export function useReferenceComparison(userSequence: PoseSequence | null): ComparisonResult {
  const [result, setResult] = useState<ComparisonResult>(IDLE)

  useEffect(() => {
    if (!userSequence) {
      setResult(IDLE)
      return
    }

    let cancelled = false
    setResult(LOADING)

    const run = async () => {
      try {
        const clips = await fetchReferenceClips(MOTION_TYPE)
        const clip = clips.find((c) => c.video_url && c.pose_data_url)
        if (!clip || !clip.video_url || !clip.pose_data_url) {
          if (!cancelled) setResult(NO_REFERENCE_AVAILABLE)
          return
        }

        const referenceSequence = await fetchPoseSequence(clip.pose_data_url)
        if (cancelled) return

        const userVectors = computeFeatureVectors(userSequence)
        const referenceVectors = computeFeatureVectors(referenceSequence)
        const path = dtw(userVectors, referenceVectors).path
        const flags = computeCheckpointFlags(userSequence, referenceSequence, path)

        setResult({ status: 'ready', referenceVideoUrl: clip.video_url, referenceSequence, path, flags })
      } catch (err) {
        console.error('Reference comparison failed', err)
        if (!cancelled) setResult(ERROR)
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [userSequence])

  return result
}
