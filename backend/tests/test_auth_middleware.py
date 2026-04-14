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
