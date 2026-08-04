# Pose Estimation on Uploaded Video (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload a video, run MediaPipe pose estimation on every frame client-side, and play the video back with a synced skeleton overlay — no comparison logic yet.

**Architecture:** React + Vite + TypeScript frontend (client-only — the video never leaves the browser) alongside a minimal Python + FastAPI backend that is not yet in the video pipeline. On upload, the video is fully pre-processed (seek-based frame extraction + MediaPipe `PoseLandmarker` + a One-Euro smoothing pass) before playback begins; playback then just reads the cached per-frame pose data and draws it to a canvas synced to a scrubber.

**Tech Stack:** React 18, Vite, TypeScript, `@mediapipe/tasks-vision`, Vitest + React Testing Library (frontend tests); Python 3, FastAPI, pytest + httpx (backend tests).

## Global Constraints

- Frontend is React + Vite + TypeScript using the stock `react-ts` template only — no Redux, no router, no UI kit.
- Backend is Python + FastAPI. Not in the upload/pose path this milestone — health-check + a guarded static-file mount only.
- Upload is client-only: the video file is read into a blob URL and never sent to the backend.
- Processing mode is pre-process-fully-then-play: every frame is pose-estimated up front (with a progress indicator) and cached in memory before playback is enabled.
- No webcam recording — file upload only (`video/mp4`, `video/quicktime`).
- Frame extraction is seek-based (not `requestVideoFrameCallback`), at a fixed `targetFps = 30`.
- MediaPipe config: `pose_landmarker_full` model, `runningMode: 'VIDEO'`, `numPoses: 1`, GPU delegate with a CPU fallback.
- Smoothing: One-Euro filter, defaults `minCutoff = 1.0`, `beta = 0.007`, `dCutoff = 1.0`, run once over the full raw sequence (not live during extraction).
- The same `<video>` element is reused for extraction and playback (no second hidden element).
- Out of scope entirely this milestone: reference clip library, DTW alignment, side-by-side view, checkpoint rules, LLM feedback, multi-reference cycling.
- 2-space indentation for TypeScript; standard PEP 8 for Python.

---

## File Structure

```
Sports_Analysis_App/
├── frontend/
│   ├── package.json, tsconfig.json, vite.config.ts, index.html
│   └── src/
│       ├── main.tsx, App.tsx, App.test.tsx, setupTests.ts
│       ├── components/
│       │   ├── FileUpload.tsx, FileUpload.test.tsx
│       │   ├── ProcessingProgress.tsx, ProcessingProgress.test.tsx
│       │   └── VideoPoseViewer.tsx
│       ├── hooks/
│       │   └── usePoseEstimation.ts
│       └── lib/
│           ├── poseTypes.ts
│           ├── frameExtraction.ts, frameExtraction.test.ts
│           ├── oneEuroFilter.ts, oneEuroFilter.test.ts
│           └── drawSkeleton.ts, drawSkeleton.test.ts
└── backend/
    ├── requirements.txt
    ├── app/
    │   ├── __init__.py
    │   └── main.py
    └── tests/
        └── test_health.py
```

