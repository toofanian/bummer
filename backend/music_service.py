"""Abstract interface for music streaming services.

Each concrete implementation (Spotify, Apple Music, etc.) wraps a specific
service's API behind this common contract so that routers remain
service-agnostic.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class NormalizedAlbum:
    service_id: str
    name: str
    artists: list[str]
    release_date: str | None
    total_tracks: int | None
    image_url: str | None
    added_at: str | None

    def to_dict(self) -> dict:
        return {
            "service_id": self.service_id,
            "name": self.name,
            "artists": self.artists,
            "release_date": self.release_date,
            "total_tracks": self.total_tracks,
            "image_url": self.image_url,
            "added_at": self.added_at,
        }


@dataclass
class NormalizedTrack:
    service_id: str
    track_number: int
    name: str
    duration: str
    artists: list[str]

    def to_dict(self) -> dict:
        return {
            "service_id": self.service_id,
            "track_number": self.track_number,
            "name": self.name,
            "duration": self.duration,
            "artists": self.artists,
        }


class MusicService(ABC):
    """Contract that every music service adapter must implement."""

    @abstractmethod
    def get_library_albums(self) -> tuple[list[dict], int]:
        """Fetch all saved albums.

        Returns (album_dicts, total) where each dict matches the
        NormalizedAlbum shape (uses plain dicts for JSON compatibility
        with existing caching layer).
        """
        ...

    @abstractmethod
    def get_album_tracks(self, album_id: str) -> list[dict]:
        """Fetch tracks for a single album.

        Returns list of dicts matching the NormalizedTrack shape.
        """
        ...

    @abstractmethod
    def get_album_metadata(self, album_id: str) -> dict | None:
        """Fetch metadata for a single album by its service ID.

        Returns a dict with at least: service_id, name, artists, image_url.
        Used as a fallback when the album isn't in the local cache.
        """
        ...

    @property
    @abstractmethod
    def service_type(self) -> str:
        """Return 'spotify' or 'apple_music'."""
        ...

    @property
    @abstractmethod
    def supports_remote_playback(self) -> bool:
        """Whether this service supports backend-proxied remote playback.

        Spotify Connect: True (remote control via API)
        Apple Music: False (playback is browser-local via MusicKit JS)
        """
        ...

    def get_playback_uri(self, album_id: str) -> str:
        """Build a playback URI for the given album.

        Spotify: 'spotify:album:{id}'
        Apple Music: not used (playback is client-side)
        """
        raise NotImplementedError(
            f"{self.service_type} does not support backend playback URIs"
        )

    def get_track_uri(self, track_id: str) -> str:
        """Build a playback URI for a single track."""
        raise NotImplementedError(
            f"{self.service_type} does not support backend track URIs"
        )
