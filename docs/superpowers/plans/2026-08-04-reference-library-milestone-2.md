# Reference Clip Library (Milestone 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the curated reference-clip pipeline for one motion (swimming freestyle) per `sports-motion-comparison-spec.md`'s build-order step 2: a directory-based backend store + listing endpoint for pre-processed reference clips, and a dev-only frontend tool that lets a developer run the existing pose pipeline on a local video file and export a `pose.json`. This milestone ships the *pipeline*, not real clips — the automated test suite must pass with zero clips present.

**Architecture:** Backend gains a small, factory-constructed FastAPI app (`create_app()`) so the reference-clip directory can be swapped per-test without touching disk state; a new `GET /api/reference-clips` JSON endpoint computes `ReferenceClip` records from a curated directory tree; a guarded `StaticFiles` mount at `/reference-clips` serves the actual video/pose-json bytes. Frontend gains a second, isolated Vite HTML entry point (`reference-tool.html`) — since this app has no router, a second root HTML file is the correct idiom for a second entry point in Vite's native multi-page-app support — whose component reuses `FileUpload`, `ProcessingProgress`, `VideoPoseViewer`, and `usePoseEstimation` exactly as `App.tsx` does, adding only a "Download pose.json" button.

**Tech Stack:** Same as milestone 1 — React 18, Vite, TypeScript, Vitest + RTL; Python 3, FastAPI, pytest + httpx. No new dependencies on either side.

See `docs/superpowers/specs/2026-08-04-reference-library-milestone-2-design.md` for the design rationale (options considered, why the dev-page approach was chosen over headless automation or a Python reimplementation).

## Global Constraints

- Chosen motion for this milestone: `freestyle` (swimming). Directory/query-param values use this literal string.
- Backend: reuse `fastapi.staticfiles.StaticFiles` for byte-serving; no `aiofiles`, no `python-multipart` — verified unnecessary (StaticFiles depends on `anyio`, already installed transitively; no upload endpoint is added). No changes to `backend/requirements.txt`.
- Frontend: no new npm dependencies. No router. The dev tool is a second Vite HTML entry (`frontend/reference-tool.html`), not a route inside `App.tsx`.
- The dev tool must not appear anywhere in `App.tsx`'s idle/processing/ready flow — it is a separate, isolated page.
- The reference-clip listing endpoint and static mount must both behave correctly (no errors, empty results) with zero clips on disk — the automated suite may not depend on real/committed video files.
- Directory layout: `backend/reference_clips/<motion_type>/<clip_id>/{video.<ext>, pose.json, metadata.json}`.
- `ReferenceClip` JSON shape returned by the API matches the spec's field list exactly: `id, motion_type, video_url, pose_data_url, camera_angle_note, source_or_license_note`. No extra fields.
- `metadata.json` (hand-authored per clip) holds only the two free-text notes; `id` and `motion_type` are derived from the directory names, not duplicated on disk.
- 2-space indentation for TypeScript; standard PEP 8 for Python.

---

## File Structure

```
Sports_Analysis_App/
├── backend/
│   ├── app/
│   │   └── main.py                          # modified: create_app() factory + new endpoint/mount
│   ├── reference_clips/
│   │   └── README.md                         # new: on-disk layout doc; keeps dir present & empty in git
│   └── tests/
│       └── test_reference_clips.py           # new
└── frontend/
    ├── reference-tool.html                   # new: second Vite entry point
    └── src/
        └── dev-tools/
            ├── reference-tool-main.tsx        # new: React root for the dev tool
            ├── ReferenceToolApp.tsx            # new: reuses FileUpload/ProcessingProgress/VideoPoseViewer/usePoseEstimation
            └── ReferenceToolApp.test.tsx       # new
```

