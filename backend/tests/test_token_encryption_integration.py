"""Integration tests: refresh tokens are encrypted on write and decrypted on read."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet


def _generate_key() -> str:
    return Fernet.generate_key().decode()


# ---------------------------------------------------------------------------
# spotify_client.py — decrypt on read, encrypt on refresh write
# ---------------------------------------------------------------------------


class TestSpotifyClientDecryptsOnRead:
    def test_decrypt_called_on_refresh_token_read(self):
        """get_spotify_for_user decrypts refresh_token from DB before use."""
        from spotify_client import get_spotify_for_user

        key = _generate_key()
        cipher = Fernet(key.encode())
        encrypted_refresh = cipher.encrypt(b"real-refresh-token").decode()

        expires_at = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
        token_row = {
            "user_id": "user-123",
            "client_id": "cid",
            "access_token": "old-access",
            "refresh_token": encrypted_refresh,
            "expires_at": expires_at,
        }
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            token_row
        ]

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "access_token": "new-access",
            "expires_in": 3600,
        }
        mock_response.raise_for_status = MagicMock()

        with (
            patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key}),
            patch(
                "spotify_client.requests.post", return_value=mock_response
            ) as mock_post,
        ):
            get_spotify_for_user("user-123", mock_db)

        # The refresh call should use the decrypted token
        call_data = (
            mock_post.call_args[1].get("data") or mock_post.call_args[0][1]
            if len(mock_post.call_args[0]) > 1
            else mock_post.call_args[1]["data"]
        )
        assert call_data["refresh_token"] == "real-refresh-token"


class TestSpotifyClientEncryptsOnRefreshWrite:
    def test_new_refresh_token_encrypted_before_db_write(self):
        """When Spotify returns a new refresh_token on refresh, it's encrypted."""
        from spotify_client import get_spotify_for_user

        key = _generate_key()
        cipher = Fernet(key.encode())
        encrypted_refresh = cipher.encrypt(b"old-refresh").decode()

        expires_at = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
        token_row = {
            "user_id": "user-123",
            "client_id": "cid",
            "access_token": "old-access",
            "refresh_token": encrypted_refresh,
            "expires_at": expires_at,
        }
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            token_row
        ]

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "access_token": "new-access",
            "refresh_token": "new-refresh-from-spotify",
            "expires_in": 3600,
        }
        mock_response.raise_for_status = MagicMock()

        with (
            patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key}),
            patch("spotify_client.requests.post", return_value=mock_response),
        ):
            get_spotify_for_user("user-123", mock_db)

        # Check that the DB update encrypted the new refresh token
        update_call = mock_db.table.return_value.update.call_args[0][0]
        stored_refresh = update_call["refresh_token"]
        assert stored_refresh != "new-refresh-from-spotify"
        # Verify it's validly encrypted
        decrypted = cipher.decrypt(stored_refresh.encode()).decode()
        assert decrypted == "new-refresh-from-spotify"


# ---------------------------------------------------------------------------
# routers/auth.py — encrypt on initial store
# ---------------------------------------------------------------------------


class TestAuthRouterEncryptsOnStore:
    def test_store_spotify_token_encrypts_refresh_token(self):
        from fastapi.testclient import TestClient

        from auth_middleware import get_current_user
        from main import app

        key = _generate_key()
        cipher = Fernet(key.encode())

        async def mock_user():
            return {"user_id": "user-123", "token": "fake-jwt"}

        app.dependency_overrides[get_current_user] = mock_user
        mock_db = MagicMock()
        mock_db.table.return_value.upsert.return_value.execute.return_value = (
            MagicMock()
        )

        client = TestClient(app, follow_redirects=False)
        with (
            patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key}),
            patch("routers.auth.get_service_db", return_value=mock_db),
        ):
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
        upsert_data = mock_db.table.return_value.upsert.call_args[0][0]
        stored_refresh = upsert_data["refresh_token"]
        assert stored_refresh != "sp-refresh"
        assert cipher.decrypt(stored_refresh.encode()).decode() == "sp-refresh"
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# routers/auth_proxy.py — encrypt on callback-proxy store
# ---------------------------------------------------------------------------


class TestAuthProxyEncryptsOnStore:
    def test_callback_proxy_encrypts_refresh_token(self):
        key = _generate_key()
        cipher = Fernet(key.encode())

        mock_db = MagicMock()
        mock_db.table.return_value.upsert.return_value.execute.return_value = (
            MagicMock()
        )

        # Build a valid signed state
        import time

        from routers.auth_proxy import _sign_state

        secret = "test-proxy-secret"
        state_payload = {
            "origin": "https://test-preview-toofanians-projects.vercel.app",
            "user_id": "user-456",
            "client_id": "proxy-cid",
            "verifier": "test-verifier",
            "ts": int(time.time()),
        }
        state = _sign_state(state_payload, secret)

        mock_token_response = MagicMock()
        mock_token_response.json.return_value = {
            "access_token": "proxy-access",
            "refresh_token": "proxy-refresh",
            "expires_in": 3600,
        }
        mock_token_response.raise_for_status = MagicMock()

        from fastapi.testclient import TestClient

        from main import app

        client = TestClient(app, follow_redirects=False)

        with (
            patch.dict(
                "os.environ",
                {
                    "TOKEN_ENCRYPTION_KEY": key,
                    "SPOTIFY_PROXY_SECRET": secret,
                    "SPOTIFY_PROXY_REDIRECT_URI": "https://example.com/callback",
                },
            ),
            patch("routers.auth_proxy.requests.post", return_value=mock_token_response),
            patch("routers.auth_proxy.get_service_db", return_value=mock_db),
        ):
            from routers.auth_proxy import limiter as _proxy_limiter

            _proxy_limiter.reset()
            response = client.get(
                "/auth/callback-proxy",
                params={"code": "auth-code", "state": state},
            )

        assert response.status_code == 302
        upsert_data = mock_db.table.return_value.upsert.call_args[0][0]
        stored_refresh = upsert_data["refresh_token"]
        assert stored_refresh != "proxy-refresh"
        assert cipher.decrypt(stored_refresh.encode()).decode() == "proxy-refresh"