**Testing strategy note:** pure logic (frame-timing math, the One-Euro filter, canvas draw calls, the seek helper, presentational components, and App's state machine) gets real TDD with Vitest/React Testing Library or pytest. The two tasks that integrate real MediaPipe WASM + real video decoding (`usePoseEstimation`, `VideoPoseViewer`) are not meaningfully unit-testable without a real browser and a real model download — those tasks are implemented directly and verified with a documented manual procedure using real test clips, consistent with this milestone's own validation goal ("does the pose pipeline actually work").

---

### Task 1: Scaffold frontend and backend projects

**Files:**
- Create: `frontend/` (via `npm create vite@latest`)
- Create: `frontend/src/setupTests.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/tests/__init__.py`

**Interfaces:**
- Produces: a working `npm run test` (Vitest) and `pytest` command for every later task to build on.

- [ ] **Step 1: Scaffold the frontend**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @mediapipe/tasks-vision
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Wire Vitest into `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
  },
})
```

`frontend/src/setupTests.ts`:

```ts
import '@testing-library/jest-dom'
```

Add to `frontend/package.json` `scripts`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write a frontend toolchain sanity test**

`frontend/src/lib/sanity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('toolchain sanity', () => {
  it('runs TypeScript test files under Vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Run it to verify the frontend toolchain works**

Run: `cd frontend && npm run test`
Expected: 1 test file, 1 test, PASS.

- [ ] **Step 5: Scaffold the backend**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
mkdir -p backend/app backend/tests
touch backend/app/__init__.py backend/tests/__init__.py
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install fastapi "uvicorn[standard]" pytest httpx
pip freeze | grep -E "fastapi|uvicorn|pytest|httpx|starlette|anyio" > backend/requirements.txt
```

- [ ] **Step 6: Write a backend toolchain sanity test**

`backend/tests/test_sanity.py`:

```python
def test_pytest_runs():
    assert 1 + 1 == 2
```

- [ ] **Step 7: Run it to verify the backend toolchain works**

Run: `cd backend && source .venv/bin/activate && pytest`
Expected: 1 test collected, PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend backend .gitignore
git commit -m "chore: scaffold frontend (Vite+React+TS+Vitest) and backend (FastAPI+pytest)"
```

---

### Task 2: Backend `/health` endpoint

**Files:**
- Create: `backend/app/main.py`
- Create/Modify: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `GET /health` → `{"status": "ok"}`; a FastAPI `app` object importable as `app.main:app`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 3: Write minimal implementation**

`backend/app/main.py`:

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 5: Manually verify the server actually boots**

Run: `cd backend && uvicorn app.main:app --reload --port 8000` then in another shell `curl http://localhost:8000/health`
Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_health.py
git commit -m "feat(backend): add /health endpoint and guarded static frontend mount"
```

---

### Task 3: Pose data types and frame-timing math

**Files:**
- Create: `frontend/src/lib/poseTypes.ts`
- Create: `frontend/src/lib/frameExtraction.ts`
- Create: `frontend/src/lib/frameExtraction.test.ts`

**Interfaces:**
- Produces: `Landmark`, `PoseFrame`, `PoseSequence` types; `computeFrameCount(durationSec, targetFps)`, `frameTimestampMs(frameIndex, targetFps)`, `frameIndexForTime(currentTimeSec, targetFps, frameCount)` — all pure functions used by every later task that touches pose data or frame timing.

- [ ] **Step 1: Define the pose data types (no test needed — no runtime behavior)**

`frontend/src/lib/poseTypes.ts`:

```ts
export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export interface PoseFrame {
  frameIndex: number
  timestampMs: number
  landmarksRaw: Landmark[] | null
  landmarksSmoothed: Landmark[] | null
  worldLandmarksRaw?: Landmark[] | null
}

export interface PoseSequence {
  videoDurationMs: number
  videoWidth: number
  videoHeight: number
  targetFps: number
  frameCount: number
  frames: PoseFrame[]
  modelInfo: { variant: 'lite' | 'full' | 'heavy'; delegate: 'GPU' | 'CPU' }
}
```

- [ ] **Step 2: Write the failing tests for the timing math**

`frontend/src/lib/frameExtraction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeFrameCount, frameIndexForTime, frameTimestampMs } from './frameExtraction'

describe('computeFrameCount', () => {
  it('multiplies duration by target fps, floored', () => {
    expect(computeFrameCount(10, 30)).toBe(300)
  })

  it('always returns at least 1 frame for a non-zero duration', () => {
    expect(computeFrameCount(0.01, 30)).toBe(1)
  })
})

describe('frameTimestampMs', () => {
  it('converts a frame index to a millisecond timestamp at the target fps', () => {
    expect(frameTimestampMs(30, 30)).toBe(1000)
    expect(frameTimestampMs(0, 30)).toBe(0)
  })
})

