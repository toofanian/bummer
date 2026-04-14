"""Apple Music developer token generation.

Apple Music requires a developer token (JWT) signed with a MusicKit private key.
This token is sent to the frontend, which uses it to initialize MusicKit JS
and authorize the user.

Required environment variables:
- APPLE_MUSIC_KEY_ID: The 10-character key identifier from Apple Developer portal
- APPLE_MUSIC_TEAM_ID: The Apple Developer Team ID
- APPLE_MUSIC_PRIVATE_KEY: The MusicKit private key (PEM format, ES256)

The developer token is valid for up to 6 months. We generate tokens with
a 30-day expiry and cache them in memory.
"""

import os
import time

import jwt

_cached_token: dict | None = None  # {"token": str, "expires_at": float}

TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60  # 30 days
REFRESH_BUFFER_SECONDS = 24 * 60 * 60  # Refresh 1 day before expiry


def generate_developer_token() -> str:
    """Generate (or return cached) Apple Music developer token.

    Returns a JWT signed with the MusicKit private key.
    """
    global _cached_token

    now = time.time()
    if _cached_token and now < _cached_token["expires_at"] - REFRESH_BUFFER_SECONDS:
        return _cached_token["token"]

    key_id = os.getenv("APPLE_MUSIC_KEY_ID")
    team_id = os.getenv("APPLE_MUSIC_TEAM_ID")
    private_key = os.getenv("APPLE_MUSIC_PRIVATE_KEY")

    if not all([key_id, team_id, private_key]):
        raise RuntimeError(
            "Apple Music configuration incomplete. "
            "Set APPLE_MUSIC_KEY_ID, APPLE_MUSIC_TEAM_ID, and APPLE_MUSIC_PRIVATE_KEY."
        )

    # Handle private key that might be stored with escaped newlines
    if "\\n" in private_key:
        private_key = private_key.replace("\\n", "\n")

    expires_at = now + TOKEN_EXPIRY_SECONDS

    token = jwt.encode(
        {
            "iss": team_id,
            "iat": int(now),
            "exp": int(expires_at),
        },
        private_key,
        algorithm="ES256",
        headers={
            "alg": "ES256",
            "kid": key_id,
        },
    )

    _cached_token = {"token": token, "expires_at": expires_at}
    return token


def clear_token_cache():
    """Clear the cached developer token. Useful for testing."""
    global _cached_token
    _cached_token = None
