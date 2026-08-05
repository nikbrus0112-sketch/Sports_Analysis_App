import { useEffect, useRef, useState } from 'react'
import { fetchPoseSequence, fetchReferenceClips, type ReferenceClip } from '../api/referenceClips'
import { computeCheckpointFlags, type CheckpointFlag } from '../lib/checkpointFlags'
import { dtw } from '../lib/dtw'
import { computeFeatureVectors } from '../lib/featureVector'
import type { PoseSequence } from '../lib/poseTypes'

interface Alignment {
  referenceVideoUrl: string
  referenceSequence: PoseSequence
  path: [number, number][]
  flags: CheckpointFlag[]
}

export type ComparisonResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no-reference-available' }
  | { status: 'error' }
  | ({
      status: 'ready'
      referenceClips: ReferenceClip[]
      selectedClipIndex: number
      selectReferenceClip: (index: number) => void
    } & Alignment)

const IDLE: ComparisonResult = { status: 'idle' }
const LOADING: ComparisonResult = { status: 'loading' }
const NO_REFERENCE_AVAILABLE: ComparisonResult = { status: 'no-reference-available' }
const ERROR: ComparisonResult = { status: 'error' }

// Wraps any integer (including negative or over-length) into a valid array
// index — "cycle" is the spec's own word for this feature, so wrap-around
// (not clamping) is the hook's own contract, independent of what UI drives it.
function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length
}

/**
 * Fetches the full reference-clip list for the given motion type, then
 * fetches + aligns whichever clip is currently selected. selectReferenceClip
 * lets a caller cycle between clips once the library has more than one
 * (spec build-order step 6 / V1 item 8). Per-clip pose data is cached (by
 * clip id) so re-selecting an already-viewed clip skips the network fetch —
 * DTW/checkpoint-flags are still recomputed every time (cheap, pure,
 * deterministic).
 */
export function useReferenceComparison(userSequence: PoseSequence | null, motionType: string): ComparisonResult {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'no-reference-available' | 'error' | 'ready'>('idle')
  const [referenceClips, setReferenceClips] = useState<ReferenceClip[]>([])
  const [selectedClipIndex, setSelectedClipIndex] = useState(0)
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const poseCache = useRef(new Map<string, PoseSequence>())

  // Effect 1: fetch the clip list whenever the user's own sequence or the
  // selected motion type changes. A motion change resets state and refetches
  // exactly like a new user clip does — no stale clips from the old motion
  // are ever shown under the new selection.
  useEffect(() => {
    if (!userSequence) {
      setPhase('idle')
      setReferenceClips([])
      setSelectedClipIndex(0)
      setAlignment(null)
      return
    }

    let cancelled = false
    setPhase('loading')
    setReferenceClips([])
    setSelectedClipIndex(0)
    setAlignment(null)

    fetchReferenceClips(motionType)
      .then((clips) => {
        if (cancelled) return
        const validClips = clips.filter((c) => c.video_url && c.pose_data_url)
        if (validClips.length === 0) {
          setPhase('no-reference-available')
          return
        }
        setReferenceClips(validClips)
      })
      .catch((err) => {
        console.error('Reference comparison failed', err)
        if (!cancelled) setPhase('error')
      })

    return () => {
      cancelled = true
    }
  }, [userSequence, motionType])

  // Effect 2: (re)compute alignment for whichever clip is currently selected.
  useEffect(() => {
    if (!userSequence || referenceClips.length === 0) return

    const index = wrapIndex(selectedClipIndex, referenceClips.length)
    const clip = referenceClips[index]
    const clipVideoUrl = clip.video_url
    const clipPoseDataUrl = clip.pose_data_url
    if (!clipVideoUrl || !clipPoseDataUrl) return // defensive; effect 1 already filters these out

    let cancelled = false
    setPhase('loading')

    const run = async () => {
      try {
        let referenceSequence = poseCache.current.get(clip.id)
        if (!referenceSequence) {
          referenceSequence = await fetchPoseSequence(clipPoseDataUrl)
          if (cancelled) return
          poseCache.current.set(clip.id, referenceSequence)
        }

        const userVectors = computeFeatureVectors(userSequence)
        const referenceVectors = computeFeatureVectors(referenceSequence)
        const path = dtw(userVectors, referenceVectors).path
        const flags = computeCheckpointFlags(userSequence, referenceSequence, path)

        if (cancelled) return
        setAlignment({ referenceVideoUrl: clipVideoUrl, referenceSequence, path, flags })
        setPhase('ready')
      } catch (err) {
        console.error('Reference comparison failed', err)
        if (!cancelled) setPhase('error')
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [referenceClips, selectedClipIndex, userSequence])

  function selectReferenceClip(index: number) {
    setSelectedClipIndex(index)
  }

  if (phase === 'ready' && alignment) {
    return {
      status: 'ready',
      referenceClips,
      selectedClipIndex: wrapIndex(selectedClipIndex, referenceClips.length),
      selectReferenceClip,
      ...alignment,
    }
  }
  if (phase === 'loading') return LOADING
  if (phase === 'no-reference-available') return NO_REFERENCE_AVAILABLE
  if (phase === 'error') return ERROR
  return IDLE
}
