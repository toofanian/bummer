"""Tests for Spotify OAuth callback proxy endpoints (preview-login & callback-proxy)."""

import base64
import hashlib
import hmac as hmac_mod
import json
import time
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app, follow_redirects=False)

PROXY_SECRET = "a" * 64  # 32-byte hex string for test HMAC
PROXY_REDIRECT_URI = "https://thedeathofshuffle.com/api/auth/callback-proxy"
VALID_ORIGIN = "https://bummer-abc123-toofanians-projects.vercel.app"
TEST_CLIENT_ID = "test-spotify-client-id"
TEST_USER_ID = "test-user-uuid-1234"
TEST_SUPABASE_TOKEN = "fake-supabase-jwt"


def _env_vars(**overrides):
    """Return a dict of env vars for patching, with sensible defaults."""
    env = {
        "SPOTIFY_PROXY_SECRET": PROXY_SECRET,
        "SPOTIFY_PROXY_REDIRECT_URI": PROXY_REDIRECT_URI,
    }
    env.update(overrides)
    return env


def _mock_jwt_verify(monkeypatch=None):
    """Patch JWT verification to accept any token and return TEST_USER_ID."""
    # We patch at the module level where the function is used
    pass  # Handled per-test via patch decorators


def _build_signed_state(payload_dict, secret=PROXY_SECRET):
    """Build a signed state string the same way the endpoint does."""
    payload_json = json.dumps(payload_dict, separators=(",", ":"), sort_keys=True)
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).rstrip(b"=").decode()
    sig = hmac_mod.new(secret.encode(), payload_json.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def _valid_state_payload(**overrides):
    """Return a valid state payload dict."""
    payload = {
        "origin": VALID_ORIGIN,
        "user_id": TEST_USER_ID,
        "client_id": TEST_CLIENT_ID,
        "verifier": "dGVzdHZlcmlmaWVy",  # base64url of "testverifier"
        "ts": int(time.time()),
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Endpoint 1: GET /auth/preview-login
# ---------------------------------------------------------------------------


class TestPreviewLogin:
    """Tests for GET /auth/preview-login."""

    @patch.dict("os.environ", _env_vars(), clear=False)
    @patch("routers.auth.limiter")
    def test_preview_login_redirects_to_spotify(self, mock_limiter):
        """Valid params should produce a 302 redirect to accounts.spotify.com/authorize."""
        mock_limiter.reset.return_value = None

        # Mock JWT verification to accept our test token
        with patch("routers.auth_proxy.verify_supabase_jwt", return_value=TEST_USER_ID):
            response = client.get(
                "/auth/preview-login",
                params={
                    "origin": VALID_ORIGIN,
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": TEST_SUPABASE_TOKEN,
                },
            )

        assert response.status_code == 302
        location = response.headers["location"]
        assert location.startswith("https://accounts.spotify.com/authorize")
        assert "response_type=code" in location
        assert "code_challenge_method=S256" in location
        assert f"client_id={TEST_CLIENT_ID}" in location
        assert "state=" in location

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_preview_login_rejects_invalid_origin(self):
        """Origin not matching the vercel preview pattern should return 400."""
        with patch("routers.auth_proxy.verify_supabase_jwt", return_value=TEST_USER_ID):
            response = client.get(
                "/auth/preview-login",
                params={
                    "origin": "https://evil.example.com",
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": TEST_SUPABASE_TOKEN,
                },
            )
        assert response.status_code == 400

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_preview_login_rejects_missing_params(self):
        """Missing required query params should return 422."""
        # Missing all params
        response = client.get("/auth/preview-login")
        assert response.status_code == 422

        # Missing client_id
        response = client.get(
            "/auth/preview-login",
            params={"origin": VALID_ORIGIN, "supabase_token": TEST_SUPABASE_TOKEN},
        )
        assert response.status_code == 422

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_preview_login_rejects_invalid_supabase_token(self):
        """Bad JWT should return 401."""
        with patch(
            "routers.auth_proxy.verify_supabase_jwt",
            side_effect=Exception("Invalid token"),
        ):
            response = client.get(
                "/auth/preview-login",
                params={
                    "origin": VALID_ORIGIN,
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": "bad-token",
                },
            )
        assert response.status_code == 401

    def test_preview_login_returns_501_when_not_configured(self):
        """Missing SPOTIFY_PROXY_SECRET env var should return 501."""
        # Ensure env vars are NOT set
        with patch.dict(
            "os.environ",
            {"SPOTIFY_PROXY_SECRET": "", "SPOTIFY_PROXY_REDIRECT_URI": ""},
            clear=False,
        ):
            response = client.get(
                "/auth/preview-login",
                params={
                    "origin": VALID_ORIGIN,
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": TEST_SUPABASE_TOKEN,
                },
            )
        assert response.status_code == 501


# ---------------------------------------------------------------------------
# Endpoint 2: GET /auth/callback-proxy
# ---------------------------------------------------------------------------


class TestCallbackProxy:
    """Tests for GET /auth/callback-proxy."""

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_callback_proxy_exchanges_code_and_redirects(self):
        """Valid state + code should exchange tokens, store them, and redirect."""
        state_payload = _valid_state_payload()
        state = _build_signed_state(state_payload)

        mock_token_response = MagicMock()
        mock_token_response.status_code = 200
        mock_token_response.json.return_value = {
            "access_token": "sp-access-token",
            "refresh_token": "sp-refresh-token",
            "expires_in": 3600,
        }
        mock_token_response.raise_for_status = MagicMock()

        mock_db = MagicMock()
        mock_db.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        with (
            patch("routers.auth_proxy.requests.post", return_value=mock_token_response),
            patch("routers.auth_proxy.get_service_db", return_value=mock_db),
        ):
            response = client.get(
                "/auth/callback-proxy",
                params={"code": "auth-code-123", "state": state},
            )

        assert response.status_code == 302
        location = response.headers["location"]
        assert location.startswith(VALID_ORIGIN)
        assert "proxy_success=true" in location

        # Verify token was stored
        mock_db.table.assert_called_with("music_tokens")
        upsert_arg = mock_db.table.return_value.upsert.call_args[0][0]
        assert upsert_arg["user_id"] == TEST_USER_ID
        assert upsert_arg["access_token"] == "sp-access-token"
        assert upsert_arg["refresh_token"] == "sp-refresh-token"
        assert upsert_arg["client_id"] == TEST_CLIENT_ID

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_callback_proxy_rejects_tampered_state(self):
        """Modified HMAC should return 400."""
        state_payload = _valid_state_payload()
        state = _build_signed_state(state_payload)
        # Tamper with the signature
        parts = state.split(".")
        tampered_state = parts[0] + "." + "0" * 64

        response = client.get(
            "/auth/callback-proxy",
            params={"code": "auth-code-123", "state": tampered_state},
        )
        assert response.status_code == 400

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_callback_proxy_rejects_stale_state(self):
        """Timestamp older than 10 minutes should return 400."""
        state_payload = _valid_state_payload(ts=int(time.time()) - 700)  # 11+ min ago
        state = _build_signed_state(state_payload)

        response = client.get(
            "/auth/callback-proxy",
            params={"code": "auth-code-123", "state": state},
        )
        assert response.status_code == 400

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_callback_proxy_rejects_invalid_origin_in_state(self):
        """Origin in state not matching pattern should return 400."""
        state_payload = _valid_state_payload(origin="https://evil.example.com")
        state = _build_signed_state(state_payload)

        response = client.get(
            "/auth/callback-proxy",
            params={"code": "auth-code-123", "state": state},
        )
        assert response.status_code == 400

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_callback_proxy_handles_spotify_error(self):
        """When Spotify redirects with error param, redirect to origin with error."""
        state_payload = _valid_state_payload()
        state = _build_signed_state(state_payload)

        response = client.get(
            "/auth/callback-proxy",
            params={"error": "access_denied", "state": state},
        )
        assert response.status_code == 302
        location = response.headers["location"]
        assert VALID_ORIGIN in location
        assert "spotify_error=access_denied" in location
