"""Spotify implementation of the MusicService interface."""

import spotipy

from music_service import MusicService


def _format_duration(ms: int) -> str:
    total_seconds = ms // 1000
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes}:{seconds:02d}"


class SpotifyService(MusicService):
    """Wraps spotipy.Spotify behind the MusicService contract."""

    def __init__(self, sp: spotipy.Spotify):
        self._sp = sp

    @property
    def sp(self) -> spotipy.Spotify:
        """Expose the raw spotipy client for Spotify-specific operations
        (playback, devices) that don't go through the generic interface."""
        return self._sp

    @property
    def service_type(self) -> str:
        return "spotify"

    @property
    def supports_remote_playback(self) -> bool:
        return True

    def get_playback_uri(self, album_id: str) -> str:
        return f"spotify:album:{album_id}"

    def get_track_uri(self, track_id: str) -> str:
        return f"spotify:track:{track_id}"

    def get_library_albums(self) -> tuple[list[dict], int]:
        all_items = []
        total = None
        offset = 0
        limit = 50

        while total is None or offset < total:
            result = self._sp.current_user_saved_albums(limit=limit, offset=offset)
            total = result["total"]
            all_items.extend(result["items"])
            offset += len(result["items"])
            if not result["next"]:
                break

        albums = [self._normalize_album(item) for item in all_items]
        return albums, total

    def get_album_tracks(self, album_id: str) -> list[dict]:
        all_tracks = []
        result = self._sp.album_tracks(album_id, limit=50)
        while True:
            all_tracks.extend(result["items"])
            if not result["next"]:
                break
            result = self._sp.album_tracks(album_id, limit=50, offset=len(all_tracks))

        return [
            {
                "service_id": t["id"],
                "track_number": t["track_number"],
                "name": t["name"],
                "duration": _format_duration(t["duration_ms"]),
                "artists": [a["name"] for a in t.get("artists", [])],
            }
            for t in all_tracks
        ]

    def get_album_metadata(self, album_id: str) -> dict | None:
        try:
            album = self._sp.album(album_id)
            images = album.get("images", [])
            largest = max(images, key=lambda i: i.get("height", 0), default=None)
            return {
                "service_id": album_id,
                "name": album["name"],
                "artists": [a["name"] for a in album.get("artists", [])],
                "image_url": largest["url"] if largest else None,
            }
        except Exception:
            return None

    @staticmethod
    def _normalize_album(item: dict) -> dict:
        album = item["album"]
        images = album.get("images", [])
        largest_image = max(
            images, key=lambda i: i.get("height") or 0, default=None
        )
        return {
            "service_id": album["id"],
            "name": album["name"],
            "artists": [a["name"] for a in album.get("artists", [])],
            "release_date": album.get("release_date"),
            "total_tracks": album.get("total_tracks"),
            "image_url": largest_image["url"] if largest_image else None,
            "added_at": item.get("added_at"),
        }
