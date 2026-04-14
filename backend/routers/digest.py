import os
from collections import Counter
from datetime import date

import spotipy
from fastapi import APIRouter, Depends, Header, HTTPException
from supabase import Client

from auth_middleware import get_authed_db, get_current_user
from db import get_db
from routers.library import get_album_cache
from spotify_client import get_user_spotify

router = APIRouter(prefix="/digest", tags=["digest"])


def _find_snapshot(db: Client, target_date: str):
    """Find the snapshot with the greatest date <= target_date (floor strategy)."""
    result = (
        db.table("library_snapshots")
        .select("*")
        .lte("snapshot_date", target_date)
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _resolve_album_metadata(
    album_ids: list[str], album_cache: list[dict], sp: spotipy.Spotify
):
    """Resolve metadata for album IDs. Uses cache first, then Spotify API fallback."""
    lookup = {a["spotify_id"]: a for a in album_cache}
    resolved = []
    for aid in album_ids:
        if aid in lookup:
            a = lookup[aid]
            resolved.append(
                {
                    "spotify_id": aid,
                    "name": a["name"],
                    "artists": a["artists"],
                    "image_url": a.get("image_url"),
                }
            )
        else:
            try:
                album = sp.album(aid)
                images = album.get("images", [])
                largest = max(images, key=lambda i: i.get("height", 0), default=None)
                resolved.append(
                    {
                        "spotify_id": aid,
                        "name": album["name"],
                        "artists": [a["name"] for a in album.get("artists", [])],
                        "image_url": largest["url"] if largest else None,
                    }
                )
            except Exception:
                resolved.append(
                    {
                        "spotify_id": aid,
                        "name": None,
                        "artists": None,
                        "image_url": None,
                    }
                )
    return resolved


@router.get("")
def get_digest(
    start: date,
    end: date,
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    start_str = str(start)
    end_str = str(end)
    start_snap = _find_snapshot(db, start_str)
    end_snap = _find_snapshot(db, end_str)

    if not start_snap or not end_snap:
        raise HTTPException(
            status_code=404,
            detail="No snapshots found for the requested date range. Digests require at least one day of library tracking.",
        )

    start_ids = set(start_snap["album_ids"])
    end_ids = set(end_snap["album_ids"])

    added_ids = list(end_ids - start_ids)
    removed_ids = list(start_ids - end_ids)

    play_rows = (
        db.table("play_history")
        .select("album_id, played_at")
        .gte("played_at", start_str)
        .lte("played_at", end_str)
        .execute()
    ).data

    play_counts = Counter(row["album_id"] for row in play_rows)
    listened_ids = [aid for aid, _ in play_counts.most_common()]

    album_cache = get_album_cache(db, user_id=user["user_id"])

    all_ids = set(added_ids) | set(removed_ids) | set(listened_ids)
    metadata = _resolve_album_metadata(list(all_ids), album_cache, sp)
    meta_lookup = {m["spotify_id"]: m for m in metadata}

    def enrich(ids):
        return [meta_lookup[aid] for aid in ids if aid in meta_lookup]

    def enrich_listened(ids):
        result = []
        for aid in ids:
            if aid in meta_lookup:
                entry = {**meta_lookup[aid], "play_count": play_counts[aid]}
                result.append(entry)
        return result

    return {
        "period": {"start": start_str, "end": end_str},
        "added": enrich(added_ids),
        "removed": enrich(removed_ids),
        "listened": enrich_listened(listened_ids),
    }


@router.post("/snapshot")
def create_snapshot(
    db: Client = Depends(get_db),
    x_cron_secret: str | None = Header(default=None),
):
    expected = os.getenv("CRON_SECRET", "")
    if not expected or x_cron_secret != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    # In multi-user mode, snapshots are created per-user via POST /digest/ensure-snapshot.
    # The cron endpoint iterates all users with cached libraries and creates snapshots.
    today = str(date.today())
    users_with_cache = (
        db.table("library_cache").select("user_id, albums, total").execute()
    )
    if not users_with_cache.data:
        raise HTTPException(
            status_code=503,
            detail="No library caches found. Users must open the app to sync first.",
        )

    created = 0
    for row in users_with_cache.data:
        album_ids = [a["spotify_id"] for a in row["albums"]]
        total = len(album_ids)
        db.table("library_snapshots").upsert(
            {
                "snapshot_date": today,
                "album_ids": album_ids,
                "total": total,
                "user_id": row["user_id"],
            },
            on_conflict="snapshot_date,user_id",
        ).execute()
        created += 1

    return {"snapshot_date": today, "users_processed": created}


@router.post("/ensure-snapshot")
def ensure_snapshot(
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    today = str(date.today())

    # Check if a snapshot already exists for today
    existing = (
        db.table("library_snapshots").select("*").eq("snapshot_date", today).execute()
    )
    if existing.data:
        snap = existing.data[0]
        return {
            "status": "exists",
            "snapshot_date": snap["snapshot_date"],
            "total": snap["total"],
        }

    # No snapshot for today — create one from the album cache
    album_cache = get_album_cache(db, user_id=user_id)
    if not album_cache:
        raise HTTPException(
            status_code=503,
            detail="Library cache is empty. Open the app to sync your library first.",
        )

    album_ids = [a["spotify_id"] for a in album_cache]
    total = len(album_ids)

    db.table("library_snapshots").upsert(
        {
            "snapshot_date": today,
            "album_ids": album_ids,
            "total": total,
            "user_id": user_id,
        },
        on_conflict="snapshot_date,user_id",
    ).execute()

    return {"status": "created", "snapshot_date": today, "total": total}
