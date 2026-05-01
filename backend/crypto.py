"""Encrypt/decrypt Spotify refresh tokens at rest using Fernet symmetric encryption."""

import os

from cryptography.fernet import Fernet


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
    """Decrypt a token string. Falls back to returning input on any error."""
    cipher = get_cipher()
    if not cipher:
        return token
    try:
        return cipher.decrypt(token.encode()).decode()
    except Exception:
        return token  # Graceful fallback for unencrypted tokens during migration
