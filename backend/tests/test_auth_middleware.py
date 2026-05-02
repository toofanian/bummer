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


def test_no_preview_bypass_exists():
    """Verify that the preview auth bypass has been removed.

    auth_middleware must not contain any preview-mode constants or
    functions that could short-circuit JWT validation.
    """
    import auth_middleware

    assert not hasattr(auth_middleware, "PREVIEW_USER_ID")
    assert not hasattr(auth_middleware, "PREVIEW_USER_EMAIL")
    assert not hasattr(auth_middleware, "_is_preview_env")
    assert not hasattr(auth_middleware, "_get_preview_session")
    assert not hasattr(auth_middleware, "_preview_session")


def test_get_current_user_validates_jwt_even_in_preview_env(monkeypatch):
    """Even with VERCEL_ENV=preview, get_current_user must validate JWTs
    through the normal JWKS path (no bypass)."""
    import asyncio

    from fastapi import HTTPException

    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("SUPABASE_URL", "https://preview-test.supabase.co")

    from auth_middleware import get_current_user

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_current_user(authorization="Bearer invalid-token"))
    assert exc_info.value.status_code == 401
