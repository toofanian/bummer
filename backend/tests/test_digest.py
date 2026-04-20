import os
from datetime import date
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from db import get_db
from main import app
from spotify_client import get_user_spotify

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}


def mock_db():
    db = MagicMock()
    return db


def mock_spotify():
    return MagicMock()


def setup_overrides(db=None, sp=None):
    _db = db or mock_db()
    _sp = sp or mock_spotify()
    app.dependency_overrides[get_authed_db] = lambda: _db
    app.dependency_overrides[get_db] = lambda: _db
    app.dependency_overrides[get_user_spotify] = lambda: _sp
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


def clear_overrides():
    app.dependency_overrides.clear()


# --- POST /digest/snapshot ---


@patch.dict(os.environ, {"CRON_SECRET": "test-secret"})
def test_snapshot_creates_row():
    db = mock_db()
    # Mock library_cache query returning one user's cached albums
    db.table.return_value.select.return_value.execute.return_value = MagicMock(
        data=[
            {
                "user_id": FAKE_USER_ID,
                "albums": [
                    {
                        "service_id": "a1",
                        "name": "Album1",
                        "artists": ["X"],
                        "image_url": None,
                    },
                    {
                        "service_id": "a2",
                        "name": "Album2",
                        "artists": ["Y"],
                        "image_url": None,
                    },
                ],
                "total": 2,
            }
        ]
    )
    setup_overrides(db=db)
    try:
        res = client.post(
            "/digest/snapshot",
            headers={"X-Cron-Secret": "test-secret"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["users_processed"] == 1
        assert data["snapshot_date"] == str(date.today())
        db.table.return_value.upsert.assert_called_once()
        upsert_call = db.table.return_value.upsert.call_args[0][0]
        assert set(upsert_call["album_ids"]) == {"a1", "a2"}
        assert upsert_call["total"] == 2
        assert upsert_call["user_id"] == FAKE_USER_ID
    finally:
        clear_overrides()


@patch.dict(os.environ, {"CRON_SECRET": "test-secret"})
def test_snapshot_returns_503_when_cache_empty():
    db = mock_db()
    # No library_cache rows at all
    db.table.return_value.select.return_value.execute.return_value = MagicMock(data=[])
    setup_overrides(db=db)
    try:
        res = client.post(
            "/digest/snapshot",
            headers={"X-Cron-Secret": "test-secret"},
        )
        assert res.status_code == 503
    finally:
        clear_overrides()


@patch.dict(os.environ, {"CRON_SECRET": "test-secret"})
def test_snapshot_rejects_bad_secret():
    setup_overrides()
    try:
        res = client.post(
            "/digest/snapshot",
            headers={"X-Cron-Secret": "wrong"},
        )
        assert res.status_code == 403
    finally:
        clear_overrides()


@patch.dict(os.environ, {"CRON_SECRET": "test-secret"})
def test_snapshot_rejects_missing_secret():
    setup_overrides()
    try:
        res = client.post("/digest/snapshot")
        assert res.status_code == 403
    finally:
        clear_overrides()


# --- GET /digest ---

ALBUM_CACHE = [
    {
        "service_id": "a1",
        "name": "Album One",
        "artists": ["Artist A"],
        "image_url": "https://img/1.jpg",
    },
    {
        "service_id": "a2",
        "name": "Album Two",
        "artists": ["Artist B"],
        "image_url": "https://img/2.jpg",
    },
    {
        "service_id": "a3",
        "name": "Album Three",
        "artists": ["Artist C"],
        "image_url": "https://img/3.jpg",
    },
]


def test_digest_returns_added_and_removed():
    start_snapshot = {
        "snapshot_date": "2026-03-01",
        "album_ids": ["a1", "a2"],
        "total": 2,
    }
    end_snapshot = {
        "snapshot_date": "2026-03-08",
        "album_ids": ["a1", "a3"],
        "total": 2,
    }

    # The DB mock returns the single matching snapshot per query.
    # We need two separate calls for start and end snapshots.
    db = MagicMock()
    call_count = {"n": 0}

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            snapshot = end_snapshot if call_count["n"] > 0 else start_snapshot
            call_count["n"] += 1
            mock_table.select.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[snapshot]
            )
        elif table_name == "play_history":
            mock_table.select.return_value.gte.return_value.lte.return_value.execute.return_value = MagicMock(
                data=[]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest", params={"start": "2026-03-01", "end": "2026-03-08"})
        assert res.status_code == 200
        data = res.json()
        added_ids = [a["service_id"] for a in data["added"]]
        removed_ids = [a["service_id"] for a in data["removed"]]
        assert "a3" in added_ids
        assert "a2" in removed_ids
        assert "a1" not in added_ids
        assert "a1" not in removed_ids
    finally:
        clear_overrides()


def test_digest_returns_listened_with_play_counts():
    snapshot = {"snapshot_date": "2026-03-01", "album_ids": ["a1"], "total": 1}
    plays = [
        {"album_id": "a1", "played_at": "2026-03-02T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-03-03T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-03-04T10:00:00+00:00"},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[snapshot]
            )
        elif table_name == "play_history":
            mock_table.select.return_value.gte.return_value.lte.return_value.execute.return_value = MagicMock(
                data=plays
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest", params={"start": "2026-03-01", "end": "2026-03-08"})
        assert res.status_code == 200
        data = res.json()
        listened = data["listened"]
        assert len(listened) == 1
        assert listened[0]["service_id"] == "a1"
        assert listened[0]["play_count"] == 3
    finally:
        clear_overrides()


def test_digest_404_when_no_snapshots():
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest", params={"start": "2026-03-01", "end": "2026-03-08"})
        assert res.status_code == 404
    finally:
        clear_overrides()


def test_digest_requires_start_and_end():
    setup_overrides()
    try:
        res = client.get("/digest")
        assert res.status_code == 422
    finally:
        clear_overrides()


# --- POST /digest/ensure-snapshot ---


@patch("routers.digest.get_album_cache")
@patch("routers.digest.date")
def test_ensure_snapshot_creates_when_none_exists(mock_date, mock_cache):
    mock_date.today.return_value = date(2026, 3, 15)
    mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
    mock_cache.return_value = [
        {"service_id": "a1", "name": "Album1", "artists": ["X"], "image_url": None},
        {"service_id": "a2", "name": "Album2", "artists": ["Y"], "image_url": None},
    ]
    db = MagicMock()
    # No existing snapshot for today (.eq(snapshot_date).eq(user_id).execute())
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    setup_overrides(db=db)
    try:
        res = client.post("/digest/ensure-snapshot")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "created"
        assert data["snapshot_date"] == "2026-03-15"
        assert data["total"] == 2
        # Verify upsert was called
        db.table.return_value.upsert.assert_called_once()
        upsert_call = db.table.return_value.upsert.call_args[0][0]
        assert set(upsert_call["album_ids"]) == {"a1", "a2"}
        assert upsert_call["user_id"] == FAKE_USER_ID
    finally:
        clear_overrides()


@patch("routers.digest.get_album_cache")
@patch("routers.digest.date")
def test_ensure_snapshot_skips_when_already_exists(mock_date, mock_cache):
    mock_date.today.return_value = date(2026, 3, 15)
    mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
    existing_snapshot = {
        "snapshot_date": "2026-03-15",
        "album_ids": ["a1", "a2"],
        "total": 2,
    }
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[existing_snapshot]
    )
    setup_overrides(db=db)
    try:
        res = client.post("/digest/ensure-snapshot")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "exists"
        assert data["snapshot_date"] == "2026-03-15"
        assert data["total"] == 2
        # Verify upsert was NOT called
        db.table.return_value.upsert.assert_not_called()
        # Verify get_album_cache was NOT called (no need to read cache if snapshot exists)
        mock_cache.assert_not_called()
    finally:
        clear_overrides()


@patch("routers.digest.get_album_cache")
@patch("routers.digest.date")
def test_ensure_snapshot_returns_503_when_cache_empty(mock_date, mock_cache):
    mock_date.today.return_value = date(2026, 3, 15)
    mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
    mock_cache.return_value = []
    db = MagicMock()
    # No existing snapshot (.eq(snapshot_date).eq(user_id).execute())
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    setup_overrides(db=db)
    try:
        res = client.post("/digest/ensure-snapshot")
        assert res.status_code == 503
    finally:
        clear_overrides()


# --- GET /digest/changelog ---


def test_changelog_returns_entries_from_consecutive_snapshots():
    """Three snapshots → two entries, each showing adds/removes between consecutive pairs."""
    snapshots = [
        {"snapshot_date": "2026-04-03", "album_ids": ["a1", "a2", "a3"], "total": 3},
        {"snapshot_date": "2026-04-02", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            # First call: fetch snapshots list (limit+1 rows, ordered desc)
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
            return mock_table
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        entries = data["entries"]
        assert len(entries) == 2

        # Most recent entry: 2026-04-03 vs 2026-04-02 → a3 added
        assert entries[0]["date"] == "2026-04-03"
        added_ids_0 = [a["service_id"] for a in entries[0]["added"]]
        assert "a3" in added_ids_0
        assert entries[0]["removed"] == []

        # Older entry: 2026-04-02 vs 2026-04-01 → a2 added
        assert entries[1]["date"] == "2026-04-02"
        added_ids_1 = [a["service_id"] for a in entries[1]["added"]]
        assert "a2" in added_ids_1
        assert entries[1]["removed"] == []
    finally:
        clear_overrides()


def test_changelog_empty_when_no_snapshots():
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        assert data["entries"] == []
        assert data["has_more"] is False
        assert data["next_cursor"] is None
    finally:
        clear_overrides()


def test_changelog_empty_when_one_snapshot():
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1}]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        assert data["entries"] == []
        assert data["has_more"] is False
    finally:
        clear_overrides()


def test_changelog_includes_removals():
    """When an album is in the older snapshot but not the newer, it appears in removed."""
    snapshots = [
        {"snapshot_date": "2026-04-02", "album_ids": ["a1"], "total": 1},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1", "a2"], "total": 2},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        entries = data["entries"]
        assert len(entries) == 1
        assert entries[0]["date"] == "2026-04-02"
        removed_ids = [a["service_id"] for a in entries[0]["removed"]]
        assert "a2" in removed_ids
        assert entries[0]["added"] == []
    finally:
        clear_overrides()


def test_changelog_skips_unchanged_pairs():
    """Consecutive snapshots with identical album_ids produce no entry."""
    snapshots = [
        {"snapshot_date": "2026-04-03", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-02", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        entries = data["entries"]
        # Only one entry: 2026-04-02 vs 2026-04-01 (a2 added)
        # The 2026-04-03 vs 2026-04-02 pair is identical → skipped
        assert len(entries) == 1
        assert entries[0]["date"] == "2026-04-02"
    finally:
        clear_overrides()


def test_changelog_before_cursor():
    """The before param filters to snapshots before the given date."""
    snapshots = [
        {"snapshot_date": "2026-04-02", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1},
    ]

    db = MagicMock()
    snapshots_mock = None

    def table_router(table_name):
        nonlocal snapshots_mock
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            snapshots_mock = mock_table
            # The endpoint builds .select().order().limit() then appends .lt() when before is set
            mock_table.select.return_value.order.return_value.limit.return_value.lt.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog", params={"before": "2026-04-05"})
        assert res.status_code == 200
        data = res.json()
        assert len(data["entries"]) == 1
        # Verify .lt was called on the query chain
        snapshots_mock.select.return_value.order.return_value.limit.return_value.lt.assert_called()
    finally:
        clear_overrides()


# --- GET /digest/history ---


def test_history_returns_plays_grouped_by_day():
    """3 plays across 2 days, verify grouping and ordering (newest first)."""
    plays = [
        {"album_id": "a1", "played_at": "2026-04-18T15:30:00+00:00"},
        {"album_id": "a2", "played_at": "2026-04-18T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-04-17T20:00:00+00:00"},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=plays
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/history")
        assert res.status_code == 200
        data = res.json()
        days = data["days"]
        assert len(days) == 2
        # Newest day first
        assert days[0]["date"] == "2026-04-18"
        assert len(days[0]["plays"]) == 2
        # Within a day, newest first
        assert days[0]["plays"][0]["played_at"] == "2026-04-18T15:30:00+00:00"
        assert days[0]["plays"][0]["album"]["service_id"] == "a1"
        assert days[0]["plays"][1]["played_at"] == "2026-04-18T10:00:00+00:00"
        assert days[0]["plays"][1]["album"]["service_id"] == "a2"
        # Older day
        assert days[1]["date"] == "2026-04-17"
        assert len(days[1]["plays"]) == 1
        assert data["has_more"] is False
        assert data["next_cursor"] is None
    finally:
        clear_overrides()


def test_history_empty_when_no_plays():
    """No play_history rows returns empty days."""
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/history")
        assert res.status_code == 200
        data = res.json()
        assert data["days"] == []
        assert data["has_more"] is False
        assert data["next_cursor"] is None
    finally:
        clear_overrides()


def test_history_before_cursor():
    """Verify .lt is called when before param is provided."""
    plays = [
        {"album_id": "a1", "played_at": "2026-04-15T10:00:00+00:00"},
    ]

    db = MagicMock()
    play_history_mock = None

    def table_router(table_name):
        nonlocal play_history_mock
        mock_table = MagicMock()
        if table_name == "play_history":
            play_history_mock = mock_table
            mock_table.select.return_value.order.return_value.limit.return_value.lt.return_value.execute.return_value = MagicMock(
                data=plays
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get(
            "/digest/history",
            params={"before": "2026-04-16T00:00:00+00:00"},
        )
        assert res.status_code == 200
        # Verify .lt was called on the query chain
        play_history_mock.select.return_value.order.return_value.limit.return_value.lt.assert_called()
    finally:
        clear_overrides()


# --- GET /digest/stats ---


def test_stats_returns_top_albums_and_artists():
    """5 plays across 2 albums, verify top albums sorted by count and top artists."""
    plays = [
        {"album_id": "a1", "played_at": "2026-04-10T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-04-11T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-04-12T10:00:00+00:00"},
        {"album_id": "a2", "played_at": "2026-04-13T10:00:00+00:00"},
        {"album_id": "a2", "played_at": "2026-04-14T10:00:00+00:00"},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=plays)
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/stats")
        assert res.status_code == 200
        data = res.json()
        assert data["period_days"] == 30
        # Top albums: a1 (3 plays) then a2 (2 plays)
        top_albums = data["top_albums"]
        assert len(top_albums) == 2
        assert top_albums[0]["album"]["service_id"] == "a1"
        assert top_albums[0]["play_count"] == 3
        assert top_albums[1]["album"]["service_id"] == "a2"
        assert top_albums[1]["play_count"] == 2
        # Top artists: Artist A (3 plays from a1), Artist B (2 plays from a2)
        top_artists = data["top_artists"]
        assert len(top_artists) == 2
        assert top_artists[0]["artist"] == "Artist A"
        assert top_artists[0]["play_count"] == 3
        assert top_artists[1]["artist"] == "Artist B"
        assert top_artists[1]["play_count"] == 2
    finally:
        clear_overrides()


def test_stats_empty_when_no_plays():
    """No plays in last 30 days returns empty lists."""
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/stats")
        assert res.status_code == 200
        data = res.json()
        assert data["period_days"] == 30
        assert data["top_albums"] == []
        assert data["top_artists"] == []
    finally:
        clear_overrides()
