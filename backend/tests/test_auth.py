from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from auth_middleware import get_current_user
from main import app

client = TestClient(app, follow_redirects=False)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# --- redeem-invite tests ---
# Original validation tests removed — invite code check bypassed (issue #79).
# See git history for the original tests if re-enabling.


# --- redeem-invite bypass tests (issue #79) ---


def test_redeem_invite_bypassed_always_succeeds():
    """Invite code validation is bypassed — any code should succeed without DB."""
    response = client.post(
        "/auth/redeem-invite",
        json={"invite_code": "ANYTHING"},
    )
    assert response.status_code == 200
    assert "redeemed" in response.json()["message"].lower()


def test_redeem_invite_bypassed_no_db_call():
    """Bypassed endpoint should not touch the database at all."""
    mock_db = MagicMock()
    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.post(
            "/auth/redeem-invite",
            json={"invite_code": "ANYTHING"},
        )
    assert response.status_code == 200
    mock_db.table.assert_not_called()


# --- spotify-token tests ---


def _override_current_user():
    async def mock_user():
        return {"user_id": "user-123", "token": "fake-jwt"}

    app.dependency_overrides[get_current_user] = mock_user


def _clear_overrides():
    app.dependency_overrides.clear()


def test_store_spotify_token():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.post(
            "/auth/spotify-token",
            json={
                "access_token": "sp-access",
                "refresh_token": "sp-refresh",
                "expires_in": 3600,
                "client_id": "my-client-id",
            },
        )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    mock_db.table.return_value.upsert.assert_called_once()
    _clear_overrides()


def test_delete_spotify_token():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.delete("/auth/spotify-token")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    mock_db.table.return_value.delete.assert_called_once()
    _clear_overrides()


# --- spotify-status tests ---


def test_spotify_status_no_credentials():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.get("/auth/spotify-status")

    assert response.status_code == 200
    assert response.json() == {"has_credentials": False, "client_id": None}
    _clear_overrides()


def test_spotify_status_with_credentials():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"user_id": "user-123", "client_id": "my-spotify-cid"}
    ]

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.get("/auth/spotify-status")

    assert response.status_code == 200
    assert response.json() == {
        "has_credentials": True,
        "client_id": "my-spotify-cid",
    }
    _clear_overrides()


def test_spotify_status_requires_auth():
    # No override — missing Authorization header should be rejected
    response = client.get("/auth/spotify-status")
    assert response.status_code in (401, 403, 422)


# --- delete-account tests ---


def test_delete_account_removes_user_data():
    _override_current_user()
    mock_db = MagicMock()
    # table().delete().eq().execute() chain
    mock_db.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
    # auth.admin.delete_user
    mock_db.auth.admin.delete_user.return_value = MagicMock()

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.delete("/auth/account")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Verify deletes happened across user-owned tables
    called_tables = [call_args[0][0] for call_args in mock_db.table.call_args_list]
    for t in [
        "music_tokens",
        "album_metadata",
        "collection_albums",
        "collections",
        "library_cache",
        "library_snapshots",
        "play_history",
        "profiles",
    ]:
        assert t in called_tables, f"expected delete on {t}, got {called_tables}"

    # auth user itself must be deleted
    mock_db.auth.admin.delete_user.assert_called_once_with("user-123")
    _clear_overrides()


def test_delete_account_only_deletes_own_user_rows():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
    mock_db.auth.admin.delete_user.return_value = MagicMock()

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.delete("/auth/account")

    assert response.status_code == 200
    # Every delete().eq() call must filter by user_id = "user-123"
    eq_calls = mock_db.table.return_value.delete.return_value.eq.call_args_list
    assert len(eq_calls) > 0
    for call_args in eq_calls:
        # eq("user_id", "user-123") — or for profiles table eq("id", "user-123")
        col, val = call_args[0][0], call_args[0][1]
        assert val == "user-123"
        assert col in ("user_id", "id")
    _clear_overrides()


def test_delete_account_requires_auth():
    response = client.delete("/auth/account")
    assert response.status_code in (401, 403, 422)


# --- expires_in validation (M9) ---


