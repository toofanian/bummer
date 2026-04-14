from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from main import app
from spotify_client import get_spotify

client = TestClient(app)

PLAYBACK_STATE = {
    "is_playing": True,
    "progress_ms": 45000,
    "item": {
        "name": "Track One",
        "duration_ms": 240000,
        "album": {"name": "Some Album"},
        "artists": [{"name": "Artist A"}, {"name": "Artist B"}],
    },
    "device": {"name": "My Mac", "type": "Computer"},
}


def make_sp(playback=PLAYBACK_STATE):
    sp = MagicMock()
    sp.current_playback.return_value = playback
    return sp


def override_spotify(sp):
    app.dependency_overrides[get_spotify] = lambda: sp


def clear_overrides():
    app.dependency_overrides.clear()


# --- GET /playback/state ---


def test_get_playback_state_returns_simplified_shape():
    sp = make_sp()
    override_spotify(sp)

    response = client.get("/playback/state")

    assert response.status_code == 200
    data = response.json()
    assert data["is_playing"] is True
    assert data["track"]["name"] == "Track One"
    assert data["track"]["album"] == "Some Album"
    assert data["track"]["artists"] == ["Artist A", "Artist B"]
    assert data["track"]["progress_ms"] == 45000
    assert data["track"]["duration_ms"] == 240000
    assert data["device"]["name"] == "My Mac"
    assert data["device"]["type"] == "Computer"

    clear_overrides()


def test_get_playback_state_idle_when_nothing_playing():
    sp = make_sp(playback=None)
    override_spotify(sp)

    response = client.get("/playback/state")

    assert response.status_code == 200
    data = response.json()
    assert data["is_playing"] is False
    assert data["track"] is None
    assert data["device"] is None

    clear_overrides()


def test_get_playback_state_idle_when_no_item():
    sp = make_sp(playback={**PLAYBACK_STATE, "is_playing": False, "item": None})
    override_spotify(sp)

    response = client.get("/playback/state")

    assert response.status_code == 200
    data = response.json()
    assert data["is_playing"] is False
    assert data["track"] is None

    clear_overrides()


# --- PUT /playback/pause ---


def test_pause_calls_spotify_pause():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/pause")

    assert response.status_code == 204
    sp.pause_playback.assert_called_once()

    clear_overrides()


# --- PUT /playback/play ---


def test_play_resumes_without_context():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/play", json={})

    assert response.status_code == 204
    sp.start_playback.assert_called_once_with(context_uri=None)

    clear_overrides()


def test_play_with_album_context_uri():
    sp = make_sp()
    override_spotify(sp)

    response = client.put(
        "/playback/play", json={"context_uri": "spotify:album:abc123"}
    )

    assert response.status_code == 204
    sp.start_playback.assert_called_once_with(context_uri="spotify:album:abc123")

    clear_overrides()


# --- play: no active device ---


def make_no_device_error():
    import spotipy

    err = spotipy.exceptions.SpotifyException(
        http_status=404,
        code=-1,
        msg="No active device found",
    )
    return err


def test_play_no_active_device_transfers_and_retries():
    """When play raises 404 'No active device' and a device is available,
    transfer playback to that device then retry start_playback — return 204."""
    sp = make_sp()
    # First call raises; second call succeeds
    sp.start_playback.side_effect = [make_no_device_error(), None]
    sp.devices.return_value = {"devices": [{"id": "device-abc", "name": "My Mac"}]}
    override_spotify(sp)

    response = client.put("/playback/play", json={})

    assert response.status_code == 204
    sp.devices.assert_called_once()
    sp.transfer_playback.assert_called_once_with("device-abc", force_play=False)
    assert sp.start_playback.call_count == 2

    clear_overrides()


def test_play_no_active_device_no_devices_returns_409():
    """When play raises 404 'No active device' and no devices are available,
    return 409 with detail 'no_device'."""
    sp = make_sp()
    sp.start_playback.side_effect = make_no_device_error()
    sp.devices.return_value = {"devices": []}
    override_spotify(sp)

    response = client.put("/playback/play", json={})

    assert response.status_code == 409
    assert response.json()["detail"] == "no_device"

    clear_overrides()


# --- play: track_uri ---


def test_play_with_track_uri():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/play", json={"track_uri": "spotify:track:xyz789"})

    assert response.status_code == 204
    sp.start_playback.assert_called_once_with(uris=["spotify:track:xyz789"])

    clear_overrides()


def test_play_with_track_uri_no_device_transfers_and_retries():
    sp = make_sp()
    sp.start_playback.side_effect = [make_no_device_error(), None]
    sp.devices.return_value = {"devices": [{"id": "device-abc", "name": "My Mac"}]}
    override_spotify(sp)

    response = client.put("/playback/play", json={"track_uri": "spotify:track:xyz789"})

    assert response.status_code == 204
    sp.devices.assert_called_once()
    sp.transfer_playback.assert_called_once_with("device-abc", force_play=False)
    assert sp.start_playback.call_count == 2
    # Both calls used uris=
    sp.start_playback.assert_called_with(uris=["spotify:track:xyz789"])

    clear_overrides()


