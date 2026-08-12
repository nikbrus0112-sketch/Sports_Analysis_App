import type { PoseSequence } from '../lib/poseTypes'

// Field names match the backend's wire format exactly (see
// backend/app/main.py's _list_reference_clips) — snake_case, no camelCase
// mapping layer. This frontend has never talked to a backend before this
// milestone, so there's no established case-conversion convention to
// follow, and one clip-list fetch doesn't justify inventing one.
export interface ReferenceClip {
  id: string
  motion_type: string
  video_url: string | null
  pose_data_url: string | null
  camera_angle_note: string
  source_or_license_note: string
}

// Relative paths only — resolved via the Vite dev proxy (vite.config.ts) in
// development and same-origin static serving in production. No base-URL
// config needed in either environment.
export async function fetchReferenceClips(motionType: string): Promise<ReferenceClip[]> {
  const response = await fetch(`/api/reference-clips?motion_type=${encodeURIComponent(motionType)}`)
  if (!response.ok) throw new Error(`Failed to fetch reference clips (HTTP ${response.status})`)
  return response.json()
}

export async function fetchPoseSequence(poseDataUrl: string): Promise<PoseSequence> {
  const response = await fetch(poseDataUrl)
  if (!response.ok) throw new Error(`Failed to fetch pose data from ${poseDataUrl} (HTTP ${response.status})`)
  return response.json()
}
