import random
from datetime import datetime, timedelta, timezone

import spotipy
from fastapi import APIRouter, Depends, Response
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
    db: Client = Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    album_cache = get_album_cache(db, user_id=user["user_id"])
    lookup = _build_album_lookup(album_cache)

    # Recently played: last 60 unique albums by most recent play
    recent_rows = (
        db.table("play_history")
        .select("album_id, played_at")
        .order("played_at", desc=True)
        .limit(600)
        .execute()
    ).data

    recent_ids = _dedup_album_ids(recent_rows)[:60]

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
        rediscover_candidates, min(60, len(rediscover_candidates))
    )

    # Recommended: shuffled albums by artists from recently played
    recently_played_home = set(recent_ids)
    recent_artists = set()
    for aid in recently_played_home:
        album = lookup.get(aid)
        if album:
            for artist in album.get("artists", []):
                name = artist["name"] if isinstance(artist, dict) else artist
                recent_artists.add(name)

    def _artist_name(a):
        return a["name"] if isinstance(a, dict) else a

    recommended_candidates = [
        a
        for a in album_cache
        if a["service_id"] not in recently_played_home
        and any(
            _artist_name(artist) in recent_artists for artist in a.get("artists", [])
        )
    ]
    recommended = random.sample(
        recommended_candidates, min(60, len(recommended_candidates))
    )

    # Recently added: albums sorted by added_at descending, capped at 30
    recently_added = sorted(
        [a for a in album_cache if a.get("added_at")],
        key=lambda a: a["added_at"],
        reverse=True,
    )[:60]

    return {
        "recently_played": resolve(recent_ids),
        "rediscover": rediscover,
        "recommended": recommended,
        "recently_added": recently_added,
    }
