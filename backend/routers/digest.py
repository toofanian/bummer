import os
from collections import Counter, defaultdict
from datetime import date, datetime

import spotipy
from fastapi import APIRouter, Depends, Header, HTTPException, Query
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
    lookup = {a["service_id"]: a for a in album_cache}
    resolved = []
    for aid in album_ids:
        if aid in lookup:
            a = lookup[aid]
            resolved.append(
                {
                    "service_id": aid,
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
                        "service_id": aid,
                        "name": album["name"],
                        "artists": [a["name"] for a in album.get("artists", [])],
                        "image_url": largest["url"] if largest else None,
                    }
                )
            except Exception:
                resolved.append(
                    {
                        "service_id": aid,
                        "name": None,
                        "artists": None,
                        "image_url": None,
                    }
                )
    return resolved


@router.get("/history")
def get_history(
    limit: int = Query(default=50, ge=1, le=200),
    before: datetime | None = None,
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    query = (
        db.table("play_history")
        .select("album_id, played_at")
        .order("played_at", desc=True)
        .limit(limit + 1)
    )
    if before:
        query = query.lt("played_at", str(before))

    rows = query.execute().data

    has_more = len(rows) > limit
    # Keep only `limit` rows for the response
    result_rows = rows[:limit]

    if not result_rows:
        return {"days": [], "has_more": False, "next_cursor": None}

    next_cursor = result_rows[-1]["played_at"] if has_more else None

    # Resolve album metadata
    unique_ids = list({r["album_id"] for r in result_rows})
    album_cache = get_album_cache(db, user_id=user["user_id"])
    metadata = _resolve_album_metadata(unique_ids, album_cache, sp)
    meta_lookup = {m["service_id"]: m for m in metadata}

    # Group by date
    grouped = defaultdict(list)
    for row in result_rows:
        day = row["played_at"][:10]  # extract YYYY-MM-DD
        album_meta = meta_lookup.get(
            row["album_id"],
            {
                "service_id": row["album_id"],
                "name": None,
                "artists": None,
                "image_url": None,
            },
        )
        grouped[day].append(
            {
                "album": album_meta,
                "played_at": row["played_at"],
            }
        )

    # Build days list, sorted newest first (rows are already ordered desc)
    days = []
    for day_date in dict.fromkeys(row["played_at"][:10] for row in result_rows):
        days.append(
            {
                "date": day_date,
                "plays": grouped[day_date],
            }
        )

    return {"days": days, "has_more": has_more, "next_cursor": next_cursor}


@router.get("/stats")
def get_stats(
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    from datetime import timedelta

    thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()

    rows = (
        db.table("play_history")
        .select("album_id, played_at")
        .gte("played_at", thirty_days_ago)
        .execute()
    ).data

    if not rows:
        return {"period_days": 30, "top_albums": [], "top_artists": []}

    play_counts = Counter(row["album_id"] for row in rows)
    top_album_ids = [aid for aid, _ in play_counts.most_common(10)]

    album_cache = get_album_cache(db, user_id=user["user_id"])
    metadata = _resolve_album_metadata(top_album_ids, album_cache, sp)
    meta_lookup = {m["service_id"]: m for m in metadata}

    top_albums = []
    for aid in top_album_ids:
        album_meta = meta_lookup.get(aid)
        if album_meta:
            top_albums.append(
                {
                    "album": album_meta,
                    "play_count": play_counts[aid],
                }
            )

    # Top artists: map album plays to artists
    artist_counts = Counter()
    for aid in top_album_ids:
        album_meta = meta_lookup.get(aid)
        if album_meta and album_meta.get("artists"):
            for artist in album_meta["artists"]:
                artist_counts[artist] += play_counts[aid]

    top_artists = [
        {"artist": name, "play_count": count}
        for name, count in artist_counts.most_common(10)
    ]

    return {
        "period_days": 30,
        "top_albums": top_albums,
        "top_artists": top_artists,
    }


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
    meta_lookup = {m["service_id"]: m for m in metadata}

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


@router.get("/changelog")
def get_changelog(
    limit: int = 50,
    before: date | None = None,
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    # Fetch limit+1 snapshots to compute `limit` diffs (need pairs)
    query = (
        db.table("library_snapshots")
        .select("snapshot_date, album_ids")
        .order("snapshot_date", desc=True)
        .limit(limit + 1)
    )
    if before:
        query = query.lt("snapshot_date", str(before))

    snapshots = query.execute().data

    if len(snapshots) < 2:
        return {"entries": [], "has_more": False, "next_cursor": None}

    # Compute diffs between consecutive pairs
    raw_entries = []
    for i in range(len(snapshots) - 1):
        newer = snapshots[i]
        older = snapshots[i + 1]
        newer_ids = set(newer["album_ids"])
        older_ids = set(older["album_ids"])
        added_ids = list(newer_ids - older_ids)
        removed_ids = list(older_ids - newer_ids)
        if added_ids or removed_ids:
            raw_entries.append(
                {
                    "date": newer["snapshot_date"],
                    "added_ids": added_ids,
                    "removed_ids": removed_ids,
                }
            )

    # Resolve metadata for all referenced album IDs
    all_ids = set()
    for entry in raw_entries:
        all_ids.update(entry["added_ids"])
        all_ids.update(entry["removed_ids"])

    album_cache = get_album_cache(db, user_id=user["user_id"])
    metadata = _resolve_album_metadata(list(all_ids), album_cache, sp)
    meta_lookup = {m["service_id"]: m for m in metadata}

    entries = []
    for entry in raw_entries:
        entries.append(
            {
                "date": entry["date"],
                "added": [
                    meta_lookup[aid] for aid in entry["added_ids"] if aid in meta_lookup
                ],
                "removed": [
                    meta_lookup[aid]
                    for aid in entry["removed_ids"]
                    if aid in meta_lookup
                ],
            }
        )

    # Pagination: if we fetched limit+1 snapshots and used all pairs, there may be more
    has_more = len(snapshots) > limit
    next_cursor = snapshots[-2]["snapshot_date"] if has_more else None

    return {"entries": entries, "has_more": has_more, "next_cursor": next_cursor}


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
        album_ids = [a["service_id"] for a in row["albums"]]
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
        db.table("library_snapshots").select("*").eq("snapshot_date", today).eq("user_id", user_id).execute()
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

    album_ids = [a["service_id"] for a in album_cache]
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