**Testing strategy note:** the backend endpoint is pure filesystem-driven logic — fully unit-testable via `TestClient` against a `tmp_path`-backed app, no committed binary fixtures, no monkeypatching needed because `create_app()` takes the directory as a parameter. The frontend dev-tool component is testable the same way `App.tsx` already is: mock `usePoseEstimation`, never let a real MediaPipe call happen, assert on state/DOM. Real MediaPipe processing and real video decoding are still not unit-testable (same reasoning as milestone 1's `usePoseEstimation`/`VideoPoseViewer`) — that stays a manual-verification concern (Task 4).

---

### Task 1: Backend — refactor `main.py` into a `create_app()` factory

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_health.py` (no behavior change expected — confirms the refactor is safe)

**Interfaces:**
- Produces: `create_app(reference_clips_dir: Path = ..., frontend_dist_dir: Path = ...) -> FastAPI`; module-level `app = create_app()` (unchanged import path `app.main:app` for `test_health.py` and `uvicorn app.main:app`).

This is a pure testability seam — no new behavior yet. It lets Task 2's tests build a fresh app pointed at a `tmp_path` without touching the real `backend/reference_clips/` directory or monkeypatching module globals.

- [ ] **Step 1: Confirm the baseline passes before touching anything**

Run: `cd backend && pytest -v`
Expected: `test_health.py::test_health_returns_ok` and `test_sanity.py::test_pytest_runs` PASS (2 tests).

- [ ] **Step 2: Refactor `main.py` into a factory**

`backend/app/main.py`:

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

_BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_REFERENCE_CLIPS_DIR = _BACKEND_DIR / "reference_clips"
DEFAULT_FRONTEND_DIST_DIR = _BACKEND_DIR.parent / "frontend" / "dist"


def create_app(
    reference_clips_dir: Path = DEFAULT_REFERENCE_CLIPS_DIR,
    frontend_dist_dir: Path = DEFAULT_FRONTEND_DIST_DIR,
) -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    if reference_clips_dir.is_dir():
        app.mount("/reference-clips", StaticFiles(directory=str(reference_clips_dir)), name="reference-clips")

    if frontend_dist_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(frontend_dist_dir), html=True), name="frontend")

    return app


app = create_app()
```

(The `/reference-clips` static mount moves in here now, guarded exactly like the existing `frontend_dist` mount; the `GET /api/reference-clips` JSON route is added in Task 2 — it must be registered *before* the `/` frontend mount, since Starlette mounts match by prefix and a mount registered at `/` would otherwise shadow routes registered after it. `/health` and the future `/api/reference-clips` route both stay above the `/` mount, same ordering the file already had.)

- [ ] **Step 3: Confirm nothing regressed**

Run: `cd backend && pytest -v`
Expected: same 2 tests still PASS, `from app.main import app` in `test_health.py` still resolves.

- [ ] **Step 4: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add backend/app/main.py
git commit -m "refactor(backend): extract create_app() factory for per-test directory injection"
```

---

### Task 2: Backend — `GET /api/reference-clips` + `/reference-clips` static serving

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_reference_clips.py`
- Create: `backend/reference_clips/README.md`

**Interfaces:**
- Produces: `GET /api/reference-clips[?motion_type=<str>]` → `200` + `list[ReferenceClip]` (`ReferenceClip = {id, motion_type, video_url, pose_data_url, camera_angle_note, source_or_license_note}`); `GET /reference-clips/<motion_type>/<clip_id>/<file>` → raw bytes via `StaticFiles`, `404` if missing.

**Design notes (read before implementing):**
- Filtering by an unknown `motion_type` is a normal, valid query — it returns `200 []`, not `404`. A `404` only comes from `StaticFiles` when a requested file genuinely doesn't exist on disk.
- A clip directory missing `metadata.json` is silently skipped (not a hard error) — curation is manual, partial directories are an expected mid-edit state, not a bug.
- `video_url` is resolved by globbing `video.*` in the clip directory (extension varies: `.mp4`/`.mov`); `pose_data_url` assumes a fixed `pose.json` filename (produced by the dev tool in Task 3).

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_reference_clips.py`:

```python
import json

from fastapi.testclient import TestClient

from app.main import create_app


def _write_clip(clips_dir, motion_type, clip_id, *, metadata=None, video=True, pose=True):
    clip_dir = clips_dir / motion_type / clip_id
    clip_dir.mkdir(parents=True)
    if metadata is not None:
        (clip_dir / "metadata.json").write_text(json.dumps(metadata))
    if video:
        (clip_dir / "video.mp4").write_text("placeholder-not-a-real-video")
    if pose:
        (clip_dir / "pose.json").write_text(json.dumps({"frames": []}))
    return clip_dir


def test_returns_empty_list_when_reference_clips_dir_does_not_exist(tmp_path):
    app = create_app(reference_clips_dir=tmp_path / "does-not-exist")
    client = TestClient(app)

    response = client.get("/api/reference-clips")

    assert response.status_code == 200
    assert response.json() == []


def test_returns_empty_list_when_reference_clips_dir_is_empty(tmp_path):
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/reference-clips")

    assert response.status_code == 200
    assert response.json() == []


def test_lists_a_clip_with_metadata_and_servable_urls(tmp_path):
    _write_clip(
        tmp_path,
        "freestyle",
        "clip-1",
        metadata={"camera_angle_note": "side, water level", "source_or_license_note": "self-filmed"},
    )
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/reference-clips")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "clip-1",
            "motion_type": "freestyle",
            "video_url": "/reference-clips/freestyle/clip-1/video.mp4",
            "pose_data_url": "/reference-clips/freestyle/clip-1/pose.json",
            "camera_angle_note": "side, water level",
            "source_or_license_note": "self-filmed",
        }
    ]


