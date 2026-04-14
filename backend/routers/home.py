import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import spotipy
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from supabase import Client

from auth_middleware import get_authed_db, get_current_user
from routers.library import get_album_cache
from spotify_client import get_user_spotify

router = APIRouter(prefix="/home", tags=["home"])


class LogPlayRequest(BaseModel):
    album_id: str


@router.post("/history/log", status_code=204)
def log_play(
    body: LogPlayRequest,
    db: Client = Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    db.table("play_history").insert(
        {"album_id": body.album_id, "user_id": user["user_id"]}
    ).execute()
    return Response(status_code=204)


@router.post("/history/sync")
def sync_history(
    db: Client = Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    results = sp.current_user_recently_played(limit=50)
    items = results.get("items", [])
    if not items:
        return {"synced": 0}

    # Parse played_at timestamps and find time range
    parsed = []
    for item in items:
        album_id = item["track"]["album"]["id"]
        played_at = item["played_at"]
        parsed.append({"album_id": album_id, "played_at": played_at})

    timestamps = [p["played_at"] for p in parsed]
    min_ts = min(timestamps)
    max_ts = max(timestamps)

    # Fetch existing rows in this time range to avoid duplicates
    existing_rows = (
        db.table("play_history")
        .select("album_id, played_at")
        .eq("user_id", user["user_id"])
        .gte("played_at", min_ts)
        .lte("played_at", max_ts)
        .execute()
    ).data
    existing_pairs = {(r["album_id"], r["played_at"]) for r in existing_rows}

    new_rows = [
        {
            "album_id": p["album_id"],
            "user_id": user["user_id"],
            "played_at": p["played_at"],
            "source": "spotify_sync",
        }
        for p in parsed
        if (p["album_id"], p["played_at"]) not in existing_pairs
    ]

    if new_rows:
        db.table("play_history").insert(new_rows).execute()

    return {"synced": len(new_rows)}


def _build_album_lookup(album_cache):
    return {a["service_id"]: a for a in album_cache}


def _dedup_album_ids(rows):
    """Return unique album_ids preserving first-occurrence order."""
    seen = set()
    result = []
    for row in rows:
        aid = row["album_id"]
        if aid not in seen:
            seen.add(aid)
            result.append(aid)
    return result


@router.get("")
def get_home(
    tz: str = Query(default="UTC"),
    db: Client = Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    album_cache = get_album_cache(db, user_id=user["user_id"])
    lookup = _build_album_lookup(album_cache)

    try:
        user_tz = ZoneInfo(tz)
    except (KeyError, ValueError):
        user_tz = ZoneInfo("UTC")

    now_local = datetime.now(user_tz)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    today_start_utc = today_start.astimezone(timezone.utc).isoformat()
    week_start_utc = week_start.astimezone(timezone.utc).isoformat()

    rows = (
        db.table("play_history")
        .select("album_id, played_at")
        .gte("played_at", week_start_utc)
        .order("played_at", desc=True)
        .execute()
    ).data

    today_rows = [r for r in rows if r["played_at"] >= today_start_utc]
    week_rows = [r for r in rows if r["played_at"] < today_start_utc]

    today_ids = _dedup_album_ids(today_rows)
    week_ids = _dedup_album_ids(week_rows)

    def resolve(ids):
        return [lookup[aid] for aid in ids if aid in lookup]

    # Rediscover: albums not played in 60+ days (or never played)
    sixty_days_ago = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    all_history = (
        db.table("play_history")
        .select("album_id, played_at")
        .gte("played_at", sixty_days_ago)
        .execute()
    ).data
    recently_played_ids = {r["album_id"] for r in all_history}
    rediscover_candidates = [
        a for a in album_cache if a["service_id"] not in recently_played_ids
    ]
    rediscover = random.sample(
        rediscover_candidates, min(20, len(rediscover_candidates))
    )

    # Recommended: albums by frequently played artists, not played in 30 days
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    last_30_history = (
        db.table("play_history")
        .select("album_id")
        .gte("played_at", thirty_days_ago)
        .execute()
    ).data

    artist_play_counts = {}
    played_in_30 = set()
    for r in last_30_history:
        played_in_30.add(r["album_id"])
        album = lookup.get(r["album_id"])
        if album:
            for artist in album.get("artists", []):
                artist_play_counts[artist] = artist_play_counts.get(artist, 0) + 1

    top_artists = sorted(artist_play_counts, key=artist_play_counts.get, reverse=True)[
        :5
    ]

    recommended = [
        a
        for a in album_cache
        if a["service_id"] not in played_in_30
        and any(artist in top_artists for artist in a.get("artists", []))
    ][:20]

    # Recently added: albums sorted by added_at descending, capped at 20
    recently_added = sorted(
        [a for a in album_cache if a.get("added_at")],
        key=lambda a: a["added_at"],
        reverse=True,
    )[:20]

    return {
        "today": resolve(today_ids),
        "this_week": resolve(week_ids),
        "rediscover": rediscover,
        "recommended": recommended,
        "recently_added": recently_added,
    }
