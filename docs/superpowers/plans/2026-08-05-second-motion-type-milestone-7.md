# Second Motion Type — Butterfly (Milestone 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement build-order step 7 of `sports-motion-comparison-spec.md` — "Add a second motion type to confirm the pipeline generalizes rather than being accidentally hardcoded to the first one." Every layer of the pipeline (pose estimation, DTW, checkpoint flags, normalization, and the backend `GET /api/reference-clips?motion_type=` endpoint) is already motion-agnostic. The *only* hardcoding left is the `MOTION_TYPE = 'freestyle'` constant inside `useReferenceComparison.ts` and the lack of any UI to choose a different one. This milestone removes that constant, adds a fixed two-item motion picker (`freestyle` / `butterfly`, matching the backend test fixture's existing naming), and threads the selection through the hook into the fetch call — proving genericness at the one remaining layer that wasn't already proven.

**Architecture:**
- `frontend/src/lib/motionTypes.ts` (new): a tiny static data module — `MotionTypeOption` interface, `MOTION_TYPES` fixed array (`freestyle`, `butterfly`), `DEFAULT_MOTION_TYPE`. No logic, no test file (justified in Task 1).
- `frontend/src/hooks/useReferenceComparison.ts` (modified): drops the hardcoded `MOTION_TYPE` constant, takes `motionType: string` as a second parameter, uses it in `fetchReferenceClips(motionType)`, and adds it to effect 1's dependency array so a motion change resets/refetches exactly like a new user clip does today.
- `frontend/src/App.tsx` (modified): owns `motionType` state (`useState(DEFAULT_MOTION_TYPE)`), renders a `<select>` populated from `MOTION_TYPES` on the idle screen only, passes `motionType` as `useReferenceComparison`'s second argument, and interpolates the selected motion's label into the "no reference clip available" message instead of the hardcoded word "freestyle".

**Tech Stack:** Same as milestones 1–6 — React 19, Vite, TypeScript, Vitest + RTL. No new dependencies, no UI library — plain `<select>`.

See `docs/superpowers/specs/2026-08-05-second-motion-type-milestone-7-design.md` for the design rationale.

## Global Constraints

