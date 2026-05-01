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
    """Upsert the album list into Supabase library_cache.

    Clears artist_images cache so it gets re-resolved on next request
    (new artists may have been added or removed).
    """
    cache_key = user_id or "albums"
    db.table("library_cache").upsert(
        {
            "id": cache_key,
            "user_id": user_id,
            "albums": albums,
            "total": total,
            "artist_images": {},
            "synced_at": "now()",
        }
    ).execute()


def _artist_names(artists: list) -> list[str]:
    """Extract artist name strings from either string or {name, id} format."""
    return [a["name"] if isinstance(a, dict) else a for a in artists]


def _flatten_artists_for_response(albums: list[dict]) -> list[dict]:
    """Return album dicts with artists flattened to plain name strings for frontend."""
    return [
        {**album, "artists": _artist_names(album.get("artists", []))}
        for album in albums
    ]


def _normalize_album(item: dict) -> dict:
    album = item["album"]
    images = album.get("images", [])
    largest_image = max(images, key=lambda i: i.get("height") or 0, default=None)
    return {
        "service_id": album["id"],
        "name": album["name"],
        "artists": [
            {"name": a["name"], "id": a["id"]} for a in album.get("artists", [])
        ],
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

    # Filter out previously deduped albums
    suppressed = (
        db.table("deduped_albums")
        .select("old_service_id")
        .eq("user_id", user_id)
        .execute()
    )
    suppressed_ids = {r["old_service_id"] for r in suppressed.data}
    albums = [a for a in body.albums if a["service_id"] not in suppressed_ids]

    # Read current cache to compute diff
    existing = _get_supabase_cache(db, user_id=user_id)
    if existing and existing.get("albums"):
        old_ids = {a["service_id"] for a in existing["albums"]}
        new_ids = {a["service_id"] for a in albums}
        added = list(new_ids - old_ids)
        removed = list(old_ids - new_ids)
        if added or removed:
            db.table("library_changes").insert(
                {
                    "user_id": user_id,
                    "added_ids": added,
                    "removed_ids": removed,
                }
            ).execute()

    _save_supabase_cache(db, albums, len(albums), user_id)

    # Run cross-ID dedup on the cached albums
    from dedup import apply_dedup

    deduped_albums = apply_dedup(db, user_id, albums)
    if len(deduped_albums) < len(albums):
        # Re-save cache with losers removed
        _save_supabase_cache(db, deduped_albums, len(deduped_albums), user_id)

    return {"total": len(deduped_albums)}


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


@router.get("/listen-counts")
def get_listen_counts(
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    rows = (
        db.table("play_history")
        .select("album_id")
        .eq("user_id", user["user_id"])
        .execute()
    ).data
    counts = {}
    for row in rows:
        aid = row["album_id"]
        counts[aid] = counts.get(aid, 0) + 1
    return {"counts": counts}


@router.get("/artist-images")
def get_artist_images(
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    """Return artist name -> image_url map for all artists in user's library.

    Uses a write-through cache in library_cache.artist_images. First request
    resolves from Spotify and persists; subsequent requests return cached data.
    """
    from routers.digest import _resolve_artist_images

    # Check cache first
    cache_row = _get_supabase_cache(db, user_id=user["user_id"])
    cached_images = (cache_row or {}).get("artist_images") or {}
    if cached_images:
        return {"artist_images": cached_images}

    # Cache miss — resolve from Spotify
    albums = get_album_cache(db, user_id=user["user_id"])
    artist_id_map = {}
    for album in albums:
        for artist in album.get("artists", []):
            if isinstance(artist, dict) and artist.get("id"):
                artist_id_map[artist["name"]] = artist["id"]

    images = _resolve_artist_images(list(artist_id_map.items()), sp)

    # Write to cache
    db.table("library_cache").update({"artist_images": images}).eq(
        "id", user["user_id"]
    ).execute()

    return {"artist_images": images}


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
