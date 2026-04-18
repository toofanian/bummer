import spotipy
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from spotify_client import get_user_spotify

router = APIRouter(prefix="/playback", tags=["playback"])


class PlayRequest(BaseModel):
    context_uri: str | None = None
    track_uri: str | None = None


class VolumeRequest(BaseModel):
    volume_percent: int = Field(..., ge=0, le=100)


class SeekRequest(BaseModel):
    position_ms: int = Field(..., ge=0)


class TransferRequest(BaseModel):
    device_id: str


def _is_no_active_device(exc: spotipy.exceptions.SpotifyException) -> bool:
    return exc.http_status == 404 and "No active device" in str(exc)


def _is_restricted_device(exc: spotipy.exceptions.SpotifyException) -> bool:
    return exc.http_status == 403 and "Restricted" in str(exc)


@router.get("/state")
def get_playback_state(sp: spotipy.Spotify = Depends(get_user_spotify)):
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
            "album_spotify_id": item["album"].get("id"),
            "artists": [a["name"] for a in item.get("artists", [])],
            "progress_ms": state.get("progress_ms"),
            "duration_ms": item.get("duration_ms"),
        },
        "device": {"name": device["name"], "type": device["type"]} if device else None,
    }


@router.put("/pause")
def pause_playback(sp: spotipy.Spotify = Depends(get_user_spotify)):
    try:
        sp.pause_playback()
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            # Nothing to pause — return 204 silently
            return Response(status_code=204)
        raise
    return Response(status_code=204)


@router.put("/play")
def play_playback(body: PlayRequest, sp: spotipy.Spotify = Depends(get_user_spotify)):
    def _start():
        if body.track_uri:
            sp.start_playback(uris=[body.track_uri])
        else:
            sp.start_playback(context_uri=body.context_uri)

    try:
        _start()
    except spotipy.exceptions.SpotifyException as e:
        if _is_restricted_device(e):
            raise HTTPException(status_code=409, detail="restricted_device")
        if _is_no_active_device(e):
            raise HTTPException(status_code=409, detail="no_device")
        raise
    return Response(status_code=204)


@router.post("/previous")
def previous_track(sp: spotipy.Spotify = Depends(get_user_spotify)):
    try:
        sp.previous_track()
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return Response(status_code=204)
        raise
    return Response(status_code=204)


@router.post("/next")
def next_track(sp: spotipy.Spotify = Depends(get_user_spotify)):
    try:
        sp.next_track()
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return Response(status_code=204)
        raise
    return Response(status_code=204)


@router.put("/volume")
def set_volume(body: VolumeRequest, sp: spotipy.Spotify = Depends(get_user_spotify)):
    try:
        sp.volume(body.volume_percent)
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return Response(status_code=204)
        raise
    return Response(status_code=204)


@router.get("/devices")
def get_devices(sp: spotipy.Spotify = Depends(get_user_spotify)):
    result = sp.devices()
    devices = result.get("devices", [])
    return [
        {
            "id": d["id"],
            "name": d["name"],
            "type": d["type"],
            "is_active": d.get("is_active", False),
        }
        for d in devices
    ]


@router.put("/seek")
def seek_playback(body: SeekRequest, sp: spotipy.Spotify = Depends(get_user_spotify)):
    try:
        sp.seek_track(body.position_ms)
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return Response(status_code=204)
        if _is_restricted_device(e):
            raise HTTPException(status_code=409, detail="restricted_device")
        raise
    return Response(status_code=204)


@router.get("/queue")
def get_queue(sp: spotipy.Spotify = Depends(get_user_spotify)):
    try:
        data = sp.queue()
    except spotipy.exceptions.SpotifyException as e:
        if _is_no_active_device(e):
            return {"currently_playing": None, "queue": []}
        raise

    if not data:
        return {"currently_playing": None, "queue": []}

    cp = data.get("currently_playing")
    currently_playing = None
    if cp:
        currently_playing = {
            "name": cp["name"],
            "artists": [a["name"] for a in cp.get("artists", [])],
            "album": cp["album"]["name"],
        }

    raw_queue = data.get("queue", [])[:20]
    queue = [
        {
            "name": item["name"],
            "artists": [a["name"] for a in item.get("artists", [])],
            "album": item["album"]["name"],
            "duration_ms": item.get("duration_ms"),
            "uri": item.get("uri"),
        }
        for item in raw_queue
    ]

    return {"currently_playing": currently_playing, "queue": queue}


@router.put("/transfer")
def transfer_playback(
    body: TransferRequest, sp: spotipy.Spotify = Depends(get_user_spotify)
):
    sp.transfer_playback(body.device_id, force_play=False)
    return Response(status_code=204)