describe('frameIndexForTime', () => {
  it('maps a playback time to the nearest frame index', () => {
    expect(frameIndexForTime(5, 30, 300)).toBe(150)
  })

  it('clamps to 0 for negative time', () => {
    expect(frameIndexForTime(-1, 30, 300)).toBe(0)
  })

  it('clamps to the last frame for time past the end', () => {
    expect(frameIndexForTime(100, 30, 300)).toBe(299)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm run test -- frameExtraction`
Expected: FAIL — `frameExtraction.ts` does not exist yet.

- [ ] **Step 4: Write minimal implementation**

`frontend/src/lib/frameExtraction.ts`:

```ts
export function computeFrameCount(durationSec: number, targetFps: number): number {
  return Math.max(1, Math.floor(durationSec * targetFps))
}

export function frameTimestampMs(frameIndex: number, targetFps: number): number {
  return Math.round(frameIndex * (1000 / targetFps))
}

export function frameIndexForTime(currentTimeSec: number, targetFps: number, frameCount: number): number {
  const idx = Math.round(currentTimeSec * targetFps)
  return Math.min(Math.max(idx, 0), frameCount - 1)
}

export function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      requestAnimationFrame(() => resolve())
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = timeSec
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test -- frameExtraction`
Expected: PASS (6 tests). `seekTo` is untested here — it's covered in Task 6.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/poseTypes.ts frontend/src/lib/frameExtraction.ts frontend/src/lib/frameExtraction.test.ts
git commit -m "feat(frontend): add pose data types and frame-timing math"
```

---

### Task 4: One-Euro smoothing filter

**Files:**
- Create: `frontend/src/lib/oneEuroFilter.ts`
- Create: `frontend/src/lib/oneEuroFilter.test.ts`

**Interfaces:**
- Consumes: `PoseFrame` from `./poseTypes` (Task 3)
- Produces: `OneEuroFilter` class with `.filter(value, timestampMs): number`; `smoothSequence(frames: PoseFrame[]): PoseFrame[]` — used by `usePoseEstimation` (Task 7).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/oneEuroFilter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { OneEuroFilter, smoothSequence } from './oneEuroFilter'
import type { PoseFrame } from './poseTypes'

describe('OneEuroFilter', () => {
  it('returns the input value unchanged on the first sample', () => {
    const filter = new OneEuroFilter()
    expect(filter.filter(10, 0)).toBe(10)
  })

  it('holds steady on a constant signal', () => {
    const filter = new OneEuroFilter()
    filter.filter(5, 0)
    const result = filter.filter(5, 33)
    expect(result).toBeCloseTo(5, 5)
  })

  it('smooths a step change instead of jumping immediately', () => {
    const filter = new OneEuroFilter()
    filter.filter(0, 0)
    const firstResponse = filter.filter(100, 33)
    expect(firstResponse).toBeGreaterThan(0)
    expect(firstResponse).toBeLessThan(100)
  })

  it('converges toward a new constant value over repeated samples', () => {
    const filter = new OneEuroFilter()
    filter.filter(0, 0)
    let last = 0
    for (let t = 33; t <= 1000; t += 33) {
      last = filter.filter(100, t)
    }
    expect(last).toBeGreaterThan(95)
  })
})

describe('smoothSequence', () => {
  it('preserves null landmarksRaw frames as null smoothed', () => {
    const frames: PoseFrame[] = [
      { frameIndex: 0, timestampMs: 0, landmarksRaw: null, landmarksSmoothed: null },
    ]
    const result = smoothSequence(frames)
    expect(result[0].landmarksSmoothed).toBeNull()
  })

  it('produces smoothed landmarks matching the input shape', () => {
    const frames: PoseFrame[] = [
      {
        frameIndex: 0,
        timestampMs: 0,
        landmarksRaw: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })),
        landmarksSmoothed: null,
      },
    ]
    const result = smoothSequence(frames)
    expect(result[0].landmarksSmoothed).toHaveLength(33)
    expect(result[0].landmarksSmoothed?.[0].x).toBeCloseTo(0.5, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- oneEuroFilter`
Expected: FAIL — `oneEuroFilter.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/lib/oneEuroFilter.ts`:

```ts
import type { PoseFrame } from './poseTypes'

class LowPassFilter {
  private y: number | null = null
  private s: number | null = null

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value
    } else {
      this.s = alpha * value + (1 - alpha) * (this.s as number)
    }
    this.y = value
    return this.s as number
  }

  lastValue(): number | null {
    return this.y
  }
}

function smoothingFactor(cutoff: number, dt: number): number {
  const r = 2 * Math.PI * cutoff * dt
  return r / (r + 1)
}

export interface OneEuroFilterOptions {
  minCutoff?: number
  beta?: number
  dCutoff?: number
}

export class OneEuroFilter {
  private minCutoff: number
  private beta: number
  private dCutoff: number
  private xFilter = new LowPassFilter()
  private dxFilter = new LowPassFilter()
  private lastTimestampMs: number | null = null

  constructor(options: OneEuroFilterOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1.0
    this.beta = options.beta ?? 0.007
    this.dCutoff = options.dCutoff ?? 1.0
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs
      this.xFilter.filter(value, 1)
      return value
    }

    const dt = Math.max((timestampMs - this.lastTimestampMs) / 1000, 1e-3)
    this.lastTimestampMs = timestampMs

    const prevValue = this.xFilter.lastValue() ?? value
    const dx = (value - prevValue) / dt
    const edx = this.dxFilter.filter(dx, smoothingFactor(this.dCutoff, dt))

    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.xFilter.filter(value, smoothingFactor(cutoff, dt))
  }
}

const NUM_LANDMARKS = 33
const AXES = ['x', 'y', 'z'] as const

export function smoothSequence(frames: PoseFrame[]): PoseFrame[] {
  const filters: OneEuroFilter[][] = Array.from({ length: NUM_LANDMARKS }, () =>
    AXES.map(() => new OneEuroFilter())
  )

  return frames.map((frame) => {
    if (!frame.landmarksRaw) {
      return { ...frame, landmarksSmoothed: null }
    }

    const landmarksSmoothed = frame.landmarksRaw.map((landmark, i) => ({
      x: filters[i][0].filter(landmark.x, frame.timestampMs),
      y: filters[i][1].filter(landmark.y, frame.timestampMs),
      z: filters[i][2].filter(landmark.z, frame.timestampMs),
      visibility: landmark.visibility,
    }))

    return { ...frame, landmarksSmoothed }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- oneEuroFilter`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/oneEuroFilter.ts frontend/src/lib/oneEuroFilter.test.ts
git commit -m "feat(frontend): add One-Euro smoothing filter"
```

---

### Task 5: Pure skeleton-drawing function

**Files:**
- Create: `frontend/src/lib/drawSkeleton.ts`
- Create: `frontend/src/lib/drawSkeleton.test.ts`

**Interfaces:**
- Consumes: `Landmark` from `./poseTypes` (Task 3)
- Produces: `drawSkeleton(ctx, landmarks, canvasWidth, canvasHeight, connections, options?)` — used by `VideoPoseViewer` (Task 10).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/drawSkeleton.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { drawSkeleton } from './drawSkeleton'
import type { Landmark } from './poseTypes'

function createMockContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
  }
}

describe('drawSkeleton', () => {
  it('does nothing when landmarks is null', () => {
    const ctx = createMockContext()
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, null, 100, 100, [])
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  it('draws a line for each connection, scaled to canvas size', () => {
    const ctx = createMockContext()
    const landmarks: Landmark[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, landmarks, 200, 100, [[0, 1]])
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 100)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('draws a dot for every landmark', () => {
    const ctx = createMockContext()
    const landmarks: Landmark[] = [
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.25, y: 0.75, z: 0 },
    ]
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, landmarks, 100, 100, [])
    expect(ctx.arc).toHaveBeenCalledTimes(2)
  })

  it('skips connections that reference a missing landmark index instead of throwing', () => {
    const ctx = createMockContext()
    const landmarks: Landmark[] = [{ x: 0, y: 0, z: 0 }]
    expect(() =>
      drawSkeleton(ctx as unknown as CanvasRenderingContext2D, landmarks, 100, 100, [[0, 5]])
    ).not.toThrow()
    expect(ctx.moveTo).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- drawSkeleton`
Expected: FAIL — `drawSkeleton.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/lib/drawSkeleton.ts`:

```ts
import type { Landmark } from './poseTypes'

export interface DrawSkeletonOptions {
  color?: string
  radius?: number
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[] | null,
  canvasWidth: number,
  canvasHeight: number,
  connections: readonly (readonly [number, number])[],
  options: DrawSkeletonOptions = {}
): void {
  if (!landmarks) return

  const color = options.color ?? '#00FF00'
  const radius = options.radius ?? 3

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color

  for (const [startIdx, endIdx] of connections) {
    const start = landmarks[startIdx]
    const end = landmarks[endIdx]
    if (!start || !end) continue
    ctx.beginPath()
    ctx.moveTo(start.x * canvasWidth, start.y * canvasHeight)
    ctx.lineTo(end.x * canvasWidth, end.y * canvasHeight)
    ctx.stroke()
  }

  for (const landmark of landmarks) {
    ctx.beginPath()
    ctx.arc(landmark.x * canvasWidth, landmark.y * canvasHeight, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- drawSkeleton`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/drawSkeleton.ts frontend/src/lib/drawSkeleton.test.ts
git commit -m "feat(frontend): add pure canvas skeleton-drawing function"
```

---

### Task 6: `seekTo` DOM helper test coverage

**Files:**
- Modify: `frontend/src/lib/frameExtraction.test.ts` (add tests for `seekTo`, already implemented in Task 3)

**Interfaces:**
- Consumes: `seekTo` from `./frameExtraction` (implemented in Task 3, untested until now)

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/frameExtraction.test.ts`:

```ts
import { afterEach, beforeEach } from 'vitest'
import { seekTo } from './frameExtraction'

function createFakeVideo() {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    currentTime: 0,
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
  }
}

describe('seekTo', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets currentTime immediately and resolves after the seeked event fires', async () => {
    const fakeVideo = createFakeVideo()
    const promise = seekTo(fakeVideo as unknown as HTMLVideoElement, 1.5)

    expect(fakeVideo.currentTime).toBe(1.5)

    fakeVideo.dispatchSeeked()
    await expect(promise).resolves.toBeUndefined()
  })

  it('does not resolve before the seeked event fires', async () => {
    const fakeVideo = createFakeVideo()
    let resolved = false
    seekTo(fakeVideo as unknown as HTMLVideoElement, 2).then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)

    fakeVideo.dispatchSeeked()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(true)
  })
})
```

Also add `import { describe, expect, it, vi } from 'vitest'` if not already present at the top of the file (merge with the existing import from Task 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- frameExtraction`
Expected: The two new `seekTo` tests FAIL if `requestAnimationFrame` isn't stubbed correctly, or PASS immediately if `seekTo`'s Task-3 implementation is already correct — since `seekTo` was written in Task 3, this step should actually go green right away. That's fine: the point of this task is to add missing coverage for existing behavior, not to drive new implementation. Confirm both new tests pass and no existing test broke.

- [ ] **Step 3: Run full frameExtraction suite to confirm nothing regressed**

Run: `cd frontend && npm run test -- frameExtraction`
Expected: PASS (8 tests total: 6 from Task 3 + 2 new)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/frameExtraction.test.ts
git commit -m "test(frontend): add coverage for seekTo DOM helper"
```

---

### Task 7: `usePoseEstimation` hook — real MediaPipe integration

**Files:**
- Create: `frontend/src/hooks/usePoseEstimation.ts`

**Interfaces:**
- Consumes: `computeFrameCount`, `frameTimestampMs`, `seekTo` from `../lib/frameExtraction`; `smoothSequence` from `../lib/oneEuroFilter`; `PoseFrame`, `PoseSequence` from `../lib/poseTypes`
- Produces: `usePoseEstimation()` → `{ estimateSequence(video: HTMLVideoElement, options: { targetFps: number; onProgress?: (current: number, total: number) => void }): Promise<PoseSequence> }` — used by `App.tsx` (Task 9).

**Note on testing:** this task wires real `@mediapipe/tasks-vision` WASM + a downloaded model file against a real `<video>` element. That's not meaningfully unit-testable (it needs network access, a real GPU/CPU delegate, and real decoded video frames) — the pure logic it depends on (frame timing, smoothing) is already covered by Tasks 3–4. This task is implemented directly and verified with the manual procedure in Step 3.

- [ ] **Step 1: Write the implementation**

`frontend/src/hooks/usePoseEstimation.ts`:

```ts
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef } from 'react'
import { computeFrameCount, frameTimestampMs, seekTo } from '../lib/frameExtraction'
import { smoothSequence } from '../lib/oneEuroFilter'
import type { PoseFrame, PoseSequence } from '../lib/poseTypes'

const MEDIAPIPE_VERSION = '0.10.14'
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

export interface EstimateSequenceOptions {
  targetFps: number
  onProgress?: (current: number, total: number) => void
}

async function createPoseLandmarker(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL)
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}

export function usePoseEstimation() {
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const delegateRef = useRef<'GPU' | 'CPU'>('GPU')

  useEffect(() => {
    return () => {
      landmarkerRef.current?.close()
    }
  }, [])

  const ensureLandmarker = useCallback(async (): Promise<PoseLandmarker> => {
    if (landmarkerRef.current) return landmarkerRef.current
    try {
      landmarkerRef.current = await createPoseLandmarker('GPU')
      delegateRef.current = 'GPU'
    } catch (err) {
      console.warn('GPU delegate init failed, falling back to CPU', err)
      landmarkerRef.current = await createPoseLandmarker('CPU')
      delegateRef.current = 'CPU'
    }
    console.info(`PoseLandmarker initialized with delegate=${delegateRef.current}`)
    return landmarkerRef.current
  }, [])

  const estimateSequence = useCallback(
    async (video: HTMLVideoElement, options: EstimateSequenceOptions): Promise<PoseSequence> => {
      const { targetFps, onProgress } = options
      const landmarker = await ensureLandmarker()

      const durationSec = video.duration
      const frameCount = computeFrameCount(durationSec, targetFps)
      const frames: PoseFrame[] = []

      for (let i = 0; i < frameCount; i++) {
        const targetTimeSec = Math.min(i / targetFps, durationSec - 0.05)
        await seekTo(video, targetTimeSec)

        const timestampMs = frameTimestampMs(i, targetFps)
        const result = landmarker.detectForVideo(video, timestampMs)

        frames.push({
          frameIndex: i,
          timestampMs,
          landmarksRaw: result.landmarks[0] ?? null,
          landmarksSmoothed: null,
          worldLandmarksRaw: result.worldLandmarks[0] ?? null,
        })

        onProgress?.(i + 1, frameCount)
      }

      return {
        videoDurationMs: durationSec * 1000,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        targetFps,
        frameCount,
        frames: smoothSequence(frames),
        modelInfo: { variant: 'full', delegate: delegateRef.current },
      }
    },
    [ensureLandmarker]
  )

  return { estimateSequence }
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (documented procedure, not an automated test)**

This step can only be fully exercised once `App.tsx`/`VideoPoseViewer` exist (Tasks 9–10), but confirm now that it at least loads without throwing:

1. Temporarily render a minimal test harness (or wait until Task 11's full manual pass) that calls `estimateSequence` on a `<video>` pointed at a short local test clip.
2. Confirm in the browser console that `PoseLandmarker initialized with delegate=GPU` logs (or `CPU` if GPU init fails) — no uncaught errors.
3. Confirm `onProgress` fires once per frame and reaches `(frameCount, frameCount)`.
4. Confirm the returned `PoseSequence.frames` array has one entry per frame with non-null `landmarksSmoothed` for frames where a person is visible.

Full end-to-end confirmation happens in Task 11's manual verification pass — this step is a placeholder checkpoint, not the final sign-off.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/usePoseEstimation.ts
git commit -m "feat(frontend): add usePoseEstimation hook with MediaPipe PoseLandmarker integration"
```

---

### Task 8: `FileUpload` and `ProcessingProgress` components

**Files:**
- Create: `frontend/src/components/FileUpload.tsx`
- Create: `frontend/src/components/FileUpload.test.tsx`
- Create: `frontend/src/components/ProcessingProgress.tsx`
- Create: `frontend/src/components/ProcessingProgress.test.tsx`

**Interfaces:**
- Produces: `<FileUpload onFileSelected={(file: File) => void} disabled?: boolean />`; `<ProcessingProgress current={number} total={number} />` — both consumed by `App.tsx` (Task 9).

- [ ] **Step 1: Write the failing tests for FileUpload**

`frontend/src/components/FileUpload.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileUpload } from './FileUpload'

describe('FileUpload', () => {
  it('calls onFileSelected when a file is chosen', async () => {
    const onFileSelected = vi.fn()
    render(<FileUpload onFileSelected={onFileSelected} />)

    const input = screen.getByTestId('file-upload-input')
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(input, file)

    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('disables the input when disabled is true', () => {
    render(<FileUpload onFileSelected={vi.fn()} disabled />)
    expect(screen.getByTestId('file-upload-input')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- FileUpload`
Expected: FAIL — `FileUpload.tsx` does not exist yet.

- [ ] **Step 3: Write minimal FileUpload implementation**

`frontend/src/components/FileUpload.tsx`:

```tsx
interface FileUploadProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export function FileUpload({ onFileSelected, disabled }: FileUploadProps) {
  return (
    <input
      type="file"
      accept="video/mp4,video/quicktime"
      disabled={disabled}
      data-testid="file-upload-input"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onFileSelected(file)
      }}
    />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- FileUpload`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing tests for ProcessingProgress**

`frontend/src/components/ProcessingProgress.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProcessingProgress } from './ProcessingProgress'

describe('ProcessingProgress', () => {
  it('renders the rounded percentage', () => {
    render(<ProcessingProgress current={30} total={120} />)
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('renders 0% when total is 0', () => {
    render(<ProcessingProgress current={0} total={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npm run test -- ProcessingProgress`
Expected: FAIL — `ProcessingProgress.tsx` does not exist yet.

- [ ] **Step 7: Write minimal ProcessingProgress implementation**

`frontend/src/components/ProcessingProgress.tsx`:

```tsx
interface ProcessingProgressProps {
  current: number
  total: number
}

export function ProcessingProgress({ current, total }: ProcessingProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div>
      <progress value={current} max={total} data-testid="progress-bar" />
      <span>{percent}%</span>
    </div>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npm run test -- ProcessingProgress`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/FileUpload.tsx frontend/src/components/FileUpload.test.tsx \
        frontend/src/components/ProcessingProgress.tsx frontend/src/components/ProcessingProgress.test.tsx
git commit -m "feat(frontend): add FileUpload and ProcessingProgress components"
```

---

### Task 9: `App.tsx` state machine and orchestration

**Files:**
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/App.test.tsx`
- Modify: `frontend/src/main.tsx` (point at the new `App`)

**Interfaces:**
- Consumes: `FileUpload`, `ProcessingProgress` (Task 8); `usePoseEstimation` (Task 7, mocked in tests); `VideoPoseViewer` (Task 10 — not yet implemented; see Step 0 note)
- Produces: the top-level `idle | processing | ready` state machine that Task 10/11 build on.

**Step 0 sequencing note:** `App.tsx` imports `VideoPoseViewer` from `./components/VideoPoseViewer`, which Task 10 creates. Since this task's tests mock `usePoseEstimation` and never let a real MediaPipe call happen, `VideoPoseViewer` only needs to exist as a real (if not yet fully polished) component for these tests to run — implement Task 10 immediately before this task if working strictly in order, or stub `VideoPoseViewer` minimally here and let Task 10 flesh it out. This plan assumes Task 10 is done first; reorder if executing strictly task-by-task by swapping Tasks 9 and 10.

- [ ] **Step 1: Write the failing tests**

`frontend/src/App.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { PoseSequence } from './lib/poseTypes'

const mockEstimateSequence = vi.fn()

vi.mock('./hooks/usePoseEstimation', () => ({
  usePoseEstimation: () => ({ estimateSequence: mockEstimateSequence }),
}))

const fakeSequence: PoseSequence = {
  videoDurationMs: 1000,
  videoWidth: 640,
  videoHeight: 480,
  targetFps: 30,
  frameCount: 30,
  frames: [],
  modelInfo: { variant: 'full', delegate: 'GPU' },
}

beforeEach(() => {
  mockEstimateSequence.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

describe('App', () => {
  it('starts in idle state showing the file upload input', () => {
    render(<App />)
    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
  })

  it('shows processing progress after a file is selected', async () => {
    mockEstimateSequence.mockReturnValue(new Promise(() => {}))
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument())
  })

  it('transitions to ready state once estimateSequence resolves', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('Try another video')).toBeInTheDocument())
  })

  it('resets to idle and revokes the object URL on "Try another video"', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<App />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)
    await waitFor(() => screen.getByText('Try another video'))

    await userEvent.click(screen.getByText('Try another video'))

    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- App.test`
Expected: FAIL — `App.tsx` does not exist yet (or exists only as the Vite template default).

- [ ] **Step 3: Write minimal implementation**

`frontend/src/App.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { FileUpload } from './components/FileUpload'
import { ProcessingProgress } from './components/ProcessingProgress'
import { VideoPoseViewer } from './components/VideoPoseViewer'
import { usePoseEstimation } from './hooks/usePoseEstimation'
import type { PoseSequence } from './lib/poseTypes'

const TARGET_FPS = 30

type AppState = 'idle' | 'processing' | 'ready'

export function App() {
  const [state, setState] = useState<AppState>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [poseSequence, setPoseSequence] = useState<PoseSequence | null>(null)
  const { estimateSequence } = usePoseEstimation()

  const handleFileSelected = (file: File) => {
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setPoseSequence(null)
    setProgress({ current: 0, total: 0 })
    setState('processing')
  }

  const handleVideoElementReady = useCallback(
    (video: HTMLVideoElement) => {
      const run = async () => {
        const sequence = await estimateSequence(video, {
          targetFps: TARGET_FPS,
          onProgress: (current, total) => setProgress({ current, total }),
        })
        video.currentTime = 0
        setPoseSequence(sequence)
        setState('ready')
      }
      run()
    },
    [estimateSequence]
  )

  const handleReset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(null)
    setPoseSequence(null)
    setState('idle')
  }

  return (
    <div>
      {state === 'idle' && <FileUpload onFileSelected={handleFileSelected} />}
      {(state === 'processing' || state === 'ready') && videoUrl && (
        <>
          {state === 'processing' && <ProcessingProgress current={progress.current} total={progress.total} />}
          <VideoPoseViewer
            videoUrl={videoUrl}
            poseSequence={poseSequence}
            onVideoElementReady={handleVideoElementReady}
          />
          {state === 'ready' && <button onClick={handleReset}>Try another video</button>}
        </>
      )}
    </div>
  )
}
```

`frontend/src/main.tsx` (replace the Vite template body):

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- App.test`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/main.tsx
git commit -m "feat(frontend): add App state machine (idle/processing/ready)"
```

---

### Task 10: `VideoPoseViewer` — video/canvas playback and overlay

**Files:**
- Create: `frontend/src/components/VideoPoseViewer.tsx`

**Interfaces:**
- Consumes: `frameIndexForTime` from `../lib/frameExtraction` (Task 3); `drawSkeleton` from `../lib/drawSkeleton` (Task 5); `PoseSequence` from `../lib/poseTypes` (Task 3)
- Produces: `<VideoPoseViewer videoUrl poseSequence onVideoElementReady />` — consumed by `App.tsx` (Task 9).

**Note on testing:** this component's core behavior is real video decoding and real canvas painting synced to playback — jsdom does not implement either meaningfully, so this is implemented directly and verified manually in Task 11. The frame-index math it uses is already unit-tested (Task 3).

- [ ] **Step 1: Write the implementation**

`frontend/src/components/VideoPoseViewer.tsx`:

```tsx
import { PoseLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { drawSkeleton } from '../lib/drawSkeleton'
import { frameIndexForTime } from '../lib/frameExtraction'
import type { PoseSequence } from '../lib/poseTypes'

interface VideoPoseViewerProps {
  videoUrl: string
  poseSequence: PoseSequence | null
  onVideoElementReady: (video: HTMLVideoElement) => void
}

export function VideoPoseViewer({ videoUrl, poseSequence, onVideoElementReady }: VideoPoseViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (video) onVideoElementReady(video)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !poseSequence) return
    canvas.width = poseSequence.videoWidth
    canvas.height = poseSequence.videoHeight
  }, [poseSequence])

  const drawCurrentFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !poseSequence) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const frameIndex = frameIndexForTime(video.currentTime, poseSequence.targetFps, poseSequence.frameCount)
    const frame = poseSequence.frames[frameIndex]

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSkeleton(
      ctx,
      frame?.landmarksSmoothed ?? null,
      canvas.width,
      canvas.height,
      PoseLandmarker.POSE_CONNECTIONS as unknown as readonly (readonly [number, number])[]
    )
  }

  useEffect(() => {
    if (!isPlaying || !poseSequence) return
    const loop = () => {
      drawCurrentFrame()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, poseSequence])

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play()
      setIsPlaying(true)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Number(e.target.value)
    drawCurrentFrame()
  }

  return (
    <div style={{ position: 'relative', width: poseSequence?.videoWidth ?? '100%', maxWidth: '100%' }}>
      <video
        ref={videoRef}
        src={videoUrl}
        style={{ width: '100%', display: 'block' }}
        onLoadedMetadata={drawCurrentFrame}
      />
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      {poseSequence && (
        <div>
          <button onClick={handlePlayPause}>{isPlaying ? 'Pause' : 'Play'}</button>
          <input
            type="range"
            min={0}
            max={poseSequence.videoDurationMs / 1000}
            step={1 / poseSequence.targetFps}
            onChange={handleSeek}
            data-testid="scrubber"
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite to confirm nothing else broke**

Run: `cd frontend && npm run test`
Expected: all prior tests (Tasks 1, 3–6, 8–9) still PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/VideoPoseViewer.tsx
git commit -m "feat(frontend): add VideoPoseViewer with playback, scrubber, and skeleton overlay"
```

---

### Task 11: End-to-end wiring, polish, and manual verification

**Files:**
- Modify: `frontend/src/hooks/usePoseEstimation.ts` (error handling)
- Modify: `frontend/src/components/VideoPoseViewer.tsx` (video error state)

**Interfaces:**
- No new interfaces — this task polishes and verifies the full pipeline built in Tasks 1–10.

- [ ] **Step 1: Add basic error handling**

In `usePoseEstimation.ts`, wrap `ensureLandmarker`'s CPU fallback attempt so a hard failure surfaces instead of hanging silently:

```ts
const ensureLandmarker = useCallback(async (): Promise<PoseLandmarker> => {
  if (landmarkerRef.current) return landmarkerRef.current
  try {
    landmarkerRef.current = await createPoseLandmarker('GPU')
    delegateRef.current = 'GPU'
  } catch (err) {
    console.warn('GPU delegate init failed, falling back to CPU', err)
    try {
      landmarkerRef.current = await createPoseLandmarker('CPU')
      delegateRef.current = 'CPU'
    } catch (cpuErr) {
      throw new Error(`Failed to initialize MediaPipe PoseLandmarker on both GPU and CPU: ${String(cpuErr)}`)
    }
  }
  console.info(`PoseLandmarker initialized with delegate=${delegateRef.current}`)
  return landmarkerRef.current
}, [])
```

In `VideoPoseViewer.tsx`, add an `onError` handler on the `<video>` element that surfaces unsupported-codec errors instead of failing silently:

```tsx
<video
  ref={videoRef}
  src={videoUrl}
  style={{ width: '100%', display: 'block' }}
  onLoadedMetadata={drawCurrentFrame}
  onError={() => console.error('Video failed to load — check the file is a supported mp4/mov codec.')}
/>
```

- [ ] **Step 2: Type-check and run the full automated test suite**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Run: `cd backend && pytest`
Expected: all PASS, no type errors.

- [ ] **Step 3: Manual verification — backend**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 4: Manual verification — frontend, real clips**

```bash
cd frontend && npm run dev
```

Using 2–3 short (5–10s) real test clips (at least one landscape, one portrait, mixing `.mp4`/`.mov`):

1. Upload a clip; confirm the progress bar advances smoothly to 100% and note the wall-clock processing time (slower than real-time is fine — it's a pre-process pass — flag only if egregiously slow).
2. Confirm the skeleton tracks the person's real joints correctly (not offset, mirrored, or stretched) for both the landscape and portrait clip.
3. Pause, then drag the scrubber forward and backward — confirm the overlay updates to match with no stale/lagging skeleton.
4. Open the browser console and confirm `PoseLandmarker initialized with delegate=GPU` (or the CPU fallback message) logs with no uncaught errors.
5. Click "Try another video" and confirm it returns to the upload screen; check the console/Network tab confirms no lingering blob URL (or manually verify `URL.revokeObjectURL` was called by checking React DevTools state resets).
6. Test in Chrome first, then Safari — this is the actual point of choosing seek-based extraction over `requestVideoFrameCallback`, so confirm behavior matches across both.
7. Optional: temporarily swap `frame?.landmarksSmoothed` for `frame?.landmarksRaw` in `VideoPoseViewer.drawCurrentFrame` to confirm the One-Euro filter is visibly reducing jitter, then revert.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePoseEstimation.ts frontend/src/components/VideoPoseViewer.tsx
git commit -m "feat(frontend): add error handling for MediaPipe init and video load failures"
```

---

## Self-Review Notes

- **Spec coverage:** every milestone-1 bullet from `sports-motion-comparison-spec.md`'s build-order step 1 is covered: upload (Task 8/9), pose estimation (Task 7), skeleton overlay (Task 5/10), no comparison logic (explicitly out of scope, confirmed absent from all tasks).
- **Type consistency:** `PoseSequence`/`PoseFrame`/`Landmark` (Task 3) are used identically across Tasks 4, 7, 9, 10 — checked field names (`landmarksSmoothed`, `landmarksRaw`, `targetFps`, `frameCount`) match on every use.
- **No placeholders:** all steps contain real, complete code; the two manual-verification tasks (7, 10) are flagged explicitly as such rather than given fake unit tests that wouldn't actually validate MediaPipe/canvas behavior.
