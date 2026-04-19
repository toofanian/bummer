from typing import Literal

import spotipy
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

import routers.library as library_module
from auth_middleware import get_authed_db, get_current_user
from spotify_client import get_user_spotify

router = APIRouter(tags=["metadata"])


class TierBody(BaseModel):
    tier: Literal["S", "A", "B", "C", "D"]


class CollectionBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class CollectionAlbumBody(BaseModel):
    service_id: str


class DescriptionBody(BaseModel):
    description: str | None = Field(None, max_length=2000)


class ReorderBody(BaseModel):
    album_ids: list[str] = Field(..., max_length=500)


class ReorderCollectionsBody(BaseModel):
    collection_ids: list[str] = Field(..., max_length=500)


class BulkAddBody(BaseModel):
    service_ids: list[str] = Field(..., max_length=500)


class CoverBody(BaseModel):
    cover_album_id: str | None


# --- Bulk ---


@router.get("/metadata/all")
def get_all_metadata(
    db=Depends(get_authed_db), sp: spotipy.Spotify = Depends(get_user_spotify)
):
    result = db.table("album_metadata").select("*").execute()
    return {row["service_id"]: {"tier": row["tier"]} for row in result.data}


# --- Tier ---


@router.put("/metadata/{album_id}/tier")
def set_tier(
    album_id: str,
    body: TierBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    result = (
        db.table("album_metadata")
        .upsert(
            {
                "service_id": album_id,
                "tier": body.tier,
                "user_id": user["user_id"],
            }
        )
        .execute()
    )
    return result.data[0]


@router.delete("/metadata/{album_id}/tier")
def clear_tier(
    album_id: str,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    result = (
        db.table("album_metadata")
        .upsert(
            {
                "service_id": album_id,
                "tier": None,
                "user_id": user["user_id"],
            }
        )
        .execute()
    )
    return result.data[0]


# --- Collections ---


@router.get("/collections")
def list_collections(
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    result = (
        db.table("collections")
        .select("*, collection_albums(count)")
        .order("position")
        .execute()
    )
    rows = []
    for row in result.data:
        count_data = row.pop("collection_albums", None)
        album_count = count_data[0]["count"] if count_data else 0
        row["album_count"] = album_count
        rows.append(row)
    return rows


@router.post("/collections", status_code=201)
def create_collection(
    body: CollectionBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    # Assign position = max(existing) + 1
    existing = (
        db.table("collections")
        .select("position")
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    next_pos = (existing.data[0]["position"] or 0) + 1 if existing.data else 0

    result = (
        db.table("collections")
        .insert({"name": body.name, "user_id": user["user_id"], "position": next_pos})
        .execute()
    )
    return result.data[0]


@router.put("/collections/reorder")
def reorder_collections(
    body: ReorderCollectionsBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    for i, collection_id in enumerate(body.collection_ids):
        db.table("collections").update({"position": i}).eq("id", collection_id).eq(
            "user_id", user_id
        ).execute()
    return {"reordered": True}


@router.delete("/collections/{collection_id}")
def delete_collection(
    collection_id: str,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
):
    db.table("collections").delete().eq("id", collection_id).execute()
    return {"deleted": True}


@router.patch("/collections/{collection_id}")
def rename_collection(
    collection_id: str,
    body: CollectionBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
):
    result = (
        db.table("collections")
        .update({"name": body.name})
        .eq("id", collection_id)
        .execute()
    )
    return result.data[0]


@router.put("/collections/{collection_id}/description")
def update_collection_description(
    collection_id: str,
    body: DescriptionBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
):
    result = (
        db.table("collections")
        .update({"description": body.description})
        .eq("id", collection_id)
        .execute()
    )
    return result.data[0]


@router.post("/collections/{collection_id}/albums", status_code=201)
def add_album_to_collection(
    collection_id: str,
    body: CollectionAlbumBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    existing = (
        db.table("collection_albums")
        .select("position")
        .eq("collection_id", collection_id)
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    next_pos = (existing.data[0]["position"] or 0) + 1 if existing.data else 0

    result = (
        db.table("collection_albums")
        .insert(
            {
                "collection_id": collection_id,
                "service_id": body.service_id,
                "position": next_pos,
                "user_id": user["user_id"],
            }
        )
        .execute()
    )
    return result.data[0]


@router.put("/collections/{collection_id}/cover")
def set_collection_cover(
    collection_id: str,
    body: CoverBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
):
    result = (
        db.table("collections")
        .update({"cover_album_id": body.cover_album_id})
        .eq("id", collection_id)
        .execute()
    )
    return result.data[0]


@router.put("/collections/{collection_id}/albums/reorder")
def reorder_collection_albums(
    collection_id: str,
    body: ReorderBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
):
    for i, album_id in enumerate(body.album_ids):
        db.table("collection_albums").update({"position": i}).eq(
            "collection_id", collection_id
        ).eq("service_id", album_id).execute()
    return {"reordered": True}


@router.post("/collections/{collection_id}/albums/bulk", status_code=201)
def bulk_add_albums_to_collection(
    collection_id: str,
    body: BulkAddBody,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
    user: dict = Depends(get_current_user),
):
    # Get current max position
    existing = (
        db.table("collection_albums")
        .select("position")
        .eq("collection_id", collection_id)
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    start_pos = (existing.data[0]["position"] or 0) + 1 if existing.data else 0

    user_id = user["user_id"]
    rows = [
        {
            "collection_id": collection_id,
            "service_id": sid,
            "position": start_pos + i,
            "user_id": user_id,
        }
        for i, sid in enumerate(body.service_ids)
    ]
    db.table("collection_albums").upsert(
        rows, on_conflict="collection_id,service_id"
    ).execute()
    # Return actual count so frontend can use authoritative number
    count = (
        db.table("collection_albums")
        .select("service_id", count="exact")
        .eq("collection_id", collection_id)
        .execute()
    )
    return {"added": len(rows), "album_count": count.count}


@router.delete("/collections/{collection_id}/albums/{album_id}")
def remove_album_from_collection(
    collection_id: str,
    album_id: str,
    db=Depends(get_authed_db),
    sp: spotipy.Spotify = Depends(get_user_spotify),
):
    db.table("collection_albums").delete().eq("collection_id", collection_id).eq(
        "service_id", album_id
    ).execute()
    return {"deleted": True}


@router.get("/collections/{collection_id}/albums")
def get_collection_albums(
    collection_id: str,
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    result = (
        db.table("collection_albums")
        .select("service_id, position")
        .eq("collection_id", collection_id)
        .order("position")
        .execute()
    )
    ordered_ids = [row["service_id"] for row in result.data]
    ids = set(ordered_ids)

    # Read library cache from Supabase. If empty, returns empty list — the
    # frontend is responsible for driving library sync via POST /library/sync
    # before requesting collection albums.
    cached_albums = library_module.get_album_cache(db, user_id=user_id)
    album_map = {a["service_id"]: a for a in cached_albums if a["service_id"] in ids}
    albums = [album_map[sid] for sid in ordered_ids if sid in album_map]
    return {"albums": albums}
