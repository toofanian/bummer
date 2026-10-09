"""Tests for token encryption/decryption helpers."""

from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet


def _generate_key() -> str:
    return Fernet.generate_key().decode()


def _encrypted_with_fresh_key(plaintext: str = "my-secret-token") -> str:
    from crypto import encrypt_token

    with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": _generate_key()}):
        return encrypt_token(plaintext)


class TestEncryptToken:
    def test_encrypt_returns_different_string(self):
        from crypto import encrypt_token

        key = _generate_key()
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key}):
            result = encrypt_token("my-secret-token")
        assert result != "my-secret-token"

    def test_encrypt_without_key_returns_plaintext(self):
        from crypto import encrypt_token

        with patch.dict("os.environ", {}, clear=True):
            result = encrypt_token("my-secret-token")
        assert result == "my-secret-token"

    def test_encrypt_with_empty_key_returns_plaintext(self):
        from crypto import encrypt_token

        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": ""}):
            result = encrypt_token("my-secret-token")
        assert result == "my-secret-token"


class TestDecryptToken:
    def test_decrypt_reverses_encrypt(self):
        from crypto import decrypt_token, encrypt_token

        key = _generate_key()
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key}):
            encrypted = encrypt_token("my-secret-token")
            decrypted = decrypt_token(encrypted)
        assert decrypted == "my-secret-token"

    def test_decrypt_ciphertext_without_key_raises(self):
        """Missing key must never hand ciphertext back to the caller (#156)."""
        from crypto import TokenDecryptError, decrypt_token

        encrypted = _encrypted_with_fresh_key()
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(TokenDecryptError):
                decrypt_token(encrypted)

    def test_decrypt_ciphertext_with_empty_key_raises(self):
        from crypto import TokenDecryptError, decrypt_token

        encrypted = _encrypted_with_fresh_key()
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": ""}):
            with pytest.raises(TokenDecryptError):
                decrypt_token(encrypted)

    def test_decrypt_with_wrong_key_raises(self):
        from crypto import TokenDecryptError, decrypt_token

        encrypted = _encrypted_with_fresh_key()
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": _generate_key()}):
            with pytest.raises(TokenDecryptError):
                decrypt_token(encrypted)

    def test_decrypt_with_malformed_key_raises(self):
        from crypto import TokenDecryptError, decrypt_token

        encrypted = _encrypted_with_fresh_key()
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": "not-a-fernet-key"}):
            with pytest.raises(TokenDecryptError):
                decrypt_token(encrypted)

    def test_decrypt_error_does_not_leak_token(self):
        from crypto import TokenDecryptError, decrypt_token

        encrypted = _encrypted_with_fresh_key()
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(TokenDecryptError) as exc_info:
                decrypt_token(encrypted)
        assert encrypted not in str(exc_info.value)

    def test_decrypt_legacy_plaintext_token_returns_input(self):
        """Rows written before encryption-at-rest hold raw Spotify tokens (AQ...)."""
        from crypto import decrypt_token

        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": _generate_key()}):
            result = decrypt_token("AQDlegacyPlaintextRefreshToken")
        assert result == "AQDlegacyPlaintextRefreshToken"

    def test_decrypt_legacy_plaintext_token_without_key_returns_input(self):
        from crypto import decrypt_token

        with patch.dict("os.environ", {}, clear=True):
            result = decrypt_token("AQDlegacyPlaintextRefreshToken")
        assert result == "AQDlegacyPlaintextRefreshToken"