def test_filters_by_motion_type(tmp_path):
    _write_clip(tmp_path, "freestyle", "clip-1", metadata={"camera_angle_note": "a", "source_or_license_note": "b"})
    _write_clip(tmp_path, "butterfly", "clip-2", metadata={"camera_angle_note": "c", "source_or_license_note": "d"})
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/reference-clips", params={"motion_type": "freestyle"})

    assert response.status_code == 200
    assert [clip["id"] for clip in response.json()] == ["clip-1"]


def test_returns_empty_list_for_unknown_motion_type(tmp_path):
    _write_clip(tmp_path, "freestyle", "clip-1", metadata={"camera_angle_note": "a", "source_or_license_note": "b"})
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/reference-clips", params={"motion_type": "backstroke"})

    assert response.status_code == 200
    assert response.json() == []


def test_skips_clip_directory_missing_metadata_json(tmp_path):
    _write_clip(tmp_path, "freestyle", "clip-1", metadata=None)
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/reference-clips")

    assert response.status_code == 200
    assert response.json() == []


def test_serves_the_actual_pose_json_bytes(tmp_path):
    _write_clip(
        tmp_path, "freestyle", "clip-1", metadata={"camera_angle_note": "a", "source_or_license_note": "b"}
    )
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/reference-clips/freestyle/clip-1/pose.json")

    assert response.status_code == 200
    assert response.json() == {"frames": []}


def test_404_for_a_clip_file_that_does_not_exist(tmp_path):
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/reference-clips/freestyle/nonexistent-clip/video.mp4")

    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_reference_clips.py -v`
Expected: FAIL — `/api/reference-clips` doesn't exist yet (404s where 200 is expected), and the static-serving tests 404 unconditionally since the mount doesn't exist yet either.

- [ ] **Step 3: Implement the listing logic and route**

Add to `backend/app/main.py` (replacing the file from Task 1):

```python
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

_BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_REFERENCE_CLIPS_DIR = _BACKEND_DIR / "reference_clips"
DEFAULT_FRONTEND_DIST_DIR = _BACKEND_DIR.parent / "frontend" / "dist"


def create_app(
    reference_clips_dir: Path = DEFAULT_REFERENCE_CLIPS_DIR,
    frontend_dist_dir: Path = DEFAULT_FRONTEND_DIST_DIR,
) -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/reference-clips")
    def list_reference_clips(motion_type: str | None = None) -> list[dict]:
        return _list_reference_clips(reference_clips_dir, motion_type)

    if reference_clips_dir.is_dir():
        app.mount("/reference-clips", StaticFiles(directory=str(reference_clips_dir)), name="reference-clips")

    if frontend_dist_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(frontend_dist_dir), html=True), name="frontend")

    return app


