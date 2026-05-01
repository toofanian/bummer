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
            "artists": [{"name": "Artist", "id": "artArtist"}],
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


def test_sync_page_returns_albums_in_response():
    """sync_one_page must return the normalized albums in the response JSON."""
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
    assert "albums" in data
    assert len(data["albums"]) == 1
    assert data["albums"][0]["service_id"] == "abc123"
    assert data["albums"][0]["name"] == "Dummy Album"
    assert data["synced_this_page"] == 1
    assert data["spotify_total"] == 1
    assert data["next_offset"] == 1
    assert data["done"] is True

    sp.current_user_saved_albums.assert_called_once_with(limit=50, offset=0)

    clear_overrides()


def test_sync_page_does_not_write_to_cache():
    """sync_one_page must NOT read or write library_cache — no DB interaction."""
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

    # The DB mock's table() should never have been called (no cache read/write)
    db.table.assert_not_called()

    clear_overrides()


def test_sync_page_does_not_return_total_in_cache():
    """total_in_cache is removed from the sync response contract."""
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
    assert "total_in_cache" not in response.json()

    clear_overrides()


def test_sync_complete_writes_atomically():
    """POST /library/sync-complete writes the full album list in one DB call."""
    db = mock_db_empty()
    override_db(db)

    albums = [
        {
            "service_id": "abc123",
            "name": "Dummy Album",
            "artists": [{"name": "Artist One", "id": "art1"}],
            "release_date": "2020-05-01",
            "total_tracks": 10,
            "image_url": "https://example.com/large.jpg",
            "added_at": "2021-06-01T00:00:00Z",
        },
        {
            "service_id": "xyz789",
            "name": "Second Album",
            "artists": [{"name": "Artist Two", "id": "art2"}],
            "release_date": "2019-03-01",
            "total_tracks": 8,
            "image_url": None,
            "added_at": "2020-01-01T00:00:00Z",
        },
    ]

    response = client.post("/library/sync-complete", json={"albums": albums})

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2

    # Verify the DB upsert was called with the full album list
    db.table.assert_any_call("library_cache")
    db.table.return_value.upsert.assert_called_once()
    upsert_call = db.table.return_value.upsert.call_args[0][0]
    assert len(upsert_call["albums"]) == 2
    assert upsert_call["total"] == 2
    assert upsert_call["user_id"] == FAKE_USER_ID

    clear_overrides()


def test_sync_complete_requires_auth():
    """POST /library/sync-complete without auth should 401."""

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated")

    app.dependency_overrides[get_current_user] = raise_401
    app.dependency_overrides[get_authed_db] = raise_401

    response = client.post("/library/sync-complete", json={"albums": []})

    assert response.status_code == 401

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
    assert len(data["albums"]) == 50

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


def test_sync_complete_writes_synced_at_timestamp():
    """sync-complete writes synced_at = now() to the cache row."""
    db = mock_db_empty()
    override_db(db)

    albums = [
        {
            "service_id": "abc123",
            "name": "Test",
            "artists": [],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        }
    ]
    response = client.post("/library/sync-complete", json={"albums": albums})

    assert response.status_code == 200
    upsert_call = db.table.return_value.upsert.call_args[0][0]
    assert "synced_at" in upsert_call
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


def test_normalize_album_stores_artist_objects():
    """_normalize_album must store artists as {name, id} dicts, not plain strings."""
    from routers.library import _normalize_album

    result = _normalize_album(SAVED_ALBUM)
    assert result["artists"] == [
        {"name": "Artist One", "id": "art1"},
        {"name": "Artist Two", "id": "art2"},
    ]


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
    assert data["albums"] == []
    assert data["spotify_total"] == 0
    assert data["done"] is True
    assert data["next_offset"] == 0

    clear_overrides()


def test_sync_complete_records_library_changes():
    """sync-complete diffs against existing cache and inserts a library_changes row."""
    db = MagicMock()
    cache_albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
        {"service_id": "a2", "name": "Album 2", "artists": [], "image_url": None},
    ]
    changes_mock = MagicMock()
    cache_mock = MagicMock()
    cache_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": FAKE_USER_ID,
                "albums": cache_albums,
                "total": 2,
                "synced_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    cache_mock.upsert.return_value.execute.return_value = MagicMock(data=[])

    deduped_mock = MagicMock()
    deduped_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )

    def table_router(table_name):
        if table_name == "library_changes":
            return changes_mock
        if table_name == "deduped_albums":
            return deduped_mock
        return cache_mock

    db.table.side_effect = table_router
    override_db(db)

    new_albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
        {"service_id": "a3", "name": "Album 3", "artists": [], "image_url": None},
    ]

    response = client.post("/library/sync-complete", json={"albums": new_albums})
    assert response.status_code == 200

    changes_mock.insert.assert_called_once()
    data = changes_mock.insert.call_args[0][0]
    assert set(data["added_ids"]) == {"a3"}
    assert set(data["removed_ids"]) == {"a2"}
    assert data["user_id"] == FAKE_USER_ID

    clear_overrides()


