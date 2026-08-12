# Multi-Reference Cycling (Milestone 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement build-order step 6 of `sports-motion-comparison-spec.md` — "Multi-reference cycling" (spec section 6 Display: "Reference-clip cycling once the library has more than one clip per motion"; V1 scope item 8: "If more than one reference clip exists for a motion, user can cycle between them"). `useReferenceComparison` currently fetches the clip list, picks index `0`, and throws the rest away. This milestone keeps the whole filtered clip list, exposes a `selectReferenceClip(index)` action plus the currently-selected index/clip-count on the hook's `'ready'` result, caches fetched pose data per clip so re-visiting a clip is instant, and adds a small Prev/Next cycling control to `ComparisonView` that only appears once there are 2+ clips.

**Architecture:**
- `frontend/src/hooks/useReferenceComparison.ts` (modified): splits the existing single fetch-and-align effect into two effects — one that fetches the full clip list per `userSequence` change (unchanged trigger), and one that fetches/aligns whichever clip is currently selected, keyed by `[referenceClips, selectedClipIndex, userSequence]`. A `useRef<Map<string, PoseSequence>>` caches fetched pose data by clip `id` so cycling back to a previously-viewed clip skips the network fetch entirely. `selectReferenceClip(index)` stores the raw index; out-of-range values (including negative) are wrapped via modulo at read time, so the hook's own contract is robust independent of `ComparisonView`.
- `frontend/src/components/ComparisonView.tsx` (modified): three new props (`referenceClipCount`, `selectedClipIndex`, `onSelectReferenceClip`) drive a small "Clip {i+1} of {N}" + Prev/Next control, rendered only when `referenceClipCount >= 2` — zero visual change for the current one-clip-or-fewer reality. A new tiny effect resets the internal scrubber (`pairIndex`) to `0` whenever the `path` prop changes, which matters specifically for the *cache-hit* clip-switch case (see Task 2 design notes for why).
- `frontend/src/App.tsx` (modified): passes the three new props straight through from `comparison` when `status === 'ready'` — no new logic, same thin-wiring role as today.

**Tech Stack:** Same as milestones 1–5 — React 19, Vite, TypeScript, Vitest + RTL. No new dependencies.

See `docs/superpowers/specs/2026-08-04-multi-reference-cycling-milestone-6-design.md` for the design rationale.

## Global Constraints

- No new frontend dependencies.
- 2-space indentation, no semicolons — matches every existing `.ts`/`.tsx` file.
- `landmarksSmoothed`, never `landmarksRaw`, throughout (unaffected by this milestone, noted for consistency).
- Pure/hook logic (`useReferenceComparison.ts`) gets full TDD unit coverage. `ComparisonView.tsx` stays prop-driven, zero mocks, real RTL tests.
- Reuse over rebuild: selection-by-array-index mirrors the exact pattern `ComparisonView`'s own `pairIndex` scrubber already uses — no new "which one of N" abstraction invented. The DTW + checkpoint-flags pipeline (`computeFeatureVectors`/`dtw`/`computeCheckpointFlags`) is untouched, just re-invoked per selected clip.
- No non-null assertions (`!`) — this codebase has none; narrow via `if` guards on locally-bound `const`s instead (see Task 1).

---

## File Structure

```
Sports_Analysis_App/
└── frontend/
    └── src/
        ├── hooks/
        │   ├── useReferenceComparison.ts                  # modified
        │   └── useReferenceComparison.test.ts             # modified (full rewrite/extension)
        ├── components/
        │   ├── ComparisonView.tsx                          # modified
        │   └── ComparisonView.test.tsx                     # modified (extended)
        ├── App.tsx                                         # modified
        └── App.test.tsx                                    # modified (extended)
```

No new files this milestone.

---

### Task 1: `useReferenceComparison.ts` — track the full clip list, add selection + per-clip caching

**Files:**
- Modify: `frontend/src/hooks/useReferenceComparison.ts`
- Modify: `frontend/src/hooks/useReferenceComparison.test.ts`