# --- pause: no active device ---


def test_pause_no_active_device_returns_204_silently():
    """When pause raises 404 'No active device', return 204 silently — nothing to pause."""
    sp = make_sp()
    sp.pause_playback.side_effect = make_no_device_error()
    override_spotify(sp)

    response = client.put("/playback/pause")

    assert response.status_code == 204

    clear_overrides()


# --- POST /playback/previous ---


def test_previous_calls_spotify_previous_track():
    sp = make_sp()
    override_spotify(sp)

    response = client.post("/playback/previous")

    assert response.status_code == 204
    sp.previous_track.assert_called_once()

    clear_overrides()


def test_previous_no_active_device_returns_204_silently():
    sp = make_sp()
    sp.previous_track.side_effect = make_no_device_error()
    override_spotify(sp)

    response = client.post("/playback/previous")

    assert response.status_code == 204

    clear_overrides()


# --- POST /playback/next ---


def test_next_calls_spotify_next_track():
    sp = make_sp()
    override_spotify(sp)

    response = client.post("/playback/next")

    assert response.status_code == 204
    sp.next_track.assert_called_once()

    clear_overrides()


def test_next_no_active_device_returns_204_silently():
    sp = make_sp()
    sp.next_track.side_effect = make_no_device_error()
    override_spotify(sp)

    response = client.post("/playback/next")

    assert response.status_code == 204

    clear_overrides()


# --- PUT /playback/volume ---


def test_volume_calls_spotify_volume():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/volume", json={"volume_percent": 75})

    assert response.status_code == 204
    sp.volume.assert_called_once_with(75)

    clear_overrides()


def test_volume_rejects_out_of_range_high():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/volume", json={"volume_percent": 101})

    assert response.status_code == 422

    clear_overrides()


def test_volume_rejects_out_of_range_low():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/volume", json={"volume_percent": -1})

    assert response.status_code == 422

    clear_overrides()


def test_volume_no_active_device_returns_204_silently():
    sp = make_sp()
    sp.volume.side_effect = make_no_device_error()
    override_spotify(sp)

    response = client.put("/playback/volume", json={"volume_percent": 50})

    assert response.status_code == 204

    clear_overrides()


# --- play: restricted device (403) ---


def make_restricted_device_error():
    import spotipy

    err = spotipy.exceptions.SpotifyException(
        http_status=403,
        code=-1,
        msg="Restricted device",
    )
    return err


def test_play_returns_409_restricted_device_when_spotify_raises_403():
    """When Spotify returns 403 'Restricted device', return 409 with detail 'restricted_device'."""
    sp = make_sp()
    sp.start_playback.side_effect = make_restricted_device_error()
    override_spotify(sp)

    response = client.put("/playback/play", json={})

    assert response.status_code == 409
    assert response.json()["detail"] == "restricted_device"

    clear_overrides()


def test_play_restricted_device_after_no_device_recovery_returns_409():
    """When auto-recovery succeeds (transfer) but the retry still hits 403 Restricted device,
    return 409 with detail 'restricted_device'."""
    sp = make_sp()
    sp.start_playback.side_effect = [
        make_no_device_error(),
        make_restricted_device_error(),
    ]
    sp.devices.return_value = {"devices": [{"id": "device-abc", "name": "Sonos"}]}
    override_spotify(sp)

    response = client.put("/playback/play", json={})

    assert response.status_code == 409
    assert response.json()["detail"] == "restricted_device"

    clear_overrides()


# --- GET /playback/devices ---


def test_get_devices_returns_device_list():
    sp = make_sp()
    sp.devices.return_value = {
        "devices": [
            {
                "id": "abc123",
                "name": "Alex's iPhone",
                "type": "Smartphone",
                "is_active": True,
            },
            {"id": "def456", "name": "My Mac", "type": "Computer", "is_active": False},
        ]
    }
    override_spotify(sp)

    response = client.get("/playback/devices")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0] == {
        "id": "abc123",
        "name": "Alex's iPhone",
        "type": "Smartphone",
        "is_active": True,
    }
    assert data[1] == {
        "id": "def456",
        "name": "My Mac",
        "type": "Computer",
        "is_active": False,
    }

    clear_overrides()


def test_get_devices_returns_empty_list_when_no_devices():
    sp = make_sp()
    sp.devices.return_value = {"devices": []}
    override_spotify(sp)

    response = client.get("/playback/devices")

    assert response.status_code == 200
    assert response.json() == []

    clear_overrides()


# --- PUT /playback/transfer ---


def test_transfer_playback_calls_spotify_transfer():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/transfer", json={"device_id": "abc123"})

    assert response.status_code == 204
    sp.transfer_playback.assert_called_once_with("abc123", force_play=True)

    clear_overrides()


def test_transfer_playback_missing_device_id_returns_422():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/transfer", json={})

    assert response.status_code == 422

    clear_overrides()
