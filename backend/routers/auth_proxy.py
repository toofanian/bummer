"""Spotify OAuth callback proxy for Vercel preview deploys.

Allows preview deploys (with dynamic URLs) to use real Spotify authentication
by routing OAuth through the prod domain's stable redirect URI.
"""

import base64
import hashlib
import hmac as hmac_mod
import json
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from db import get_service_db

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])

# Spotify scopes needed for Bummer
_SPOTIFY_SCOPES = (
    "user-library-read "
    "user-read-playback-state "
    "user-modify-playback-state "
    "user-read-currently-playing"
)

# Only allow Vercel preview deploy origins for this project
_ORIGIN_RE = re.compile(r"^https://[a-z0-9-]+-toofanians-projects\.vercel\.app$")


def _get_proxy_config() -> tuple[str, str]:
    """Return (secret, redirect_uri) or raise 501 if not configured."""
    secret = os.getenv("SPOTIFY_PROXY_SECRET", "")
    redirect_uri = os.getenv("SPOTIFY_PROXY_REDIRECT_URI", "")
    if not secret or not redirect_uri:
        raise HTTPException(status_code=501, detail="Spotify proxy not configured")
    return secret, redirect_uri


def _validate_origin(origin: str) -> None:
    """Raise 400 if origin doesn't match the allowed pattern."""
    if not _ORIGIN_RE.match(origin):
        raise HTTPException(status_code=400, detail="Invalid origin")


def _b64url_encode(data: bytes) -> str:
    """Base64url encode without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    """Base64url decode with padding restoration."""
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _sign_state(payload_dict: dict, secret: str) -> str:
    """JSON-serialize, HMAC-sign, and encode state as base64url.sig."""
    payload_json = json.dumps(payload_dict, separators=(",", ":"), sort_keys=True)
    payload_b64 = _b64url_encode(payload_json.encode())
    sig = hmac_mod.new(
        secret.encode(), payload_json.encode(), hashlib.sha256
    ).hexdigest()
    return f"{payload_b64}.{sig}"


def _verify_state(state: str, secret: str) -> dict:
    """Decode and verify a signed state string. Returns the payload dict."""
    parts = state.split(".", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Malformed state")

    payload_b64, sig_hex = parts
    try:
        payload_json = _b64url_decode(payload_b64).decode()
        payload = json.loads(payload_json)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed state payload")

    # Recompute HMAC and compare constant-time
    expected_sig = hmac_mod.new(
        secret.encode(), payload_json.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac_mod.compare_digest(sig_hex, expected_sig):
        raise HTTPException(status_code=400, detail="Invalid state signature")

    # Check timestamp freshness (10 min window)
    ts = payload.get("ts", 0)
    if abs(time.time() - ts) > 600:
        raise HTTPException(status_code=400, detail="State expired")

    # Validate origin in payload
    origin = payload.get("origin", "")
    _validate_origin(origin)

    return payload


def verify_supabase_jwt(token: str) -> str:
    """Verify a Supabase JWT and return the user_id (sub claim).

    Reuses the JWKS client from auth_middleware.
    """
    import jwt as pyjwt

    from auth_middleware import _get_jwks_client

    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "HS256"],
            audience="authenticated",
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")
    return user_id


# ---------------------------------------------------------------------------
# Endpoint 1: GET /auth/preview-login
# ---------------------------------------------------------------------------


@router.get("/preview-login")
@limiter.limit("5/minute")
async def preview_login(
    request: Request,
    origin: str = Query(...),
    client_id: str = Query(...),
    supabase_token: str = Query(...),
):
    """Initiate Spotify OAuth for a preview deploy.

    Generates PKCE + signed state and redirects to Spotify's authorize endpoint.
    """
    secret, redirect_uri = _get_proxy_config()

    _validate_origin(origin)

    # Verify the Supabase JWT to get the user_id
    try:
        user_id = verify_supabase_jwt(supabase_token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Supabase token")

    # Generate PKCE
    verifier_bytes = secrets.token_bytes(64)
    verifier = _b64url_encode(verifier_bytes)
    challenge = _b64url_encode(hashlib.sha256(verifier.encode()).digest())

    # Build signed state
    state_payload = {
        "origin": origin,
        "user_id": user_id,
        "client_id": client_id,
        "verifier": verifier,
        "ts": int(time.time()),
    }
    state = _sign_state(state_payload, secret)

    # Build Spotify authorize URL
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": _SPOTIFY_SCOPES,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
        "state": state,
    }
    spotify_url = f"https://accounts.spotify.com/authorize?{urlencode(params)}"
    return RedirectResponse(url=spotify_url, status_code=302)


# ---------------------------------------------------------------------------
# Endpoint 2: GET /auth/callback-proxy
# ---------------------------------------------------------------------------


@router.get("/callback-proxy")
@limiter.limit("10/minute")
async def callback_proxy(
    request: Request,
    code: str | None = Query(default=None),
    state: str = Query(...),
    error: str | None = Query(default=None),
):
    """Receive Spotify's OAuth callback, exchange code for tokens, redirect to preview."""
    secret, redirect_uri = _get_proxy_config()

    # Attempt to extract origin from state for error redirects
    # (best effort — if state is totally broken we return 400)
    payload = _verify_state(state, secret)
    origin = payload["origin"]

    # Handle Spotify error
    if error:
        return RedirectResponse(
            url=f"{origin}/?spotify_error={error}",
            status_code=302,
        )

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    # Exchange code for tokens
    token_response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": payload["client_id"],
            "code_verifier": payload["verifier"],
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    token_response.raise_for_status()
    tokens = token_response.json()

    # Store tokens in Supabase
    now = datetime.now(timezone.utc)
    db = get_service_db()
    db.table("music_tokens").upsert(
        {
            "user_id": payload["user_id"],
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "expires_at": (now + timedelta(seconds=tokens["expires_in"])).isoformat(),
            "client_id": payload["client_id"],
            "updated_at": now.isoformat(),
        }
    ).execute()

    # Redirect back to preview
    return RedirectResponse(
        url=f"{origin}/auth/spotify/callback?proxy_success=true",
        status_code=302,
    )
