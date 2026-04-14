from unittest.mock import MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

import routers.library as library_module
from main import app
from spotify_client import get_spotify
from db import get_db

client = TestClient(app)

# A minimal Spotify saved-album payload (mirrors the real API shape)
SAVED_ALBUM = {
    "added_at": "2021-06-01T00:00:00Z",
    "album": {
        "id": "abc123",
        "name": "Dummy Album",
        "artists": [
            {"id": "art1", "name": "Artist One"},
            {"id": "art2", "name": "Artist Two"},
        ],
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


def mock_db_with_cache(albums_data, total):
    """Return a mock Supabase client that has a warm library_cache row."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "albums", "albums": albums_data, "total": total, "synced_at": "2026-01-01T00:00:00Z"}]
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    return db


def mock_db_empty():
    """Return a mock Supabase client with no library_cache row (cold Supabase)."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    return db


def override_db(db):
    app.dependency_overrides[get_db] = lambda: db


# --- tests ---


def test_get_albums_returns_normalized_album_list():
    override_db(mock_db_empty())
    sp = make_spotify_mock(
        [
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
        ]
    )
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
    override_db(mock_db_empty())
    album_with_images = {
        **SAVED_ALBUM,
        "album": {
            **SAVED_ALBUM["album"],
            "images": [
                {"url": "https://example.com/small.jpg", "height": 64, "width": 64},
                {"url": "https://example.com/large.jpg", "height": 640, "width": 640},
            ],
        },
    }
    sp = make_spotify_mock(
        [
            {"items": [album_with_images], "total": 1, "next": None},
        ]
    )
    override_spotify(sp)

    response = client.get("/library/albums")
    album = response.json()["albums"][0]

    assert album["image_url"] == "https://example.com/large.jpg"

    clear_overrides()


def test_get_albums_handles_missing_image():
    override_db(mock_db_empty())
    album_no_image = {**SAVED_ALBUM, "album": {**SAVED_ALBUM["album"], "images": []}}
    sp = make_spotify_mock(
        [
            {"items": [album_no_image], "total": 1, "next": None},
        ]
    )
    override_spotify(sp)

    response = client.get("/library/albums")
    album = response.json()["albums"][0]

    assert album["image_url"] is None

    clear_overrides()


def test_get_albums_fetches_all_pages():
    override_db(mock_db_empty())
    sp = make_spotify_mock(
        [
            {
                "items": [SAVED_ALBUM, SAVED_ALBUM],
                "total": 3,
                "next": "https://api.spotify.com/page2",
            },
            {"items": [SAVED_ALBUM], "total": 3, "next": None},
        ]
    )
    override_spotify(sp)

    response = client.get("/library/albums")
    data = response.json()

    assert data["total"] == 3
    assert len(data["albums"]) == 3
    assert sp.current_user_saved_albums.call_count == 2

    clear_overrides()


def test_get_albums_returns_401_when_not_authenticated():
    override_db(mock_db_empty())

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")

    app.dependency_overrides[get_spotify] = raise_401

    response = client.get("/library/albums")

    assert response.status_code == 401

    clear_overrides()


def test_get_albums_uses_cache_on_second_request():
    override_db(mock_db_empty())
    sp = make_spotify_mock(
        [
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
        ]
    )
    override_spotify(sp)

    client.get("/library/albums")
    client.get("/library/albums")

    assert sp.current_user_saved_albums.call_count == 1  # Spotify only called once

    clear_overrides()


def test_get_albums_refetches_after_cache_expires():
    import time

    override_db(mock_db_empty())
    sp = make_spotify_mock(
        [
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
        ]
    )
    override_spotify(sp)

    client.get("/library/albums")

    # Expire the cache manually
    library_module._cache["fetched_at"] = (
        time.time() - library_module.CACHE_TTL_SECONDS - 1
    )

    client.get("/library/albums")

    assert sp.current_user_saved_albums.call_count == 2  # Spotify called again

    clear_overrides()


def test_get_album_tracks_includes_artists():
    sp = MagicMock()
    sp.album_tracks.return_value = {
        "items": [
            {
                "id": "track1",
                "track_number": 1,
                "name": "No Ordinary Love",
                "duration_ms": 265000,
                "artists": [{"id": "art1", "name": "Sade"}],
                "next": None,
            }
        ],
        "next": None,
    }
    override_spotify(sp)

    response = client.get("/library/albums/abc123/tracks")

    assert response.status_code == 200
    tracks = response.json()["tracks"]
    assert len(tracks) == 1
    track = tracks[0]
    assert "artists" in track
    assert isinstance(track["artists"], list)
    assert track["artists"] == ["Sade"]

    clear_overrides()


def test_cache_can_be_invalidated_explicitly():
    override_db(mock_db_empty())
    sp = make_spotify_mock(
        [
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
        ]
    )
    override_spotify(sp)

    client.get("/library/albums")
    client.post("/library/albums/invalidate-cache")
    client.get("/library/albums")

    assert sp.current_user_saved_albums.call_count == 2  # re-fetched after invalidation

    clear_overrides()


def test_invalidate_cache_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = lambda: (_ for _ in ()).throw(
        HTTPException(status_code=401, detail="Not authenticated")
    )

    response = client.post("/library/albums/invalidate-cache")

    assert response.status_code == 401

    clear_overrides()


def test_get_supabase_cache_returns_row_when_present():
    from routers.library import _get_supabase_cache
    db = mock_db_with_cache([{"spotify_id": "abc"}], 1)
    result = _get_supabase_cache(db)
    assert result is not None
    assert result["total"] == 1
    assert result["albums"] == [{"spotify_id": "abc"}]


def test_get_supabase_cache_returns_none_when_absent():
    from routers.library import _get_supabase_cache
    db = mock_db_empty()
    result = _get_supabase_cache(db)
    assert result is None


def test_save_supabase_cache_calls_upsert():
    from routers.library import _save_supabase_cache
    db = mock_db_empty()
    albums = [{"spotify_id": "abc", "name": "Test"}]
    _save_supabase_cache(db, albums, 1)
    db.table.assert_called_with("library_cache")
    db.table.return_value.upsert.assert_called_once()
    call_args = db.table.return_value.upsert.call_args[0][0]
    assert call_args["id"] == "albums"
    assert call_args["albums"] == albums
    assert call_args["total"] == 1


def test_get_albums_returns_supabase_cache_when_in_memory_cold():
    """When in-memory is cold but Supabase has data, return it immediately."""
    cached_albums = [{"spotify_id": "abc123", "name": "Cached Album", "artists": ["Artist"], "release_date": "2020", "total_tracks": 10, "image_url": None, "added_at": "2021-01-01T00:00:00Z"}]
    db = mock_db_with_cache(cached_albums, 1)
    override_db(db)
    # Background task will call Spotify, so configure a valid mock response
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    response = client.get("/library/albums")

    assert response.status_code == 200
    data = response.json()
    assert data["syncing"] is True
    assert len(data["albums"]) == 1
    assert data["albums"][0]["spotify_id"] == "abc123"
    # Background task calls Spotify once to re-sync; response itself came from Supabase
    assert sp.current_user_saved_albums.call_count == 1

    clear_overrides()


def test_get_albums_returns_syncing_false_on_cold_start():
    """Cold start (no in-memory, no Supabase): fetch from Spotify, syncing=False."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    response = client.get("/library/albums")

    assert response.status_code == 200
    data = response.json()
    assert data["syncing"] is False
    assert len(data["albums"]) == 1
    sp.current_user_saved_albums.assert_called_once()

    clear_overrides()


def test_get_albums_saves_to_supabase_on_cold_start():
    """Cold start should persist fetched albums to Supabase."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    client.get("/library/albums")

    db.table.assert_any_call("library_cache")
    db.table.return_value.upsert.assert_called_once()

    clear_overrides()


def test_get_albums_returns_syncing_false_when_in_memory_fresh():
    """In-memory cache hit: syncing=False, no Supabase/Spotify calls."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    client.get("/library/albums")   # warms in-memory
    db.reset_mock()

    response = client.get("/library/albums")  # should hit in-memory only

    assert response.json()["syncing"] is False
    db.table.return_value.select.assert_not_called()
    assert sp.current_user_saved_albums.call_count == 1  # not called again

    clear_overrides()
