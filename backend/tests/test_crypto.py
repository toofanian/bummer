"""Tests for token encryption/decryption helpers."""

from unittest.mock import patch

from cryptography.fernet import Fernet


def _generate_key() -> str:
    return Fernet.generate_key().decode()


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

    def test_decrypt_without_key_returns_input(self):
        from crypto import decrypt_token

        with patch.dict("os.environ", {}, clear=True):
            result = decrypt_token("some-ciphertext")
        assert result == "some-ciphertext"

    def test_decrypt_unencrypted_token_returns_input(self):
        """Graceful fallback for plaintext tokens during migration."""
        from crypto import decrypt_token

        key = _generate_key()
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key}):
            result = decrypt_token("plaintext-refresh-token")
        assert result == "plaintext-refresh-token"

    def test_decrypt_with_wrong_key_returns_input(self):
        """Wrong key should fall back gracefully, not crash."""
        from crypto import decrypt_token, encrypt_token

        key1 = _generate_key()
        key2 = _generate_key()
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key1}):
            encrypted = encrypt_token("my-secret-token")
        with patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": key2}):
            result = decrypt_token(encrypted)
        assert result == encrypted  # Falls back to returning ciphertext
