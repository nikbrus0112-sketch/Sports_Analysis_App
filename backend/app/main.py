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
        try:
            candidate = (reference_clips_dir / motion_type).resolve()
            candidate.relative_to(reference_clips_dir.resolve())
        except (ValueError, RuntimeError):
            # ValueError: candidate isn't a descendant of reference_clips_dir
            # (traversal or an absolute-path override). RuntimeError: pathlib's
            # symlink-loop error. Either way, degrade to "not found" like any
            # other unknown motion_type, not a 500.
            return []
        motion_dirs = [candidate]
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
            try:
                metadata = json.loads(metadata_path.read_text())
            except json.JSONDecodeError:
                # Same mid-edit tolerance as a missing file — a corrupt/empty
                # metadata.json in one clip shouldn't 500 the whole listing.
                continue
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
