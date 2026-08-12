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


def test_rejects_path_traversal_in_motion_type(tmp_path):
    clips_dir = tmp_path / "reference_clips"
    _write_clip(clips_dir, "freestyle", "clip-1", metadata={"camera_angle_note": "a", "source_or_license_note": "b"})
    # A sibling directory outside reference_clips_dir with its own metadata.json —
    # a traversal should never be able to reach or leak this.
    secret_dir = tmp_path / "secret_area" / "leaked_clip"
    secret_dir.mkdir(parents=True)
    (secret_dir / "metadata.json").write_text(json.dumps({"camera_angle_note": "leaked", "source_or_license_note": "leaked"}))

    app = create_app(reference_clips_dir=clips_dir)
    client = TestClient(app)

    response = client.get("/api/reference-clips", params={"motion_type": "../secret_area"})

    assert response.status_code == 200
    assert response.json() == []


def test_skips_clip_directory_with_malformed_metadata_json_instead_of_500ing(tmp_path):
    _write_clip(tmp_path, "freestyle", "clip-1", metadata={"camera_angle_note": "a", "source_or_license_note": "b"})
    bad_clip_dir = tmp_path / "freestyle" / "clip-2"
    bad_clip_dir.mkdir(parents=True)
    (bad_clip_dir / "metadata.json").write_text("")  # empty/malformed — not valid JSON
    app = create_app(reference_clips_dir=tmp_path)
    client = TestClient(app)

    response = client.get("/api/reference-clips")

    assert response.status_code == 200
    assert [clip["id"] for clip in response.json()] == ["clip-1"]
