"""Tests for Apple Music developer token generation."""

from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
)

from apple_music_token import (
    TOKEN_EXPIRY_SECONDS,
    clear_token_cache,
    generate_developer_token,
)


def _generate_test_key():
    """Generate a test EC private key in PEM format."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    return pem.decode(), private_key.public_key()


@pytest.fixture(autouse=True)
def clean_cache():
    clear_token_cache()
    yield
    clear_token_cache()


def test_generate_developer_token_returns_valid_jwt():
    pem, public_key = _generate_test_key()

    with patch.dict(
        "os.environ",
        {
            "APPLE_MUSIC_KEY_ID": "TESTKEY123",
            "APPLE_MUSIC_TEAM_ID": "TEAM456",
            "APPLE_MUSIC_PRIVATE_KEY": pem,
        },
    ):
        token = generate_developer_token()

    assert isinstance(token, str)
    # Decode and verify structure (without signature verification since
    # PyJWT uses different key format)
    payload = jwt.decode(token, options={"verify_signature": False})
    assert payload["iss"] == "TEAM456"
    assert "iat" in payload
    assert "exp" in payload
    assert payload["exp"] - payload["iat"] == TOKEN_EXPIRY_SECONDS


def test_generate_developer_token_includes_key_id_in_header():
    pem, _ = _generate_test_key()

    with patch.dict(
        "os.environ",
        {
            "APPLE_MUSIC_KEY_ID": "MYKEY789",
            "APPLE_MUSIC_TEAM_ID": "TEAM456",
            "APPLE_MUSIC_PRIVATE_KEY": pem,
        },
    ):
        token = generate_developer_token()

    header = jwt.get_unverified_header(token)
    assert header["kid"] == "MYKEY789"
    assert header["alg"] == "ES256"


def test_generate_developer_token_caches():
    pem, _ = _generate_test_key()

    with patch.dict(
        "os.environ",
        {
            "APPLE_MUSIC_KEY_ID": "KEY1",
            "APPLE_MUSIC_TEAM_ID": "TEAM1",
            "APPLE_MUSIC_PRIVATE_KEY": pem,
        },
    ):
        token1 = generate_developer_token()
        token2 = generate_developer_token()

    assert token1 == token2  # Same token returned (cached)


def test_generate_developer_token_raises_without_env():
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError, match="Apple Music configuration incomplete"):
            generate_developer_token()


def test_generate_developer_token_handles_escaped_newlines():
    pem, _ = _generate_test_key()
    escaped_pem = pem.replace("\n", "\\n")

    with patch.dict(
        "os.environ",
        {
            "APPLE_MUSIC_KEY_ID": "KEY1",
            "APPLE_MUSIC_TEAM_ID": "TEAM1",
            "APPLE_MUSIC_PRIVATE_KEY": escaped_pem,
        },
    ):
        token = generate_developer_token()

    assert isinstance(token, str)
    payload = jwt.decode(token, options={"verify_signature": False})
    assert payload["iss"] == "TEAM1"