def test_store_spotify_token_rejects_zero_expires_in():
    _override_current_user()
    response = client.post(
        "/auth/spotify-token",
        json={
            "access_token": "sp-access",
            "refresh_token": "sp-refresh",
            "expires_in": 0,
            "client_id": "my-client-id",
        },
    )
    assert response.status_code == 422
    _clear_overrides()


def test_store_spotify_token_rejects_negative_expires_in():
    _override_current_user()
    response = client.post(
        "/auth/spotify-token",
        json={
            "access_token": "sp-access",
            "refresh_token": "sp-refresh",
            "expires_in": -100,
            "client_id": "my-client-id",
        },
    )
    assert response.status_code == 422
    _clear_overrides()


def test_store_spotify_token_rejects_excessive_expires_in():
    _override_current_user()
    response = client.post(
        "/auth/spotify-token",
        json={
            "access_token": "sp-access",
            "refresh_token": "sp-refresh",
            "expires_in": 7201,
            "client_id": "my-client-id",
        },
    )
    assert response.status_code == 422
    _clear_overrides()


def test_store_spotify_token_accepts_valid_expires_in():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.post(
            "/auth/spotify-token",
            json={
                "access_token": "sp-access",
                "refresh_token": "sp-refresh",
                "expires_in": 3600,
                "client_id": "my-client-id",
            },
        )
    assert response.status_code == 200
    _clear_overrides()


def test_store_spotify_token_accepts_max_expires_in():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.post(
            "/auth/spotify-token",
            json={
                "access_token": "sp-access",
                "refresh_token": "sp-refresh",
                "expires_in": 7200,
                "client_id": "my-client-id",
            },
        )
    assert response.status_code == 200
    _clear_overrides()


# --- refresh-spotify-token tests (M2: server-side token refresh) ---


def test_refresh_spotify_token_returns_new_access_token():
    """POST /auth/refresh-spotify-token should refresh via backend and return new token."""
    _override_current_user()
    mock_db = MagicMock()
    # get_spotify_for_user internally refreshes if expired
    mock_spotify = MagicMock()
    # After refresh, reading back the token
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"access_token": "new-sp-access", "expires_at": "2026-05-01T12:00:00+00:00"}
    ]

    with (
        patch("routers.auth.get_service_db", return_value=mock_db),
        patch("routers.auth.get_spotify_for_user", return_value=mock_spotify),
    ):
        response = client.post("/auth/refresh-spotify-token")

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"] == "new-sp-access"
    assert data["expires_at"] == "2026-05-01T12:00:00+00:00"
    _clear_overrides()


def test_refresh_spotify_token_returns_401_when_no_credentials():
    """POST /auth/refresh-spotify-token should 401 if no tokens stored."""
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock_spotify = MagicMock()

    with (
        patch("routers.auth.get_service_db", return_value=mock_db),
        patch("routers.auth.get_spotify_for_user", return_value=mock_spotify),
    ):
        response = client.post("/auth/refresh-spotify-token")

    assert response.status_code == 401
    assert "No Spotify credentials" in response.json()["detail"]
    _clear_overrides()


def test_refresh_spotify_token_requires_auth():
    """POST /auth/refresh-spotify-token should require authentication."""
    response = client.post("/auth/refresh-spotify-token")
    assert response.status_code in (401, 403, 422)


def test_delete_account_rate_limited():
    _override_current_user()
    mock_db = MagicMock()
    mock_db.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
    mock_db.auth.admin.delete_user.return_value = MagicMock()

    # Reset the limiter state so this test is deterministic regardless of
    # earlier tests hitting /auth/account.
    from routers.auth import limiter as _auth_limiter

    _auth_limiter.reset()

    with patch("routers.auth.get_service_db", return_value=mock_db):
        responses = [client.delete("/auth/account") for _ in range(5)]

    statuses = [r.status_code for r in responses]
    # The limit is 3/hour; at least one of the later requests must be throttled.
    assert 429 in statuses, f"expected rate limit, got {statuses}"
    _auth_limiter.reset()
    _clear_overrides()
