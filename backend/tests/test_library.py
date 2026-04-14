from unittest.mock import MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from main import app
from spotify_client import get_user_spotify

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}

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
    app.dependency_overrides[get_user_spotify] = lambda: sp


def clear_overrides():
    app.dependency_overrides.clear()


def mock_db_with_cache(albums_data, total):
    """Return a mock Supabase client that has a warm library_cache row."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "id": "albums",
                    "albums": albums_data,
                    "total": total,
                    "synced_at": "2026-01-01T00:00:00Z",
                }
            ]
        )
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    return db


def mock_db_empty():
    """Return a mock Supabase client with no library_cache row (cold Supabase)."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    return db


def override_db(db):
    app.dependency_overrides[get_authed_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


# --- tests ---


def test_get_albums_returns_empty_when_no_cache():
    """Empty Supabase cache -> empty response, no Spotify call."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([])
    override_spotify(sp)

    response = client.get("/library/albums")

    assert response.status_code == 200
    data = response.json()
    assert data["albums"] == []
    assert data["total"] == 0
    assert data["last_synced"] is None

    sp.current_user_saved_albums.assert_not_called()

    clear_overrides()


def test_get_albums_returns_cache_row_with_last_synced():
    """Populated Supabase cache -> returns albums + last_synced timestamp."""
    cached = [
        {
            "service_id": "abc123",
            "name": "Cached Album",
            "artists": ["Artist"],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        }
    ]
    db = mock_db_with_cache(cached, 1)
    override_db(db)
    sp = make_spotify_mock([])
    override_spotify(sp)

    response = client.get("/library/albums")

    assert response.status_code == 200
    data = response.json()
    assert len(data["albums"]) == 1
    assert data["albums"][0]["service_id"] == "abc123"
    assert data["total"] == 1
    assert data["last_synced"] == "2026-01-01T00:00:00Z"

    sp.current_user_saved_albums.assert_not_called()

    clear_overrides()


def test_get_albums_does_not_include_syncing_field():
    """The old `syncing` boolean is removed from the contract."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([])
    override_spotify(sp)

    response = client.get("/library/albums")

    assert "syncing" not in response.json()

    clear_overrides()


def test_get_albums_returns_401_when_not_authenticated():
    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated")

    app.dependency_overrides[get_current_user] = raise_401
    app.dependency_overrides[get_authed_db] = raise_401

    response = client.get("/library/albums")

    assert response.status_code == 401

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


def test_get_supabase_cache_returns_row_when_present():
    from routers.library import _get_supabase_cache

    db = mock_db_with_cache([{"service_id": "abc"}], 1)
    result = _get_supabase_cache(db)
    assert result is not None
    assert result["total"] == 1
    assert result["albums"] == [{"service_id": "abc"}]


def test_get_supabase_cache_returns_none_when_absent():
    from routers.library import _get_supabase_cache

    db = mock_db_empty()
    result = _get_supabase_cache(db)
    assert result is None


def test_save_supabase_cache_calls_upsert():
    from routers.library import _save_supabase_cache

    db = mock_db_empty()
    albums = [{"service_id": "abc", "name": "Test"}]
    _save_supabase_cache(db, albums, 1, FAKE_USER_ID)
    db.table.assert_called_with("library_cache")
    db.table.return_value.upsert.assert_called_once()
    call_args = db.table.return_value.upsert.call_args[0][0]
    assert call_args["id"] == FAKE_USER_ID
    assert call_args["albums"] == albums
    assert call_args["total"] == 1
    assert call_args["user_id"] == FAKE_USER_ID


def test_dedupe_empty_list_returns_empty():
    from routers.library import _dedupe_albums_by_service_id

    assert _dedupe_albums_by_service_id([]) == []


def test_dedupe_single_album_returns_unchanged():
    from routers.library import _dedupe_albums_by_service_id

    album = {"service_id": "abc", "name": "A"}
    assert _dedupe_albums_by_service_id([album]) == [album]


def test_dedupe_removes_duplicate_service_ids_last_wins():
    from routers.library import _dedupe_albums_by_service_id

    a_old = {"service_id": "abc", "name": "Old"}
    b = {"service_id": "xyz", "name": "B"}
    a_new = {"service_id": "abc", "name": "New"}

    result = _dedupe_albums_by_service_id([a_old, b, a_new])

    # "abc" keeps its first-seen position (0), but value is from a_new
    assert len(result) == 2
    assert result[0] == {"service_id": "abc", "name": "New"}
    assert result[1] == b


def test_dedupe_preserves_order_for_unique_ids():
    from routers.library import _dedupe_albums_by_service_id

    albums = [
        {"service_id": "a", "name": "A"},
        {"service_id": "b", "name": "B"},
        {"service_id": "c", "name": "C"},
    ]
    assert _dedupe_albums_by_service_id(albums) == albums


def test_sync_offset_zero_empty_cache_fetches_and_writes():
    """Cold start: offset=0 fetches one Spotify page and writes it to cache."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock(
        [
            {
                "items": [SAVED_ALBUM],
                "total": 1,
                "next": None,
            },
        ]
    )
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 0})

    assert response.status_code == 200
    data = response.json()
    assert data["synced_this_page"] == 1
    assert data["total_in_cache"] == 1
    assert data["spotify_total"] == 1
    assert data["next_offset"] == 1
    assert data["done"] is True

    # Verify Spotify was called with correct args
    sp.current_user_saved_albums.assert_called_once_with(limit=50, offset=0)

    # Verify cache was written
    db.table.assert_any_call("library_cache")
    db.table.return_value.upsert.assert_called()

    clear_overrides()


def test_sync_offset_nonzero_appends_to_existing_cache():
    """offset>0 merges the new page into whatever's already in cache."""
    existing = [
        {
            "service_id": "old1",
            "name": "Old Album",
            "artists": ["X"],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        }
    ]
    db = mock_db_with_cache(existing, 1)
    override_db(db)
    sp = make_spotify_mock(
        [
            {"items": [SAVED_ALBUM], "total": 2, "next": None},
        ]
    )
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 50})

    assert response.status_code == 200
    data = response.json()
    assert data["synced_this_page"] == 1
    assert data["total_in_cache"] == 2
    assert data["next_offset"] == 51

    upsert_call = db.table.return_value.upsert.call_args[0][0]
    service_ids = [a["service_id"] for a in upsert_call["albums"]]
    assert "old1" in service_ids
    assert "abc123" in service_ids

    clear_overrides()


