# Reference Clip Library (Milestone 2) — Design

## Goal

Per `sports-motion-comparison-spec.md`'s suggested build order, step 2: "Build the curated reference library for one motion (2–3 clips), pre-processed offline." This milestone ships the *pipeline* for that library — not real clips. The chosen motion is **swimming freestyle**; the user will supply their own footage after this milestone lands.

## Constraints

- The automated test suite must pass with **zero clips present** — no real clips are part of this milestone.
- No new dependencies, frontend or backend.
- Reuse the existing, already-tested browser pose pipeline (`usePoseEstimation.ts`) instead of writing a second pose-estimation implementation.
- The app has no router (milestone-1 constraint, still holds) — a second Vite HTML entry point is the idiom for a second, isolated page.

## Design

### Offline processing: reuse the browser pipeline via a dev-only page

Three options were considered:
1. **Reuse the browser pipeline via a dev-only page (chosen).** A small isolated page in the frontend reuses `usePoseEstimation`'s `estimateSequence`, `FileUpload`, `ProcessingProgress`, and `VideoPoseViewer` verbatim — a developer picks a local clip, lets it process, downloads the resulting `PoseSequence` as `pose.json`. Zero new pose-estimation code, zero new dependencies, reuses code already validated in milestone 1.
2. **Headless browser automation** (e.g. Playwright driving the same page for batch processing). Rejected for now — adds a new dev dependency and moving parts for what is currently a rare, manual, one-clip-at-a-time task.
3. **Python MediaPipe on the backend.** Rejected — duplicates logic already built and tested on the frontend, with a different (legacy) model API, for no benefit at this scale.

### Backend: filesystem-driven library + listing endpoint

`backend/app/main.py` is refactored into a `create_app(reference_clips_dir, frontend_dist_dir)` factory (a pure testability seam — no behavior change) so tests can point it at a `tmp_path` instead of the real directory.

On-disk layout:
```
backend/reference_clips/<motion_type>/<clip_id>/
  video.<ext>      # source clip (mp4/mov/etc.)
  pose.json        # PoseSequence JSON, produced by the reference-tool dev page
  metadata.json    # { "camera_angle_note": "...", "source_or_license_note": "..." }
```
`id` and `motion_type` come from directory names, not duplicated inside `metadata.json`.

New route `GET /api/reference-clips[?motion_type=]` returns `list[ReferenceClip]`, matching the spec's field list exactly: `id, motion_type, video_url, pose_data_url, camera_angle_note, source_or_license_note`. No invented fields (frame count / duration already live inside `pose.json` — duplicating them on `metadata.json` would just be another place for them to drift out of sync).

Behavior:
- Missing or empty `reference_clips/` dir → `[]`, not an error (required — no real clips exist yet).
- Unknown `motion_type` filter → `[]`, not `404` (a normal, valid query).
- A clip directory missing `metadata.json` → skipped, not an error (curation is manual; partial directories are an expected mid-edit state).
- Actual video/pose-json bytes are served via a guarded `StaticFiles` mount at `/reference-clips`, the same guarded-mount pattern already used for `frontend/dist` — confirmed to need no new dependency (`starlette.staticfiles` uses `anyio`, not `aiofiles`; no upload endpoint means `python-multipart` isn't needed either).

### Frontend: dev-only tool as a second Vite entry point

`frontend/reference-tool.html` → `src/dev-tools/reference-tool-main.tsx` → `ReferenceToolApp.tsx`. Same idle/processing/ready state shape as `App.tsx`, reusing `FileUpload`/`ProcessingProgress`/`VideoPoseViewer`/`usePoseEstimation` unchanged, adding only a "Download pose.json" button (Blob + `<a download>`).

Not wired into `vite.config.ts`'s build — Vite's dev server serves any root-level `.html` file by path with no config, but `vite build` only bundles `index.html` by default. Since this tool is dev-only and never shipped, that's left as-is rather than adding `rollupOptions.input` for a page that doesn't need to exist in the production artifact.

## Out of scope (deferred, not built)

- Committing real clip binaries to git, or a `.gitignore` rule for `video.*` under `reference_clips/` — add if/when the team decides to check in licensed footage.
- Wiring the dev tool into the production build.
- Anything from build-order steps 3+ (DTW alignment, side-by-side viewer, checkpoint rules) — out of scope for this milestone.

## Testing strategy

Backend: fully unit-testable via `TestClient` against `tmp_path`-backed apps — no committed binary fixtures needed, `create_app()`'s parameter injection removes any need for monkeypatching. Frontend: `ReferenceToolApp` is testable the same way `App.tsx` already is (mock `usePoseEstimation`, never invoke real MediaPipe). Real MediaPipe/video-decode behavior stays a manual-verification concern, same reasoning as milestone 1.
