import spotipy
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from spotify_client import get_spotify

router = APIRouter(prefix="/playback", tags=["playback"])


class PlayRequest(BaseModel):
    context_uri: str | None = None
    track_uri: str | None = None


class VolumeRequest(BaseModel):
    volume_percent: int = Field(..., ge=0, le=100)


def _is_no_active_device(exc: spotipy.exceptions.SpotifyException) -> bool:
    return exc.http_status == 404 and "No active device" in str(exc)


@router.get("/state")
def get_playback_state(sp: spotipy.Spotify = Depends(get_spotify)):
    state = sp.current_playback()

    if not state or not state.get("item"):
        return {"is_playing": False, "track": None, "device": None}

    item = state["item"]
    device = state.get("device")

    return {
        "is_playing": state.get("is_playing", False),
        "track": {
            "name": item["name"],
            "album": item["album"]["name"],
            "artists": [a["name"] for a in item.get("artists", [])],
            "progress_ms": state.get("progress_ms"),
            "duration_ms": item.get("duration_ms"),
        },
        "device": {"name": device["name"], "type": device["type"]} if device else None,
    }


@router.put("/pause")
def pause_playback(sp: spotipy.Spotify = Depends(get_spotify)):
    try:
        sp.pause_playback()
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            # Nothing to pause — return 204 silently
            return Response(status_code=204)
        raise
    return Response(status_code=204)


@router.put("/play")
def play_playback(body: PlayRequest, sp: spotipy.Spotify = Depends(get_spotify)):
    def _start():
        if body.track_uri:
            sp.start_playback(uris=[body.track_uri])
        else:
            sp.start_playback(context_uri=body.context_uri)

    try:
        _start()
    except spotipy.exceptions.SpotifyException as e:
        if not _is_no_active_device(e):
            raise
        # Auto-recover: find an available device and transfer playback to it
        result = sp.devices()
        devices = result.get("devices", [])
        if not devices:
            raise HTTPException(status_code=409, detail="no_device")
        sp.transfer_playback(devices[0]["id"], force_play=False)
        _start()
    return Response(status_code=204)


@router.post("/previous")
def previous_track(sp: spotipy.Spotify = Depends(get_spotify)):
    try:
        sp.previous_track()
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return Response(status_code=204)
        raise
    return Response(status_code=204)


@router.post("/next")
def next_track(sp: spotipy.Spotify = Depends(get_spotify)):
    try:
        sp.next_track()
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return Response(status_code=204)
        raise
    return Response(status_code=204)


@router.put("/volume")
def set_volume(body: VolumeRequest, sp: spotipy.Spotify = Depends(get_spotify)):
    try:
        sp.volume(body.volume_percent)
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return Response(status_code=204)
        raise
    return Response(status_code=204)
