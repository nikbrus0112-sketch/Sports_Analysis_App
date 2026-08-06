# Video Metadata Race Fix

## Task 1: Wait for video metadata before reading duration/dimensions in `estimateSequence`

**Root cause:** `estimateSequence` reads `video.duration`, `video.videoWidth`, `video.videoHeight` with no guarantee `loadedmetadata` has fired. All three callers (`VideoPoseViewer.tsx`, `ReferenceToolApp.tsx`, `AlignmentToolApp.tsx`'s `ClipSlot`) route through this one function, so the fix belongs here, not in each caller.

**Files:**
- `frontend/src/lib/frameExtraction.ts` (add `waitForMetadata`)
- `frontend/src/lib/frameExtraction.test.ts` (tests for `waitForMetadata`)
- `frontend/src/hooks/usePoseEstimation.ts` (one-line call site addition)

**Interfaces:**
```ts
// frameExtraction.ts
export function waitForMetadata(video: HTMLVideoElement): Promise<void>
```

### Design decisions

- **Name:** `waitForMetadata` — mirrors `seekTo`'s shape (verb + what it waits for).
- **Readiness constant:** use a local named constant, `const HAVE_METADATA_READY_STATE = 1`, not `HTMLMediaElement.HAVE_METADATA`. Both are equivalent at runtime; the local constant documents intent at the call site without a reader needing to know `HAVE_METADATA === 1`, and matches this file's convention of not referencing DOM statics.
- **Immediate-resolve path:** `Promise.resolve()` when metadata is already loaded — no listener ever registered.
- **`error` handling: yes, add it.** A promise that hangs forever on a bad codec/corrupt file is strictly worse than today's bug (silent NaN at least renders something broken; a hung promise blocks the pipeline forever with zero feedback). Same "wait for a DOM event, resolve/reject a promise" shape `seekTo` already established. `VideoPoseViewer.tsx`'s existing `onError` console.error is independent and doesn't unstick the awaited `estimateSequence` call, so this rejection is still worth adding there too. Confirmed via grep: `ReferenceToolApp.tsx` and `AlignmentToolApp.tsx` have no `onError` handler at all — pre-existing gap, out of scope for this task (not a trivial one-liner to add correctly with proper messaging across two files).

### Steps

- [ ] Add `waitForMetadata` to `frontend/src/lib/frameExtraction.ts`, directly below `seekTo`:
  ```ts
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
  ```

- [ ] Extend `createFakeVideo()` in `frontend/src/lib/frameExtraction.test.ts` with a mutable `readyState` and `dispatchLoadedMetadata`/`dispatchError`, following the exact `dispatchSeeked` shape:
  ```ts
  function createFakeVideo() {
    const listeners: Record<string, Array<() => void>> = {}
    return {
      currentTime: 0,
      readyState: 0,
      addEventListener: (event: string, cb: () => void) => {
        listeners[event] = listeners[event] ?? []
        listeners[event].push(cb)
      },
      removeEventListener: (event: string, cb: () => void) => {
        listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb)
      },
      dispatchSeeked: () => {
        ;(listeners['seeked'] ?? []).forEach((cb) => cb())
      },
      dispatchLoadedMetadata: () => {
        ;(listeners['loadedmetadata'] ?? []).forEach((cb) => cb())
      },
      dispatchError: () => {
        ;(listeners['error'] ?? []).forEach((cb) => cb())
      },
    }
  }
  ```
  Shared helper used by both `describe('seekTo', ...)` and the new `describe('waitForMetadata', ...)` — the existing `seekTo` tests don't touch `readyState` or the new dispatch methods, so they're unaffected.

- [ ] Add `waitForMetadata` to the import line at the top of `frameExtraction.test.ts`:
  ```ts
  import { computeFrameCount, frameIndexForTime, frameTimestampMs, seekTo, waitForMetadata } from './frameExtraction'
  ```

- [ ] Add `describe('waitForMetadata', ...)` block, below the `seekTo` block:
  ```ts
  describe('waitForMetadata', () => {
    it('resolves without registering a listener when readyState already indicates metadata is loaded', async () => {
      const fakeVideo = createFakeVideo()
      fakeVideo.readyState = 1

      await expect(waitForMetadata(fakeVideo as unknown as HTMLVideoElement)).resolves.toBeUndefined()
    })

    it('does not resolve before loadedmetadata fires when starting from an unloaded state', async () => {
      const fakeVideo = createFakeVideo()
      let resolved = false
      waitForMetadata(fakeVideo as unknown as HTMLVideoElement).then(() => {
        resolved = true
      })

      await Promise.resolve()
      expect(resolved).toBe(false)

      fakeVideo.dispatchLoadedMetadata()
      await Promise.resolve()
      await Promise.resolve()
      expect(resolved).toBe(true)
    })

    it('resolves once loadedmetadata fires', async () => {
      const fakeVideo = createFakeVideo()
      const promise = waitForMetadata(fakeVideo as unknown as HTMLVideoElement)

      fakeVideo.dispatchLoadedMetadata()
      await expect(promise).resolves.toBeUndefined()
    })

    it('rejects if the error event fires before loadedmetadata', async () => {
      const fakeVideo = createFakeVideo()
      const promise = waitForMetadata(fakeVideo as unknown as HTMLVideoElement)

      fakeVideo.dispatchError()
      await expect(promise).rejects.toThrow('Video failed to load before metadata was available')
    })
  })
  ```

- [ ] Run `cd frontend && npm run test -- frameExtraction` — confirm all tests (existing `seekTo` ones + new `waitForMetadata` ones) pass.

- [ ] Add the one-line call in `frontend/src/hooks/usePoseEstimation.ts`: update the import and insert the await, immediately before `const durationSec = video.duration`:
  ```ts
  import { computeFrameCount, frameTimestampMs, seekTo, waitForMetadata } from '../lib/frameExtraction'
  ```
  ```ts
      const landmarker = await ensureLandmarker()

      await waitForMetadata(video)

      const durationSec = video.duration
  ```
  No further changes to `estimateSequence` — everything downstream already correctly reads `video.duration`/`video.videoWidth`/`video.videoHeight`, it just needed those reads deferred until metadata is real.

- [ ] No new test file for this call-site change. `usePoseEstimation.ts` is already exempted repo-wide (documented since milestone 1) because it requires a real MediaPipe/WASM model download to exercise meaningfully. The new logic it depends on is fully unit-tested at its own definition; the call site itself is a single `await` with no new branching.

- [ ] Run `cd frontend && npx tsc -b` — confirm no type errors (`--noEmit` is confirmed silently broken on this repo's project-references tsconfig, do not use it).

- [ ] Run `cd frontend && npm run test` — confirm full suite passes (97/97 — 93 existing + 4 new).

- [ ] Commit:
  ```bash
  cd /Users/nikb/Projects/Sports_Analysis_App
  git add frontend/src/lib/frameExtraction.ts frontend/src/lib/frameExtraction.test.ts frontend/src/hooks/usePoseEstimation.ts
  git commit -m "fix(frontend): wait for video metadata before reading duration/dimensions in estimateSequence"
  ```

### Self-Review Notes

- Confirmed via grep that `VideoPoseViewer.tsx` has an `onError` handler but `ReferenceToolApp.tsx` and `AlignmentToolApp.tsx` do not — `waitForMetadata`'s rejection path is the only failure signal those two callers get today. Left as-is; flagged rather than silently fixing three unrelated files in a root-cause task.
- Considered timing out `waitForMetadata` (reject after N seconds if neither event fires) — rejected as scope creep beyond the actual bug (a metadata-timing race, not a hung-load problem); the `error` event covers the concrete failure mode already observed.
- `HAVE_METADATA_READY_STATE = 1` matches the real `HTMLMediaElement.HAVE_METADATA` value — a naming/readability choice, not a semantic difference.
- Did not add a test asserting `removeEventListener` is called on both paths — the existing `seekTo` tests in this file don't assert cleanup either (same fake-video pattern, same omission), staying consistent with the file's existing test depth.

### Critical Files for Implementation
- frontend/src/lib/frameExtraction.ts
- frontend/src/lib/frameExtraction.test.ts
- frontend/src/hooks/usePoseEstimation.ts
