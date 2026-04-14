from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from main import app
from spotify_client import get_spotify

client = TestClient(app)


def override_spotify(sp):
    app.dependency_overrides[get_spotify] = lambda: sp


def clear_overrides():
    app.dependency_overrides.clear()


def make_track(number, name, duration_ms, spotify_id=None):
    tid = spotify_id or f"track-id-{number}"
    return {"id": tid, "track_number": number, "name": name, "duration_ms": duration_ms, "artists": [{"name": "Artist"}]}


def test_get_tracks_returns_track_list():
    sp = MagicMock()
    sp.album_tracks.return_value = {
        "items": [make_track(1, "Track One", 210000), make_track(2, "Track Two", 180500)],
        "next": None,
    }
    override_spotify(sp)

    response = client.get("/library/albums/abc123/tracks")

    assert response.status_code == 200
    tracks = response.json()["tracks"]
    assert len(tracks) == 2
    assert tracks[0]["name"] == "Track One"
    assert tracks[0]["track_number"] == 1

    clear_overrides()


def test_get_tracks_formats_duration_as_m_ss():
    sp = MagicMock()
    sp.album_tracks.return_value = {
        "items": [
            make_track(1, "Short",  210000),  # 3:30
            make_track(2, "Longer", 180500),  # 3:00
            make_track(3, "Exact",   61000),  # 1:01
        ],
        "next": None,
    }
    override_spotify(sp)

    tracks = client.get("/library/albums/abc123/tracks").json()["tracks"]

    assert tracks[0]["duration"] == "3:30"
    assert tracks[1]["duration"] == "3:00"
    assert tracks[2]["duration"] == "1:01"

    clear_overrides()


def test_get_tracks_fetches_all_pages():
    sp = MagicMock()
    sp.album_tracks.side_effect = [
        {"items": [make_track(1, "Track One", 200000), make_track(2, "Track Two", 200000)], "next": "page2"},
        {"items": [make_track(3, "Track Three", 200000)], "next": None},
    ]
    override_spotify(sp)

    tracks = client.get("/library/albums/abc123/tracks").json()["tracks"]

    assert len(tracks) == 3
    assert sp.album_tracks.call_count == 2

    clear_overrides()


def test_get_tracks_includes_spotify_id():
    sp = MagicMock()
    sp.album_tracks.return_value = {
        "items": [make_track(1, "Track One", 210000, spotify_id="track-abc")],
        "next": None,
    }
    override_spotify(sp)

    tracks = client.get("/library/albums/abc123/tracks").json()["tracks"]

    assert tracks[0]["spotify_id"] == "track-abc"

    clear_overrides()


def test_get_tracks_returns_401_when_not_authenticated():
    from fastapi import HTTPException
    app.dependency_overrides[get_spotify] = lambda: (_ for _ in ()).throw(
        HTTPException(status_code=401, detail="Not authenticated")
    )

    response = client.get("/library/albums/abc123/tracks")

    assert response.status_code == 401

    clear_overrides()