**Interfaces:**
- Consumes: unchanged — `fetchReferenceClips`, `fetchPoseSequence` from `../api/referenceClips`; `computeFeatureVectors`; `dtw`; `computeCheckpointFlags`.
- Produces: `ComparisonResult`'s `'ready'` variant grows three fields — `referenceClips: ReferenceClip[]`, `selectedClipIndex: number`, `selectReferenceClip: (index: number) => void` — alongside the existing `referenceVideoUrl`, `referenceSequence`, `path`, `flags` (now describing the *currently selected* clip, not always clip 0).

**Design notes (read before implementing):**
- **Two effects, not one.** Effect 1 (deps `[userSequence]`) fetches the clip list, filters to clips with both `video_url` and `pose_data_url` (same filter as today, just keeping every match instead of only the first), and resets `selectedClipIndex` to `0` — a new user clip should default back to the first reference clip, not whatever was selected for the previous user clip. Effect 2 (deps `[referenceClips, selectedClipIndex, userSequence]`) fetches (or reads from cache) the selected clip's pose data and recomputes alignment. Both effects keep the existing `cancelled` stale-closure guard.
- **Selection is index-based, wrapped at read time, not clamped at write time.** `selectReferenceClip(index)` just stores the raw index via `setSelectedClipIndex(index)`. A module-level `wrapIndex(index, length)` helper (`((index % length) + length) % length`) is applied both when effect 2 picks the clip to align against *and* when building the `selectedClipIndex` field of the `'ready'` result. This means an out-of-range index a caller passes (5 with 3 clips, or `-1`) always resolves to a valid clip, and the hook never needs to reason about "what if `ComparisonView` sends something weird" — the contract holds on its own.
- **Per-clip pose cache, not per-render.** A `useRef<Map<string, PoseSequence>>` keyed by clip `id`, populated in effect 2 right after a successful `fetchPoseSequence`. Re-selecting a cached clip skips the fetch; `computeFeatureVectors`/`dtw`/`computeCheckpointFlags` are always re-run on selection (cheap, pure, deterministic — no reason to cache their output too).
- **No non-null assertions.** Effect 2 destructures `clip.video_url`/`clip.pose_data_url` into local `const`s and guards on those *before* defining the nested async `run` function — narrowing a property access directly wouldn't reliably survive into a closure defined afterward, but narrowing a local `const` identifier does.
- **A neat side effect of this structure: cache hits don't flicker to a loading state.** `setPhase('loading')` runs synchronously at the top of effect 2, then `run()` is invoked. On a cache hit, `run`'s body never hits an `await` (the cache lookup is synchronous), so it runs to completion — including `setPhase('ready')` — before the effect returns, all in the same commit. React 18's automatic batching means the component only ever sees one re-render with the final `'ready'` state. On a genuine cache miss, `await fetchPoseSequence(...)` really does yield, so `'loading'` *is* painted first.
- **Multi-reference cycling is the literal point of this feature**, so `MOTION_TYPE = 'freestyle'` hardcoding, the `'no-reference-available'` status, and the `cancelled`-guard idiom are all unchanged from milestone 5 — only the "which clip" logic changes.

- [ ] **Step 1: Rewrite the test file (write failing tests first)**

Replace `frontend/src/hooks/useReferenceComparison.test.ts` entirely with:

```ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReferenceComparison } from './useReferenceComparison'
import type { PoseSequence } from '../lib/poseTypes'

const mockFetchReferenceClips = vi.fn()
const mockFetchPoseSequence = vi.fn()
const mockComputeFeatureVectors = vi.fn()
const mockDtw = vi.fn()
const mockComputeCheckpointFlags = vi.fn()

vi.mock('../api/referenceClips', () => ({
  fetchReferenceClips: (...args: unknown[]) => mockFetchReferenceClips(...args),
  fetchPoseSequence: (...args: unknown[]) => mockFetchPoseSequence(...args),
}))
vi.mock('../lib/featureVector', () => ({
  computeFeatureVectors: (...args: unknown[]) => mockComputeFeatureVectors(...args),
}))
vi.mock('../lib/dtw', () => ({
  dtw: (...args: unknown[]) => mockDtw(...args),
}))
vi.mock('../lib/checkpointFlags', () => ({
  computeCheckpointFlags: (...args: unknown[]) => mockComputeCheckpointFlags(...args),
}))

function fakeSequence(frameCount: number): PoseSequence {
  return {
    videoDurationMs: 1000,
    videoWidth: 640,
    videoHeight: 480,
    targetFps: 30,
    frameCount,
    frames: [],
    modelInfo: { variant: 'full', delegate: 'GPU' },
  }
}

function clipFixture(id: string) {
  return {
    id,
    motion_type: 'freestyle',
    video_url: `/reference-clips/freestyle/${id}/video.mp4`,
    pose_data_url: `/reference-clips/freestyle/${id}/pose.json`,
    camera_angle_note: '',
    source_or_license_note: '',
  }
}

beforeEach(() => {
  mockFetchReferenceClips.mockReset()
  mockFetchPoseSequence.mockReset()
  mockComputeFeatureVectors.mockReset().mockReturnValue([[0]])
  mockDtw.mockReset().mockReturnValue({ path: [[0, 0]], cost: 0 })
  mockComputeCheckpointFlags.mockReset().mockReturnValue([])
})

describe('useReferenceComparison', () => {
  it('stays idle when userSequence is null', () => {
    const { result } = renderHook(() => useReferenceComparison(null))
    expect(result.current.status).toBe('idle')
    expect(mockFetchReferenceClips).not.toHaveBeenCalled()
  })

  it('resolves to no-reference-available when the library has zero clips', async () => {
    mockFetchReferenceClips.mockResolvedValue([])
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
  })

  it('resolves to no-reference-available when clips exist but none have both a video and pose data URL', async () => {
    mockFetchReferenceClips.mockResolvedValue([
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: null,
        pose_data_url: null,
        camera_angle_note: '',
        source_or_license_note: '',
      },
    ])
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
    expect(mockFetchPoseSequence).not.toHaveBeenCalled()
  })

  it('resolves to ready with the computed reference sequence, path, flags, and clip list on the happy path', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1')])
    const referenceSequence = fakeSequence(12)
    mockFetchPoseSequence.mockResolvedValue(referenceSequence)
    mockDtw.mockReturnValue({
      path: [
        [0, 0],
        [1, 1],
      ],
      cost: 1,
    })
    mockComputeCheckpointFlags.mockReturnValue([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])

    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceVideoUrl).toBe('/reference-clips/freestyle/clip-1/video.mp4')
    expect(result.current.referenceSequence).toBe(referenceSequence)
    expect(result.current.path).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(result.current.flags).toEqual([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])
    expect(result.current.referenceClips).toEqual([clipFixture('clip-1')])
    expect(result.current.selectedClipIndex).toBe(0)
  })

  it('resolves to error when fetchReferenceClips rejects', async () => {
    mockFetchReferenceClips.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('exposes every valid clip in referenceClips when the library has more than one', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1'), clipFixture('clip-2'), clipFixture('clip-3')])
    mockFetchPoseSequence.mockResolvedValue(fakeSequence(10))

    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceClips).toHaveLength(3)
    expect(result.current.selectedClipIndex).toBe(0)
  })

  it('selectReferenceClip switches to another clip, fetching its pose data and recomputing the alignment', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1'), clipFixture('clip-2'), clipFixture('clip-3')])
    const sequenceA = fakeSequence(10)
    const sequenceB = fakeSequence(20)
    mockFetchPoseSequence.mockImplementation((url: string) =>
      Promise.resolve(url.includes('clip-1') ? sequenceA : sequenceB)
    )
    mockDtw
      .mockReturnValueOnce({ path: [[0, 0]], cost: 0 })
      .mockReturnValueOnce({
        path: [
          [0, 0],
          [1, 1],
        ],
        cost: 1,
      })
    mockComputeCheckpointFlags
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])

    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockFetchPoseSequence).toHaveBeenCalledTimes(1)

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(1)
    })
    await waitFor(() => expect(mockFetchPoseSequence).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(1)
    })

    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.referenceSequence).toBe(sequenceB)
    expect(result.current.path).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(result.current.flags).toEqual([{ phase: 1, joint: 'leftElbow', userValue: 1, referenceValue: 2, delta: -1 }])
  })

  it('does not refetch pose data when re-selecting an already-fetched clip index (cache hit)', async () => {
    mockFetchReferenceClips.mockResolvedValue([clipFixture('clip-1'), clipFixture('clip-2')])
    mockFetchPoseSequence.mockImplementation((url: string) =>
      Promise.resolve(fakeSequence(url.includes('clip-1') ? 10 : 20))
    )

    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(1)
    })
    await waitFor(() => expect(mockFetchPoseSequence).toHaveBeenCalledTimes(2))

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(0)
    })
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(0)
    })

    expect(mockFetchPoseSequence).toHaveBeenCalledTimes(2) // clip-1 was cached, not refetched
  })

  it('wraps an out-of-range selectReferenceClip index via modulo, both above and below the valid range', async () => {
    mockFetchReferenceClips.mockResolvedValue([
      clipFixture('clip-1'),
      clipFixture('clip-2'),
      clipFixture('clip-3'),
      clipFixture('clip-4'),
    ])
    mockFetchPoseSequence.mockResolvedValue(fakeSequence(10))

    const { result } = renderHook(() => useReferenceComparison(fakeSequence(10)))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(5) // 5 % 4 === 1
    })
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(1)
    })

    act(() => {
      if (result.current.status === 'ready') result.current.selectReferenceClip(-1) // wraps to the last clip
    })
    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready')
      expect(result.current.selectedClipIndex).toBe(3)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify the new/changed assertions fail**

Run: `cd frontend && npm run test -- useReferenceComparison`
Expected: FAIL — the current implementation has no `referenceClips`, `selectedClipIndex`, or `selectReferenceClip` on the `'ready'` result.

- [ ] **Step 3: Rewrite the implementation**

`frontend/src/hooks/useReferenceComparison.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { fetchPoseSequence, fetchReferenceClips, type ReferenceClip } from '../api/referenceClips'
import { computeCheckpointFlags, type CheckpointFlag } from '../lib/checkpointFlags'
import { dtw } from '../lib/dtw'
import { computeFeatureVectors } from '../lib/featureVector'
import type { PoseSequence } from '../lib/poseTypes'

