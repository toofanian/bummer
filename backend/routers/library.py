import time
import spotipy
from fastapi import APIRouter, Depends
from spotify_client import get_spotify

router = APIRouter(prefix="/library", tags=["library"])

CACHE_TTL_SECONDS = 3600  # 1 hour

_cache = {"albums": None, "total": None, "fetched_at": None}


def _is_cache_fresh():
    return _cache["fetched_at"] is not None and (
        time.time() - _cache["fetched_at"]
    ) < CACHE_TTL_SECONDS


def clear_cache():
    _cache["albums"] = None
    _cache["total"] = None
    _cache["fetched_at"] = None


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


@router.get("/albums")
def get_albums(sp: spotipy.Spotify = Depends(get_spotify)):
    if not _is_cache_fresh():
        all_items, total = _fetch_all_albums(sp)
        _cache["albums"] = [_normalize_album(item) for item in all_items]
        _cache["total"] = total
        _cache["fetched_at"] = time.time()

    return {"albums": _cache["albums"], "total": _cache["total"]}


@router.post("/albums/invalidate-cache")
def invalidate_cache():
    clear_cache()
    return {"cache": "cleared"}
