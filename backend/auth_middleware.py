import os

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient
from supabase import Client, create_client

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


async def get_current_user(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
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
    """Returns a Supabase client authenticated as the requesting user (RLS applies)."""
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