// Only motion in the reference library so far — see milestone 5's plan for
// the full rationale. A motion picker is future work (build-order step 7).
const MOTION_TYPE = 'freestyle'

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
 * Fetches the full reference-clip list for the (currently hardcoded) motion
 * type, then fetches + aligns whichever clip is currently selected.
 * selectReferenceClip lets a caller cycle between clips once the library has
 * more than one (spec build-order step 6 / V1 item 8). Per-clip pose data is
 * cached (by clip id) so re-selecting an already-viewed clip skips the
 * network fetch — DTW/checkpoint-flags are still recomputed every time
 * (cheap, pure, deterministic).
 */
export function useReferenceComparison(userSequence: PoseSequence | null): ComparisonResult {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'no-reference-available' | 'error' | 'ready'>('idle')
  const [referenceClips, setReferenceClips] = useState<ReferenceClip[]>([])
  const [selectedClipIndex, setSelectedClipIndex] = useState(0)
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const poseCache = useRef(new Map<string, PoseSequence>())

  // Effect 1: fetch the clip list whenever the user's own sequence changes —
  // same trigger point as before. Resets selection back to the first clip,
  // since a new user clip starting fresh should default there.
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

    fetchReferenceClips(MOTION_TYPE)
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
  }, [userSequence])

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- useReferenceComparison`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/hooks/useReferenceComparison.ts frontend/src/hooks/useReferenceComparison.test.ts
git commit -m "feat(frontend): support cycling between multiple reference clips in useReferenceComparison"
```

