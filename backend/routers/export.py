import csv
import io
import json
import zipfile
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from auth_middleware import get_authed_db, get_current_user

router = APIRouter(tags=["export"])


@router.get("/export")
def export_library(user=Depends(get_current_user), db=Depends(get_authed_db)):
    # Fetch all user data
    cache_rows = (
        db.table("library_cache")
        .select("albums")
        .eq("id", user["user_id"])
        .execute()
        .data
    )
    albums = cache_rows[0]["albums"] if cache_rows else []

    collections = db.table("collections").select("*").execute().data or []
    collection_albums = db.table("collection_albums").select("*").execute().data or []
    tiers = db.table("album_metadata").select("service_id,tier").execute().data or []

    tier_map = {t["service_id"]: t["tier"] for t in tiers}
    collection_map = {c["id"]: c["name"] for c in collections}

    # Build album lookup for collection_albums CSV
    # library_cache stores normalized albums (service_id, name, artists as string list)
    album_lookup = {}
    flat_albums = []
    for item in albums:
        spotify_id = item["service_id"]
        artists = item.get("artists", [])
        artist = ", ".join(artists) if isinstance(artists, list) else str(artists)
        flat = {
            "title": item["name"],
            "artist": artist,
            "release_date": item.get("release_date", ""),
            "spotify_id": spotify_id,
            "added_at": item.get("added_at", ""),
            "tier": tier_map.get(spotify_id, ""),
        }
        flat_albums.append(flat)
        album_lookup[spotify_id] = flat

    # Build ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # albums.csv
        albums_csv = io.StringIO()
        writer = csv.DictWriter(
            albums_csv,
            fieldnames=["title", "artist", "release_date", "spotify_id", "added_at", "tier"],
        )
        writer.writeheader()
        writer.writerows(flat_albums)
        zf.writestr("albums.csv", albums_csv.getvalue())

        # collections.csv
        coll_csv = io.StringIO()
        writer = csv.DictWriter(
            coll_csv, fieldnames=["name", "description", "created_at"]
        )
        writer.writeheader()
        for c in collections:
            writer.writerow({
                "name": c["name"],
                "description": c.get("description", ""),
                "created_at": c.get("created_at", ""),
            })
        zf.writestr("collections.csv", coll_csv.getvalue())

        # collection_albums.csv
        ca_csv = io.StringIO()
        writer = csv.DictWriter(
            ca_csv,
            fieldnames=["collection_name", "album_title", "spotify_id", "position"],
        )
        writer.writeheader()
        for ca in collection_albums:
            sid = ca["service_id"]
            writer.writerow({
                "collection_name": collection_map.get(ca["collection_id"], ""),
                "album_title": album_lookup.get(sid, {}).get("title", ""),
                "spotify_id": sid,
                "position": ca["position"],
            })
        zf.writestr("collection_albums.csv", ca_csv.getvalue())

        # export.json
        export_data = {
            "albums": flat_albums,
            "collections": [
                {
                    "name": c["name"],
                    "description": c.get("description", ""),
                    "created_at": c.get("created_at", ""),
                    "albums": [
                        {
                            "spotify_id": ca["service_id"],
                            "title": album_lookup.get(ca["service_id"], {}).get("title", ""),
                            "position": ca["position"],
                        }
                        for ca in collection_albums
                        if ca["collection_id"] == c["id"]
                    ],
                }
                for c in collections
            ],
        }
        zf.writestr("export.json", json.dumps(export_data, indent=2))

    buf.seek(0)
    filename = f"bummer-export-{date.today().isoformat()}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
