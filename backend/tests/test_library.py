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


def _make_keyed_db(cache_rows: dict[str, dict] = None):
    """Return a mock Supabase client that stores rows keyed by cache id.

    `cache_rows` maps cache_key -> row dict.  Supports select/eq reads and
    upsert writes so tests can inspect what was written to each key.
    """
    if cache_rows is None:
        cache_rows = {}
    store = dict(cache_rows)
    upsert_log: list[dict] = []
    delete_log: list[str] = []

    db = MagicMock()

    def _make_table_chain(table_name):
        table_mock = MagicMock()

        # --- SELECT path ---
        def _eq(col, val):
            eq_mock = MagicMock()
            row = store.get(val)
            eq_mock.execute.return_value = MagicMock(data=[row] if row else [])
            return eq_mock

        table_mock.select.return_value.eq = _eq

        # --- UPSERT path ---
        def _upsert(payload):
            upsert_log.append(payload)
            store[payload["id"]] = payload
            upsert_mock = MagicMock()
            upsert_mock.execute.return_value = MagicMock(data=[])
            return upsert_mock

        table_mock.upsert = _upsert

        # --- DELETE path ---
        def _delete():
            del_chain = MagicMock()

            def _del_eq(col, val):
                delete_log.append(val)
                if val in store:
                    del store[val]
                del_eq_mock = MagicMock()
                del_eq_mock.execute.return_value = MagicMock(data=[])
                return del_eq_mock

            del_chain.eq = _del_eq
            return del_chain

        table_mock.delete = _delete

        return table_mock

    db.table = lambda name: _make_table_chain(name)
    db._store = store
    db._upsert_log = upsert_log
    db._delete_log = delete_log
    return db


def test_sync_offset_zero_writes_to_staging_not_main():
    """offset=0 with done=false writes to staging key only; main is untouched."""
    db = _make_keyed_db()
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

    staging_key = f"{FAKE_USER_ID}:staging"
    # Staging row was written
    assert staging_key in db._store
    assert len(db._store[staging_key]["albums"]) == 50
    # Main row was NOT written
    assert FAKE_USER_ID not in db._store

    clear_overrides()


def test_sync_offset_nonzero_appends_to_staging():
    """offset>0 reads staging, appends new page, writes back to staging."""
    staging_key = f"{FAKE_USER_ID}:staging"
    existing_staging = {
        "id": staging_key,
        "user_id": FAKE_USER_ID,
        "albums": [
            {
                "service_id": "old1",
                "name": "Old Album",
                "artists": ["X"],
                "release_date": "2020",
                "total_tracks": 10,
                "image_url": None,
                "added_at": "2021-01-01T00:00:00Z",
            }
        ],
        "total": 1,
        "synced_at": "2026-01-01T00:00:00Z",
    }
    db = _make_keyed_db({staging_key: existing_staging})
    override_db(db)
    sp = make_spotify_mock(
        [
            {
                "items": [SAVED_ALBUM],
                "total": 2,
                "next": "https://api.spotify.com/v1/me/albums?offset=100",
            },
        ]
    )
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 50})

    assert response.status_code == 200
    data = response.json()
    assert data["synced_this_page"] == 1
    assert data["total_in_cache"] == 2
    assert data["done"] is False

    # Staging updated with both albums
    staging_ids = [a["service_id"] for a in db._store[staging_key]["albums"]]
    assert "old1" in staging_ids
    assert "abc123" in staging_ids
    # Main still not written
    assert FAKE_USER_ID not in db._store

    clear_overrides()


def test_sync_done_copies_staging_to_main_and_deletes_staging():
    """When done=true, staging content is promoted to main and staging is deleted."""
    db = _make_keyed_db()
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
    assert data["done"] is True
    assert data["total_in_cache"] == 1

    staging_key = f"{FAKE_USER_ID}:staging"
    # Main row was written
    assert FAKE_USER_ID in db._store
    assert db._store[FAKE_USER_ID]["albums"][0]["service_id"] == "abc123"
    # Staging row was deleted
    assert staging_key not in db._store

    clear_overrides()


