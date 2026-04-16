from typing import Any

import spotipy
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from auth_middleware import get_authed_db, get_current_user
from spotify_client import get_user_spotify

router = APIRouter(prefix="/library", tags=["library"])


class SyncRequest(BaseModel):
    offset: int


class SyncCompleteRequest(BaseModel):
    albums: list[dict[str, Any]]


def _dedupe_albums_by_service_id(albums: list[dict]) -> list[dict]:
    """Collapse duplicate service_ids, keeping the first-seen position but last-wins value.

    Used by the sync endpoint's merge path. In practice duplicates only occur
    under retries or two-tab races (where the duplicate payloads are identical),
    so last-wins is defensive but equivalent to first-wins in the common case.
    """
    seen: dict[str, dict] = {}
    order: list[str] = []
    for album in albums:
        sid = album["service_id"]
        if sid not in seen:
            order.append(sid)
        seen[sid] = album
    return [seen[sid] for sid in order]


def _get_supabase_cache(db: Client, user_id: str = None):
    """Return the cached library_cache row from Supabase, or None if absent."""
    cache_key = user_id or "albums"
    result = db.table("library_cache").select("*").eq("id", cache_key).execute()
    if result.data:
        return result.data[0]
    return None


def _save_supabase_cache(db: Client, albums: list, total: int, user_id: str = None):
    """Upsert the album list into Supabase library_cache."""
    cache_key = user_id or "albums"
    db.table("library_cache").upsert(
        {
            "id": cache_key,
            "user_id": user_id,
            "albums": albums,
            "total": total,
            "synced_at": "now()",
        }
    ).execute()


def _normalize_album(item: dict) -> dict:
    album = item["album"]
    images = album.get("images", [])
    largest_image = max(images, key=lambda i: i.get("height") or 0, default=None)
    return {
        "service_id": album["id"],
        "name": album["name"],
        "artists": [a["name"] for a in album.get("artists", [])],
        "release_date": album.get("release_date"),
        "total_tracks": album.get("total_tracks"),
        "image_url": largest_image["url"] if largest_image else None,
        "added_at": item.get("added_at"),
    }


@router.get("/albums")
def get_albums(
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    """Return the user's cached library state. No Spotify calls.

    The frontend is responsible for driving a sync loop via POST /library/sync
    when the cache is empty or stale.
    """
    user_id = user["user_id"]
    row = _get_supabase_cache(db, user_id=user_id)
    if row is None:
        return {"albums": [], "total": 0, "last_synced": None}
    albums = row.get("albums") or []
    return {
        "albums": albums,
        "total": len(albums),
        "last_synced": row.get("synced_at"),
    }


@router.post("/sync")
def sync_one_page(
    body: SyncRequest,
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    if body.offset < 0 or body.offset % 50 != 0:
        raise HTTPException(
            status_code=400,
            detail="offset must be a non-negative multiple of 50",
        )

    # Fetch one page from Spotify
    result = sp.current_user_saved_albums(limit=50, offset=body.offset)
    new_albums = [_normalize_album(item) for item in result["items"]]
    spotify_total = result["total"]
    done = result["next"] is None

    return {
        "albums": new_albums,
        "synced_this_page": len(new_albums),
        "spotify_total": spotify_total,
        "next_offset": body.offset + len(new_albums),
        "done": done,
    }


@router.post("/sync-complete")
def sync_complete(
    body: SyncCompleteRequest,
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    _save_supabase_cache(db, body.albums, len(body.albums), user_id)
    return {"total": len(body.albums)}


def _format_duration(ms: int) -> str:
    total_seconds = ms // 1000
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes}:{seconds:02d}"


@router.get("/albums/{album_id}/tracks")
def get_album_tracks(album_id: str, sp: spotipy.Spotify = Depends(get_user_spotify)):
    all_tracks = []
    result = sp.album_tracks(album_id, limit=50)
    while True:
        all_tracks.extend(result["items"])
        if not result["next"]:
            break
        result = sp.album_tracks(album_id, limit=50, offset=len(all_tracks))
    return {
        "tracks": [
            {
                "service_id": t["id"],
                "track_number": t["track_number"],
                "name": t["name"],
                "duration": _format_duration(t["duration_ms"]),
                "artists": [a["name"] for a in t.get("artists", [])],
            }
            for t in all_tracks
        ]
    }


def get_album_cache(db: Client = None, user_id: str | None = None):
    """Return cached album list from Supabase, or empty list if absent.

    Used by digest.py to read the user's library snapshot without re-fetching
    from Spotify. Previously consulted an in-memory cache; now Supabase-only.
    """
    if db is not None:
        row = _get_supabase_cache(db, user_id=user_id)
        if row:
            return row["albums"]
    return []
