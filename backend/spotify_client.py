import logging
import threading
from datetime import datetime, timedelta, timezone

import requests
import spotipy
from fastapi import Depends, HTTPException
from supabase import Client

from auth_middleware import get_current_user
from crypto import TokenDecryptError, decrypt_token, encrypt_token
from db import get_service_db

logger = logging.getLogger(__name__)

SCOPES = [
    "user-library-read",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
]

_TOKEN_COLUMNS = "access_token, refresh_token, client_id, expires_at"

# Per-user lock for token refresh to prevent concurrent refresh races
_refresh_locks: dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()


class SpotifyReauthRequired(HTTPException):
    """The user has no usable Spotify credentials and must reconnect.

    Returned by the API as 401 with ``code: spotify_reauth_required`` (see the
    handler in main.py) so the frontend can route into the connect flow.
    """

    code = "spotify_reauth_required"

    def __init__(self, detail: str = "Spotify authorization expired. Reconnect."):
        super().__init__(status_code=401, detail=detail)


def _get_refresh_lock(user_id: str) -> threading.Lock:
    with _locks_lock:
        if user_id not in _refresh_locks:
            _refresh_locks[user_id] = threading.Lock()
        return _refresh_locks[user_id]


def _decrypt_refresh_token(user_id: str, stored: str) -> str:
    try:
        return decrypt_token(stored)
    except TokenDecryptError:
        logger.error(
            "Cannot decrypt music_tokens.refresh_token for user %s; "
            "check TOKEN_ENCRYPTION_KEY",
            user_id,
        )
        raise


def get_spotify_for_user(user_id: str, db: Client) -> spotipy.Spotify:
    result = (
        db.table("music_tokens").select(_TOKEN_COLUMNS).eq("user_id", user_id).execute()
    )
    if not result.data:
        raise SpotifyReauthRequired(
            "No Spotify credentials found. Complete onboarding first."
        )
    token_data = result.data[0]

    # Decrypt refresh token from DB
    token_data["refresh_token"] = _decrypt_refresh_token(
        user_id, token_data["refresh_token"]
    )

    expires_at = datetime.fromisoformat(token_data["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at - timedelta(minutes=5):
        lock = _get_refresh_lock(user_id)
        with lock:
            # Re-fetch inside lock — another thread may have already refreshed
            result = (
                db.table("music_tokens")
                .select(_TOKEN_COLUMNS)
                .eq("user_id", user_id)
                .execute()
            )
            token_data = result.data[0]
            stored_refresh_token = token_data["refresh_token"]
            token_data["refresh_token"] = _decrypt_refresh_token(
                user_id, stored_refresh_token
            )
            expires_at = datetime.fromisoformat(token_data["expires_at"])
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires_at - timedelta(minutes=5):
                token_data = _refresh_token(
                    user_id, token_data, db, stored_refresh_token
                )
    return spotipy.Spotify(auth=token_data["access_token"])


def _spotify_error_code(response: requests.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return None
    return body.get("error") if isinstance(body, dict) else None


def _discard_dead_token(user_id: str, db: Client, stored_refresh_token: str) -> dict:
    """Delete the row whose refresh token Spotify rejected, then demand re-auth.

    The delete is scoped to the rejected token: the lock above is per process,
    so another instance may have rotated the token since we read it. In that
    case nothing is deleted and the row it wrote is returned instead.
    """
    deleted = (
        db.table("music_tokens")
        .delete()
        .eq("user_id", user_id)
        .eq("refresh_token", stored_refresh_token)
        .execute()
    )
    if not deleted.data:
        current = (
            db.table("music_tokens")
            .select(_TOKEN_COLUMNS)
            .eq("user_id", user_id)
            .execute()
        )
        if current.data:
            return current.data[0]
    raise SpotifyReauthRequired()


def _refresh_token(
    user_id: str, token_data: dict, db: Client, stored_refresh_token: str
) -> dict:
    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": token_data["refresh_token"],
            "client_id": token_data["client_id"],
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    if not response.ok:
        logger.error(
            "Spotify token refresh failed for user %s: %s %s",
            user_id,
            response.status_code,
            response.text[:500],
        )
        # Refresh tokens expire 6 months after authorization; Spotify answers
        # 400 invalid_grant and the user has to go through authorization again.
        if (
            response.status_code == 400
            and _spotify_error_code(response) == "invalid_grant"
        ):
            return _discard_dead_token(user_id, db, stored_refresh_token)
    response.raise_for_status()
    new_tokens = response.json()
    updated = {
        "access_token": new_tokens["access_token"],
        "expires_at": (
            datetime.now(timezone.utc) + timedelta(seconds=new_tokens["expires_in"])
        ).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if "refresh_token" in new_tokens:
        updated["refresh_token"] = encrypt_token(new_tokens["refresh_token"])
    db.table("music_tokens").update(updated).eq("user_id", user_id).execute()
    return {**token_data, **updated}


async def get_user_spotify(
    user: dict = Depends(get_current_user),
) -> spotipy.Spotify:
    db = get_service_db()
    return get_spotify_for_user(user["user_id"], db)


# Keep get_spotify as an alias so existing routers/tests continue to work during migration
get_spotify = get_user_spotify
