import os
import time

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient
from supabase import Client, create_client

# --- Preview-mode constants ---
# Matches frontend/src/previewMode.js PREVIEW_USER_ID. When
# VERCEL_ENV=preview, we sign in as this user via Supabase's password
# grant to obtain a real ES256-signed session JWT. The JWT is passed to
# postgrest.auth() exactly like prod requests, so RLS is enforced
# naturally — the preview user sees only their own rows.
#
# The preview user exists in the prod Supabase project (this is the
# Option B shared-DB model — see docs/specs/2026-04-11-...-design.md).
# Its email+password are created via `POST /auth/v1/admin/users` and
# the plaintext password is stored only in the Vercel preview scope
# env var PREVIEW_USER_PASSWORD.
PREVIEW_USER_ID = "00000000-0000-0000-0000-000000000001"
PREVIEW_USER_EMAIL = "preview@crate.local"

# Session cache for the preview user. Signing in on every request
# would hammer GoTrue — cache the access_token + expiry in-process and
# refresh when within 2 minutes of expiry. Reset on cold start.
_preview_session: dict | None = None


def _is_preview_env() -> bool:
    """True iff we are running on a Vercel preview deploy.

    Relies solely on the Vercel-injected VERCEL_ENV system variable,
    which Vercel sets to 'production' / 'preview' / 'development'
    based on deploy type. Cannot be overridden from the project env
    var UI for the production scope.
    """
    return os.getenv("VERCEL_ENV") == "preview"


def _get_preview_session() -> dict:
    """Sign in as the preview user, caching the session token.

    Returns a dict with at least an 'access_token' key (a real
    ES256-signed Supabase session JWT that passes JWKS verification
    in the normal auth path). Raises HTTPException if the sign-in
    fails or the password env var is missing.
    """
    global _preview_session

    now = time.time()
    if _preview_session is not None:
        expires_at = _preview_session.get("expires_at", 0)
        if now < expires_at - 120:  # 2-minute refresh buffer
            return _preview_session

    password = os.getenv("PREVIEW_USER_PASSWORD")
    if not password:
        raise HTTPException(
            status_code=500,
            detail="Preview mode: missing PREVIEW_USER_PASSWORD env var",
        )

    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    if not url or not anon_key:
        raise HTTPException(
            status_code=500,
            detail="Preview mode: missing SUPABASE_URL or SUPABASE_ANON_KEY",
        )

    client = create_client(url, anon_key)
    try:
        resp = client.auth.sign_in_with_password(
            {"email": PREVIEW_USER_EMAIL, "password": password}
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Preview mode sign-in failed: {exc}",
        ) from exc

    session = getattr(resp, "session", None)
    if session is None or not getattr(session, "access_token", None):
        raise HTTPException(
            status_code=500,
            detail="Preview mode sign-in returned no session",
        )

    _preview_session = {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        # Supabase session objects expose .expires_at as unix seconds.
        "expires_at": getattr(session, "expires_at", None) or (now + 3600),
    }
    return _preview_session


# Cache the JWKS client (fetches public keys from Supabase)
_jwks_client = None
_jwks_url = None


def _get_jwks_client():
    global _jwks_client, _jwks_url
    url = os.getenv("SUPABASE_URL")
    if not url:
        raise HTTPException(
            status_code=500, detail="Server misconfigured: missing SUPABASE_URL"
        )
    jwks_url = f"{url}/auth/v1/.well-known/jwks.json"
    if _jwks_client is None or _jwks_url != jwks_url:
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
        _jwks_url = jwks_url
    return _jwks_client


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    # Preview short-circuit: sign in as the seeded preview user and
    # return a real session JWT. RLS is enforced downstream via
    # postgrest.auth() in get_authed_db.
    if _is_preview_env():
        session = _get_preview_session()
        return {"user_id": PREVIEW_USER_ID, "token": session["access_token"]}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split(" ", 1)[1]

    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "HS256"],  # Accept both during transition
            audience="authenticated",
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")

    return {"user_id": user_id, "token": token}


async def get_authed_db(user: dict = Depends(get_current_user)) -> Client:
    """Returns a Supabase client authenticated as the requesting user (RLS applies).

    Preview mode uses the same code path as prod — the preview user's
    token is a real Supabase session JWT (see _get_preview_session),
    so postgrest.auth() enforces RLS the same way and the preview
    user only sees their own rows. No service-role shortcut.
    """
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    if not url or not anon_key:
        raise HTTPException(
            status_code=500,
            detail="Server misconfigured: missing Supabase credentials",
        )
    client = create_client(url, anon_key)
    client.postgrest.auth(user["token"])
    return client