---

### Task 2: `ComparisonView.tsx` — Prev/Next cycling controls

**Files:**
- Modify: `frontend/src/components/ComparisonView.tsx`
- Modify: `frontend/src/components/ComparisonView.test.tsx`

**Interfaces:**
- New props: `referenceClipCount: number`, `selectedClipIndex: number`, `onSelectReferenceClip: (index: number) => void`.
- No new consumed modules.

**Design notes (read before implementing):**
- **Renders nothing new below 2 clips** — `referenceClipCount >= 2` gate, so the common near-term case of exactly one clip (or zero, which never reaches this component) is a zero-diff render, matching today's snapshot exactly.
- **Wrap-around computed here, in the click handlers** — `(selectedClipIndex + 1) % referenceClipCount` for Next, `(selectedClipIndex - 1 + referenceClipCount) % referenceClipCount` for Prev. The hook (Task 1) *also* wraps defensively on its own, so this is redundant-but-harmless belt-and-suspenders, not the only place wrap-around is enforced.
- **New: reset the internal scrubber (`pairIndex`) to `0` whenever `path` changes.** Necessary specifically for the *cache-hit* clip-switch path: when `App`'s `comparison.status` stays `'ready'` across a selection change (this happens exactly when the newly selected clip's pose data was already cached), `ComparisonView` never unmounts, so its own `pairIndex` state would otherwise survive pointing at a scrub position that may be past the end of (or simply mean something different in) the new clip's `path`. On a cache-miss switch this is moot (the intermediate `'loading'` status unmounts `ComparisonView` in `App`, so a fresh instance already starts at `pairIndex = 0`) — but the effect is needed for correctness in the case that doesn't unmount.
- **Placement:** rendered between the video panes and the scrubber — a small control row, not folded into the existing scrubber markup (different unit: "which clip", not "which frame pair").

- [ ] **Step 1: Extend the test file (write failing tests first)**

In `frontend/src/components/ComparisonView.test.tsx`, update `renderView`'s defaults and add new tests:

```tsx
function renderView(overrides: Partial<Parameters<typeof ComparisonView>[0]> = {}) {
  render(
    <ComparisonView
      userVideoUrl="blob:user"
      userSequence={fakeSequence(3)}
      referenceVideoUrl="blob:reference"
      referenceSequence={fakeSequence(3)}
      path={path}
      flags={flags}
      referenceClipCount={1}
      selectedClipIndex={0}
      onSelectReferenceClip={vi.fn()}
      {...overrides}
    />
  )
}
```

Add these tests inside `describe('ComparisonView', ...)`, after the existing 4:

```tsx
it('renders no cycling controls when there is only one reference clip', () => {
  renderView()
  expect(screen.queryByTestId('reference-clip-cycler')).not.toBeInTheDocument()
})

it('renders cycling controls with the current position when there are multiple reference clips', () => {
  renderView({ referenceClipCount: 3, selectedClipIndex: 0 })
  expect(screen.getByTestId('reference-clip-cycler')).toBeInTheDocument()
  expect(screen.getByText('Clip 1 of 3')).toBeInTheDocument()
})

it('clicking Next calls onSelectReferenceClip with the next index', () => {
  const onSelectReferenceClip = vi.fn()
  renderView({ referenceClipCount: 3, selectedClipIndex: 0, onSelectReferenceClip })
  fireEvent.click(screen.getByText('Next'))
  expect(onSelectReferenceClip).toHaveBeenCalledWith(1)
})

it('clicking Prev at index 0 wraps around to call onSelectReferenceClip with the last index', () => {
  const onSelectReferenceClip = vi.fn()
  renderView({ referenceClipCount: 3, selectedClipIndex: 0, onSelectReferenceClip })
  fireEvent.click(screen.getByText('Prev'))
  expect(onSelectReferenceClip).toHaveBeenCalledWith(2)
})

it('resets the scrubber to pair 0 when the path prop changes (e.g. after switching reference clips)', () => {
  const { rerender } = render(
    <ComparisonView
      userVideoUrl="blob:user"
      userSequence={fakeSequence(3)}
      referenceVideoUrl="blob:reference"
      referenceSequence={fakeSequence(3)}
      path={path}
      flags={flags}
      referenceClipCount={2}
      selectedClipIndex={0}
      onSelectReferenceClip={vi.fn()}
    />
  )
  fireEvent.change(screen.getByTestId('comparison-scrubber'), { target: { value: '1' } })
  expect(screen.getByTestId('comparison-scrubber')).toHaveValue('1')

  const newPath: [number, number][] = [
    [0, 0],
    [1, 1],
  ]
  rerender(
    <ComparisonView
      userVideoUrl="blob:user"
      userSequence={fakeSequence(3)}
      referenceVideoUrl="blob:reference-2"
      referenceSequence={fakeSequence(2)}
      path={newPath}
      flags={flags}
      referenceClipCount={2}
      selectedClipIndex={1}
      onSelectReferenceClip={vi.fn()}
    />
  )
  expect(screen.getByTestId('comparison-scrubber')).toHaveValue('0')
})
```

