# Multi-Reference Cycling (Milestone 6) — Design

## Goal

Build-order step 6 / V1 scope item 8 from `sports-motion-comparison-spec.md`: "If more than one reference clip exists for a motion, user can cycle between them." Milestone 5's `useReferenceComparison` fetches the full clip list but discards everything after the first match. This milestone keeps the whole list and lets the user switch between clips.

## Constraints

- No new dependencies.
- No backend changes — the endpoint already returns every clip for a motion; this is purely a frontend consumption change.
- Pure/hook logic gets full TDD coverage; `ComparisonView` stays prop-driven and mock-free, matching milestone 5's testing strategy.

## Design

### Selection: array index, same pattern already in use

`ComparisonView` already expresses "which one of N" as a plain array index for its scrubber (`pairIndex` into the DTW `path`). Reference-clip selection reuses that exact idiom — `selectedClipIndex` into `referenceClips` — rather than inventing a new selection abstraction (e.g. selecting by clip `id`).

### Caching: only the network fetch, not the alignment

Re-visiting a previously-viewed clip should be instant — that's the whole point of "cycling." A `Map<string, PoseSequence>` keyed by clip `id`, held in a `useRef` inside `useReferenceComparison`, caches fetched pose data. DTW and checkpoint-flag computation are **not** cached — they're pure, cheap, and deterministic, so recomputing them on every selection is simpler and carries zero risk of serving a stale alignment for a different (but incorrectly cache-hit) pair. Caching them too would be solving a problem that doesn't exist yet.

### Two effects, not one

The existing single effect conflated two different triggers: "the user uploaded a new clip" (should refetch the whole reference-clip list and reset selection) and "the selected reference clip changed" (should fetch-or-cache that one clip's data and realign). Splitting them into two effects — one keyed on `userSequence`, one keyed on `[referenceClips, selectedClipIndex, userSequence]` — keeps each trigger's responsibility singular and mirrors the DTW `useEffect` pattern already established in `AlignmentToolApp.tsx` and milestone 5's original hook.

A side benefit falls out of this structure for free: when a selection change hits the pose-data cache, the fetch step never actually `await`s anything, so React 18's automatic batching means the `'loading'` state set at the top of the effect is never painted — the component goes straight from one `'ready'` state to the next `'ready'` state in a single commit. This wasn't special-cased; it's a consequence of the cache lookup being synchronous.

### Robustness: wrap at the hook boundary, not just in the UI

`selectReferenceClip(index)` accepts any integer. The hook wraps it via modulo (`((index % length) + length) % length`) both when picking which clip to align against and when reporting `selectedClipIndex` back out. This means the hook's own contract — "always resolves to a valid clip" — holds regardless of what calls it, rather than relying on `ComparisonView`'s Prev/Next buttons to be the only thing keeping the index in range.

### UI: Prev/Next, gated at 2+ clips, wrap-around

Cycling controls live inside `ComparisonView` (not `App.tsx`, which stays a thin wiring layer) and render nothing at all when there's 0 or 1 clip — zero visual change from milestone 5 for the common near-term case. At 2+, a small "Clip {i+1} of {N}" + Prev/Next row appears. Wrap-around (not disabling at the boundary) matches the spec's own word, "cycle."

One correctness detail this UI needs: since a cache-hit selection change doesn't unmount `ComparisonView` (props just update), the component's own scrubber (`pairIndex`) needs an explicit reset whenever `path` changes — otherwise it could keep pointing at a pair index that's stale or out of range for the newly selected clip's (differently-sized) DTW path.

## Out of scope (deferred, not built)

- Clip-id-based URL/routing persistence of the current selection.
- Keyboard shortcuts for cycling.
- A "jump to clip N" direct-index control beyond Prev/Next — not justified until clip counts grow large enough that Prev/Next becomes tedious.
- A real motion-picker UI (build-order step 7) — unaffected by this milestone.

## Testing strategy

`useReferenceComparison` is tested via `renderHook`, mocking `../api/referenceClips`/`../lib/featureVector`/`../lib/dtw`/`../lib/checkpointFlags` at the module boundary — same convention milestone 5 established. New cases specifically exercise the cache (call-count assertions) and the modulo wrap (both above-range and negative indices). `ComparisonView` stays fully RTL-tested with zero mocks. `App.tsx`'s new test is a thin integration check that the wiring is correct, not a re-test of `ComparisonView`'s own cycling logic.
