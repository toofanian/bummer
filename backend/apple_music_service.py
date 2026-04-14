"""Apple Music implementation of the MusicService interface.

Requires:
- Apple Developer Token (JWT signed with MusicKit private key, generated server-side)
- Music User Token (obtained client-side via MusicKit JS, stored in DB)

Apple Music API base: https://api.music.apple.com/v1/
"""

import requests

from music_service import MusicService

APPLE_MUSIC_API_BASE = "https://api.music.apple.com/v1"


def _format_duration(ms: int) -> str:
    total_seconds = ms // 1000
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes}:{seconds:02d}"


class AppleMusicService(MusicService):
    """Wraps the Apple Music REST API behind the MusicService contract.

    Playback is NOT handled here — Apple Music playback is browser-local
    via MusicKit JS. This service handles library reads and metadata only.
    """

    def __init__(self, developer_token: str, music_user_token: str):
        self._developer_token = developer_token
        self._music_user_token = music_user_token

    @property
    def service_type(self) -> str:
        return "apple_music"

    @property
    def supports_remote_playback(self) -> bool:
        return False

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._developer_token}",
            "Music-User-Token": self._music_user_token,
        }

    def get_library_albums(self) -> tuple[list[dict], int]:
        """Fetch all saved albums from user's Apple Music library."""
        all_albums = []
        url = f"{APPLE_MUSIC_API_BASE}/me/library/albums"
        params = {"limit": 100, "include": "catalog"}

        while url:
            resp = requests.get(
                url, headers=self._headers(), params=params, timeout=30
            )
            resp.raise_for_status()
            data = resp.json()

            for item in data.get("data", []):
                all_albums.append(self._normalize_album(item))

            # Pagination
            next_url = data.get("next")
            url = f"{APPLE_MUSIC_API_BASE}{next_url}" if next_url else None
            params = None  # next URL includes params

        return all_albums, len(all_albums)

    def get_album_tracks(self, album_id: str) -> list[dict]:
        """Fetch tracks for a library album."""
        url = f"{APPLE_MUSIC_API_BASE}/me/library/albums/{album_id}/tracks"
        resp = requests.get(url, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()

        tracks = []
        for i, item in enumerate(data.get("data", []), start=1):
            attrs = item.get("attributes", {})
            tracks.append(
                {
                    "service_id": item["id"],
                    "track_number": attrs.get("trackNumber", i),
                    "name": attrs.get("name", "Unknown"),
                    "duration": _format_duration(attrs.get("durationInMillis", 0)),
                    "artists": [attrs.get("artistName", "Unknown")],
                }
            )
        return tracks

    def get_album_metadata(self, album_id: str) -> dict | None:
        """Fetch metadata for a single library album."""
        try:
            url = f"{APPLE_MUSIC_API_BASE}/me/library/albums/{album_id}"
            resp = requests.get(url, headers=self._headers(), timeout=30)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("data", [])
            if not items:
                return None
            return self._normalize_album(items[0])
        except Exception:
            return None

    @staticmethod
    def _normalize_album(item: dict) -> dict:
        """Normalize an Apple Music library album to the common shape.

        Uses the catalog ID as service_id (global, stable, works in deep links)
        and stores the library ID separately for API calls that need it.
        Falls back to library ID if catalog relationship is missing.
        """
        attrs = item.get("attributes", {})
        artwork = attrs.get("artwork", {})

        # Build image URL from artwork template
        image_url = None
        if artwork.get("url"):
            image_url = (
                artwork["url"].replace("{w}", "640").replace("{h}", "640")
            )

        # Extract catalog ID from relationships (preferred — global, stable)
        library_id = item["id"]
        catalog_id = None
        catalog_data = (
            item.get("relationships", {}).get("catalog", {}).get("data", [])
        )
        if catalog_data:
            catalog_id = catalog_data[0].get("id")

        return {
            "service_id": catalog_id or library_id,
            "library_id": library_id,
            "name": attrs.get("name", "Unknown"),
            "artists": [attrs.get("artistName", "Unknown")],
            "release_date": attrs.get("releaseDate"),
            "total_tracks": attrs.get("trackCount"),
            "image_url": image_url,
            "added_at": attrs.get("dateAdded"),
            "catalog_url": (
                f"https://music.apple.com/album/{catalog_id}"
                if catalog_id
                else None
            ),
        }
