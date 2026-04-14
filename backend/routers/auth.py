import os

import spotipy
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse

from spotify_client import CACHE_PATH, get_oauth, get_spotify

router = APIRouter(prefix="/auth", tags=["auth"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


@router.get("/login")
def login():
    """Redirect user to Spotify's OAuth consent page."""
    auth_url = get_oauth().get_authorize_url()
    return RedirectResponse(auth_url)


@router.get("/callback")
def callback(code: str):
    """Spotify redirects here after user grants access."""
    get_oauth().get_access_token(code)
    return RedirectResponse(FRONTEND_URL)


@router.get("/status")
def status():
    """Check whether we have valid cached Spotify credentials."""
    oauth = get_oauth()
    token_info = oauth.get_cached_token()
    if token_info and not oauth.is_token_expired(token_info):
        return {"authenticated": True}
    return {"authenticated": False}


@router.post("/logout")
def logout(sp: spotipy.Spotify = Depends(get_spotify)):
    """Clear cached tokens."""
    if os.path.exists(CACHE_PATH):
        os.remove(CACHE_PATH)
    return {"authenticated": False}
