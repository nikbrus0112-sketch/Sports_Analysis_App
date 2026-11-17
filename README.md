# Stroke Analysis

Upload a video of your swim stroke and compare it, frame by frame, against a reference clip. The app runs pose estimation in the browser, lines up your stroke with the reference using dynamic time warping, and flags the joints whose angles differ most at each point in the stroke.

**Status:** working prototype. Freestyle has one reference clip. Butterfly appears in the motion picker but has no reference clips yet, so choosing it returns no comparison.

## How it works

1. **Pose estimation.** MediaPipe Pose Landmarker (33 body landmarks) runs client-side on your video, sampled at 30 fps. Landmarks are smoothed with a One Euro filter to cut frame-to-frame jitter.
2. **Joint angles.** Each frame becomes 8 angles: left and right elbow, shoulder, hip, and knee. Angles are 2D (measured in the image plane) and range from 0° to 180°.
3. **Alignment.** Each frame's feature vector holds the 8 angles plus their angular velocity and acceleration (24 values). Dynamic time warping (DTW) maps each of your frames to the matching frame of the reference clip, so a slower or faster stroke still lines up phase to phase.
4. **Checkpoint flags.** At each aligned frame pair, any joint whose angle differs from the reference by more than 15° is flagged.
5. **Comparison view.** Both videos play side by side on one scrubber. You can toggle the skeleton overlay, switch to an overlap view that draws both skeletons scaled to the same body size on one canvas, read the flag table for the current frame, and switch between reference clips when a motion has more than one.

Reference clips come from a curated library in `backend/reference_clips/`, not from web search. Their pose data is computed once, ahead of time. The spec explains why the app doesn't pull pro footage from YouTube or similar sites (terms of service and copyright).

## Repository layout

```
backend/                       FastAPI server: reference clip listing, static file serving
  app/main.py
  reference_clips/             curated clips: <motion_type>/<clip_id>/{video.*, pose.json, metadata.json}
  tests/
frontend/                      React + TypeScript + Vite + Tailwind
  src/lib/                     pose, angle, DTW, flagging, and drawing logic (framework-free)
  src/hooks/                   pose estimation and reference comparison
  src/components/              upload, progress, and comparison UI
  src/dev-tools/               reference-clip and alignment inspection tools
docs/superpowers/              per-milestone design specs and implementation plans
sports-motion-comparison-spec.md   v1 product and technical spec
```

## Running locally

You need Python 3.10 or newer (tested on 3.13) and Node.js 20.19+ or 22.12+ (Vite 8's minimum). The browser also needs internet access: the MediaPipe runtime and pose model load from jsDelivr and Google Cloud Storage at runtime.

### Development (two processes)

Backend, on port 8000:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend, on port 5173:

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/reference-clips` to the backend.

### Single server

Build the frontend, then run the backend alone. FastAPI serves the built app from `frontend/dist`.

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app --port 8000
```

Open http://localhost:8000.

### Dev tools

These pages exist only under `npm run dev`:

- `/reference-tool.html` runs pose estimation on a clip and exports the `pose.json` a new reference clip needs.
- `/alignment-tool.html` loads two pose sequences and shows the DTW path and checkpoint flags between them.

## Tests

```bash
cd backend && python -m pytest     # API and reference-clip listing
cd frontend && npm test            # pose, angle, DTW, flag, and component tests (Vitest)
cd frontend && npm run lint        # Oxlint
```

## Adding a reference clip

1. Run the clip through `/reference-tool.html` and save the exported `pose.json`.
2. Create `backend/reference_clips/<motion_type>/<clip_id>/` containing the video (`video.mp4` or another extension), `pose.json`, and a `metadata.json` with `camera_angle_note` and `source_or_license_note`.
3. That's it. The backend re-reads the directory on every request, so `GET /api/reference-clips?motion_type=<motion_type>` lists the new clip right away.

`backend/reference_clips/README.md` has the full format. To add a new motion type to the picker, add an entry to `frontend/src/lib/motionTypes.ts`.

## Limitations

- **Camera angle decides what the angles mean.** Angles come from a single 2D view, so the same pose filmed from a different angle produces different numbers. Film your clip from the same angle as the reference clip, or the flags measure the difference between cameras instead of technique. The very large deltas (over 100°) on the current freestyle clip most likely come from this or from weak landmark detection on underwater footage, not from real form differences.
- **The 15° flag threshold is a first draft.** It sits above typical landmark jitter but isn't calibrated against biomechanics data.
- **There is no stroke-phase detection.** A flag's "phase" is the reference clip's frame index, not a named phase like catch, pull, push, or recovery.
- **DTW has no warping window.** Clips of very different length or content can align badly.
- **Missed detections carry forward.** When a frame has no pose, the last good angles are reused instead of interpolated.
- **Not built yet** (see the spec): finding reference footage online, detecting the motion type automatically, blending the two videos at the pixel level, and LLM-written coaching feedback generated from the flags.

This is a tool for exploring differences in form. It isn't a measurement instrument, and its flags aren't coaching advice.
