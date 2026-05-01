"""Tests for Spotify OAuth callback proxy endpoints (preview-login & callback-proxy)."""

import base64
import hashlib
import hmac as hmac_mod
import json
import time
from unittest.mock import MagicMock, patch

import pytest
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
    sig = hmac_mod.new(
        secret.encode(), payload_json.encode(), hashlib.sha256
    ).hexdigest()
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
    """Tests for POST /auth/preview-login (M1: token moved from URL to POST body)."""

    @patch.dict("os.environ", _env_vars(), clear=False)
    @patch("routers.auth.limiter")
    def test_preview_login_returns_redirect_url(self, mock_limiter):
        """Valid POST body should return JSON with redirect_url to Spotify."""
        mock_limiter.reset.return_value = None

        with patch("routers.auth_proxy.verify_supabase_jwt", return_value=TEST_USER_ID):
            response = client.post(
                "/auth/preview-login",
                json={
                    "origin": VALID_ORIGIN,
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": TEST_SUPABASE_TOKEN,
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "redirect_url" in data
        redirect_url = data["redirect_url"]
        assert redirect_url.startswith("https://accounts.spotify.com/authorize")
        assert "response_type=code" in redirect_url
        assert "code_challenge_method=S256" in redirect_url
        assert f"client_id={TEST_CLIENT_ID}" in redirect_url
        assert "state=" in redirect_url

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_preview_login_rejects_invalid_origin(self):
        """Origin not matching the vercel preview pattern should return 400."""
        with patch("routers.auth_proxy.verify_supabase_jwt", return_value=TEST_USER_ID):
            response = client.post(
                "/auth/preview-login",
                json={
                    "origin": "https://evil.example.com",
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": TEST_SUPABASE_TOKEN,
                },
            )
        assert response.status_code == 400

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_preview_login_rejects_missing_params(self):
        """Missing required fields should return 422."""
        # Missing all fields
        response = client.post("/auth/preview-login", json={})
        assert response.status_code == 422

        # Missing client_id
        response = client.post(
            "/auth/preview-login",
            json={"origin": VALID_ORIGIN, "supabase_token": TEST_SUPABASE_TOKEN},
        )
        assert response.status_code == 422

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_preview_login_rejects_invalid_supabase_token(self):
        """Bad JWT should return 401."""
        with patch(
            "routers.auth_proxy.verify_supabase_jwt",
            side_effect=Exception("Invalid token"),
        ):
            response = client.post(
                "/auth/preview-login",
                json={
                    "origin": VALID_ORIGIN,
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": "bad-token",
                },
            )
        assert response.status_code == 401

    def test_preview_login_returns_501_when_not_configured(self):
        """Missing SPOTIFY_PROXY_SECRET env var should return 501."""
        with patch.dict(
            "os.environ",
            {"SPOTIFY_PROXY_SECRET": "", "SPOTIFY_PROXY_REDIRECT_URI": ""},
            clear=False,
        ):
            response = client.post(
                "/auth/preview-login",
                json={
                    "origin": VALID_ORIGIN,
                    "client_id": TEST_CLIENT_ID,
                    "supabase_token": TEST_SUPABASE_TOKEN,
                },
            )
        assert response.status_code == 501

    @patch.dict("os.environ", _env_vars(), clear=False)
    def test_preview_login_get_method_not_allowed(self):
        """GET should no longer be accepted (moved to POST)."""
        response = client.get(
            "/auth/preview-login",
            params={
                "origin": VALID_ORIGIN,
                "client_id": TEST_CLIENT_ID,
                "supabase_token": TEST_SUPABASE_TOKEN,
            },
        )
        assert response.status_code == 405


# ---------------------------------------------------------------------------
# Endpoint 2: GET /auth/callback-proxy
# ---------------------------------------------------------------------------


class TestVerifySupabaseJwt:
    """Tests for verify_supabase_jwt security hardening."""

    def test_invalid_token_does_not_leak_exception_detail(self):
        """M4: verify_supabase_jwt must not leak exception details."""
        from unittest.mock import MagicMock

        import jwt as pyjwt

        mock_client = MagicMock()
        mock_client.get_signing_key_from_jwt.side_effect = pyjwt.InvalidTokenError(
            "secret internal detail"
        )
        with patch("auth_middleware._get_jwks_client", return_value=mock_client):
            from routers.auth_proxy import verify_supabase_jwt

            with pytest.raises(Exception) as exc_info:
                verify_supabase_jwt("bad-token")
        assert exc_info.value.status_code == 401
        assert "secret internal detail" not in exc_info.value.detail
        assert exc_info.value.detail == "Invalid token"

    def test_rejects_hs256_algorithm(self):
        """M10: verify_supabase_jwt should only accept ES256."""
        import time as time_mod

        import jwt as pyjwt

        mock_client = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "some-secret"
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        hs256_token = pyjwt.encode(
            {
                "sub": "user-123",
                "exp": int(time_mod.time()) + 3600,
                "aud": "authenticated",
            },
            "some-secret",
            algorithm="HS256",
        )

        with patch("auth_middleware._get_jwks_client", return_value=mock_client):
            from routers.auth_proxy import verify_supabase_jwt

            with pytest.raises(Exception) as exc_info:
                verify_supabase_jwt(hs256_token)
        assert exc_info.value.status_code == 401


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
        mock_db.table.return_value.upsert.return_value.execute.return_value = (
            MagicMock()
        )

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
    def test_callback_proxy_returns_502_on_spotify_token_exchange_failure(self):
        """M6: Spotify token exchange HTTP error should return 502, not crash."""
        state_payload = _valid_state_payload()
        state = _build_signed_state(state_payload)

        mock_token_response = MagicMock()
        mock_token_response.status_code = 400
        mock_token_response.raise_for_status.side_effect = __import__(
            "requests"
        ).HTTPError("400 Client Error")

        with patch(
            "routers.auth_proxy.requests.post", return_value=mock_token_response
        ):
            response = client.get(
                "/auth/callback-proxy",
                params={"code": "auth-code-123", "state": state},
            )

        assert response.status_code == 502
        assert response.json()["detail"] == "Spotify token exchange failed"

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
