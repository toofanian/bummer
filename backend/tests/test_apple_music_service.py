"""Tests for the AppleMusicService implementation."""

from unittest.mock import MagicMock, patch

import pytest

from apple_music_service import AppleMusicService


def test_apple_music_service_type():
    svc = AppleMusicService("dev-token", "user-token")
    assert svc.service_type == "apple_music"


def test_apple_music_does_not_support_remote_playback():
    svc = AppleMusicService("dev-token", "user-token")
    assert svc.supports_remote_playback is False


def test_apple_music_get_playback_uri_raises():
    svc = AppleMusicService("dev-token", "user-token")
    with pytest.raises(NotImplementedError):
        svc.get_playback_uri("album123")


def test_apple_music_get_track_uri_raises():
    svc = AppleMusicService("dev-token", "user-token")
    with pytest.raises(NotImplementedError):
        svc.get_track_uri("track123")


def test_apple_music_headers():
    svc = AppleMusicService("dev-token-abc", "user-token-xyz")
    headers = svc._headers()
    assert headers["Authorization"] == "Bearer dev-token-abc"
    assert headers["Music-User-Token"] == "user-token-xyz"


@patch("apple_music_service.requests.get")
def test_apple_music_get_library_albums(mock_get):
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [
            {
                "id": "l.ABC123",
                "attributes": {
                    "name": "1989 (Taylor's Version)",
                    "artistName": "Taylor Swift",
                    "releaseDate": "2023-10-27",
                    "trackCount": 21,
                    "artwork": {
                        "url": "https://is1-ssl.mzstatic.com/{w}x{h}.jpg",
                    },
                    "dateAdded": "2023-11-01T00:00:00Z",
                },
                "relationships": {
                    "catalog": {
                        "data": [{"id": "1440857781", "type": "albums"}]
                    }
                },
            }
        ],
        "next": None,
    }
    mock_get.return_value = mock_response

    svc = AppleMusicService("dev-token", "user-token")
    albums, total = svc.get_library_albums()

    assert total == 1
    assert len(albums) == 1
    assert albums[0]["service_id"] == "1440857781"  # catalog ID, not library ID
    assert albums[0]["library_id"] == "l.ABC123"
    assert albums[0]["name"] == "1989 (Taylor's Version)"
    assert albums[0]["artists"] == ["Taylor Swift"]
    assert albums[0]["release_date"] == "2023-10-27"
    assert albums[0]["total_tracks"] == 21
    assert "640x640" in albums[0]["image_url"]
    assert albums[0]["catalog_url"] == "https://music.apple.com/album/1440857781"


@patch("apple_music_service.requests.get")
def test_apple_music_get_library_albums_pagination(mock_get):
    page1_response = MagicMock()
    page1_response.raise_for_status = MagicMock()
    page1_response.json.return_value = {
        "data": [
            {
                "id": "l.A1",
                "attributes": {
                    "name": "Album 1",
                    "artistName": "Artist",
                    "artwork": {},
                },
                "relationships": {
                    "catalog": {"data": [{"id": "111", "type": "albums"}]}
                },
            }
        ],
        "next": "/v1/me/library/albums?offset=100",
    }

    page2_response = MagicMock()
    page2_response.raise_for_status = MagicMock()
    page2_response.json.return_value = {
        "data": [
            {
                "id": "l.A2",
                "attributes": {
                    "name": "Album 2",
                    "artistName": "Artist",
                    "artwork": {},
                },
                "relationships": {
                    "catalog": {"data": [{"id": "222", "type": "albums"}]}
                },
            }
        ],
        "next": None,
    }

    mock_get.side_effect = [page1_response, page2_response]

    svc = AppleMusicService("dev-token", "user-token")
    albums, total = svc.get_library_albums()

    assert total == 2
    assert albums[0]["service_id"] == "111"
    assert albums[1]["service_id"] == "222"


