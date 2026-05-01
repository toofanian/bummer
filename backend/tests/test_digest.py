from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

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


ALBUM_CACHE = [
    {
        "service_id": "a1",
        "name": "Album One",
        "artists": [{"name": "Artist A", "id": "artA"}],
        "image_url": "https://img/1.jpg",
    },
    {
        "service_id": "a2",
        "name": "Album Two",
        "artists": [{"name": "Artist B", "id": "artB"}],
        "image_url": "https://img/2.jpg",
    },
    {
        "service_id": "a3",
        "name": "Album Three",
        "artists": [{"name": "Artist C", "id": "artC"}],
        "image_url": "https://img/3.jpg",
    },
]


# --- GET /digest/changelog ---


def test_changelog_returns_added_events():
    """Changelog returns added albums from library_changes in the last 30 days."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=1)).isoformat(),
            "added_ids": ["a1"],
            "removed_ids": [],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        days = data["days"]
        assert len(days) == 1
        events = days[0]["events"]
        assert len(events) == 1
        assert events[0]["type"] == "added"
        assert events[0]["album"]["service_id"] == "a1"
        assert "changed_at" in events[0]
    finally:
        clear_overrides()


def test_changelog_returns_removed_events():
    """Changelog returns removed albums from library_changes."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=2)).isoformat(),
            "added_ids": [],
            "removed_ids": ["a2"],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        days = data["days"]
        assert len(days) == 1
        events = days[0]["events"]
        assert len(events) == 1
        assert events[0]["type"] == "removed"
        assert events[0]["album"]["service_id"] == "a2"
    finally:
        clear_overrides()


def test_changelog_detects_bounced_albums():
    """Album that appears in both added and removed within 30 days = bounced."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=1)).isoformat(),
            "added_ids": [],
            "removed_ids": ["a1"],
        },
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=5)).isoformat(),
            "added_ids": ["a1"],
            "removed_ids": [],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        days = data["days"]
        assert len(days) == 1
        events = days[0]["events"]
        assert len(events) == 1
        assert events[0]["type"] == "bounced"
        assert events[0]["album"]["service_id"] == "a1"
        assert events[0]["changed_at"] == (now - timedelta(days=1)).isoformat()
    finally:
        clear_overrides()


def test_changelog_empty_when_no_changes():
    """No library_changes rows returns empty events list."""
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
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
        assert data["days"] == []
    finally:
        clear_overrides()


def test_changelog_events_sorted_most_recent_first():
    """Events are sorted by changed_at descending."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=1)).isoformat(),
            "added_ids": ["a1"],
            "removed_ids": [],
        },
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=3)).isoformat(),
            "added_ids": ["a2"],
            "removed_ids": [],
        },
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=2)).isoformat(),
            "added_ids": [],
            "removed_ids": ["a3"],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        days = res.json()["days"]
        assert len(days) == 3
        # Most recent day first
        assert days[0]["events"][0]["album"]["service_id"] == "a1"
        assert days[1]["events"][0]["album"]["service_id"] == "a3"
        assert days[2]["events"][0]["album"]["service_id"] == "a2"
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
        assert days[0]["date"] == "2026-04-18"
        assert len(days[0]["plays"]) == 2
        assert days[0]["plays"][0]["played_at"] == "2026-04-18T15:30:00+00:00"
        assert days[0]["plays"][0]["album"]["service_id"] == "a1"
        assert days[0]["plays"][1]["played_at"] == "2026-04-18T10:00:00+00:00"
        assert days[0]["plays"][1]["album"]["service_id"] == "a2"
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
        top_albums = data["top_albums"]
        assert len(top_albums) == 2
        assert top_albums[0]["album"]["service_id"] == "a1"
        assert top_albums[0]["play_count"] == 3
        assert top_albums[1]["album"]["service_id"] == "a2"
        assert top_albums[1]["play_count"] == 2
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


def test_stats_returns_artist_image_urls():
    """Stats response includes image_url for each top artist."""
    plays = [
        {"album_id": "a1", "played_at": "2026-04-10T10:00:00+00:00"},
    ]
    album_cache = [
        {
            "service_id": "a1",
            "name": "Album One",
            "artists": [{"name": "Artist A", "id": "artA"}],
            "image_url": "https://img/1.jpg",
        },
    ]

    sp = mock_spotify()
    sp.artists.return_value = {
        "artists": [
            {
                "id": "artA",
                "name": "Artist A",
                "images": [
                    {"url": "https://artist-img/artA-large.jpg", "height": 640},
                    {"url": "https://artist-img/artA-small.jpg", "height": 64},
                ],
            }
        ]
    }

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=plays)
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": album_cache}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db, sp=sp)
    try:
        res = client.get("/digest/stats")
        assert res.status_code == 200
        data = res.json()
        assert (
            data["top_artists"][0]["image_url"] == "https://artist-img/artA-small.jpg"
        )
        sp.artists.assert_called_once_with(["artA"])
    finally:
        clear_overrides()


def test_stats_top_artists_from_all_plays_not_just_top_albums():
    """Artists with plays spread across non-top albums should still appear in top_artists."""
    albums_meta = []
    plays = []
    for i in range(1, 11):
        aid = f"top{i}"
        albums_meta.append(
            {
                "service_id": aid,
                "name": f"Top Album {i}",
                "artists": [{"name": f"Artist {i}", "id": f"art{i}"}],
                "image_url": None,
            }
        )
        for _ in range(3):
            plays.append(
                {"album_id": aid, "played_at": f"2026-04-{10 + i}T10:00:00+00:00"}
            )

    for j, aid in enumerate(["extra1", "extra2"]):
        albums_meta.append(
            {
                "service_id": aid,
                "name": f"Extra Album {j + 1}",
                "artists": [{"name": "Prolific Artist", "id": "artProlific"}],
                "image_url": None,
            }
        )
        for _ in range(2):
            plays.append(
                {"album_id": aid, "played_at": f"2026-04-0{j + 1}T10:00:00+00:00"}
            )

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=plays)
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": albums_meta}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/stats")
        assert res.status_code == 200
        data = res.json()
        artist_names = [a["artist"] for a in data["top_artists"]]
        assert "Prolific Artist" in artist_names
        prolific = next(
            a for a in data["top_artists"] if a["artist"] == "Prolific Artist"
        )
        assert prolific["play_count"] == 4
    finally:
        clear_overrides()


def test_stats_resolves_artist_images_via_search_when_no_id():
    """When cache has old string-format artists (no ID), falls back to Spotify search."""
    plays = [
        {"album_id": "a1", "played_at": "2026-04-10T10:00:00+00:00"},
    ]
    album_cache = [
        {
            "service_id": "a1",
            "name": "Album One",
            "artists": ["Artist A"],
            "image_url": "https://img/1.jpg",
        },
    ]

    sp = mock_spotify()
    sp.search.return_value = {
        "artists": {
            "items": [
                {
                    "id": "artA",
                    "name": "Artist A",
                    "images": [
                        {"url": "https://artist-img/artA.jpg", "height": 64},
                    ],
                }
            ]
        }
    }
    sp.artists.return_value = {
        "artists": [
            {
                "id": "artA",
                "name": "Artist A",
                "images": [
                    {"url": "https://artist-img/artA.jpg", "height": 64},
                ],
            }
        ]
    }

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=plays)
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": album_cache}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db, sp=sp)
    try:
        res = client.get("/digest/stats")
        assert res.status_code == 200
        data = res.json()
        assert data["top_artists"][0]["image_url"] == "https://artist-img/artA.jpg"
        sp.search.assert_called_once()
    finally:
        clear_overrides()
