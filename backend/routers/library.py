import time

import spotipy
from fastapi import APIRouter, BackgroundTasks, Depends
from supabase import Client

from auth_middleware import get_authed_db, get_current_user
from spotify_client import get_user_spotify
from spotify_helpers import fetch_all_albums

router = APIRouter(prefix="/library", tags=["library"])

CACHE_TTL_SECONDS = 3600  # 1 hour

_caches: dict[
    str, dict
] = {}  # user_id -> {"albums": ..., "total": ..., "fetched_at": ...}


def _is_cache_fresh(user_id: str) -> bool:
    entry = _caches.get(user_id)
    return entry is not None and (time.time() - entry["fetched_at"]) < CACHE_TTL_SECONDS


def clear_cache(user_id: str | None = None):
    if user_id is None:
        _caches.clear()
    else:
        _caches.pop(user_id, None)


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
        "spotify_id": album["id"],
        "name": album["name"],
        "artists": [a["name"] for a in album.get("artists", [])],
        "release_date": album.get("release_date"),
        "total_tracks": album.get("total_tracks"),
        "image_url": largest_image["url"] if largest_image else None,
        "added_at": item.get("added_at"),
    }


def _background_spotify_sync(sp: spotipy.Spotify, db: Client, user_id: str):
    """Re-sync from Spotify and update both in-memory and Supabase cache."""
    all_items, total = fetch_all_albums(sp)
    albums = [_normalize_album(item) for item in all_items]
    _caches[user_id] = {"albums": albums, "total": total, "fetched_at": time.time()}
    _save_supabase_cache(db, albums, total, user_id)


@router.get("/albums")
def get_albums(
    background_tasks: BackgroundTasks,
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]

    # Tier 1: in-memory cache
    if _is_cache_fresh(user_id):
        entry = _caches[user_id]
        return {"albums": entry["albums"], "total": entry["total"], "syncing": False}

    # Tier 2: Supabase cache
    supabase_row = _get_supabase_cache(db, user_id=user_id)
    if supabase_row:
        _caches[user_id] = {
            "albums": supabase_row["albums"],
            "total": supabase_row["total"],
            "fetched_at": time.time(),
        }
        entry = _caches[user_id]
        background_tasks.add_task(_background_spotify_sync, sp, db, user_id)
        return {"albums": entry["albums"], "total": entry["total"], "syncing": True}

    # Tier 3: cold start — fetch from Spotify
    all_items, total = fetch_all_albums(sp)
    albums = [_normalize_album(item) for item in all_items]
    _caches[user_id] = {"albums": albums, "total": total, "fetched_at": time.time()}
    _save_supabase_cache(db, albums, total, user_id)
    return {"albums": albums, "total": total, "syncing": False}


@router.post("/albums/invalidate-cache")
def invalidate_cache(
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    clear_cache(user_id)
    db.table("library_cache").delete().eq("id", user_id).execute()
    return {"cache": "cleared"}


def _format_duration(ms: int) -> str:
    total_seconds = ms // 1000
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes}:{seconds:02d}"


@router.get("/albums/{spotify_id}/tracks")
def get_album_tracks(spotify_id: str, sp: spotipy.Spotify = Depends(get_user_spotify)):
    all_tracks = []
    result = sp.album_tracks(spotify_id, limit=50)
    while True:
        all_tracks.extend(result["items"])
        if not result["next"]:
            break
        result = sp.album_tracks(spotify_id, limit=50, offset=len(all_tracks))
    return {
        "tracks": [
            {
                "spotify_id": t["id"],
                "track_number": t["track_number"],
                "name": t["name"],
                "duration": _format_duration(t["duration_ms"]),
                "artists": [a["name"] for a in t.get("artists", [])],
            }
            for t in all_tracks
        ]
    }


def get_album_cache(db: Client = None, user_id: str | None = None):
    """Return cached album list, falling back to Supabase if in-memory cache is cold."""
    if user_id and user_id in _caches and _caches[user_id]["albums"] is not None:
        return _caches[user_id]["albums"]
    if db is not None:
        row = _get_supabase_cache(db, user_id=user_id)
        if row:
            return row["albums"]
    return []
