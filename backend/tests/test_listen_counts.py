from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from main import app
from spotify_client import get_user_spotify

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}


def setup_overrides(db=None):
    app.dependency_overrides[get_authed_db] = lambda: db or MagicMock()
    app.dependency_overrides[get_user_spotify] = lambda: MagicMock()
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


def clear_overrides():
    app.dependency_overrides.clear()


def mock_db_with_counts(rows):
    """Mock DB where play_history select returns the given rows."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=rows)
    )
    return db


def test_listen_counts_returns_aggregated_counts():
    rows = [
        {"album_id": "a1"},
        {"album_id": "a1"},
        {"album_id": "a1"},
        {"album_id": "a2"},
    ]
    db = mock_db_with_counts(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/library/listen-counts")
        assert res.status_code == 200
        data = res.json()
        assert data["counts"] == {"a1": 3, "a2": 1}
    finally:
        clear_overrides()


def test_listen_counts_empty_history():
    db = mock_db_with_counts([])
    setup_overrides(db=db)
    try:
        res = client.get("/library/listen-counts")
        assert res.status_code == 200
        assert res.json() == {"counts": {}}
    finally:
        clear_overrides()
