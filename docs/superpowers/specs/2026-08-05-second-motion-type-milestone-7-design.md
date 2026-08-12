# Second Motion Type — Butterfly (Milestone 7) — Design

## Goal

Build-order step 7 from `sports-motion-comparison-spec.md`: "Add a second motion type to confirm the pipeline generalizes rather than being accidentally hardcoded to the first one."

## Constraints

- No new dependencies — a plain `<select>`, no UI library.
- No backend changes — `GET /api/reference-clips?motion_type=` is already generic and already tested with a second motion (`'butterfly'`, in `backend/tests/test_reference_clips.py`).
- Pure/hook logic gets full TDD coverage; test mocking/hoisting conventions from milestone 6 are reused exactly (module-boundary mocks, hoisted `fakeSequence(N)` constants bound before any `renderHook`/`render` call).
- `npx tsc -b` (not `--noEmit`) for type-checking — milestone 6 discovered `--noEmit` is a silent no-op against this repo's project-references root `tsconfig.json`.

## Design

### What's actually hardcoded

Every pipeline layer — pose estimation, DTW alignment, checkpoint flags, skeleton normalization, and the backend endpoint — is already motion-agnostic in code. The only hardcoding is a single `MOTION_TYPE = 'freestyle'` constant inside `useReferenceComparison.ts`, plus the complete absence of any UI to pick a different motion. This milestone's job is narrow: remove that one constant and add the picker, proving genericness at the one layer that wasn't yet proven — not re-proving what the backend's tests already cover.

### Second motion: butterfly, not a new sport

The backend's own test fixtures already use `'butterfly'` as an example second motion (to test the `motion_type` filter). Using it here avoids inventing new vocabulary and keeps the two real motions within swimming, matching the user's preference.

### Motion type becomes a hook parameter, not a new constant elsewhere

`useReferenceComparison(userSequence, motionType)` — the motion is now caller-supplied. Effect 1 (the clip-list fetch) must include `motionType` in its dependency array alongside `userSequence`: without this, switching motions while a user clip is already loaded would keep showing the old motion's stale clip list and alignment, silently lying about which motion is being compared. With it, a motion change resets and refetches exactly like uploading a new user clip already does.

### Fixed list, not a registry

`frontend/src/lib/motionTypes.ts` exports a flat `{value, label}[]` array and a `DEFAULT_MOTION_TYPE`. No i18n, no icons, no per-motion configuration beyond the two fields — this matches the spec's own "fixed list" wording (V1 item 1) and avoids building an extensibility mechanism nobody asked for. It gets its own tiny file (not inlined into `App.tsx`) because both `useReferenceComparison`'s tests and `App.tsx` want the same constants without importing each other. It has no test file — it's a literal array with no branches or logic; `tsc -b` already catches shape errors, and testing that TypeScript can read an array literal would be pure ceremony.

### Picker placement: the idle screen, the app's only pre-capture point

This app has no separate "capture flow" screen — the idle/upload screen is the sole point before a video is committed to, so it's the natural single place for the spec's "user picks a sport + motion... before capture" (V1 item 1). The picker does not reset on "Try another video": retrying almost always means the same motion, and the picker stays visible and changeable on the idle screen regardless.

### The "no reference clip" message stops lying

Today's hardcoded message reads "No reference clip available yet for freestyle." regardless of what's actually selected — a lie for any other motion. This milestone fixes it to interpolate the selected motion's label from `MOTION_TYPES`.

## Out of scope (deferred, not built)

- A third motion type.
- Persisting the selected motion across page reloads or in a URL.
- Per-motion checkpoint-rule differences (checkpoint flags are already motion-agnostic by construction — comparing raw joint angles between two aligned clips, not tuned per-motion phase ranges).
- Verifying the `'ready'` state for either motion end-to-end — requires real footage of two distinct motions, a higher bar than milestone 6's single-motion two-clip requirement. Noted as an explicit stretch in Task 3.

## Testing strategy

`useReferenceComparison`'s new behavior (motion change → refetch, not stale reuse) gets one dedicated test using `renderHook`'s `rerender` with changing `initialProps`, asserting the hook passes through `'loading'` synchronously before landing on the new motion's resolved status — designed so it can't pass by accident. `App.tsx`'s picker gets RTL tests mocking `useReferenceComparison` at the module boundary, matching every prior milestone's `App.test.tsx` convention.
