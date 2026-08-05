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
