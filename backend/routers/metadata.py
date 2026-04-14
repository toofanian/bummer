from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from db import get_db

router = APIRouter(tags=["metadata"])


class TierBody(BaseModel):
    tier: Literal["S", "A", "B", "C", "D"]


class CollectionBody(BaseModel):
    name: str


class CollectionAlbumBody(BaseModel):
    spotify_id: str


# --- Bulk ---

@router.get("/metadata/all")
def get_all_metadata(db=Depends(get_db)):
    result = db.table("album_metadata").select("*").execute()
    return {row["spotify_id"]: {"tier": row["tier"]} for row in result.data}


# --- Tier ---

@router.put("/metadata/{spotify_id}/tier")
def set_tier(spotify_id: str, body: TierBody, db=Depends(get_db)):
    result = db.table("album_metadata").upsert(
        {"spotify_id": spotify_id, "tier": body.tier}
    ).execute()
    return result.data[0]


@router.delete("/metadata/{spotify_id}/tier")
def clear_tier(spotify_id: str, db=Depends(get_db)):
    result = db.table("album_metadata").upsert(
        {"spotify_id": spotify_id, "tier": None}
    ).execute()
    return result.data[0]


# --- Collections ---

@router.get("/collections")
def list_collections(db=Depends(get_db)):
    result = db.table("collections").select("*").execute()
    return result.data


@router.post("/collections", status_code=201)
def create_collection(body: CollectionBody, db=Depends(get_db)):
    result = db.table("collections").insert({"name": body.name}).execute()
    return result.data[0]


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: str, db=Depends(get_db)):
    db.table("collections").delete().eq("id", collection_id).execute()
    return {"deleted": True}


@router.post("/collections/{collection_id}/albums", status_code=201)
def add_album_to_collection(collection_id: str, body: CollectionAlbumBody, db=Depends(get_db)):
    result = db.table("collection_albums").insert(
        {"collection_id": collection_id, "spotify_id": body.spotify_id}
    ).execute()
    return result.data[0]


@router.delete("/collections/{collection_id}/albums/{spotify_id}")
def remove_album_from_collection(collection_id: str, spotify_id: str, db=Depends(get_db)):
    db.table("collection_albums").delete().eq(
        "collection_id", collection_id
    ).eq("spotify_id", spotify_id).execute()
    return {"deleted": True}