def _list_reference_clips(reference_clips_dir: Path, motion_type: str | None) -> list[dict]:
    """Build ReferenceClip records from backend/reference_clips/<motion_type>/<clip_id>/."""
    if not reference_clips_dir.is_dir():
        return []

    if motion_type is not None:
        motion_dirs = [reference_clips_dir / motion_type]
    else:
        motion_dirs = sorted(p for p in reference_clips_dir.iterdir() if p.is_dir())

    clips: list[dict] = []
    for motion_dir in motion_dirs:
        if not motion_dir.is_dir():
            continue
        for clip_dir in sorted(p for p in motion_dir.iterdir() if p.is_dir()):
            metadata_path = clip_dir / "metadata.json"
            if not metadata_path.is_file():
                # ponytail: skip incomplete clip directories instead of erroring —
                # curation is manual, partial dirs are an expected mid-edit state.
                continue
            metadata = json.loads(metadata_path.read_text())
            video_paths = sorted(clip_dir.glob("video.*"))
            pose_path = clip_dir / "pose.json"
            clips.append(
                {
                    "id": clip_dir.name,
                    "motion_type": motion_dir.name,
                    "video_url": (
                        f"/reference-clips/{motion_dir.name}/{clip_dir.name}/{video_paths[0].name}"
                        if video_paths
                        else None
                    ),
                    "pose_data_url": (
                        f"/reference-clips/{motion_dir.name}/{clip_dir.name}/pose.json"
                        if pose_path.is_file()
                        else None
                    ),
                    "camera_angle_note": metadata.get("camera_angle_note", ""),
                    "source_or_license_note": metadata.get("source_or_license_note", ""),
                }
            )
    return clips


app = create_app()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_reference_clips.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && pytest -v`
Expected: all PASS (10 tests: 2 from Task 1 + 8 new). Confirms the real (production) `app = create_app()` still boots fine even though `backend/reference_clips/` is about to gain a README-only, clip-free directory.

- [ ] **Step 6: Document the on-disk layout**

`backend/reference_clips/README.md`:

```markdown
# Reference clip library

One directory per clip:

    backend/reference_clips/<motion_type>/<clip_id>/
      video.<ext>     # the source clip (mp4/mov/etc.)
      pose.json        # PoseSequence JSON, produced by the reference-tool dev page
      metadata.json     # { "camera_angle_note": "...", "source_or_license_note": "..." }

`id` and `motion_type` are derived from the directory names — don't repeat
them inside metadata.json.

`GET /api/reference-clips` (optionally `?motion_type=freestyle`) lists
whatever is here, computing `video_url`/`pose_data_url` from the directory
layout. A clip directory missing `metadata.json` is skipped, not an error.
An empty or missing `reference_clips/` directory is valid too — the endpoint
returns `[]`.

This directory currently has no clips checked in — see
`docs/superpowers/plans/2026-08-04-reference-library-milestone-2.md` for how
to produce a `pose.json` (the `frontend/reference-tool.html` dev tool) and
where to place it.
```

Committing this file keeps `backend/reference_clips/` present (but clip-free) in a fresh checkout, which is exactly the "zero clips" state the tests and the production `create_app()` default both need to work correctly.

- [ ] **Step 7: Manually verify the server actually boots and serves the new route**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/api/reference-clips
curl http://localhost:8000/api/reference-clips?motion_type=freestyle
```
Expected: both return `[]`.

- [ ] **Step 8: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add backend/app/main.py backend/tests/test_reference_clips.py backend/reference_clips/README.md
git commit -m "feat(backend): add GET /api/reference-clips listing endpoint and static clip serving"
```

---

### Task 3: Frontend — dev-only reference-clip pose tool

**Files:**
- Create: `frontend/reference-tool.html`
- Create: `frontend/src/dev-tools/reference-tool-main.tsx`
- Create: `frontend/src/dev-tools/ReferenceToolApp.tsx`
- Create: `frontend/src/dev-tools/ReferenceToolApp.test.tsx`

**Interfaces:**
- Consumes: `FileUpload`, `ProcessingProgress`, `VideoPoseViewer` (all unchanged, from milestone 1); `usePoseEstimation().estimateSequence` (unchanged, mocked in tests exactly like `App.test.tsx` does); `PoseSequence` from `../lib/poseTypes`.
- Produces: `<ReferenceToolApp />`, mounted by `reference-tool-main.tsx` into `reference-tool.html`, a second Vite entry point isolated from `index.html`/`App.tsx`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/dev-tools/ReferenceToolApp.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenceToolApp } from './ReferenceToolApp'
import type { PoseSequence } from '../lib/poseTypes'

const mockEstimateSequence = vi.fn()

vi.mock('../hooks/usePoseEstimation', () => ({
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

describe('ReferenceToolApp', () => {
  it('starts in idle state showing the file upload input', () => {
    render(<ReferenceToolApp />)
    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
  })

  it('shows processing progress after a file is selected', async () => {
    mockEstimateSequence.mockReturnValue(new Promise(() => {}))
    render(<ReferenceToolApp />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    await waitFor(() => expect(screen.getByText('0%')).toBeInTheDocument())
  })

  it('shows a download link for pose.json once processing finishes', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<ReferenceToolApp />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)

    const link = await waitFor(() => screen.getByText('Download pose.json'))
    expect(link).toHaveAttribute('download', 'pose.json')
    expect(link).toHaveAttribute('href', 'blob:mock-url')
  })

  it('revokes both the video and download object URLs when resetting', async () => {
    mockEstimateSequence.mockResolvedValue(fakeSequence)
    render(<ReferenceToolApp />)
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByTestId('file-upload-input'), file)
    await waitFor(() => screen.getByText('Download pose.json'))

    await userEvent.click(screen.getByText('Process another clip'))

    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- ReferenceToolApp`
