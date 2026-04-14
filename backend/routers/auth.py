from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth_middleware import get_current_user
from db import get_service_db

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])


# --- Request models ---


class RedeemInviteRequest(BaseModel):
    invite_code: str


class StoreSpotifyTokenRequest(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    client_id: str


# --- Public endpoints ---


@router.post("/redeem-invite")
@limiter.limit("5/15minutes")
async def redeem_invite(request: Request, body: RedeemInviteRequest):
    """Validate an invite code and mark it redeemed."""
    db = get_service_db()
    result = db.table("invite_codes").select("*").eq("code", body.invite_code).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Invite code not found")

    invite = result.data[0]
    if invite.get("redeemed_at") is not None:
        raise HTTPException(status_code=400, detail="Invite code already used")

    db.table("invite_codes").update(
        {
            "redeemed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("code", body.invite_code).execute()
    return {"message": "Invite code redeemed"}


# --- Authenticated endpoints ---


@router.post("/spotify-token")
def store_spotify_token(
    body: StoreSpotifyTokenRequest,
    user: dict = Depends(get_current_user),
):
    """Store or update Spotify PKCE tokens for the authenticated user."""
    db = get_service_db()
    now = datetime.now(timezone.utc)
    db.table("spotify_tokens").upsert(
        {
            "user_id": user["user_id"],
            "access_token": body.access_token,
            "refresh_token": body.refresh_token,
            "expires_at": (now + timedelta(seconds=body.expires_in)).isoformat(),
            "client_id": body.client_id,
            "updated_at": now.isoformat(),
        }
    ).execute()
    return {"status": "ok"}


@router.delete("/spotify-token")
def delete_spotify_token(
    user: dict = Depends(get_current_user),
):
    """Delete Spotify tokens for the authenticated user."""
    db = get_service_db()
    db.table("spotify_tokens").delete().eq("user_id", user["user_id"]).execute()
    return {"status": "ok"}


@router.get("/spotify-status")
def spotify_status(
    user: dict = Depends(get_current_user),
):
    """Return whether the authenticated user has stored Spotify credentials."""
    db = get_service_db()
    result = (
        db.table("spotify_tokens")
        .select("client_id")
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not result.data:
        return {"has_credentials": False, "client_id": None}
    return {
        "has_credentials": True,
        "client_id": result.data[0].get("client_id"),
    }


# Tables that store per-user rows keyed by a `user_id` column.
_USER_DATA_TABLES = (
    "spotify_tokens",
    "album_metadata",
    "collection_albums",
    "collections",
    "library_cache",
    "library_snapshots",
    "play_history",
)


@router.delete("/account")
@limiter.limit("3/hour")
def delete_account(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Delete all data for the authenticated user and remove the auth user itself.

    Wipes rows across every user-owned table, then deletes the Supabase auth
    user. This is irreversible.
    """
    db = get_service_db()
    user_id = user["user_id"]

    for table in _USER_DATA_TABLES:
        db.table(table).delete().eq("user_id", user_id).execute()

    # profiles table uses `id` (PK = auth.users.id) rather than `user_id`
    db.table("profiles").delete().eq("id", user_id).execute()

    # Finally remove the Supabase auth user record itself
    db.auth.admin.delete_user(user_id)

    return {"status": "ok"}
