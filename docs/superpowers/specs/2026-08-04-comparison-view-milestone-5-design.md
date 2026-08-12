# Comparison View (Milestone 5) — Design

## Goal

Build-order step 4 from `sports-motion-comparison-spec.md`: "Side-by-side synced player with skeleton overlay." This is the first milestone that wires the real app to the real backend — milestones 2-4 all proved their pieces via dev-only tools that bypass both. Per user's explicit scope choice, this milestone also builds spec section 6's superimposed "in-depth analysis" overlay and surfaces milestone 4's checkpoint flags, not just the minimal synced player.

## Constraints

- No new dependencies.
- The reference-clip library is empty today (`backend/reference_clips/` has zero real clips) — the "no reference clip available" state must be handled as a first-class, always-exercised path, not a hypothetical edge case.
- Pure logic gets full TDD coverage, matching every prior milestone.

## Design

### Cross-origin: Vite dev proxy, not backend CORS

The frontend has never called the backend before this milestone. Vite dev runs on :5173, the backend on :8000 — different origins in dev. In production, the frontend is served BY the same FastAPI app (the existing guarded `frontend/dist` static mount) — same origin, so CORS is never actually needed there. A Vite `server.proxy` for `/api` and `/reference-clips` (both to `http://localhost:8000`) solves the dev-only split with zero backend changes, and lets the frontend use relative fetch paths that work unmodified in both environments — no conditional base-URL config anywhere.

### Skeleton overlay: two distinct concepts, both built

Spec section 6 describes two things under "Display":
1. Side-by-side video players, each with its own skeleton overlay — straightforward, each pane draws its own clip's raw (unnormalized) landmarks.
2. A separate superimposed canvas with both skeletons drawn together, "normalized for scale/position" — genuinely new logic, since `drawSkeleton` draws raw `landmark.x * canvasWidth` with zero recentering or rescaling today.

**Normalization scheme (`normalizeSkeletonForOverlay`):** recenter on the hip midpoint (average of `LEFT_HIP`/`RIGHT_HIP`, always landing at exactly `(0.5, 0.5)`), rescale by torso length (hip-mid to shoulder-mid distance) to a fixed fraction (`0.3`) of the canvas. Torso length is a stabler reference than a bounding box — a raised arm doesn't change it, but would change a bounding box's height. Because x/y share one scale factor, the output is only undistorted on a **square** canvas, regardless of either source video's native aspect ratio.

`drawSkeleton` needs zero changes — it already accepts a `color` option, so the overlay is just two calls with different colors fed normalized landmarks.

### Synced playback: reuse low-level pieces, not `VideoPoseViewer`

`VideoPoseViewer` owns its own scrubber, `isPlaying` state, and rAF loop, reading `video.currentTime` live with no external-sync hook. Retrofitting a second, differently-driven code path into an already-untested-by-design component (exempted from unit tests since milestone 1 as browser/MediaPipe-dependent) risks destabilizing it for no real benefit. The new `ComparisonView` instead reuses the *low-level* pieces directly: `drawSkeleton`, `frameTimestampMs`/`seekTo` from `frameExtraction.ts`, and `POSE_CONNECTION_TUPLES` (newly exported from `VideoPoseViewer.tsx`, a one-line change with zero behavior change there).

The shared scrubber's value is a **pair index into the DTW path**, not a raw time value — moving it seeks both videos to their respective aligned frame's timestamp and redraws all three canvases. This is what makes synced comparison meaningful across two clips of different length/speed (the entire point of DTW alignment from milestone 3).

**Deferred, explicitly:** synced play/pause across two `<video>` elements. Getting two independent videos to play in lockstep (shared clock, drift correction) is meaningfully harder than seeking them together on scrub, and scrubbing alone proves the concept. Scrubber-only interaction for v1.

### Checkpoint flags panel

Reuses milestone 4's `computeCheckpointFlags` output unchanged. `CheckpointFlag.phase` is defined as the reference clip's frame index — exactly `path[pairIndex][1]` — so filtering to the current pair is a one-line `.filter()`.

### Empty-library handling is first-class

`useReferenceComparison`'s discriminated-union status includes `'no-reference-available'` as a named, expected result — not a fallthrough. `App.tsx` renders the existing single-video `VideoPoseViewer` plus a friendly message in this case, which is also today's literal default behavior (the library has zero clips right now), not a hypothetical fallback path invented for robustness theater.

### Type safety over manual null-checking

`useReferenceComparison` returns a discriminated union (`{status:'idle'} | {status:'loading'} | {status:'no-reference-available'} | {status:'error'} | {status:'ready', referenceVideoUrl, referenceSequence, path, flags}`), so `App.tsx` narrows on `status === 'ready'` and gets all four dependent fields as non-null automatically — no parallel boolean state, no repeated manual null-checks at the call site.

## Out of scope (deferred, not built)

- Synced play/pause across two videos — scrubber-only for v1.
- Multi-reference cycling (build-order step 6) — always picks the first clip with both a video and pose URL.
- A real motion-picker UI (build-order step 7) — `motion_type` is hardcoded to `'freestyle'`, the only motion so far, which trivially satisfies the spec's "fixed list" requirement.
- Backend CORS middleware — the Vite proxy is dev-only and sufficient; production is same-origin by construction.

## Testing strategy

`normalizeSkeleton.ts` and `referenceClips.ts` are pure/thin-wrapper logic — full unit coverage with hand-computed geometry and mocked `fetch`, same rigor as prior milestones. `useReferenceComparison` is tested via `renderHook` with all four dependencies (`referenceClips`, `featureVector`, `dtw`, `checkpointFlags`) mocked at the module boundary, same pattern `AlignmentToolApp.test.tsx` already established. `ComparisonView` is fully RTL-tested with **zero mocks** — its canvas/flags rendering is synchronous and driven entirely by props + `pairIndex` state, decoupled from the async `seekTo` calls (which never resolve in jsdom, harmlessly, since nothing awaits them). `App.tsx`'s new branches are tested by mocking `useReferenceComparison` at the module boundary, matching how `usePoseEstimation` is already mocked there.