def test_sync_complete_skips_changes_when_no_diff():
    """sync-complete does NOT insert a library_changes row when album list is identical."""
    db = MagicMock()
    cache_albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
    ]
    cache_mock = MagicMock()
    cache_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": FAKE_USER_ID,
                "albums": cache_albums,
                "total": 1,
                "synced_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    cache_mock.upsert.return_value.execute.return_value = MagicMock(data=[])

    deduped_mock = MagicMock()
    deduped_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )

    changes_mock = MagicMock()

    def table_router(table_name):
        if table_name == "deduped_albums":
            return deduped_mock
        if table_name == "library_changes":
            return changes_mock
        return cache_mock

    db.table.side_effect = table_router
    override_db(db)

    response = client.post("/library/sync-complete", json={"albums": cache_albums})
    assert response.status_code == 200

    changes_mock.insert.assert_not_called()

    clear_overrides()


def test_sync_complete_skips_changes_on_first_sync():
    """First sync (no prior cache) does NOT insert a library_changes row."""
    db = mock_db_empty()
    override_db(db)

    albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
    ]

    response = client.post("/library/sync-complete", json={"albums": albums})
    assert response.status_code == 200

    table_calls = [c[0][0] for c in db.table.call_args_list]
    assert "library_changes" not in table_calls

    clear_overrides()


def test_sync_complete_filters_suppressed_albums():
    """Albums in deduped_albums table are filtered out before cache upsert."""
    db = MagicMock()
    cache_mock = MagicMock()
    deduped_mock = MagicMock()
    changes_mock = MagicMock()

    # No existing cache (first sync)
    cache_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    cache_mock.upsert.return_value.execute.return_value = MagicMock(data=[])

    # Suppression list: "old1" is a known deduped album
    deduped_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"old_service_id": "old1"}]
    )

    def table_router(name):
        if name == "deduped_albums":
            return deduped_mock
        if name == "library_changes":
            return changes_mock
        return cache_mock

    db.table.side_effect = table_router
    override_db(db)

    albums = [
        {
            "service_id": "old1",
            "name": "Blonde",
            "artists": [],
            "total_tracks": 17,
            "release_date": "2016",
            "added_at": "2017-01-01T00:00:00Z",
            "image_url": None,
        },
        {
            "service_id": "new1",
            "name": "Blonde",
            "artists": [],
            "total_tracks": 17,
            "release_date": "2016",
            "added_at": "2023-01-01T00:00:00Z",
            "image_url": None,
        },
    ]

    response = client.post("/library/sync-complete", json={"albums": albums})
    assert response.status_code == 200

    # The first upsert (before dedup) should only contain non-suppressed album
    first_upsert = cache_mock.upsert.call_args_list[0][0][0]
    cached_ids = [a["service_id"] for a in first_upsert["albums"]]
    assert "old1" not in cached_ids
    assert "new1" in cached_ids

    clear_overrides()


def test_artist_images_returns_image_map():
    sp = MagicMock()
    sp.artists.return_value = {
        "artists": [
            {
                "id": "art1",
                "name": "Artist One",
                "images": [{"url": "https://img/art1.jpg", "height": 64}],
            },
        ]
    }
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "albums": [
                        {
                            "service_id": "a1",
                            "name": "Album",
                            "artists": [{"name": "Artist One", "id": "art1"}],
                            "image_url": None,
                        },
                    ]
                }
            ]
        )
    )
    override_db(db)
    override_spotify(sp)
    try:
        res = client.get("/library/artist-images")
        assert res.status_code == 200
        data = res.json()
        assert data["artist_images"]["Artist One"] == "https://img/art1.jpg"
    finally:
        clear_overrides()


def test_artist_images_returns_cached_without_spotify_call():
    """When artist_images is already cached, return it without calling Spotify."""
    sp = MagicMock()
    cached_images = {"Artist One": "https://img/cached.jpg"}
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "albums": [],
                    "artist_images": cached_images,
                }
            ]
        )
    )
    override_db(db)
    override_spotify(sp)
    try:
        res = client.get("/library/artist-images")
        assert res.status_code == 200
        data = res.json()
        assert data["artist_images"]["Artist One"] == "https://img/cached.jpg"
        sp.artists.assert_not_called()
    finally:
        clear_overrides()