Expected: FAIL — `ReferenceToolApp.tsx` does not exist yet.

- [ ] **Step 3: Write the implementation**

`frontend/src/dev-tools/ReferenceToolApp.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { FileUpload } from '../components/FileUpload'
import { ProcessingProgress } from '../components/ProcessingProgress'
import { VideoPoseViewer } from '../components/VideoPoseViewer'
import { usePoseEstimation } from '../hooks/usePoseEstimation'
import type { PoseSequence } from '../lib/poseTypes'

const TARGET_FPS = 30

type ToolState = 'idle' | 'processing' | 'ready'

export function ReferenceToolApp() {
  const [state, setState] = useState<ToolState>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
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
        setDownloadUrl(URL.createObjectURL(new Blob([JSON.stringify(sequence)], { type: 'application/json' })))
        setState('ready')
      }
      run()
    },
    [estimateSequence]
  )

  const handleReset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setVideoUrl(null)
    setDownloadUrl(null)
    setPoseSequence(null)
    setState('idle')
  }

  return (
    <div>
      <h1>Reference clip pose tool (dev only)</h1>
      <p>
        Pick a local clip, let it process, then download pose.json and place it under
        backend/reference_clips/&lt;motion_type&gt;/&lt;clip_id&gt;/ alongside a video file and a
        hand-written metadata.json.
      </p>
      {state === 'idle' && <FileUpload onFileSelected={handleFileSelected} />}
      {(state === 'processing' || state === 'ready') && videoUrl && (
        <>
          {state === 'processing' && <ProcessingProgress current={progress.current} total={progress.total} />}
          <VideoPoseViewer videoUrl={videoUrl} poseSequence={poseSequence} onVideoElementReady={handleVideoElementReady} />
          {state === 'ready' && downloadUrl && (
            <>
              <a href={downloadUrl} download="pose.json">
                Download pose.json
              </a>
              <button onClick={handleReset}>Process another clip</button>
            </>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- ReferenceToolApp`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the second Vite entry point**

`frontend/reference-tool.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reference Clip Tool (dev only)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dev-tools/reference-tool-main.tsx"></script>
  </body>
</html>
```

`frontend/src/dev-tools/reference-tool-main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReferenceToolApp } from './ReferenceToolApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReferenceToolApp />
  </StrictMode>
)
```

- [ ] **Step 6: Decision — `vite.config.ts` `build.rollupOptions.input` (no code change)**

`npm run dev` needs no config change: Vite's dev server resolves any `.html` file at the repo root by path, so `reference-tool.html` is reachable at `/reference-tool.html` immediately. `vite build` is different — by default it only bundles `index.html`; `reference-tool.html` would silently be excluded from `dist/` and `npm run build` would still succeed. Per the constraint that this tool is dev-only and never shipped, leave `vite.config.ts` unchanged — don't bundle a manual dev tool into the production artifact. If the tool later needs to be reachable via `npm run build && npm run preview`, add:

```ts
build: {
  rollupOptions: {
    input: {
      main: resolve(import.meta.dirname, 'index.html'),
      referenceTool: resolve(import.meta.dirname, 'reference-tool.html'),
    },
  },
},
```

- [ ] **Step 7: Type-check and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: no type errors; all prior tests (milestone 1) plus the 4 new `ReferenceToolApp` tests PASS.

