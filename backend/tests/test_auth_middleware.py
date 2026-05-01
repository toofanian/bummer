import time
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import ec

# Generate a test EC key pair
_private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
_public_key = _private_key.public_key()


def make_token(user_id="user-123", exp_offset=3600, audience="authenticated"):
    payload = {
        "sub": user_id,
        "exp": int(time.time()) + exp_offset,
        "aud": audience,
    }
    return pyjwt.encode(payload, _private_key, algorithm="ES256")


def _mock_jwks_client():
    """Create a mock PyJWKClient that returns our test public key."""
    mock_client = MagicMock()
    mock_signing_key = MagicMock()
    mock_signing_key.key = _public_key
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
    return mock_client


def test_get_current_user_valid_token():
    import asyncio

    token = make_token()
    with patch("auth_middleware._get_jwks_client", return_value=_mock_jwks_client()):
        from auth_middleware import get_current_user

        result = asyncio.run(get_current_user(authorization=f"Bearer {token}"))
    assert result["user_id"] == "user-123"
    assert result["token"] == token


def test_get_current_user_expired_token():
    import asyncio

    from fastapi import HTTPException

    token = make_token(exp_offset=-1)
    with patch("auth_middleware._get_jwks_client", return_value=_mock_jwks_client()):
        from auth_middleware import get_current_user

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(get_current_user(authorization=f"Bearer {token}"))
    assert exc_info.value.status_code == 401


def test_get_current_user_missing_bearer():
    import asyncio

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        from auth_middleware import get_current_user

        asyncio.run(get_current_user(authorization="not-a-bearer-token"))
    assert exc_info.value.status_code == 401


def test_get_current_user_invalid_token():
    import asyncio

    from fastapi import HTTPException

    mock_client = _mock_jwks_client()
    mock_client.get_signing_key_from_jwt.side_effect = pyjwt.InvalidTokenError("bad")
    with patch("auth_middleware._get_jwks_client", return_value=mock_client):
        from auth_middleware import get_current_user

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(get_current_user(authorization="Bearer garbage"))
    assert exc_info.value.status_code == 401


def test_get_current_user_invalid_token_does_not_leak_exception_detail():
    """M4: Invalid token response must not include exception message."""
    import asyncio

    from fastapi import HTTPException

    mock_client = _mock_jwks_client()
    mock_client.get_signing_key_from_jwt.side_effect = pyjwt.InvalidTokenError(
        "secret internal detail"
    )
    with patch("auth_middleware._get_jwks_client", return_value=mock_client):
        from auth_middleware import get_current_user

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(get_current_user(authorization="Bearer garbage"))
    assert exc_info.value.status_code == 401
    assert "secret internal detail" not in exc_info.value.detail
    assert exc_info.value.detail == "Invalid token"


def test_get_current_user_rejects_hs256_algorithm():
    """M10: Only ES256 should be accepted, not HS256."""
    import asyncio

    from fastapi import HTTPException

    # Create an HS256 token — should be rejected even if key matches
    hs256_token = pyjwt.encode(
        {"sub": "user-123", "exp": int(time.time()) + 3600, "aud": "authenticated"},
        "some-secret",
        algorithm="HS256",
    )
    mock_client = _mock_jwks_client()
    # The JWKS client won't find a key for HS256 tokens, but let's
    # make sure ES256 is the only accepted algorithm by checking that
    # even if we somehow get past key lookup, HS256 is not in the list.
    # We mock get_signing_key_from_jwt to return a key, then the decode
    # should fail because HS256 is not in the algorithms list.
    with patch("auth_middleware._get_jwks_client", return_value=mock_client):
        from auth_middleware import get_current_user

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(get_current_user(authorization=f"Bearer {hs256_token}"))
    assert exc_info.value.status_code == 401


def test_preview_sign_in_failure_does_not_leak_exception_detail(monkeypatch):
    """M5: GoTrue exception details must not appear in 500 response."""
    import asyncio

    import auth_middleware

    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("PREVIEW_USER_PASSWORD", "test-password")
    monkeypatch.setenv("SUPABASE_URL", "https://preview-test.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "preview-anon-key")
    monkeypatch.setattr(auth_middleware, "_preview_session", None)

    class _FailClient:
        class auth:
            @staticmethod
            def sign_in_with_password(credentials):
                raise Exception("secret GoTrue error: connection refused to 10.0.0.1")

    monkeypatch.setattr(
        auth_middleware, "create_client", lambda *a, **kw: _FailClient()
    )

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(auth_middleware.get_current_user(authorization="Bearer anything"))
    assert exc_info.value.status_code == 500
    assert "secret GoTrue error" not in exc_info.value.detail
    assert exc_info.value.detail == "Preview mode authentication failed"


def test_get_current_user_preview_mode_signs_in_as_preview_user(monkeypatch):
    """In VERCEL_ENV=preview, get_current_user signs in as the
    hardcoded preview user via Supabase's password grant and returns
    the real session access_token. The cached session is used on
    subsequent calls."""
    import asyncio

    import auth_middleware

    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("PREVIEW_USER_PASSWORD", "test-password")
    monkeypatch.setenv("SUPABASE_URL", "https://preview-test.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "preview-anon-key")
    # Clear the module-level session cache between tests.
    monkeypatch.setattr(auth_middleware, "_preview_session", None)

    # Stub create_client to return a fake client whose
    # auth.sign_in_with_password yields a predictable session.
    class _FakeSession:
        access_token = "real-jwt-from-supabase"
        refresh_token = "real-refresh"
        expires_at = int(time.time()) + 3600

    class _FakeResponse:
        session = _FakeSession()

    class _FakeAuth:
        def sign_in_with_password(self, credentials):
            assert credentials["email"] == auth_middleware.PREVIEW_USER_EMAIL
            assert credentials["password"] == "test-password"
            return _FakeResponse()

    class _FakeClient:
        auth = _FakeAuth()

    monkeypatch.setattr(
        auth_middleware, "create_client", lambda *a, **kw: _FakeClient()
    )

    result = asyncio.run(
        auth_middleware.get_current_user(authorization="Bearer anything")
    )
    assert result["user_id"] == auth_middleware.PREVIEW_USER_ID
    assert result["token"] == "real-jwt-from-supabase"


def test_get_current_user_production_ignores_preview_bypass(monkeypatch):
    """When VERCEL_ENV is not 'preview', the preview short-circuit is
    inactive and the normal JWT validation path runs."""
    import asyncio

    from fastapi import HTTPException

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    from auth_middleware import get_current_user

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_current_user(authorization="Bearer invalid"))
    # Either 500 (missing SUPABASE_URL for JWKS) or 401 (invalid token)
    # — either way, we did NOT short-circuit.
    assert exc_info.value.status_code in (401, 500)