- No new frontend dependencies.
- 2-space indentation, no semicolons — matches every existing `.ts`/`.tsx` file.
- Pure/hook logic (`useReferenceComparison.ts`) gets full TDD unit coverage. `App.tsx` stays a thin wiring layer — the picker is the only new logic it gains, and it's a single `useState` + `<select>`, nothing more.
- Reuse over rebuild: no new "motion registry" abstraction, no config-per-motion beyond `{ value, label }` — this is intentionally the flattest possible fixed list, matching the spec's own "fixed list" wording (V1 item 1), not an extensible registry nobody asked for.
- Test mocking/hoisting conventions from milestone 6 are reused exactly, not reinvented: module-boundary `vi.mock` for `useReferenceComparison.test.ts`'s dependencies; hoisted `fakeSequence(N)` `const`s bound *before* any `renderHook`/`render` call (never inlined in the render callback — this crashed the Vitest worker in milestone 6 and must not recur); `App.test.tsx`'s single referentially-stable `fakeSequence` object plus `vi.mock('./hooks/useReferenceComparison', ...)`.
- `npx tsc -b` (NOT `npx tsc --noEmit`, which is a silent no-op against this repo's root `tsconfig.json`) for every type-check step.
- No non-null assertions (`!`) — narrow via local `const`s and `if` guards, consistent with every prior milestone.

---

## File Structure

```
Sports_Analysis_App/
└── frontend/
    └── src/
        ├── lib/
        │   └── motionTypes.ts                              # new
        ├── hooks/
        │   ├── useReferenceComparison.ts                   # modified
        │   └── useReferenceComparison.test.ts              # modified
        ├── App.tsx                                          # modified
        └── App.test.tsx                                     # modified (extended)
```

---

### Task 1: `motionTypes.ts` + parametrize `useReferenceComparison`

**Files:**
- New: `frontend/src/lib/motionTypes.ts`
- Modify: `frontend/src/hooks/useReferenceComparison.ts`
- Modify: `frontend/src/hooks/useReferenceComparison.test.ts`

**Interfaces:**
- New: `MotionTypeOption { value: string; label: string }`, `MOTION_TYPES: MotionTypeOption[]`, `DEFAULT_MOTION_TYPE: string` — exported from `frontend/src/lib/motionTypes.ts`.
- Changed: `useReferenceComparison(userSequence: PoseSequence | null, motionType: string): ComparisonResult` — second parameter added, no other change to `ComparisonResult`'s shape.

**Design notes (read before implementing):**
- **`motionTypes.ts` gets its own file, and no test file.** Own file because `useReferenceComparison.test.ts` and `App.tsx`/`App.test.tsx` both plausibly want `DEFAULT_MOTION_TYPE`/`MOTION_TYPES` without importing each other or duplicating the list — the same reason `checkpointFlags.ts`, `dtw.ts`, and `featureVector.ts` are already separate `lib/` modules in this codebase rather than living inline in the hook or component that happens to use them first. No test file because there is no logic to test: it's a literal array and a derived constant, no branch, no loop, nothing that can fail independently of a type error (which `tsc -b` already catches).
- **`useReferenceComparison`'s existing contract is unaffected.** `ComparisonResult`'s variants, `wrapIndex`, the pose cache, effect 2 (selection/alignment) — none of that changes. This is a mechanical signature change plus one new dependency-array entry.
- **Effect 1 must include `motionType` in its dependency array**, not just `userSequence`. Without this, changing the motion picker while a user clip is already loaded would never refetch — the stale `freestyle` clip list (and its `'ready'` alignment) would keep rendering under a `butterfly` selection, silently lying to the user. Adding `motionType` to the deps makes a motion change behave exactly like a new user clip today: reset to `'loading'`, refetch, land on `'ready'` or `'no-reference-available'` for the *new* motion.
- **Test file: inline `'freestyle'` per call site, no shared constant.** One string literal per `renderHook(...)` call is not enough duplication to justify a constant.
- **The one genuinely new test:** rendering with `userSequence` fixed, then `rerender`-ing with a different `motionType`, must (a) call `fetchReferenceClips` again with the new motion string, and (b) not keep showing the old motion's stale `'ready'` result — it must pass through `'loading'` and land on whatever the new motion's fetch resolves to (here, `'no-reference-available'`, chosen deliberately so the assertion can't be satisfied by accident if the hook merely re-renders without actually resetting state).

- [ ] **Step 1: Add `motionTypes.ts` (no test — see design notes)**

`frontend/src/lib/motionTypes.ts`:

```ts
export interface MotionTypeOption {
  value: string
  label: string
}

// Fixed list per spec V1 item 1 ("User picks a sport + motion from a fixed
// list, not auto-detected"). Deliberately flat — no per-motion config beyond
// value/label, no i18n, no icons. Extend this array (and nothing else) if a
// third motion is ever added.
export const MOTION_TYPES: MotionTypeOption[] = [
  { value: 'freestyle', label: 'Freestyle' },
  { value: 'butterfly', label: 'Butterfly' },
]

export const DEFAULT_MOTION_TYPE = MOTION_TYPES[0].value
```

- [ ] **Step 2: Extend the test file (write the failing test first)**

Update every existing `renderHook(() => useReferenceComparison(...))` call site in `frontend/src/hooks/useReferenceComparison.test.ts` to pass `'freestyle'` as the second argument. Concretely, every occurrence of:

```ts
renderHook(() => useReferenceComparison(null))
```
becomes
```ts
renderHook(() => useReferenceComparison(null, 'freestyle'))
```
and every occurrence of:
```ts
renderHook(() => useReferenceComparison(userSequence))
```
becomes
```ts
renderHook(() => useReferenceComparison(userSequence, 'freestyle'))
```

(This touches the `userSequence` bound `const` in each `it`, already hoisted per the existing pattern — no new hoisting needed, just an added argument at each of the file's 9 existing `renderHook` call sites.)

Then add one new test at the end of the `describe('useReferenceComparison', ...)` block:

```ts
  it("refetches with the new motion type and resets stale state when motionType changes, rather than keeping the old motion's clips", async () => {
    mockFetchReferenceClips
      .mockResolvedValueOnce([clipFixture('clip-1')]) // freestyle
      .mockResolvedValueOnce([]) // butterfly — none yet
    mockFetchPoseSequence.mockResolvedValue(fakeSequence(10))

    const userSequence = fakeSequence(10)
    const { result, rerender } = renderHook(
      ({ motionType }: { motionType: string }) => useReferenceComparison(userSequence, motionType),
      { initialProps: { motionType: 'freestyle' } }
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockFetchReferenceClips).toHaveBeenNthCalledWith(1, 'freestyle')

    rerender({ motionType: 'butterfly' })
    expect(result.current.status).toBe('loading') // stale freestyle 'ready' result is not reused
    await waitFor(() => expect(result.current.status).toBe('no-reference-available'))
    expect(mockFetchReferenceClips).toHaveBeenNthCalledWith(2, 'butterfly')
    expect(mockFetchReferenceClips).toHaveBeenCalledTimes(2)
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm run test -- useReferenceComparison`
Expected: FAIL — `useReferenceComparison` doesn't accept a second argument yet, and `fetchReferenceClips` is still called with the hardcoded `MOTION_TYPE` regardless of what's passed.

- [ ] **Step 4: Update the implementation**

In `frontend/src/hooks/useReferenceComparison.ts`:

Remove the hardcoded constant and its comment:

```ts
// DELETE:
// Only motion in the reference library so far — see milestone 5's plan for
// the full rationale. A motion picker is future work (build-order step 7).
const MOTION_TYPE = 'freestyle'
```

Change the function signature:

```ts
export function useReferenceComparison(userSequence: PoseSequence | null, motionType: string): ComparisonResult {
```

Update effect 1 — use the parameter and add it to the dependency array:

```ts
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
```

Effect 2 (selection/alignment) is unchanged — it already only depends on `referenceClips`/`selectedClipIndex`/`userSequence`, and effect 1 resetting `referenceClips` on a motion change already forces effect 2 to a no-op until the new clip list lands.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test -- useReferenceComparison`
Expected: PASS (10 tests — 9 existing + 1 new).

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: this will surface `App.tsx`'s now-missing second argument to `useReferenceComparison` as a type error — expected, fixed in Task 2. `tsc -b` failing on `App.tsx` at this point is acceptable and should not block this task's commit; re-verify clean after Task 2.

- [ ] **Step 7: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/lib/motionTypes.ts frontend/src/hooks/useReferenceComparison.ts frontend/src/hooks/useReferenceComparison.test.ts
git commit -m "feat(frontend): parametrize useReferenceComparison by motion type, add fixed motion list"
```

---

### Task 2: `App.tsx` — motion picker UI + wiring

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `MOTION_TYPES`, `DEFAULT_MOTION_TYPE` from `./lib/motionTypes`.
- Calls `useReferenceComparison(poseSequence, motionType)` — second argument now required (matches Task 1).

**Design notes (read before implementing):**
- **Picker renders only in the `'idle'` state.** The app has no separate "capture flow" screen — idle-with-`FileUpload` is the only point before a video is committed to.
- **`motionType` does NOT reset on `handleReset`.** A user retrying the same motion shouldn't have to re-pick it every time; the picker stays visible on the idle screen regardless.
- **The "no reference clip" message now uses the selected motion's *label*** (`'Freestyle'`/`'Butterfly'`, looked up in `MOTION_TYPES`), not the raw lowercase `value`. This requires updating that one existing `App.test.tsx` assertion's literal text from `freestyle` to `Freestyle`.
- **`userEvent.selectOptions`** (already available via `@testing-library/user-event`, already a dependency) drives the new tests — no new testing dependency.

- [ ] **Step 1: Update `App.test.tsx` (write failing tests first)**

Add the import at the top:

```tsx
import { MOTION_TYPES } from './lib/motionTypes'
```

Update the existing test `'shows the existing single-video viewer with a friendly message when no reference clip is available'` — change the asserted message text from lowercase to the label:

```tsx
  it('shows the existing single-video viewer with a friendly message when no reference clip is available', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('No reference clip available yet for Freestyle.')).toBeInTheDocument())
    expect(screen.getByTestId('scrubber')).toBeInTheDocument() // VideoPoseViewer's own scrubber
    expect(screen.getByText('Try another video')).toBeInTheDocument()
  })
```

Add two new tests, after the `describe('App', ...)` block's existing tests:

```tsx
  it('shows a motion picker on the idle screen with both options, defaulting to Freestyle', () => {
    render(<App />)
    const select = screen.getByTestId('motion-type-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    for (const { label } of MOTION_TYPES) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
    expect(select.value).toBe('freestyle')
  })

  it('passes the selected motion type through to useReferenceComparison and shows its label in the no-reference message', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    await userEvent.selectOptions(screen.getByTestId('motion-type-select'), 'butterfly')

    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('No reference clip available yet for Butterfly.')).toBeInTheDocument())
    expect(mockUseReferenceComparison).toHaveBeenLastCalledWith(fakeSequence, 'butterfly')
  })
```

- [ ] **Step 2: Run tests to verify the new/changed assertions fail**

Run: `cd frontend && npm run test -- App.test`
Expected: FAIL — no `motion-type-select` exists yet; the "no reference" message is still the old hardcoded lowercase string; `useReferenceComparison` is still called with one argument.

- [ ] **Step 3: Update the implementation**

In `frontend/src/App.tsx`:

Add the import:

```tsx
import { DEFAULT_MOTION_TYPE, MOTION_TYPES } from './lib/motionTypes'
```

Add state:

```tsx
  const [motionType, setMotionType] = useState(DEFAULT_MOTION_TYPE)
```

Pass it to the hook:

```tsx
  const comparison = useReferenceComparison(poseSequence, motionType)
```

Render the picker in the idle branch (currently just `{state === 'idle' && <FileUpload onFileSelected={handleFileSelected} />}`):

```tsx
      {state === 'idle' && (
        <>
          <label htmlFor="motion-type-select">Motion</label>
          <select
            id="motion-type-select"
            data-testid="motion-type-select"
            value={motionType}
            onChange={(e) => setMotionType(e.target.value)}
          >
            {MOTION_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <FileUpload onFileSelected={handleFileSelected} />
        </>
      )}
```

Update the no-reference-available message to look up the label:

```tsx
              {state === 'ready' && comparison.status === 'no-reference-available' && (
                <p>
                  No reference clip available yet for{' '}
                  {MOTION_TYPES.find((m) => m.value === motionType)?.label ?? motionType}.
                </p>
              )}
```

(`handleReset` is unchanged — no `setMotionType` call, per the design note above.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- App.test`
Expected: PASS (9 tests — 7 existing, one with an updated assertion, plus 2 new).

- [ ] **Step 5: Type-check and run the full frontend suite**

Run: `cd frontend && npx tsc -b && npm run test`
Expected: no type errors; all tests from milestones 1–6 plus this milestone's changes PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): add motion picker (freestyle/butterfly) and wire it into reference comparison"
```

---

### Task 3: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Tasks 1–2 against the real running backend, confirming the frontend layer is now provably generic across motions, matching the backend layer's existing proof (`backend/tests/test_reference_clips.py::test_filters_by_motion_type`, which already exercises `'butterfly'` as a second motion — pre-existing, unaffected by this milestone).

**What this task actually verifies:** with the repo's current real state (zero committed reference clips for either motion, per milestone 6's baseline), picking each motion and uploading a clip should independently reach `'no-reference-available'` — with the correct motion's *label* in the message, and with `GET /api/reference-clips` genuinely receiving a different `motion_type` query parameter per selection.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `cd frontend && npx tsc -b && npm run test`
Expected: all PASS, matching the milestone-1–6 baseline plus this milestone's changes.

- [ ] **Step 2: Start both servers**

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Verify the freestyle path (regression check)**

Open the app, confirm the motion picker shows with "Freestyle" selected by default, leave it as-is, upload a user clip. Confirm the app reaches `'no-reference-available'` (or `'ready'` if real freestyle clips happen to be present) exactly as it did at the end of milestone 6, with the message reading "No reference clip available yet for Freestyle." (capitalized). Open browser devtools Network tab and confirm the request is `GET /api/reference-clips?motion_type=freestyle`.

- [ ] **Step 4: Verify the butterfly path**

Reset ("Try another video"), confirm the picker still shows "Freestyle" selected (not reset — expected per Task 2's design), switch it to "Butterfly", upload a (possibly different) user clip. Confirm the app independently reaches `'no-reference-available'` with the message reading "No reference clip available yet for Butterfly." Open Network tab and confirm this request is `GET /api/reference-clips?motion_type=butterfly` — a genuinely different query parameter, not just a different label over the same request.

- [ ] **Step 5: No console/network errors throughout**

Confirm no errors in either the browser console or the backend server logs across both motion selections.

**Stretch (not required to consider this milestone done):** if real footage for both `freestyle` and `butterfly` is later committed under `backend/reference_clips/`, repeat Steps 3–4 and confirm each motion independently reaches `'ready'` with its own correct video/pose data, DTW alignment, and checkpoint flags — not blocked on here since it needs real footage of *two* distinct motions, a higher bar than milestone 6's two-clips-of-one-motion requirement.

---

## Self-Review Notes

- **Spec coverage:** build-order step 7 ("Add a second motion type to confirm the pipeline generalizes rather than being accidentally hardcoded to the first one") is delivered exactly at the layer where hardcoding actually existed — `useReferenceComparison.ts`'s `MOTION_TYPE` constant — with no changes needed anywhere else in the pipeline, because those were already generic.
- **No naming invented:** `'butterfly'` matches the backend test fixture's existing naming exactly.
- **Minimal fixed list, not a registry:** `motionTypes.ts` is a two-item array with `{ value, label }` and nothing else.
- **No test file for `motionTypes.ts`, deliberately:** it's a literal data constant with zero branches or loops.
- **The one behaviorally new thing is effect 1's `motionType` dependency** — everything else in Task 1 is a mechanical signature change. Task 1's new test is deliberately designed so it can't pass by accident.
- **Message wording change is intentional, not incidental:** switching from a hardcoded lowercase literal to a label lookup changes the exact existing test string from `'freestyle'` to `'Freestyle'` — called out explicitly in Task 2 Step 1.
- **`motionType` deliberately does not reset on "Try another video."**
- **Deferred, explicitly:** no persistence of the selected motion across page reloads, no URL-based motion routing, no third motion type, no per-motion checkpoint-rule differences beyond what already exists generically.

### Critical Files for Implementation
- frontend/src/lib/motionTypes.ts
- frontend/src/hooks/useReferenceComparison.ts
- frontend/src/hooks/useReferenceComparison.test.ts
- frontend/src/App.tsx
- frontend/src/App.test.tsx