def test_sync_offset_nonzero_dedupes_by_service_id():
    """Retried page or racing tabs produce duplicate items; dedupe keeps one."""
    existing = [
        {
            "service_id": "abc123",  # same ID as SAVED_ALBUM
            "name": "Stale name",
            "artists": ["X"],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        }
    ]
    db = mock_db_with_cache(existing, 1)
    override_db(db)
    sp = make_spotify_mock(
        [
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
        ]
    )
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 50})

    assert response.status_code == 200
    data = response.json()
    assert data["total_in_cache"] == 1  # deduped, not 2

    upsert_call = db.table.return_value.upsert.call_args[0][0]
    assert len(upsert_call["albums"]) == 1
    # Last-wins: the new album data should be present
    assert upsert_call["albums"][0]["name"] == "Dummy Album"

    clear_overrides()


def test_sync_offset_zero_clears_existing_cache():
    """A fresh sync (offset=0) must wipe stale data before writing the new first page."""
    stale = [
        {
            "service_id": "deleted_album",
            "name": "User deleted this",
            "artists": ["X"],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        }
    ]
    db = mock_db_with_cache(stale, 1)
    override_db(db)
    sp = make_spotify_mock(
        [
            {"items": [SAVED_ALBUM], "total": 1, "next": None},
        ]
    )
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 0})

    assert response.status_code == 200
    data = response.json()
    assert data["total_in_cache"] == 1

    upsert_call = db.table.return_value.upsert.call_args[0][0]
    service_ids = [a["service_id"] for a in upsert_call["albums"]]
    assert "deleted_album" not in service_ids
    assert "abc123" in service_ids

    clear_overrides()


def test_sync_returns_done_false_when_more_pages_remain():
    """Spotify has a `next` URL -> done is False and next_offset points to page 2."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock(
        [
            {
                "items": [SAVED_ALBUM] * 50,
                "total": 120,
                "next": "https://api.spotify.com/v1/me/albums?offset=50",
            },
        ]
    )
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 0})

    assert response.status_code == 200
    data = response.json()
    assert data["done"] is False
    assert data["next_offset"] == 50
    assert data["spotify_total"] == 120

    clear_overrides()


def test_sync_returns_401_when_not_authenticated():
    """POST /library/sync without auth should 401."""

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated")

    app.dependency_overrides[get_user_spotify] = raise_401
    app.dependency_overrides[get_current_user] = raise_401

    response = client.post("/library/sync", json={"offset": 0})

    assert response.status_code == 401

    clear_overrides()


def test_sync_rejects_negative_offset():
    """Negative offset is a client bug -- reject with 400."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [], "total": 0, "next": None}])
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": -1})

    assert response.status_code == 400

    clear_overrides()


def test_sync_rejects_non_multiple_of_50_offset():
    """Offset must be a multiple of 50 (Spotify's page size)."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [], "total": 0, "next": None}])
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 73})

    assert response.status_code == 400

    clear_overrides()


def test_sync_updates_last_synced_timestamp():
    """Every successful sync writes synced_at = now() to the cache row."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 0})

    assert response.status_code == 200
    upsert_call = db.table.return_value.upsert.call_args[0][0]
    assert "synced_at" in upsert_call
    # _save_supabase_cache passes the literal string "now()" to let Postgres resolve it
    assert upsert_call["synced_at"] == "now()"

    clear_overrides()


def test_sync_propagates_spotify_errors():
    """If Spotify raises, the endpoint returns a 5xx response to the client."""
    db = mock_db_empty()
    override_db(db)
    sp = MagicMock()
    sp.current_user_saved_albums.side_effect = Exception("Spotify API down")
    override_spotify(sp)

    # Use a local client that doesn't re-raise server exceptions, so we can
    # observe the 500 response FastAPI returns in production.
    local_client = TestClient(app, raise_server_exceptions=False)
    response = local_client.post("/library/sync", json={"offset": 0})

    assert response.status_code >= 500

    clear_overrides()


def test_sync_handles_empty_library():
    """A user with zero saved albums gets done=True immediately."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock(
        [
            {"items": [], "total": 0, "next": None},
        ]
    )
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 0})

    assert response.status_code == 200
    data = response.json()
    assert data["synced_this_page"] == 0
    assert data["total_in_cache"] == 0
    assert data["spotify_total"] == 0
    assert data["done"] is True
    assert data["next_offset"] == 0

    clear_overrides()
