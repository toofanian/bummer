"""Tests for Apple Music auth endpoints."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from auth_middleware import get_current_user
from main import app

client = TestClient(app)

MOCK_USER = {"user_id": "test-user-123", "token": "mock-jwt"}


def setup_overrides():
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER


def clear_overrides():
    app.dependency_overrides.clear()


def mock_db(execute_data=None):
    db = MagicMock()
    result = MagicMock()
    result.data = execute_data or []
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        result
    )
    db.table.return_value.upsert.return_value.execute.return_value = result
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        result
    )
    db.table.return_value.delete.return_value.eq.return_value.execute.return_value = (
        result
    )
    return db


@patch("routers.apple_music_auth.generate_developer_token")
def test_get_developer_token(mock_gen):
    mock_gen.return_value = "dev-token-abc123"
    setup_overrides()

    response = client.get("/auth/apple-music/developer-token")

    assert response.status_code == 200
    assert response.json()["developer_token"] == "dev-token-abc123"
    clear_overrides()


@patch("routers.apple_music_auth.generate_developer_token")
def test_get_developer_token_returns_503_when_not_configured(mock_gen):
    mock_gen.side_effect = RuntimeError("Not configured")
    setup_overrides()

    response = client.get("/auth/apple-music/developer-token")

    assert response.status_code == 503
    clear_overrides()


@patch("routers.apple_music_auth.generate_developer_token")
def test_store_music_user_token(mock_gen):
    mock_gen.return_value = "dev-token"
    db = mock_db()
    setup_overrides()

    with patch("routers.apple_music_auth.get_service_db", return_value=db):
        response = client.post(
            "/auth/apple-music/token",
            json={"music_user_token": "user-token-xyz"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Verify token was upserted to spotify_tokens table
    db.table.assert_any_call("music_tokens")

    # Verify profile was updated
    db.table.assert_any_call("profiles")
    clear_overrides()


def test_apple_music_status_returns_false_when_no_profile():
    db = mock_db(execute_data=[])
    setup_overrides()

    with patch("routers.apple_music_auth.get_service_db", return_value=db):
        response = client.get("/auth/apple-music/status")

    assert response.status_code == 200
    assert response.json()["has_credentials"] is False
    clear_overrides()


def test_apple_music_status_returns_false_when_wrong_service_type():
    db = mock_db(execute_data=[{"service_type": "spotify"}])
    setup_overrides()

    with patch("routers.apple_music_auth.get_service_db", return_value=db):
        response = client.get("/auth/apple-music/status")

    assert response.status_code == 200
    assert response.json()["has_credentials"] is False
    clear_overrides()


def test_apple_music_status_returns_true_when_configured():
    db = MagicMock()
    # Profile query returns apple_music
    profile_result = MagicMock()
    profile_result.data = [{"service_type": "apple_music"}]
    # Token query returns a row (doesn't need access_token value)
    token_result = MagicMock()
    token_result.data = [{"user_id": "test-user-123"}]

    def table_side_effect(name):
        mock_table = MagicMock()
        if name == "profiles":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                profile_result
            )
        else:
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                token_result
            )
        return mock_table

    db.table.side_effect = table_side_effect
    setup_overrides()

    with patch("routers.apple_music_auth.get_service_db", return_value=db):
        response = client.get("/auth/apple-music/status")

    assert response.status_code == 200
    assert response.json()["has_credentials"] is True
    clear_overrides()


def test_apple_music_status_does_not_select_access_token():
    """The /status endpoint only checks existence — should not fetch access_token."""
    db = MagicMock()
    profile_result = MagicMock()
    profile_result.data = [{"service_type": "apple_music"}]
    token_result = MagicMock()
    token_result.data = [{"user_id": "test-user-123"}]

    _tables = {}

    def table_side_effect(name):
        if name in _tables:
            return _tables[name]
        mock_table = MagicMock()
        if name == "profiles":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                profile_result
            )
        else:
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                token_result
            )
        _tables[name] = mock_table
        return mock_table

    db.table.side_effect = table_side_effect
    setup_overrides()

    with patch("routers.apple_music_auth.get_service_db", return_value=db):
        client.get("/auth/apple-music/status")

    # Verify the music_tokens select does NOT request access_token
    tokens_table = _tables["music_tokens"]
    selected_cols = tokens_table.select.call_args[0][0]
    assert "access_token" not in selected_cols, (
        "Status endpoint should not fetch access_token — only check row existence"
    )
    clear_overrides()


def test_delete_music_user_token():
    db = mock_db()
    setup_overrides()

    with patch("routers.apple_music_auth.get_service_db", return_value=db):
        response = client.delete("/auth/apple-music/token")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Verify token was deleted
    db.table.assert_any_call("music_tokens")

    # Verify profile was reset
    db.table.assert_any_call("profiles")
    clear_overrides()
