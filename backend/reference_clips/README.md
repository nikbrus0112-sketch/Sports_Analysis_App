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

This directory currently ships one starter clip — `freestyle/clip-1` — as a
worked example. Add more by producing a `pose.json` via
`frontend/reference-tool.html` (see
`docs/superpowers/plans/2026-08-04-reference-library-milestone-2.md`) and
placing it in a new `<motion_type>/<clip_id>/` directory alongside a
`video.<ext>` and a hand-written `metadata.json`.
