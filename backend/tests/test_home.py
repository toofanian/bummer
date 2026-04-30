from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from main import app
from spotify_client import get_user_spotify

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}


def mock_db():
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
    return db


def mock_spotify():
    return MagicMock()


def setup_overrides(db=None, sp=None):
    app.dependency_overrides[get_authed_db] = lambda: db or mock_db()
    app.dependency_overrides[get_user_spotify] = lambda: sp or mock_spotify()
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


def clear_overrides():
    app.dependency_overrides.clear()


def test_log_play_inserts_row():
    db = mock_db()
    setup_overrides(db=db)
    try:
        res = client.post("/home/history/log", json={"album_id": "abc123"})
        assert res.status_code == 204
        db.table.assert_called_with("play_history")
        db.table.return_value.insert.assert_called_once_with(
            {"album_id": "abc123", "user_id": FAKE_USER_ID}
        )
    finally:
        clear_overrides()


def test_log_play_requires_album_id():
    setup_overrides()
    try:
        res = client.post("/home/history/log", json={})
        assert res.status_code == 422
    finally:
        clear_overrides()


def mock_db_with_play_history(rows):
    """Mock DB that returns play_history rows and empty library cache.

    The recently_played query uses .select().order().limit().execute() (no .gte()).
    The rediscover/recommended queries use .select().gte().execute().
    """
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            # Chain for recently_played: .select().order().limit().execute()
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=rows
            )
            # Chain for rediscover/recommended: .select().gte().execute()
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=rows)
            )
            # Also support .select().gte().order().execute() in case it's still used
            mock_table.select.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=rows
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    return db


ALBUM_CACHE = [
    {
        "service_id": "album1",
        "name": "Album One",
        "artists": ["Artist A"],
        "image_url": "https://img/1.jpg",
        "release_date": "2020-01-01",
        "added_at": "2024-01-15T00:00:00Z",
    },
    {
        "service_id": "album2",
        "name": "Album Two",
        "artists": ["Artist B"],
        "image_url": "https://img/2.jpg",
        "release_date": "2021-06-01",
        "added_at": "2024-03-01T00:00:00Z",
    },
    {
        "service_id": "album3",
        "name": "Album Three",
        "artists": ["Artist A"],
        "image_url": "https://img/3.jpg",
        "release_date": "2019-03-15",
        "added_at": "2023-12-01T00:00:00Z",
    },
]


@patch("routers.home.get_album_cache", return_value=ALBUM_CACHE)
def test_home_returns_recently_played_deduped(mock_cache):
    """recently_played returns deduped albums keeping first (most recent) occurrence."""
    now = datetime.now(timezone.utc)
    rows = [
        {"album_id": "album1", "played_at": now.isoformat()},
        {"album_id": "album2", "played_at": (now - timedelta(hours=1)).isoformat()},
        {"album_id": "album1", "played_at": (now - timedelta(hours=2)).isoformat()},
    ]
    db = mock_db_with_play_history(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        assert res.status_code == 200
        data = res.json()
        recently_played_ids = [a["service_id"] for a in data["recently_played"]]
        assert recently_played_ids == ["album1", "album2"]
        # Verify old keys are gone
        assert "today" not in data
        assert "this_week" not in data
    finally:
        clear_overrides()


@patch("routers.home.get_album_cache", return_value=ALBUM_CACHE)
def test_home_empty_history(mock_cache):
    db = mock_db_with_play_history([])
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        assert res.status_code == 200
        data = res.json()
        assert data["recently_played"] == []
    finally:
        clear_overrides()


@patch("routers.home.get_album_cache")
def test_home_recently_played_capped_at_60(mock_cache):
    """When more than 60 unique albums are played, only the 60 most recent are returned."""
    albums = [
        {
            "service_id": f"album{i}",
            "name": f"Album {i}",
            "artists": ["Artist X"],
            "image_url": f"https://img/{i}.jpg",
            "release_date": "2020-01-01",
            "added_at": "2024-01-01T00:00:00Z",
        }
        for i in range(1, 66)
    ]
    mock_cache.return_value = albums

    now = datetime.now(timezone.utc)
    # 65 unique plays, most recent first
    rows = [
        {"album_id": f"album{i}", "played_at": (now - timedelta(hours=i)).isoformat()}
        for i in range(1, 66)
    ]
    db = mock_db_with_play_history(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        assert res.status_code == 200
        data = res.json()
        assert len(data["recently_played"]) == 60
        ids = [a["service_id"] for a in data["recently_played"]]
        assert ids == [f"album{i}" for i in range(1, 61)]
    finally:
        clear_overrides()


@patch("routers.home.get_album_cache", return_value=ALBUM_CACHE)
def test_home_rediscover_returns_unplayed_albums(mock_cache):
    """Albums not played in 60+ days should appear in rediscover."""
    old_play = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    rows = [
        {"album_id": "album1", "played_at": old_play},
    ]
    db = mock_db_with_play_history(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        data = res.json()
        rediscover_ids = [a["service_id"] for a in data["rediscover"]]
        assert set(rediscover_ids).issubset({"album1", "album2", "album3"})
        assert len(rediscover_ids) <= 60
    finally:
        clear_overrides()


@patch("routers.home.get_album_cache", return_value=ALBUM_CACHE)
def test_home_rediscover_excludes_recently_played(mock_cache):
    """Albums played within 60 days should NOT appear in rediscover."""
    recent_play = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    rows = [
        {"album_id": "album1", "played_at": recent_play},
    ]
    db = mock_db_with_play_history(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        data = res.json()
        rediscover_ids = [a["service_id"] for a in data["rediscover"]]
        assert "album1" not in rediscover_ids
    finally:
        clear_overrides()


@patch("routers.home.get_album_cache", return_value=ALBUM_CACHE)
def test_home_recommended_by_frequent_artists(mock_cache):
    """Recommended should return albums by recently played artists, excluding those in recently played."""
    now = datetime.now(timezone.utc)
    rows = [
        {"album_id": "album1", "played_at": (now - timedelta(days=1)).isoformat()},
        {"album_id": "album1", "played_at": (now - timedelta(days=2)).isoformat()},
        {"album_id": "album1", "played_at": (now - timedelta(days=3)).isoformat()},
    ]
    db = mock_db_with_play_history(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        data = res.json()
        rec_ids = [a["service_id"] for a in data["recommended"]]
        assert "album3" in rec_ids  # by Artist A, not in recently played
        assert "album1" not in rec_ids  # in recently played section, excluded
    finally:
        clear_overrides()


@patch("routers.home.get_album_cache", return_value=ALBUM_CACHE)
def test_home_returns_recently_added(mock_cache):
    db = mock_db_with_play_history([])
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        assert res.status_code == 200
        data = res.json()
        assert "recently_added" in data
        ids = [a["service_id"] for a in data["recently_added"]]
        # Should be sorted by added_at descending
        assert ids == ["album2", "album1", "album3"]
    finally:
        clear_overrides()
