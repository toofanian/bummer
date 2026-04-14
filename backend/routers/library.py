import time

import spotipy
from fastapi import APIRouter, BackgroundTasks, Depends
from supabase import Client

from db import get_db
from spotify_client import get_spotify

router = APIRouter(prefix="/library", tags=["library"])

CACHE_TTL_SECONDS = 3600  # 1 hour

_cache = {"albums": None, "total": None, "fetched_at": None}


def _is_cache_fresh():
    return (
        _cache["fetched_at"] is not None
        and (time.time() - _cache["fetched_at"]) < CACHE_TTL_SECONDS
    )


def clear_cache():
    _cache["albums"] = None
    _cache["total"] = None
    _cache["fetched_at"] = None


SUPABASE_CACHE_KEY = "albums"


def _get_supabase_cache(db: Client):
    """Return the cached library_cache row from Supabase, or None if absent."""
    result = (
        db.table("library_cache")
        .select("*")
        .eq("id", SUPABASE_CACHE_KEY)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None


def _save_supabase_cache(db: Client, albums: list, total: int):
    """Upsert the album list into Supabase library_cache."""
    db.table("library_cache").upsert(
        {
            "id": SUPABASE_CACHE_KEY,
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


def _fetch_all_albums(sp: spotipy.Spotify):
    all_items = []
    total = None
    offset = 0
    limit = 50

    while total is None or offset < total:
        result = sp.current_user_saved_albums(limit=limit, offset=offset)
        total = result["total"]
        all_items.extend(result["items"])
        offset += len(result["items"])
        if not result["next"]:
            break

    return all_items, total


def _background_spotify_sync(sp: spotipy.Spotify, db: Client):
    """Re-sync from Spotify and update both in-memory and Supabase cache."""
    all_items, total = _fetch_all_albums(sp)
    albums = [_normalize_album(item) for item in all_items]
    _cache["albums"] = albums
    _cache["total"] = total
    _cache["fetched_at"] = time.time()
    _save_supabase_cache(db, albums, total)


@router.get("/albums")
def get_albums(
    background_tasks: BackgroundTasks,
    sp: spotipy.Spotify = Depends(get_spotify),
    db: Client = Depends(get_db),
):
    # Tier 1: in-memory cache
    if _is_cache_fresh():
        return {"albums": _cache["albums"], "total": _cache["total"], "syncing": False}

    # Tier 2: Supabase cache
    supabase_row = _get_supabase_cache(db)
    if supabase_row:
        _cache["albums"] = supabase_row["albums"]
        _cache["total"] = supabase_row["total"]
        _cache["fetched_at"] = time.time()
        background_tasks.add_task(_background_spotify_sync, sp, db)
        return {"albums": _cache["albums"], "total": _cache["total"], "syncing": True}

    # Tier 3: cold start — fetch from Spotify
    all_items, total = _fetch_all_albums(sp)
    albums = [_normalize_album(item) for item in all_items]
    _cache["albums"] = albums
    _cache["total"] = total
    _cache["fetched_at"] = time.time()
    _save_supabase_cache(db, albums, total)
    return {"albums": albums, "total": total, "syncing": False}


@router.post("/albums/invalidate-cache")
def invalidate_cache(
    sp: spotipy.Spotify = Depends(get_spotify),
    db: Client = Depends(get_db),
):
    clear_cache()
    db.table("library_cache").delete().eq("id", SUPABASE_CACHE_KEY).execute()
    return {"cache": "cleared"}


def _format_duration(ms: int) -> str:
    total_seconds = ms // 1000
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes}:{seconds:02d}"


@router.get("/albums/{spotify_id}/tracks")
def get_album_tracks(spotify_id: str, sp: spotipy.Spotify = Depends(get_spotify)):
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
