from datetime import datetime, timedelta, timezone

import requests
import spotipy
from fastapi import Depends, HTTPException
from supabase import Client

from auth_middleware import get_current_user
from db import get_service_db

SCOPES = [
    "user-library-read",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
]


def get_spotify_for_user(user_id: str, db: Client) -> spotipy.Spotify:
    result = db.table("music_tokens").select("*").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(
            status_code=401,
            detail="No Spotify credentials found. Complete onboarding first.",
        )
    token_data = result.data[0]
    expires_at = datetime.fromisoformat(token_data["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at - timedelta(minutes=5):
        token_data = _refresh_token(user_id, token_data, db)
    return spotipy.Spotify(auth=token_data["access_token"])


def _refresh_token(user_id: str, token_data: dict, db: Client) -> dict:
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
        updated["refresh_token"] = new_tokens["refresh_token"]
    db.table("music_tokens").update(updated).eq("user_id", user_id).execute()
    return {**token_data, **updated}


async def get_user_spotify(
    user: dict = Depends(get_current_user),
) -> spotipy.Spotify:
    # Preview mode: skip the token refresh (the seeded music_tokens row
    # uses a fake refresh token, so a real call to Spotify's token
    # endpoint would crash). Return a Spotipy client with the fake
    # access token — endpoints that only touch the DB (e.g. listing
    # collections) will work fine; endpoints that actually call the
    # Spotify API will fail at the call site, which is the expected
    # limitation of the preview auth bypass.
    import os

    if (
        os.getenv("VERCEL_ENV") == "preview"
        and os.getenv("PREVIEW_REAL_AUTH") != "true"
    ):
        return spotipy.Spotify(auth="PREVIEW_FAKE_ACCESS")

    db = get_service_db()
    return get_spotify_for_user(user["user_id"], db)


# Keep get_spotify as an alias so existing routers/tests continue to work during migration
get_spotify = get_user_spotify