@patch("apple_music_service.requests.get")
def test_apple_music_get_album_tracks(mock_get):
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [
            {
                "id": "t.001",
                "attributes": {
                    "name": "Welcome To New York",
                    "trackNumber": 1,
                    "durationInMillis": 212000,
                    "artistName": "Taylor Swift",
                },
            },
            {
                "id": "t.002",
                "attributes": {
                    "name": "Blank Space",
                    "trackNumber": 2,
                    "durationInMillis": 231000,
                    "artistName": "Taylor Swift",
                },
            },
        ]
    }
    mock_get.return_value = mock_response

    svc = AppleMusicService("dev-token", "user-token")
    tracks = svc.get_album_tracks("l.ABC123")

    assert len(tracks) == 2
    assert tracks[0]["service_id"] == "t.001"
    assert tracks[0]["name"] == "Welcome To New York"
    assert tracks[0]["track_number"] == 1
    assert tracks[0]["duration"] == "3:32"
    assert tracks[1]["service_id"] == "t.002"


@patch("apple_music_service.requests.get")
def test_apple_music_get_album_metadata(mock_get):
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [
            {
                "id": "l.ABC123",
                "attributes": {
                    "name": "1989",
                    "artistName": "Taylor Swift",
                    "artwork": {
                        "url": "https://img/{w}x{h}.jpg",
                    },
                },
                "relationships": {
                    "catalog": {"data": [{"id": "1440857781", "type": "albums"}]}
                },
            }
        ]
    }
    mock_get.return_value = mock_response

    svc = AppleMusicService("dev-token", "user-token")
    meta = svc.get_album_metadata("l.ABC123")

    assert meta is not None
    assert meta["service_id"] == "1440857781"
    assert meta["library_id"] == "l.ABC123"
    assert meta["name"] == "1989"


@patch("apple_music_service.requests.get")
def test_apple_music_get_album_metadata_returns_none_on_error(mock_get):
    mock_get.side_effect = Exception("Network error")

    svc = AppleMusicService("dev-token", "user-token")
    meta = svc.get_album_metadata("l.ABC123")

    assert meta is None


def test_apple_music_normalize_uses_catalog_id_as_service_id():
    album = AppleMusicService._normalize_album(
        {
            "id": "l.XYZ",
            "attributes": {
                "name": "Test Album",
                "artistName": "Test Artist",
                "artwork": {},
            },
            "relationships": {
                "catalog": {"data": [{"id": "9876543", "type": "albums"}]}
            },
        }
    )
    assert album["service_id"] == "9876543"
    assert album["library_id"] == "l.XYZ"
    assert album["catalog_url"] == "https://music.apple.com/album/9876543"


def test_apple_music_normalize_falls_back_to_library_id():
    """When catalog relationship is missing, use library ID as service_id."""
    album = AppleMusicService._normalize_album(
        {
            "id": "l.NOCATALOG",
            "attributes": {
                "name": "Local Only",
                "artistName": "Unknown",
                "artwork": {},
            },
        }
    )
    assert album["service_id"] == "l.NOCATALOG"
    assert album["library_id"] == "l.NOCATALOG"
    assert album["catalog_url"] is None


def test_apple_music_normalize_album_handles_missing_artwork():
    album = AppleMusicService._normalize_album(
        {
            "id": "l.XYZ",
            "attributes": {
                "name": "No Art Album",
                "artistName": "Unknown",
                "artwork": {},
            },
        }
    )
    assert album["image_url"] is None
    assert album["service_id"] == "l.XYZ"


def test_apple_music_normalize_album_handles_missing_attributes():
    album = AppleMusicService._normalize_album(
        {
            "id": "l.MIN",
            "attributes": {},
        }
    )
    assert album["service_id"] == "l.MIN"
    assert album["name"] == "Unknown"
    assert album["artists"] == ["Unknown"]
    assert album["image_url"] is None
    assert album["catalog_url"] is None
