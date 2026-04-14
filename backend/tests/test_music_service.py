"""Tests for the MusicService abstraction and SpotifyService implementation."""

from unittest.mock import MagicMock

from spotify_service import SpotifyService


def test_spotify_service_type():
    sp = MagicMock()
    svc = SpotifyService(sp)
    assert svc.service_type == "spotify"


def test_spotify_service_supports_remote_playback():
    sp = MagicMock()
    svc = SpotifyService(sp)
    assert svc.supports_remote_playback is True


def test_spotify_service_get_playback_uri():
    sp = MagicMock()
    svc = SpotifyService(sp)
    assert svc.get_playback_uri("abc123") == "spotify:album:abc123"


def test_spotify_service_get_track_uri():
    sp = MagicMock()
    svc = SpotifyService(sp)
    assert svc.get_track_uri("xyz789") == "spotify:track:xyz789"


def test_spotify_service_exposes_raw_sp():
    sp = MagicMock()
    svc = SpotifyService(sp)
    assert svc.sp is sp


def test_spotify_service_get_library_albums():
    sp = MagicMock()
    sp.current_user_saved_albums.return_value = {
        "total": 1,
        "items": [
            {
                "album": {
                    "id": "abc123",
                    "name": "Love Deluxe",
                    "artists": [{"name": "Sade"}],
                    "release_date": "1992-10-26",
                    "total_tracks": 8,
                    "images": [{"url": "https://img/1.jpg", "height": 640}],
                },
                "added_at": "2024-01-01T00:00:00Z",
            }
        ],
        "next": None,
    }

    svc = SpotifyService(sp)
    albums, total = svc.get_library_albums()

    assert total == 1
    assert len(albums) == 1
    assert albums[0]["service_id"] == "abc123"
    assert albums[0]["name"] == "Love Deluxe"
    assert albums[0]["artists"] == ["Sade"]
    assert albums[0]["image_url"] == "https://img/1.jpg"


def test_spotify_service_get_album_tracks():
    sp = MagicMock()
    sp.album_tracks.return_value = {
        "items": [
            {
                "id": "track1",
                "track_number": 1,
                "name": "No Ordinary Love",
                "duration_ms": 265000,
                "artists": [{"name": "Sade"}],
            },
            {
                "id": "track2",
                "track_number": 2,
                "name": "Feel No Pain",
                "duration_ms": 342000,
                "artists": [{"name": "Sade"}],
            },
        ],
        "next": None,
    }

    svc = SpotifyService(sp)
    tracks = svc.get_album_tracks("abc123")

    assert len(tracks) == 2
    assert tracks[0]["service_id"] == "track1"
    assert tracks[0]["name"] == "No Ordinary Love"
    assert tracks[0]["duration"] == "4:25"
    assert tracks[1]["service_id"] == "track2"


def test_spotify_service_get_album_metadata():
    sp = MagicMock()
    sp.album.return_value = {
        "name": "Love Deluxe",
        "artists": [{"name": "Sade"}],
        "images": [{"url": "https://img/1.jpg", "height": 640}],
    }

    svc = SpotifyService(sp)
    meta = svc.get_album_metadata("abc123")

    assert meta is not None
    assert meta["service_id"] == "abc123"
    assert meta["name"] == "Love Deluxe"
    assert meta["artists"] == ["Sade"]
    assert meta["image_url"] == "https://img/1.jpg"


def test_spotify_service_get_album_metadata_returns_none_on_error():
    sp = MagicMock()
    sp.album.side_effect = Exception("Not found")

    svc = SpotifyService(sp)
    meta = svc.get_album_metadata("abc123")

    assert meta is None


def test_spotify_service_normalize_album_handles_missing_images():
    sp = MagicMock()
    sp.current_user_saved_albums.return_value = {
        "total": 1,
        "items": [
            {
                "album": {
                    "id": "abc123",
                    "name": "Test Album",
                    "artists": [],
                    "images": [],
                },
                "added_at": None,
            }
        ],
        "next": None,
    }

    svc = SpotifyService(sp)
    albums, _ = svc.get_library_albums()

    assert albums[0]["image_url"] is None
    assert albums[0]["artists"] == []