- [ ] **Step 2: Run tests to verify the new ones fail, existing 4 still pass**

Run: `cd frontend && npm run test -- ComparisonView`
Expected: 4 pre-existing tests PASS; 5 new tests FAIL (no cycling props/UI/reset effect yet).

- [ ] **Step 3: Update the implementation**

In `frontend/src/components/ComparisonView.tsx`:

Update the props interface and destructuring:

```tsx
interface ComparisonViewProps {
  userVideoUrl: string
  userSequence: PoseSequence
  referenceVideoUrl: string
  referenceSequence: PoseSequence
  path: [number, number][]
  flags: CheckpointFlag[]
  referenceClipCount: number
  selectedClipIndex: number
  onSelectReferenceClip: (index: number) => void
}

export function ComparisonView({
  userVideoUrl,
  userSequence,
  referenceVideoUrl,
  referenceSequence,
  path,
  flags,
  referenceClipCount,
  selectedClipIndex,
  onSelectReferenceClip,
}: ComparisonViewProps) {
```

Add a new effect (alongside the two existing ones), resetting the scrubber whenever a different clip's `path` arrives:

```tsx
  // A clip switch that hits the pose-data cache (see useReferenceComparison)
  // updates props without unmounting this component — reset the scrubber so
  // it doesn't keep pointing at a pair index that means something different
  // (or doesn't exist) in the newly selected clip's path.
  useEffect(() => {
    setPairIndex(0)
  }, [path])
```

Insert the cycling control between the video panes `<div>` and the scrubber block:

```tsx
      {referenceClipCount >= 2 && (
        <div data-testid="reference-clip-cycler">
          <button onClick={() => onSelectReferenceClip((selectedClipIndex - 1 + referenceClipCount) % referenceClipCount)}>
            Prev
          </button>
          <span>
            Clip {selectedClipIndex + 1} of {referenceClipCount}
          </span>
          <button onClick={() => onSelectReferenceClip((selectedClipIndex + 1) % referenceClipCount)}>Next</button>
        </div>
      )}
```

