"""Encrypt/decrypt Spotify refresh tokens at rest using Fernet symmetric encryption."""

import os

from cryptography.fernet import Fernet, InvalidToken

# Every Fernet token starts with version byte 0x80 followed by the high bytes
# of a 64-bit timestamp, which base64-encodes to this prefix.
_FERNET_PREFIX = "gAAAAA"


class TokenDecryptError(Exception):
    """A stored token is encrypted but cannot be decrypted with the current key."""


def get_cipher() -> Fernet | None:
    """Return a Fernet cipher from TOKEN_ENCRYPTION_KEY, or None if not set."""
    key = os.getenv("TOKEN_ENCRYPTION_KEY")
    if not key:
        return None
    return Fernet(key.encode())


def encrypt_token(token: str) -> str:
    """Encrypt a token string. Returns plaintext if no key is configured."""
    cipher = get_cipher()
    if not cipher:
        return token
    return cipher.encrypt(token.encode()).decode()


def decrypt_token(token: str) -> str:
    """Decrypt a stored token.

    Legacy rows written before encryption-at-rest hold the raw Spotify token
    (prefix ``AQ``); anything that is not Fernet ciphertext is returned as-is.
    Fernet ciphertext that cannot be decrypted raises TokenDecryptError — it is
    never returned to the caller.
    """
    if not token or not token.startswith(_FERNET_PREFIX):
        return token
    try:
        cipher = get_cipher()
    except ValueError as exc:
        raise TokenDecryptError(
            "TOKEN_ENCRYPTION_KEY is not a valid Fernet key"
        ) from exc
    if not cipher:
        raise TokenDecryptError(
            "Stored token is encrypted but TOKEN_ENCRYPTION_KEY is not set"
        )
    try:
        return cipher.decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise TokenDecryptError(
            "Stored token cannot be decrypted with the current TOKEN_ENCRYPTION_KEY"
        ) from exc
