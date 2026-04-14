from unittest.mock import MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient
from main import app
from spotify_client import get_spotify
import routers.library as library_module

client = TestClient(app)

# A minimal Spotify saved-album payload (mirrors the real API shape)
SAVED_ALBUM = {
    "added_at": "2021-06-01T00:00:00Z",
    "album": {
        "id": "abc123",
        "name": "Dummy Album",
        "artists": [{"id": "art1", "name": "Artist One"}, {"id": "art2", "name": "Artist Two"}],
        "release_date": "2020-05-01",
        "total_tracks": 10,
        "images": [
            {"url": "https://example.com/large.jpg", "height": 640, "width": 640},
            {"url": "https://example.com/small.jpg", "height": 64, "width": 64},
        ],
        "uri": "spotify:album:abc123",
    },
}


def make_spotify_mock(pages):
    """Build a mock Spotify client that returns `pages` sequentially per call."""
    sp = MagicMock()
    sp.current_user_saved_albums.side_effect = pages
    return sp


def override_spotify(sp):
    app.dependency_overrides[get_spotify] = lambda: sp


def clear_overrides():
    app.dependency_overrides.clear()
    library_module.clear_cache()


# --- tests ---

def test_get_albums_returns_normalized_album_list():
    sp = make_spotify_mock([
        {"items": [SAVED_ALBUM], "total": 1, "next": None},
    ])
    override_spotify(sp)

    response = client.get("/library/albums")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["albums"]) == 1

    album = data["albums"][0]
    assert album["spotify_id"] == "abc123"
    assert album["name"] == "Dummy Album"
    assert album["artists"] == ["Artist One", "Artist Two"]
    assert album["release_date"] == "2020-05-01"
    assert album["total_tracks"] == 10
    assert album["image_url"] == "https://example.com/large.jpg"
    assert album["added_at"] == "2021-06-01T00:00:00Z"

    clear_overrides()


def test_get_albums_uses_largest_image():
    album_with_images = {**SAVED_ALBUM, "album": {**SAVED_ALBUM["album"], "images": [
        {"url": "https://example.com/small.jpg", "height": 64, "width": 64},
        {"url": "https://example.com/large.jpg", "height": 640, "width": 640},
    ]}}
    sp = make_spotify_mock([
        {"items": [album_with_images], "total": 1, "next": None},
    ])
    override_spotify(sp)

    response = client.get("/library/albums")
    album = response.json()["albums"][0]

    assert album["image_url"] == "https://example.com/large.jpg"

    clear_overrides()


def test_get_albums_handles_missing_image():
    album_no_image = {**SAVED_ALBUM, "album": {**SAVED_ALBUM["album"], "images": []}}
    sp = make_spotify_mock([
        {"items": [album_no_image], "total": 1, "next": None},
    ])
    override_spotify(sp)

    response = client.get("/library/albums")
    album = response.json()["albums"][0]

    assert album["image_url"] is None

    clear_overrides()


def test_get_albums_fetches_all_pages():
    sp = make_spotify_mock([
        {"items": [SAVED_ALBUM, SAVED_ALBUM], "total": 3, "next": "https://api.spotify.com/page2"},
        {"items": [SAVED_ALBUM],              "total": 3, "next": None},
    ])
    override_spotify(sp)

    response = client.get("/library/albums")
    data = response.json()

    assert data["total"] == 3
    assert len(data["albums"]) == 3
    assert sp.current_user_saved_albums.call_count == 2

    clear_overrides()


def test_get_albums_returns_401_when_not_authenticated():
    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")

    app.dependency_overrides[get_spotify] = raise_401

    response = client.get("/library/albums")

    assert response.status_code == 401

    clear_overrides()


def test_get_albums_uses_cache_on_second_request():
    sp = make_spotify_mock([
        {"items": [SAVED_ALBUM], "total": 1, "next": None},
    ])
    override_spotify(sp)

    client.get("/library/albums")
    client.get("/library/albums")

    assert sp.current_user_saved_albums.call_count == 1  # Spotify only called once

    clear_overrides()


def test_get_albums_refetches_after_cache_expires():
    import time
    sp = make_spotify_mock([
        {"items": [SAVED_ALBUM], "total": 1, "next": None},
        {"items": [SAVED_ALBUM], "total": 1, "next": None},
    ])
    override_spotify(sp)

    client.get("/library/albums")

    # Expire the cache manually
    library_module._cache["fetched_at"] = time.time() - library_module.CACHE_TTL_SECONDS - 1

    client.get("/library/albums")

    assert sp.current_user_saved_albums.call_count == 2  # Spotify called again

    clear_overrides()


def test_cache_can_be_invalidated_explicitly():
    sp = make_spotify_mock([
        {"items": [SAVED_ALBUM], "total": 1, "next": None},
        {"items": [SAVED_ALBUM], "total": 1, "next": None},
    ])
    override_spotify(sp)

    client.get("/library/albums")
    client.post("/library/albums/invalidate-cache")
    client.get("/library/albums")

    assert sp.current_user_saved_albums.call_count == 2  # re-fetched after invalidation

    clear_overrides()