(Everything else in the file — the two existing effects, the video panes, the scrubber, the overlay canvas, the flags table — is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- ComparisonView`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/components/ComparisonView.tsx frontend/src/components/ComparisonView.test.tsx
git commit -m "feat(frontend): add reference-clip cycling controls to ComparisonView"
```

---

### Task 3: `App.tsx` wiring

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:** none new — passes three fields straight from `comparison` (Task 1's hook) to `ComparisonView` (Task 2).

**Design notes (read before implementing):**
- Purely additive wiring in the existing `'ready'` branch — `App.tsx` gains zero new logic, exactly the "thin wiring layer" role it already has.
- Existing 6 `App.test.tsx` tests must keep passing: the `'ready'`-state mock needs the three new fields added (`referenceClips` of length 1, `selectedClipIndex: 0`, `selectReferenceClip: vi.fn()`) so `App` doesn't crash reading `comparison.referenceClips.length` on an incomplete mock object — this is purely a mock-completeness fix, not a behavior change, and with `referenceClips.length === 1` no cycling UI appears, so no existing assertion is affected.

- [ ] **Step 1: Update `App.test.tsx` (write failing test first)**

Update the existing `'ready'`-status mock (in the `'renders ComparisonView once the reference comparison is ready'` test) to:

```tsx
mockUseReferenceComparison.mockReturnValue({
  status: 'ready',
  referenceVideoUrl: '/reference-clips/freestyle/clip-1/video.mp4',
  referenceSequence: fakeSequence,
  path: [[0, 0]],
  flags: [],
  referenceClips: [
    {
      id: 'clip-1',
      motion_type: 'freestyle',
      video_url: '/reference-clips/freestyle/clip-1/video.mp4',
      pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
      camera_angle_note: '',
      source_or_license_note: '',
    },
  ],
  selectedClipIndex: 0,
  selectReferenceClip: vi.fn(),
})
```

Add one new test after it:

```tsx
it('shows cycling controls when the reference comparison has multiple clips', async () => {
  mockUseReferenceComparison.mockReturnValue({
    status: 'ready',
    referenceVideoUrl: '/reference-clips/freestyle/clip-1/video.mp4',
    referenceSequence: fakeSequence,
    path: [[0, 0]],
    flags: [],
    referenceClips: [
      {
        id: 'clip-1',
        motion_type: 'freestyle',
        video_url: '/reference-clips/freestyle/clip-1/video.mp4',
        pose_data_url: '/reference-clips/freestyle/clip-1/pose.json',
        camera_angle_note: '',
        source_or_license_note: '',
      },
      {
        id: 'clip-2',
        motion_type: 'freestyle',
        video_url: '/reference-clips/freestyle/clip-2/video.mp4',
        pose_data_url: '/reference-clips/freestyle/clip-2/pose.json',
        camera_angle_note: '',
        source_or_license_note: '',
      },
    ],
    selectedClipIndex: 0,
    selectReferenceClip: vi.fn(),
  })
  mockEstimateSequence.mockResolvedValue(fakeSequence)
  render(<App />)
  const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
  await userEvent.upload(screen.getByTestId('file-upload-input'), file)

  await waitFor(() => expect(screen.getByText('Clip 1 of 2')).toBeInTheDocument())
  expect(screen.getByText('Next')).toBeInTheDocument()
  expect(screen.getByText('Prev')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify the new test fails, existing 6 still pass**

Run: `cd frontend && npm run test -- App.test`
Expected: 6 pre-existing tests PASS (the mock-completeness edit doesn't change their behavior); 1 new test FAILS (`App.tsx` doesn't pass the new props yet).

- [ ] **Step 3: Update the implementation**

In `frontend/src/App.tsx`, update the `ComparisonView` usage inside the `'ready'` branch:

```tsx
          {state === 'ready' && comparison.status === 'ready' && poseSequence ? (
            <ComparisonView
              userVideoUrl={videoUrl}
              userSequence={poseSequence}
              referenceVideoUrl={comparison.referenceVideoUrl}
              referenceSequence={comparison.referenceSequence}
              path={comparison.path}
              flags={comparison.flags}
              referenceClipCount={comparison.referenceClips.length}
              selectedClipIndex={comparison.selectedClipIndex}
              onSelectReferenceClip={comparison.selectReferenceClip}
            />
          ) : (
```

(No other part of `App.tsx` changes.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- App.test`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: no type errors; all tests from milestones 1–5 plus this milestone's changed tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): wire reference-clip cycling controls into App"
```

---

### Task 4: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Tasks 1–3 together against a real running backend with a real multi-clip library, same "verify visually before shipping" pattern as prior milestones' final tasks.

**Prerequisite (higher bar than milestone 5's single-clip requirement):** at least **two** real reference clips committed under `backend/reference_clips/freestyle/<id-1>/` and `backend/reference_clips/freestyle/<id-2>/` (each with `video.mp4`/`.mov`, `pose.json`, and `metadata.json` — same layout as milestone 5's Task 7 Step 4). This repo may still have zero or one committed clip; without a second real clip, cycling cannot be exercised for real (only via the mocked unit/integration tests above).

- [ ] **Step 1: Run the full automated suite one more time**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: all PASS, matching the milestone-1–5 baseline plus this milestone's changes.

- [ ] **Step 2: Start both servers**

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Confirm no cycling UI with fewer than 2 clips (regression check)**

With only 0 or 1 clip committed under `backend/reference_clips/freestyle/`, upload a user clip and confirm the app behaves exactly as milestone 5 left it — no "Clip X of Y" text, no Prev/Next buttons, in either the `'no-reference-available'` or single-clip `'ready'` state.

- [ ] **Step 4: Add a second real reference clip and verify cycling**

With 2+ clips present (see prerequisite above), upload a user clip and wait for the comparison view.

Expected:
- "Clip 1 of N" and Prev/Next buttons render above the scrubber.
- Clicking Next/Prev cycles through clips in order and wraps around at both ends (Next past the last clip returns to clip 1; Prev before clip 1 goes to the last clip).
- On each clip switch, both the reference video pane and the "In-depth analysis" overlay genuinely update to the newly selected clip's footage/skeleton (not stale data from the previous clip) — confirm by picking two clips with visibly different reference footage/timing.
- The checkpoint-flags panel reflects the newly selected clip's alignment, not the previous clip's.
- Open the browser devtools Network tab: the first visit to each clip triggers one `GET .../pose.json` request; cycling back to an already-visited clip triggers **no** new `pose.json` request (cache hit) and shows no visible loading flicker — the comparison view updates instantly.
- No console/network errors throughout.

---

## Self-Review Notes

- **Spec coverage:** build-order step 6 / V1 scope item 8 ("If more than one reference clip exists for a motion, user can cycle between them") — delivered exactly, with wrap-around cycling per the spec's own word "cycle." A real motion picker (build-order step 7) remains out of scope, unaffected by this milestone.
- **Reuse over rebuild:** clip selection reuses the exact same "index into an array, stored in `useState`" pattern `ComparisonView`'s own `pairIndex` scrubber already established — no new selection abstraction invented. The DTW + checkpoint-flags pipeline is untouched; only re-invoked per selected clip, exactly as it already was per user clip.
- **Robust hook contract, not just a well-behaved UI:** `selectReferenceClip` wraps out-of-range indices via modulo inside the hook itself (Task 1), so the hook's guarantees don't depend on `ComparisonView` (or any future caller) staying within bounds.
- **Caching is deliberately narrow:** only the network fetch (`fetchPoseSequence`) is cached, keyed by clip `id`. DTW/checkpoint-flags recompute on every selection — correct-by-construction (no risk of serving stale alignment for a different, cached-but-unrelated computation) and cheap enough that caching them would be premature.
- **No loading flicker on cache hit, without special-casing it:** this falls out of React 18's automatic batching once the cache-hit code path never awaits anything (Task 1's design notes walk through why) — not a separately coded "skip loading state" branch.
- **A necessary correctness fix, not scope creep:** `ComparisonView`'s scrubber-reset-on-`path`-change effect (Task 2) is required specifically because the cache-hit fast path updates props without unmounting the component — without it, cycling to a cached clip could leave the scrubber pointing at a stale/out-of-bounds pair index. Flagged explicitly in Task 2 rather than silently added.
- **Deferred, explicitly:** no clip-id-based URL/routing persistence of the selection; no keyboard shortcuts for cycling; no "jump to clip N" direct-index UI beyond Prev/Next — all reasonable follow-ups if the clip count grows large, none justified by the "more than one clip" bar this milestone targets.

### Critical Files for Implementation
- frontend/src/hooks/useReferenceComparison.ts
- frontend/src/hooks/useReferenceComparison.test.ts
- frontend/src/components/ComparisonView.tsx
- frontend/src/components/ComparisonView.test.tsx
- frontend/src/App.tsx