- [ ] **Step 8: Manually confirm the dev server serves the new page**

Run: `cd frontend && npm run dev`, then open the printed URL with `/reference-tool.html` appended (e.g. `http://localhost:5173/reference-tool.html`).
Expected: the file-upload input renders; `App.tsx`'s normal route (`/`) is unaffected.

- [ ] **Step 9: Commit**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git add frontend/reference-tool.html frontend/src/dev-tools
git commit -m "feat(frontend): add dev-only reference-clip pose tool (second Vite entry point)"
```

---

### Task 4: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — exercises Tasks 1–3 together with one real local clip.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `cd backend && pytest -v`
Run: `cd frontend && npx tsc --noEmit && npm run test`
Expected: all PASS, matching the milestone-1 baseline plus this milestone's new tests.

- [ ] **Step 2: Process one small local clip through the dev tool**

```bash
cd frontend && npm run dev
```

Open `/reference-tool.html`, upload a short (5–10s) local freestyle-swimming clip, let it process, click "Download pose.json". Confirm the skeleton overlay in `VideoPoseViewer` tracks the swimmer sensibly (same visual check as milestone 1's manual pass) before trusting the exported file.

- [ ] **Step 3: Hand-place the clip into the backend store**

```bash
mkdir -p backend/reference_clips/freestyle/clip-1
cp ~/Downloads/pose.json backend/reference_clips/freestyle/clip-1/pose.json
cp <your-local-clip>.mp4 backend/reference_clips/freestyle/clip-1/video.mp4
```

Hand-write `backend/reference_clips/freestyle/clip-1/metadata.json`:

```json
{
  "camera_angle_note": "side view, ~5m from pool edge, camera at water level",
  "source_or_license_note": "self-filmed, no license restrictions"
}
```

- [ ] **Step 4: Confirm the backend serves it correctly**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/api/reference-clips
curl http://localhost:8000/api/reference-clips?motion_type=freestyle
curl -I http://localhost:8000/reference-clips/freestyle/clip-1/video.mp4
curl -I http://localhost:8000/reference-clips/freestyle/clip-1/pose.json
```

Expected: the JSON list contains one `clip-1` entry with `motion_type: "freestyle"` and the URLs above matching the paths just created; both `curl -I` calls return `200`.

- [ ] **Step 5: Clean up before committing (don't check in real clip binaries by accident)**

```bash
cd /Users/nikb/Projects/Sports_Analysis_App
git status
```

Confirm `backend/reference_clips/freestyle/` does not appear as untracked/staged unless you've deliberately decided to commit this clip — this milestone intentionally ships with zero clips in version control (see Task 2 Step 6's README). Remove the local test clip when done: `rm -rf backend/reference_clips/freestyle/clip-1`.

---

## Self-Review Notes

- **Spec coverage:** the spec's `ReferenceClip` field set (`id, motion_type, video_url, pose_data_url, camera_angle_note, source_or_license_note`) is matched exactly by the `/api/reference-clips` response — no extra fields invented.
- **Zero-clips requirement:** verified at three levels — `_list_reference_clips` returns `[]` for a missing directory (Task 2, test 1) and an empty one (test 2); the static mount is guarded by `.is_dir()` exactly like the pre-existing `frontend/dist` mount, so a checkout with only `backend/reference_clips/README.md` boots cleanly; no test or endpoint depends on a real clip existing.
- **No new dependencies:** confirmed by inspecting the installed `starlette.staticfiles` source directly — it uses `anyio`, not `aiofiles` (not installed, not needed); no upload endpoint means `python-multipart` isn't needed either. `backend/requirements.txt` is untouched.
- **Reuse over rebuild:** the dev tool reuses `FileUpload`, `ProcessingProgress`, `VideoPoseViewer`, and `usePoseEstimation` verbatim from milestone 1 rather than rebuilding upload/progress/playback UI — only the download-button logic and the idle/processing/ready wiring are new, and that wiring is close to line-for-line what `App.tsx` already does.
- **Deferred, not built:** committing real clip binaries into git, a `.gitignore` rule for `video.*` under `reference_clips/`, and wiring `reference-tool.html` into the production build are all explicitly left undone with reasoning given inline — add any of them only if a concrete need shows up.
