# Sports motion comparison app — v1 technical spec

## Context and goals

A web app where a user uploads video of themselves performing a specific sport
motion (e.g. baseball pitch, tennis forehand), and the app compares their form
against a curated set of reference clips using pose estimation, showing a
synced side-by-side view with per-frame technique feedback.

This spec deliberately scopes down from the full long-term vision to a
buildable v1. The two hardest and riskiest parts of the original idea — live
web video retrieval of arbitrary "pro" footage, and pixel-level video overlay
— are explicitly deferred (see "Out of scope" below), with reasoning, so
they aren't silently dropped, just sequenced later.

## V1 scope

1. User picks a sport + motion from a fixed list (not auto-detected)
2. User uploads or records a video of themselves performing that motion
3. App runs pose estimation on the user's video, client-side
4. App loads a pre-processed reference clip for that motion from a curated
   library (pose data computed once, offline, not at request time)
5. App temporally aligns the user's pose sequence to the reference sequence
6. App shows both videos side by side with a synced frame scrubber
7. Per frame, an "in-depth analysis" view shows a skeleton overlay (both
   skeletons superimposed, normalized for scale/position) plus flagged joint
   deviations against hand-authored rules for that motion
8. If more than one reference clip exists for a motion, user can cycle
   between them

## Out of scope for v1 (deferred, with reasoning)

- **Live web search/scraping for pro reference videos.** YouTube's API terms
  prohibit downloading or storing copies of audiovisual content outside the
  embedded player, and broadcast sports footage is independently
  copyrighted. Revisit only behind an explicit licensing deal or a
  Creative-Commons-sourced corpus — not as a v1 feature.
- **Automatic camera-angle detection/matching.** Sidestepped by shooting the
  curated reference library from a consistent angle and instructing users to
  match it.
- **Automatic motion/action classification.** User selects the motion
  explicitly; this removes the least reliable ML step from the critical
  path.
- **Pixel-level video overlay (translucent blend of real footage).**
  Confirmed stretch goal after skeleton overlay ships. Requires non-rigid
  video warping between two different bodies/framings — a distinctly harder
  problem than skeleton overlay.
- **Native mobile app.** v1 targets browser only.

## Architecture

### Platform

Web app. Frontend in React (or plain JS/Canvas is fine too — Claude Code's
call). A light backend (Node or Python) mainly serves the curated reference
library and its pre-computed pose data; it doesn't need to do heavy compute.

### Pipeline

**1. Capture**
Accept file upload (mp4/mov) or in-browser webcam recording. Note for
implementation: request the highest frame rate the device/browser reasonably
supports — fast motions (bat/racket/arm at contact) blur badly at 30fps, and
that's the exact instant the feedback matters most.

**2. Pose estimation**
MediaPipe Pose (BlazePose, 33 landmarks), run client-side via
`@mediapipe/tasks-vision` or equivalent. Output per frame: an array of
`{landmark_id, x, y, z, visibility}`. Apply a smoothing filter (One-Euro
filter is the standard choice) to the raw keypoints before computing any
angles downstream — raw keypoints are jittery enough that unsmoothed angle
thresholds will fire on noise, not real deviation.

**3. Reference library**
Curated, not live-fetched. Start with one motion and 2–3 clips. Each
reference clip is pose-processed once, offline, and its pose data is cached
alongside the video rather than recomputed per request.

Suggested metadata per clip:
```
ReferenceClip {
  id, motion_type, video_url, pose_data_url,
  camera_angle_note, source_or_license_note
}
```

**4. Temporal alignment**
Dynamic Time Warping (DTW) over the two pose sequences. Feature vector per
frame should be biomechanical, not raw x/y: joint angles plus angular
velocity and angular acceleration. This is more robust than raw coordinates
to differences in the athlete's height/limb length and to in-plane camera
rotation, which raw-coordinate DTW is sensitive to. Output is a frame-index
mapping between the user's clip and the reference clip, replacing naive
"frame N to frame N" comparison, which won't correspond to the same phase of
motion between two clips of different length/speed.

**5. Comparison / feedback generation — two stages, not one**

Do not hand raw video frames to a model and ask it to judge what's
different — vision-language models lack the granularity for precise
biomechanical comparison from pixels alone, and they can't reliably
distinguish "looks different because of camera angle" from "looks different
because of technique." Split it instead:

*Stage A — measurement (deterministic, from pose data).* Per motion, a
config of checkpoints:
```
MotionRules {
  motion_type,
  checkpoints: [
    { phase_name, joint, expected_angle_range, description }
  ]
}
```
At each aligned frame, compute the user's actual joint angle from the pose
landmarks and compare it against the checkpoint's expected range (or against
the reference clip's angle at the same phase). This produces a structured
record per flagged checkpoint: `{phase, joint, user_value, reference_value,
delta}`. This step is arithmetic on measured landmarks, not a model
judgment call — keep it deterministic and unit-testable.

*Stage B — explanation (LLM, given the structured deltas, not images).*
Pass the Stage A records to an LLM to generate the natural-language flag and
coaching tip ("front knee flexion: 96° vs. 82° reference at ball release —
try..."). This is where a model's broad training knowledge of coaching
language legitimately helps, and it removes the burden of hand-writing every
phrasing yourself. Optionally ground this step with retrieved coaching
content (web search) rather than pure free-association, to reduce invented
advice.

*Bootstrapping the checkpoint thresholds.* Rather than manually researching
every range from biomechanics literature, use an LLM (ideally with web
search) to draft the initial `expected_angle_range` values per
motion/phase — then spot-check a sample against real sources before
shipping. Precise numeric claims are where LLMs are most likely to sound
confident and be wrong, and this is advice people may act on with their
bodies, so treat LLM-drafted thresholds as a first draft requiring
verification, not ground truth.

**6. Display**
- Side-by-side synced video players with a shared frame scrubber
- Skeleton overlay: both skeletons drawn on one normalized canvas
- Per-frame "in-depth analysis": clickable joints surface the flagged
  checkpoints for that frame in plain language
- Reference-clip cycling once the library has more than one clip per motion

## Suggested build order

1. Pose estimation on an uploaded video, skeleton drawn over the footage —
   no comparison yet. Validates the pose pipeline in isolation.
2. Build the curated reference library for one motion (2–3 clips),
   pre-processed offline.
3. DTW alignment between the user's clip and one reference clip — verify the
   mapping visually before building UI around it.
4. Side-by-side synced player with skeleton overlay.
5. Hand-code checkpoint rules for that one motion; wire up per-frame flags.
6. Multi-reference cycling.
7. Add a second motion type to confirm the pipeline generalizes rather than
   being accidentally hardcoded to the first one.
8. Stretch, later: licensed/CC video sourcing at scale; pixel-level overlay.

## Open risks to revisit

- **Angle consistency is load-bearing.** The whole comparison assumes user
  and reference are filmed from roughly the same angle. Consider an
  on-screen capture guide (e.g. a silhouette to line up against) rather than
  just written instructions.
- **Rule thresholds are hand-authored, not learned.** Feedback quality is
  bounded by how good the sourced biomechanics rules are, not by model
  quality — be honest about this in any user-facing framing.
- **Validate MediaPipe accuracy at high-velocity moments** (the actual
  release/contact frame) before treating it as the final model choice —
  motion blur at 30fps may force either a frame-rate requirement or a switch
  to a higher-accuracy model (RTMPose/ViTPose) run server-side.
