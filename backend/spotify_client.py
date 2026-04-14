import os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from fastapi import HTTPException

SCOPES = [
    "user-library-read",            # read saved albums/tracks
    "user-read-playback-state",     # read current playback
    "user-modify-playback-state",   # control playback (Premium)
    "user-read-currently-playing",
    "playlist-read-private",
    "playlist-read-collaborative",
]

CACHE_PATH = ".spotify_cache"


def get_oauth() -> SpotifyOAuth:
    return SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=" ".join(SCOPES),
        cache_path=CACHE_PATH,
    )


def get_spotify() -> spotipy.Spotify:
    """FastAPI dependency — returns an authenticated Spotify client."""
    oauth = get_oauth()
    token_info = oauth.get_cached_token()

    if not token_info:
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")

    if oauth.is_token_expired(token_info):
        token_info = oauth.refresh_access_token(token_info["refresh_token"])

    return spotipy.Spotify(auth=token_info["access_token"])
