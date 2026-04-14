"""Apple Music authentication endpoints.

These endpoints handle:
1. Serving the Apple Developer Token to the frontend (for MusicKit JS init)
2. Storing the Music User Token (obtained client-side via MusicKit JS)
3. Checking Apple Music connection status
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from apple_music_token import generate_developer_token
from auth_middleware import get_current_user
from db import get_service_db

router = APIRouter(prefix="/auth/apple-music", tags=["auth"])


class StoreMusicUserTokenRequest(BaseModel):
    music_user_token: str


@router.get("/developer-token")
def get_developer_token(user: dict = Depends(get_current_user)):
    """Return the Apple Developer Token for MusicKit JS initialization.

    The frontend needs this token to load MusicKit JS and prompt
    the user to authorize their Apple Music account.
    """
    try:
        token = generate_developer_token()
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail="Apple Music is not configured on this server.",
        ) from e
    return {"developer_token": token}


@router.post("/token")
def store_music_user_token(
    body: StoreMusicUserTokenRequest,
    user: dict = Depends(get_current_user),
):
    """Store the Music User Token obtained from MusicKit JS authorization.

    Called after the user authorizes Apple Music access in the browser.
    The token is stored in the music_tokens table.
    """
    db = get_service_db()
    now = datetime.now(timezone.utc)

    # Get the developer token to store alongside
    try:
        dev_token = generate_developer_token()
    except RuntimeError:
        dev_token = None

    db.table("music_tokens").upsert(
        {
            "user_id": user["user_id"],
            "access_token": body.music_user_token,
            "refresh_token": None,  # Apple Music doesn't use refresh tokens
            "expires_at": None,  # Music User Tokens don't have a fixed expiry
            "client_id": None,  # Not applicable for Apple Music
            "updated_at": now.isoformat(),
        }
    ).execute()

    # Update profile service type
    db.table("profiles").update(
        {"service_type": "apple_music"}
    ).eq("id", user["user_id"]).execute()

    return {"status": "ok"}


@router.get("/status")
def apple_music_status(user: dict = Depends(get_current_user)):
    """Check if the user has Apple Music credentials stored."""
    db = get_service_db()

    # Check profile service type
    profile = (
        db.table("profiles")
        .select("service_type")
        .eq("id", user["user_id"])
        .execute()
    )

    if not profile.data or profile.data[0].get("service_type") != "apple_music":
        return {"has_credentials": False}

    # Check for stored token
    result = (
        db.table("music_tokens")
        .select("access_token")
        .eq("user_id", user["user_id"])
        .execute()
    )

    if not result.data or not result.data[0].get("access_token"):
        return {"has_credentials": False}

    return {"has_credentials": True}


@router.delete("/token")
def delete_music_user_token(user: dict = Depends(get_current_user)):
    """Remove Apple Music credentials."""
    db = get_service_db()
    db.table("music_tokens").delete().eq("user_id", user["user_id"]).execute()

    # Reset profile service type
    db.table("profiles").update(
        {"service_type": "spotify"}
    ).eq("id", user["user_id"]).execute()

    return {"status": "ok"}
