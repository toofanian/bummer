from collections import Counter, defaultdict
from datetime import datetime, timedelta

import spotipy
from fastapi import APIRouter, Depends, Query
from supabase import Client

from auth_middleware import get_authed_db, get_current_user
from routers.library import get_album_cache
from spotify_client import get_user_spotify

router = APIRouter(prefix="/digest", tags=["digest"])


def _flatten_album_artists(album_meta: dict) -> dict:
    """Return album metadata with artists flattened to plain name strings."""
    artists = album_meta.get("artists")
    if artists and isinstance(artists[0], dict):
        return {**album_meta, "artists": [a["name"] for a in artists]}
    return album_meta


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
                        "artists": [
                            {"name": a["name"], "id": a["id"]}
                            for a in album.get("artists", [])
                        ],
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


def _resolve_artist_images(
    artist_names_and_ids: list[tuple[str, str | None]],
    sp: spotipy.Spotify,
) -> dict[str, str | None]:
    """Batch-resolve artist profile images from Spotify.
    Returns dict mapping artist name -> smallest image URL (or None).
    """
    result = {}
    ids_to_fetch = []
    name_by_id = {}
    names_without_id = []
    for name, artist_id in artist_names_and_ids:
        if artist_id:
            ids_to_fetch.append(artist_id)
            name_by_id[artist_id] = name
        else:
            names_without_id.append(name)

    # Look up IDs for artists missing them (stale cache with string-only artists)
    for name in names_without_id:
        try:
            search = sp.search(q=f'artist:"{name}"', type="artist", limit=1)
            items = search.get("artists", {}).get("items", [])
            if items:
                artist_id = items[0]["id"]
                ids_to_fetch.append(artist_id)
                name_by_id[artist_id] = name
            else:
                result[name] = None
        except Exception:
            result[name] = None

    for i in range(0, len(ids_to_fetch), 50):
        batch = ids_to_fetch[i : i + 50]
        try:
            resp = sp.artists(batch)
            for artist in resp.get("artists", []):
                if not artist:
                    continue
                name = name_by_id.get(artist["id"], artist["name"])
                images = artist.get("images", [])
                smallest = min(
                    images, key=lambda img: img.get("height", 0), default=None
                )
                result[name] = smallest["url"] if smallest else None
        except Exception:
            for aid in batch:
                result[name_by_id.get(aid, aid)] = None
    return result


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
                "album": _flatten_album_artists(album_meta),
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
    all_album_ids = list(play_counts.keys())
    metadata = _resolve_album_metadata(all_album_ids, album_cache, sp)
    meta_lookup = {m["service_id"]: m for m in metadata}

    top_albums = []
    for aid in top_album_ids:
        album_meta = meta_lookup.get(aid)
        if album_meta:
            top_albums.append(
                {
                    "album": _flatten_album_artists(album_meta),
                    "play_count": play_counts[aid],
                }
            )

    # Top artists: map album plays to artists (all plays, not just top albums)
    artist_counts = Counter()
    for aid in play_counts:
        album_meta = meta_lookup.get(aid)
        if album_meta and album_meta.get("artists"):
            for artist in album_meta["artists"]:
                name = artist["name"] if isinstance(artist, dict) else artist
                artist_counts[name] += play_counts[aid]

    # Collect artist IDs from metadata for image resolution
    artist_id_map = {}  # name -> id
    for aid in play_counts:
        album_meta = meta_lookup.get(aid)
        if album_meta and album_meta.get("artists"):
            for artist in album_meta["artists"]:
                name = artist["name"] if isinstance(artist, dict) else artist
                if isinstance(artist, dict) and artist.get("id"):
                    artist_id_map[name] = artist["id"]

    top_artist_names = [name for name, _ in artist_counts.most_common(10)]
    artist_images = _resolve_artist_images(
        [(name, artist_id_map.get(name)) for name in top_artist_names],
        sp,
    )

    top_artists = [
        {
            "artist": name,
            "play_count": artist_counts[name],
            "image_url": artist_images.get(name),
        }
        for name in top_artist_names
    ]

    return {
        "period_days": 30,
        "top_albums": top_albums,
        "top_artists": top_artists,
    }


@router.get("/changelog")
def get_changelog(
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()

    rows = (
        db.table("library_changes")
        .select("changed_at, added_ids, removed_ids")
        .eq("user_id", user["user_id"])
        .gte("changed_at", thirty_days_ago)
        .order("changed_at", desc=True)
        .execute()
    ).data

    if not rows:
        return {"days": []}

    # Collect all album appearances with timestamps
    added_albums = {}  # album_id -> latest changed_at
    removed_albums = {}  # album_id -> latest changed_at
    for row in rows:
        for aid in row["added_ids"]:
            if aid not in added_albums:
                added_albums[aid] = row["changed_at"]
        for aid in row["removed_ids"]:
            if aid not in removed_albums:
                removed_albums[aid] = row["changed_at"]

    # Detect bounces (in both sets)
    bounced_ids = set(added_albums) & set(removed_albums)

    # Build events list
    raw_events = []
    for aid in bounced_ids:
        ts = max(added_albums[aid], removed_albums[aid])
        raw_events.append({"album_id": aid, "type": "bounced", "changed_at": ts})
    for aid in set(added_albums) - bounced_ids:
        raw_events.append(
            {"album_id": aid, "type": "added", "changed_at": added_albums[aid]}
        )
    for aid in set(removed_albums) - bounced_ids:
        raw_events.append(
            {"album_id": aid, "type": "removed", "changed_at": removed_albums[aid]}
        )

    # Sort by most recent first
    raw_events.sort(key=lambda e: e["changed_at"], reverse=True)

    # Resolve metadata
    all_ids = [e["album_id"] for e in raw_events]
    album_cache = get_album_cache(db, user_id=user["user_id"])
    metadata = _resolve_album_metadata(all_ids, album_cache, sp)
    meta_lookup = {m["service_id"]: m for m in metadata}

    events = []
    for e in raw_events:
        album_meta = meta_lookup.get(e["album_id"])
        if album_meta:
            events.append(
                {
                    "type": e["type"],
                    "album": _flatten_album_artists(album_meta),
                    "changed_at": e["changed_at"],
                }
            )

    # Group by date, preserving sort order
    grouped = defaultdict(list)
    for event in events:
        day = event["changed_at"][:10]
        grouped[day].append(event)

    days = []
    for day_date in dict.fromkeys(e["changed_at"][:10] for e in events):
        days.append({"date": day_date, "events": grouped[day_date]})

    return {"days": days}