def test_sync_interrupted_leaves_main_intact():
    """If sync is interrupted (no done=true), main cache is preserved."""
    main_albums = [
        {
            "service_id": "preserved",
            "name": "Should Survive",
            "artists": ["X"],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        }
    ]
    main_row = {
        "id": FAKE_USER_ID,
        "user_id": FAKE_USER_ID,
        "albums": main_albums,
        "total": 1,
        "synced_at": "2026-01-01T00:00:00Z",
    }
    db = _make_keyed_db({FAKE_USER_ID: main_row})
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

    # Sync first page (not done)
    response = client.post("/library/sync", json={"offset": 0})
    assert response.status_code == 200
    assert response.json()["done"] is False

    # Main cache is still the old data
    assert db._store[FAKE_USER_ID]["albums"] == main_albums
    assert db._store[FAKE_USER_ID]["albums"][0]["service_id"] == "preserved"

    clear_overrides()


def test_sync_offset_nonzero_dedupes_by_service_id():
    """Retried page or racing tabs produce duplicate items; dedupe keeps one."""
    staging_key = f"{FAKE_USER_ID}:staging"
    existing_staging = {
        "id": staging_key,
        "user_id": FAKE_USER_ID,
        "albums": [
            {
                "service_id": "abc123",  # same ID as SAVED_ALBUM
                "name": "Stale name",
                "artists": ["X"],
                "release_date": "2020",
                "total_tracks": 10,
                "image_url": None,
                "added_at": "2021-01-01T00:00:00Z",
            }
        ],
        "total": 1,
        "synced_at": "2026-01-01T00:00:00Z",
    }
    db = _make_keyed_db({staging_key: existing_staging})
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

    # Main row should have the deduped result (done=true)
    assert len(db._store[FAKE_USER_ID]["albums"]) == 1
    assert db._store[FAKE_USER_ID]["albums"][0]["name"] == "Dummy Album"

    clear_overrides()


def test_sync_offset_zero_clears_existing_cache():
    """A fresh sync (offset=0) must wipe stale staging data before writing the new first page."""
    staging_key = f"{FAKE_USER_ID}:staging"
    stale_staging = {
        "id": staging_key,
        "user_id": FAKE_USER_ID,
        "albums": [
            {
                "service_id": "deleted_album",
                "name": "User deleted this",
                "artists": ["X"],
                "release_date": "2020",
                "total_tracks": 10,
                "image_url": None,
                "added_at": "2021-01-01T00:00:00Z",
            }
        ],
        "total": 1,
        "synced_at": "2026-01-01T00:00:00Z",
    }
    db = _make_keyed_db({staging_key: stale_staging})
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

    # Main row has only the new album (done=true promoted staging)
    service_ids = [a["service_id"] for a in db._store[FAKE_USER_ID]["albums"]]
    assert "deleted_album" not in service_ids
    assert "abc123" in service_ids

    clear_overrides()


def test_sync_returns_done_false_when_more_pages_remain():
    """Spotify has a `next` URL -> done is False and next_offset points to page 2."""
    db = _make_keyed_db()
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
    db = _make_keyed_db()
    override_db(db)
    sp = make_spotify_mock([{"items": [], "total": 0, "next": None}])
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": -1})

    assert response.status_code == 400

    clear_overrides()


def test_sync_rejects_non_multiple_of_50_offset():
    """Offset must be a multiple of 50 (Spotify's page size)."""
    db = _make_keyed_db()
    override_db(db)
    sp = make_spotify_mock([{"items": [], "total": 0, "next": None}])
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 73})

    assert response.status_code == 400

    clear_overrides()


def test_sync_updates_last_synced_timestamp():
    """Completed sync writes synced_at = now() to the main cache row."""
    db = _make_keyed_db()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    response = client.post("/library/sync", json={"offset": 0})

    assert response.status_code == 200
    # Main row should have synced_at (done=true promotes staging to main)
    main_row = db._store[FAKE_USER_ID]
    assert "synced_at" in main_row
    assert main_row["synced_at"] == "now()"

    clear_overrides()


def test_sync_propagates_spotify_errors():
    """If Spotify raises, the endpoint returns a 5xx response to the client."""
    db = _make_keyed_db()
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
    db = _make_keyed_db()
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
