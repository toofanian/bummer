# Multi-User Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Crate from a single-user app into an invite-only multi-user app where each user authenticates via Supabase Auth (magic link) and brings their own Spotify developer app credentials (BYOK via PKCE — no client secret needed).

**Architecture:** Supabase Auth handles Crate sessions; RLS policies enforce per-user data isolation at the DB layer. The backend validates Supabase JWTs on every request and creates per-request authenticated Supabase clients so RLS applies automatically. Spotify OAuth is driven entirely by the frontend via PKCE; the backend loads Spotify tokens from the `spotify_tokens` table per user.

**Tech Stack:** FastAPI (Python 3.12), supabase-py 2.x, PyJWT, spotipy, React + Vite, @supabase/supabase-js, Web Crypto API (PKCE), Vitest, pytest

---

## File Map

### Backend — new/modified

| File | Action | Purpose |
|------|--------|---------|
| `backend/auth_middleware.py` | **Create** | JWT verification + FastAPI dependencies (`get_current_user`, `get_authed_db`, `get_user_spotify`) |
| `backend/db.py` | **Modify** | Add `get_service_db()` (service key) alongside existing; add `get_authed_client(token)` |
| `backend/spotify_client.py` | **Rewrite** | Per-user token loading from `spotify_tokens`, PKCE refresh, remove file cache |
| `backend/routers/auth.py` | **Rewrite** | Remove Spotify OAuth flow; add `/auth/redeem-invite`, `/auth/spotify-token` (POST/DELETE) |
| `backend/routers/library.py` | **Modify** | Swap `Depends(get_db)` → `Depends(get_authed_db)` |
| `backend/routers/metadata.py` | **Modify** | Same |
| `backend/routers/home.py` | **Modify** | Same |
| `backend/routers/digest.py` | **Modify** | Same |
| `backend/routers/playback.py` | **Modify** | Add auth dependency; swap to per-user Spotify client |
| `backend/migrations/007_multi_user.sql` | **Create** | Wipe existing data; add `user_id` to all tables; new tables; RLS policies |
| `backend/scripts/generate_invite.py` | **Create** | CLI to insert invite codes |
| `backend/tests/test_auth_middleware.py` | **Create** | JWT validation tests |
| `backend/tests/test_auth.py` | **Rewrite** | Tests for new invite + token endpoints |
| `backend/tests/test_spotify_client.py` | **Create** | Per-user token load + refresh tests |

### Frontend — new/modified

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/supabaseClient.js` | **Create** | Singleton Supabase JS client |
| `frontend/src/hooks/useAuth.js` | **Create** | Supabase Auth session management (Crate login state) |
| `frontend/src/hooks/useSpotifyAuth.js` | **Create** | PKCE Spotify OAuth flow |
| `frontend/src/hooks/useAuth.test.js` | **Create** | Auth hook tests |
| `frontend/src/hooks/useSpotifyAuth.test.js` | **Create** | PKCE hook tests |
| `frontend/src/components/SignupScreen.jsx` | **Create** | Email + invite code form; magic link flow |
| `frontend/src/components/SignupScreen.test.jsx` | **Create** | Signup form tests |
| `frontend/src/components/OnboardingWizard.jsx` | **Create** | Post-login BYOK setup (client_id entry, Spotify OAuth, consent) |
| `frontend/src/components/OnboardingWizard.test.jsx` | **Create** | Onboarding tests |
| `frontend/src/App.jsx` | **Modify** | Auth gate: session check → show SignupScreen / OnboardingWizard / main app |

---

## Task 1: Write DB migration

**Files:**
- Create: `backend/migrations/007_multi_user.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- backend/migrations/007_multi_user.sql
-- Phase 1: Wipe existing data (no migration — fresh start)
TRUNCATE TABLE play_history, library_snapshots, library_cache,
               collection_albums, collections, album_metadata
               RESTART IDENTITY CASCADE;

-- Phase 2: Add user_id to existing tables
ALTER TABLE album_metadata
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE collections
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE collection_albums
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE library_cache
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE library_snapshots
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE play_history
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

-- Phase 3: New tables
CREATE TABLE IF NOT EXISTS invite_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  redeemed_by UUID REFERENCES auth.users(id),
  redeemed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id),
  invite_code_used TEXT REFERENCES invite_codes(code),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spotify_tokens (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id),
  client_id     TEXT NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Phase 4: RLS policies
-- Enable RLS on all tables
ALTER TABLE album_metadata    ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_tokens    ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname
           FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Per-user isolation policy on all tables with user_id
CREATE POLICY user_isolation ON album_metadata
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON collections
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON collection_albums
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON library_cache
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON library_snapshots
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON play_history
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- invite_codes: only the redeemer can see their own row
CREATE POLICY user_isolation ON invite_codes
  USING (redeemed_by = auth.uid() OR redeemed_by IS NULL);

-- profiles: users see only their own
CREATE POLICY user_isolation ON profiles
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- spotify_tokens: users see only their own
CREATE POLICY user_isolation ON spotify_tokens
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Apply migration in Supabase dashboard**

Go to Supabase → SQL Editor → paste the contents of `007_multi_user.sql` → Run.

> **WARNING:** This TRUNCATES all existing data. Verify you are OK losing current library/collections data before running.

- [ ] **Step 3: Verify tables have user_id column**

In Supabase Table Editor, confirm `album_metadata`, `collections`, `library_cache`, etc. show a `user_id` column. Confirm `invite_codes`, `profiles`, `spotify_tokens` tables exist.

- [ ] **Step 4: Commit migration file**

```bash
cd /path/to/crate.feat-multi-user-pivot
git add backend/migrations/007_multi_user.sql
git commit -m "feat: add multi-user DB migration"
```

---

## Task 2: Add backend auth middleware

**Files:**
- Create: `backend/auth_middleware.py`
- Create: `backend/tests/test_auth_middleware.py`

- [ ] **Step 1: Verify PyJWT is installed**

```bash
cd backend && source .venv/bin/activate
python -c "import jwt; print(jwt.__version__)"
```

If not installed: `pip install PyJWT && pip freeze > requirements.txt`

- [ ] **Step 2: Add SUPABASE_JWT_SECRET and SUPABASE_ANON_KEY to .env**

Open `backend/.env` and add:
```
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

Find these in: Supabase Dashboard → Project Settings → API.
- JWT Secret: under "JWT Settings"
- Anon key: under "Project API keys"

Also add to `backend/.env.example`:
```
SUPABASE_JWT_SECRET=your-jwt-secret-here
SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 3: Write the failing tests**

```python
# backend/tests/test_auth_middleware.py
import time
import pytest
import jwt as pyjwt
from unittest.mock import patch, MagicMock
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from auth_middleware import get_current_user, get_authed_db

JWT_SECRET = "test-secret"
ALGORITHM = "HS256"

def make_token(user_id="user-123", exp_offset=3600, audience="authenticated"):
    payload = {
        "sub": user_id,
        "exp": int(time.time()) + exp_offset,
        "aud": audience,
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


# ---- get_current_user ----

def test_get_current_user_valid_token():
    token = make_token()
    with patch.dict("os.environ", {"SUPABASE_JWT_SECRET": JWT_SECRET}):
        from auth_middleware import get_current_user as _get
        import asyncio
        result = asyncio.run(_get(authorization=f"Bearer {token}"))
    assert result["user_id"] == "user-123"
    assert result["token"] == token


def test_get_current_user_expired_token():
    from fastapi import HTTPException
    token = make_token(exp_offset=-1)
    with patch.dict("os.environ", {"SUPABASE_JWT_SECRET": JWT_SECRET}):
        from auth_middleware import get_current_user as _get
        import asyncio
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_get(authorization=f"Bearer {token}"))
    assert exc_info.value.status_code == 401


def test_get_current_user_missing_bearer():
    from fastapi import HTTPException
    with patch.dict("os.environ", {"SUPABASE_JWT_SECRET": JWT_SECRET}):
        from auth_middleware import get_current_user as _get
        import asyncio
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_get(authorization="not-a-bearer-token"))
    assert exc_info.value.status_code == 401


def test_get_current_user_wrong_secret():
    from fastapi import HTTPException
    token = pyjwt.encode(
        {"sub": "x", "exp": int(time.time()) + 3600, "aud": "authenticated"},
        "wrong-secret", algorithm="HS256"
    )
    with patch.dict("os.environ", {"SUPABASE_JWT_SECRET": JWT_SECRET}):
        from auth_middleware import get_current_user as _get
        import asyncio
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_get(authorization=f"Bearer {token}"))
    assert exc_info.value.status_code == 401
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_auth_middleware.py -v
```

Expected: `ModuleNotFoundError: No module named 'auth_middleware'`

- [ ] **Step 5: Write auth_middleware.py**

```python
# backend/auth_middleware.py
import os
import jwt as pyjwt
from fastapi import Header, HTTPException, Depends
from supabase import create_client, Client


def verify_supabase_jwt(token: str) -> dict:
    secret = os.getenv("SUPABASE_JWT_SECRET")
    return pyjwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        audience="authenticated",
    )


async def get_current_user(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    try:
        payload = verify_supabase_jwt(token)
        return {"user_id": payload["sub"], "token": token}
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_authed_db(user: dict = Depends(get_current_user)) -> Client:
    """Returns a Supabase client authenticated as the requesting user (RLS applies)."""
    client = create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_ANON_KEY"),
    )
    client.postgrest.auth(user["token"])
    return client
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pytest tests/test_auth_middleware.py -v
```

Expected: 4 PASSED

- [ ] **Step 7: Commit**

```bash
git add backend/auth_middleware.py backend/tests/test_auth_middleware.py backend/.env.example
git commit -m "feat: add JWT validation middleware and auth dependencies"
```

---

## Task 3: Update db.py

**Files:**
- Modify: `backend/db.py`

- [ ] **Step 1: Read current db.py**

```bash
cat backend/db.py
```

- [ ] **Step 2: Rewrite db.py**

```python
# backend/db.py
import os
from supabase import Client, create_client

_service_client: Client | None = None


def get_service_db() -> Client:
    """Returns a Supabase client using the service role key (bypasses RLS).
    Use only for admin operations: background sync, invite generation, token storage by backend."""
    global _service_client
    if _service_client is None:
        _service_client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_KEY"),
        )
    return _service_client


# Keep get_db as an alias for backwards compat during migration
def get_db() -> Client:
    return get_service_db()
```

> Note: `get_db()` is kept as an alias so existing code continues to work. We'll replace call sites with `get_authed_db` (from auth_middleware) in subsequent tasks.

- [ ] **Step 3: Run existing db tests to confirm nothing broke**

```bash
cd backend && pytest tests/test_db.py -v
```

Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/db.py
git commit -m "feat: add get_service_db, keep get_db alias for migration"
```

---

## Task 4: Rewrite spotify_client.py

**Files:**
- Modify: `backend/spotify_client.py`
- Create: `backend/tests/test_spotify_client.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_spotify_client.py
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
import requests


def make_db_with_token(expired=False, has_refresh=True):
    """Returns a mock Supabase client with a spotify_tokens row."""
    expires_at = datetime.now(timezone.utc) + (
        timedelta(seconds=-10) if expired else timedelta(seconds=3600)
    )
    token_row = {
        "user_id": "user-123",
        "client_id": "test-client-id",
        "access_token": "test-access-token",
        "refresh_token": "test-refresh-token" if has_refresh else None,
        "expires_at": expires_at.isoformat(),
    }
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [token_row]
    return mock_db, token_row


def test_get_spotify_for_user_valid_token():
    from spotify_client import get_spotify_for_user
    db, _ = make_db_with_token()
    result = get_spotify_for_user("user-123", db)
    assert result is not None  # returns spotipy.Spotify instance


def test_get_spotify_for_user_no_tokens_raises():
    from fastapi import HTTPException
    from spotify_client import get_spotify_for_user
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(HTTPException) as exc_info:
        get_spotify_for_user("user-123", mock_db)
    assert exc_info.value.status_code == 401


def test_get_spotify_for_user_refreshes_expired_token():
    from spotify_client import get_spotify_for_user
    db, _ = make_db_with_token(expired=True)
    new_token_response = {
        "access_token": "new-access-token",
        "expires_in": 3600,
    }
    mock_response = MagicMock()
    mock_response.json.return_value = new_token_response
    mock_response.raise_for_status = MagicMock()

    with patch("spotify_client.requests.post", return_value=mock_response):
        result = get_spotify_for_user("user-123", db)

    # Confirm update was called on db
    db.table.return_value.update.assert_called_once()
    assert result is not None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_spotify_client.py -v
```

Expected: `ImportError` or test failures (current spotify_client.py has different interface)

- [ ] **Step 3: Rewrite spotify_client.py**

```python
# backend/spotify_client.py
import os
import requests
import spotipy
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends
from supabase import Client

from db import get_service_db
from auth_middleware import get_current_user

SCOPES = [
    "user-library-read",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
]


def get_spotify_for_user(user_id: str, db: Client) -> spotipy.Spotify:
    """Load Spotify client for a user from stored tokens. Refreshes if expired."""
    result = db.table("spotify_tokens").select("*").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="No Spotify credentials found. Complete onboarding first.")

    token_data = result.data[0]
    expires_at = datetime.fromisoformat(token_data["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > expires_at - timedelta(minutes=5):
        token_data = _refresh_token(user_id, token_data, db)

    return spotipy.Spotify(auth=token_data["access_token"])


def _refresh_token(user_id: str, token_data: dict, db: Client) -> dict:
    """Refresh Spotify access token using PKCE refresh (no client secret needed)."""
    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": token_data["refresh_token"],
            "client_id": token_data["client_id"],
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    response.raise_for_status()
    new_tokens = response.json()

    updated = {
        "access_token": new_tokens["access_token"],
        "expires_at": (
            datetime.now(timezone.utc) + timedelta(seconds=new_tokens["expires_in"])
        ).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if "refresh_token" in new_tokens:
        updated["refresh_token"] = new_tokens["refresh_token"]

    db.table("spotify_tokens").update(updated).eq("user_id", user_id).execute()
    return {**token_data, **updated}


async def get_user_spotify(
    user: dict = Depends(get_current_user),
) -> spotipy.Spotify:
    """FastAPI dependency: returns an authenticated Spotify client for the current user."""
    db = get_service_db()
    return get_spotify_for_user(user["user_id"], db)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_spotify_client.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/spotify_client.py backend/tests/test_spotify_client.py
git commit -m "feat: rewrite spotify_client for per-user PKCE token management"
```

---

## Task 5: Rewrite auth.py router

**Files:**
- Modify: `backend/routers/auth.py`
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Write failing tests for new endpoints**

```python
# backend/tests/test_auth.py
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

VALID_JWT = "Bearer test-token"
USER_ID = "user-abc"


def mock_current_user():
    return {"user_id": USER_ID, "token": "test-token"}


# ---- POST /auth/redeem-invite ----

def test_redeem_invite_valid_code():
    mock_db = MagicMock()
    # Code exists and is unredeemed
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "invite-1", "code": "TESTCODE", "redeemed_by": None}
    ]
    mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]

    with patch("routers.auth.get_service_db", return_value=mock_db), \
         patch("routers.auth.send_magic_link") as mock_send:
        response = client.post(
            "/auth/redeem-invite",
            json={"email": "test@example.com", "invite_code": "TESTCODE"}
        )
    assert response.status_code == 200
    mock_send.assert_called_once_with("test@example.com")


def test_redeem_invite_already_used():
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "invite-1", "code": "TESTCODE", "redeemed_by": "some-other-user"}
    ]
    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.post(
            "/auth/redeem-invite",
            json={"email": "test@example.com", "invite_code": "TESTCODE"}
        )
    assert response.status_code == 400
    assert "already been used" in response.json()["detail"]


def test_redeem_invite_nonexistent_code():
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    with patch("routers.auth.get_service_db", return_value=mock_db):
        response = client.post(
            "/auth/redeem-invite",
            json={"email": "test@example.com", "invite_code": "BADCODE"}
        )
    assert response.status_code == 404


# ---- POST /auth/spotify-token ----

def test_store_spotify_token():
    from auth_middleware import get_current_user
    app.dependency_overrides[get_current_user] = mock_current_user

    mock_db = MagicMock()
    mock_db.table.return_value.upsert.return_value.execute.return_value.data = [{}]

    with patch("routers.auth.get_authed_db", return_value=mock_db):
        response = client.post(
            "/auth/spotify-token",
            json={
                "client_id": "my-client-id",
                "access_token": "acc-tok",
                "refresh_token": "ref-tok",
                "expires_in": 3600,
            },
            headers={"Authorization": VALID_JWT},
        )
    assert response.status_code == 200
    app.dependency_overrides.clear()


# ---- DELETE /auth/spotify-token ----

def test_delete_spotify_token():
    from auth_middleware import get_current_user
    app.dependency_overrides[get_current_user] = mock_current_user

    mock_db = MagicMock()
    mock_db.table.return_value.delete.return_value.eq.return_value.execute.return_value.data = [{}]

    with patch("routers.auth.get_authed_db", return_value=mock_db):
        response = client.delete(
            "/auth/spotify-token",
            headers={"Authorization": VALID_JWT},
        )
    assert response.status_code == 200
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_auth.py -v
```

Expected: failures (old endpoints exist, new ones don't)

- [ ] **Step 3: Rewrite routers/auth.py**

```python
# backend/routers/auth.py
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from supabase import Client

from db import get_service_db
from auth_middleware import get_current_user, get_authed_db

router = APIRouter(prefix="/auth", tags=["auth"])


class RedeemInviteRequest(BaseModel):
    email: str
    invite_code: str


class SpotifyTokenRequest(BaseModel):
    client_id: str
    access_token: str
    refresh_token: str
    expires_in: int  # seconds until expiry


def send_magic_link(email: str) -> None:
    """Send a Supabase magic link to the given email."""
    admin_db = get_service_db()
    admin_db.auth.sign_in_with_otp({"email": email})


@router.post("/redeem-invite")
async def redeem_invite(body: RedeemInviteRequest):
    """Validate invite code and send magic link. Public endpoint."""
    db = get_service_db()

    result = db.table("invite_codes").select("*").eq("code", body.invite_code).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Invite code not found")

    invite = result.data[0]
    if invite["redeemed_by"] is not None:
        raise HTTPException(status_code=400, detail="Invite code has already been used")

    send_magic_link(body.email)

    # Mark redeemed — user_id filled in after they click magic link (via profile trigger)
    # We mark it used optimistically; if auth fails, code is consumed (acceptable)
    db.table("invite_codes").update({
        "redeemed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("code", body.invite_code).execute()

    return {"message": "Magic link sent"}


@router.post("/spotify-token")
async def store_spotify_token(
    body: SpotifyTokenRequest,
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_authed_db),
):
    """Store (or update) the user's Spotify tokens. Authenticated."""
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=body.expires_in)
    ).isoformat()

    db.table("spotify_tokens").upsert({
        "user_id": user["user_id"],
        "client_id": body.client_id,
        "access_token": body.access_token,
        "refresh_token": body.refresh_token,
        "expires_at": expires_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {"message": "Spotify credentials stored"}


@router.delete("/spotify-token")
async def delete_spotify_token(
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_authed_db),
):
    """Remove stored Spotify tokens (revoke server-side consent). Authenticated."""
    db.table("spotify_tokens").delete().eq("user_id", user["user_id"]).execute()
    return {"message": "Spotify credentials removed"}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_auth.py -v
```

Expected: all PASSED

- [ ] **Step 5: Confirm main.py still registers the auth router (no changes needed)**

```bash
grep "auth" backend/main.py
```

Expected: `from routers.auth import router as auth_router` and `app.include_router(auth_router)` already present.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/auth.py backend/tests/test_auth.py
git commit -m "feat: replace Spotify OAuth flow with invite+token endpoints"
```

---

## Task 6: Update library, metadata, home, digest routers

**Files:**
- Modify: `backend/routers/library.py`
- Modify: `backend/routers/metadata.py`
- Modify: `backend/routers/home.py`
- Modify: `backend/routers/digest.py`

The change is mechanical in each file: swap `Depends(get_db)` for `Depends(get_authed_db)` and add the import.

- [ ] **Step 1: Read current imports in each file**

```bash
head -20 backend/routers/library.py
head -20 backend/routers/metadata.py
head -20 backend/routers/home.py
head -20 backend/routers/digest.py
```

- [ ] **Step 2: Update library.py**

In `backend/routers/library.py`:
- Add import: `from auth_middleware import get_authed_db`
- Replace every `Depends(get_db)` with `Depends(get_authed_db)`
- Remove `from db import get_db` if it's no longer used

```bash
# Verify the change pattern before editing
grep -n "get_db" backend/routers/library.py
```

Make the replacements. Example — if the file has:
```python
from db import get_db
...
async def get_albums(db: Client = Depends(get_db)):
```

Change to:
```python
from auth_middleware import get_authed_db
...
async def get_albums(db: Client = Depends(get_authed_db)):
```

Repeat for `metadata.py`, `home.py`, `digest.py`.

- [ ] **Step 3: Run tests for all four routers to confirm nothing broke**

```bash
pytest tests/test_library.py tests/test_metadata.py tests/test_home.py tests/test_digest.py -v
```

> Note: These tests use `app.dependency_overrides` to mock `get_db`. You'll need to update the override to mock `get_authed_db` instead. Find every `app.dependency_overrides[get_db]` in the test files and change to `app.dependency_overrides[get_authed_db]`.

```bash
# Find all override sites in tests
grep -n "get_db" backend/tests/test_library.py backend/tests/test_metadata.py \
  backend/tests/test_home.py backend/tests/test_digest.py
```

Update each test file: change `from db import get_db` → `from auth_middleware import get_authed_db` and update the override key.

Expected after fixes: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/routers/library.py backend/routers/metadata.py \
        backend/routers/home.py backend/routers/digest.py \
        backend/tests/test_library.py backend/tests/test_metadata.py \
        backend/tests/test_home.py backend/tests/test_digest.py
git commit -m "feat: wire auth middleware into library/metadata/home/digest routers"
```

---

## Task 7: Update playback.py router

**Files:**
- Modify: `backend/routers/playback.py`
- Modify: `backend/tests/test_playback.py`

Playback uses both `get_db` (for play history) and `get_spotify` (for Spotify Connect calls). Both need updating.

- [ ] **Step 1: Inspect current playback.py dependencies**

```bash
grep -n "Depends\|get_db\|get_spotify\|import" backend/routers/playback.py | head -30
```

- [ ] **Step 2: Update imports and dependencies in playback.py**

Replace:
```python
from db import get_db
from spotify_client import get_spotify
```

With:
```python
from auth_middleware import get_authed_db
from spotify_client import get_user_spotify
```

Replace every:
```python
db: Client = Depends(get_db)
spotify = Depends(get_spotify)
```

With:
```python
db: Client = Depends(get_authed_db)
spotify = Depends(get_user_spotify)
```

- [ ] **Step 3: Update test_playback.py overrides**

```bash
grep -n "get_db\|get_spotify" backend/tests/test_playback.py | head -20
```

Update all `app.dependency_overrides` to use `get_authed_db` and `get_user_spotify`:

```python
# Old
from db import get_db
from spotify_client import get_spotify
app.dependency_overrides[get_db] = lambda: mock_db
app.dependency_overrides[get_spotify] = lambda: mock_spotify

# New
from auth_middleware import get_authed_db
from spotify_client import get_user_spotify
app.dependency_overrides[get_authed_db] = lambda: mock_db
app.dependency_overrides[get_user_spotify] = lambda: mock_spotify
```

- [ ] **Step 4: Run playback tests**

```bash
pytest tests/test_playback.py -v
```

Expected: all PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/routers/playback.py backend/tests/test_playback.py
git commit -m "feat: wire auth middleware into playback router"
```

---

## Task 8: Run full backend test suite

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && pytest -v 2>&1 | tail -30
```

Expected: all tests PASS. Fix any remaining failures before proceeding.

- [ ] **Step 2: Commit if any small fixes were needed**

```bash
git add -p  # stage only test/fix changes
git commit -m "fix: resolve remaining test failures after auth middleware wiring"
```

---

## Task 9: Write generate_invite.py script

**Files:**
- Create: `backend/scripts/generate_invite.py`

- [ ] **Step 1: Create the script**

```python
#!/usr/bin/env python3
# backend/scripts/generate_invite.py
"""Generate invite codes and insert them into Supabase.

Usage:
    python scripts/generate_invite.py          # generates 1 code
    python scripts/generate_invite.py 3        # generates 3 codes
"""
import os
import sys
import secrets
import string
from pathlib import Path

# Allow running from repo root or backend/
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from db import get_service_db


def generate_code(length: int = 10) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    db = get_service_db()
    codes = []
    for _ in range(count):
        code = generate_code()
        db.table("invite_codes").insert({"code": code}).execute()
        codes.append(code)
        print(f"  {code}")
    print(f"\nGenerated {count} invite code(s). Share with friends.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test it runs**

```bash
cd backend && source .venv/bin/activate
python scripts/generate_invite.py 1
```

Expected: prints one invite code and "Generated 1 invite code(s)." Check Supabase dashboard → `invite_codes` table for the new row.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/generate_invite.py
git commit -m "feat: add generate_invite.py script"
```

---

## Task 10: Frontend — install Supabase JS + create client

**Files:**
- Create: `frontend/src/supabaseClient.js`

- [ ] **Step 1: Install @supabase/supabase-js**

```bash
cd frontend && npm install @supabase/supabase-js
```

- [ ] **Step 2: Add env vars to frontend/.env and .env.example**

```
# frontend/.env (already gitignored)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

```
# frontend/.env.example
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_API_URL=http://127.0.0.1:8000
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/auth/spotify/callback
```

- [ ] **Step 3: Create supabaseClient.js**

```javascript
// frontend/src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export default supabase
```

- [ ] **Step 4: Verify it imports cleanly**

```bash
cd frontend && node -e "import('./src/supabaseClient.js').then(() => console.log('ok'))"
```

If node doesn't support ESM directly, skip — it'll be caught in the next task's tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/supabaseClient.js frontend/.env.example frontend/package.json frontend/package-lock.json
git commit -m "feat: install @supabase/supabase-js, add frontend supabase client"
```

---

## Task 11: Frontend — useAuth hook

**Files:**
- Create: `frontend/src/hooks/useAuth.js`
- Create: `frontend/src/hooks/useAuth.test.js`

This hook wraps Supabase Auth session management — it's the source of truth for whether the user is logged into Crate.

- [ ] **Step 1: Write failing tests**

```javascript
// frontend/src/hooks/useAuth.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from './useAuth'

vi.mock('../supabaseClient', () => ({
  default: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })),
      signOut: vi.fn(),
    },
  },
}))

import supabase from '../supabaseClient'

describe('useAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null session while loading', () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    const { result } = renderHook(() => useAuth())
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('returns session when user is logged in', async () => {
    const fakeSession = { user: { id: 'user-123' }, access_token: 'tok' }
    supabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession } })
    const { result } = renderHook(() => useAuth())
    await act(async () => {})
    expect(result.current.session).toEqual(fakeSession)
    expect(result.current.loading).toBe(false)
  })

  it('calls supabase.auth.signOut on logout()', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    supabase.auth.signOut.mockResolvedValue({})
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.logout() })
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd frontend && npm test -- --run hooks/useAuth
```

Expected: `Cannot find module './useAuth'`

- [ ] **Step 3: Implement useAuth.js**

```javascript
// frontend/src/hooks/useAuth.js
import { useState, useEffect } from 'react'
import supabase from '../supabaseClient'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
  }

  return { session, loading, logout }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --run hooks/useAuth
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAuth.js frontend/src/hooks/useAuth.test.js
git commit -m "feat: add useAuth hook for Supabase session management"
```

---

## Task 12: Frontend — useSpotifyAuth hook (PKCE)

**Files:**
- Create: `frontend/src/hooks/useSpotifyAuth.js`
- Create: `frontend/src/hooks/useSpotifyAuth.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// frontend/src/hooks/useSpotifyAuth.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock crypto for PKCE
const mockDigest = vi.fn()
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr) => { arr.fill(1); return arr },
    subtle: { digest: mockDigest },
  },
  writable: true,
})

vi.stubGlobal('localStorage', (() => {
  let store = {}
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
})())

vi.stubGlobal('fetch', vi.fn())

import { useSpotifyAuth } from './useSpotifyAuth'

const SCOPES = 'user-library-read user-read-playback-state user-modify-playback-state user-read-currently-playing'

describe('useSpotifyAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockDigest.mockResolvedValue(new ArrayBuffer(32))
  })

  it('returns null access token when no tokens in localStorage', () => {
    const { result } = renderHook(() => useSpotifyAuth())
    expect(result.current.accessToken).toBeNull()
  })

  it('returns access token from localStorage when not expired', () => {
    localStorage.setItem('spotify_access_token', 'tok-123')
    localStorage.setItem('spotify_expires_at', String(Date.now() + 3600000))
    const { result } = renderHook(() => useSpotifyAuth())
    expect(result.current.accessToken).toBe('tok-123')
  })

  it('initiateLogin sets code_verifier in localStorage and redirects', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true })
    localStorage.setItem('spotify_client_id', 'my-client-id')

    const { result } = renderHook(() => useSpotifyAuth())
    await act(async () => { await result.current.initiateLogin() })

    expect(localStorage.getItem('spotify_pkce_verifier')).toBeTruthy()
    expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('accounts.spotify.com/authorize'))
  })

  it('handleCallback exchanges code for tokens', async () => {
    localStorage.setItem('spotify_pkce_verifier', 'test-verifier')
    localStorage.setItem('spotify_client_id', 'my-client-id')
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-tok',
        refresh_token: 'ref-tok',
        expires_in: 3600,
      }),
    })

    const { result } = renderHook(() => useSpotifyAuth())
    await act(async () => { await result.current.handleCallback('auth-code') })

    expect(localStorage.getItem('spotify_access_token')).toBe('new-tok')
  })

  it('logout clears all spotify keys from localStorage', () => {
    localStorage.setItem('spotify_access_token', 'tok')
    localStorage.setItem('spotify_refresh_token', 'ref')
    localStorage.setItem('spotify_expires_at', '123')
    localStorage.setItem('spotify_client_id', 'cid')

    const { result } = renderHook(() => useSpotifyAuth())
    act(() => result.current.logout())

    expect(localStorage.getItem('spotify_access_token')).toBeNull()
    expect(localStorage.getItem('spotify_refresh_token')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd frontend && npm test -- --run hooks/useSpotifyAuth
```

Expected: `Cannot find module './useSpotifyAuth'`

- [ ] **Step 3: Implement useSpotifyAuth.js**

```javascript
// frontend/src/hooks/useSpotifyAuth.js
import { useState, useCallback } from 'react'

const SCOPES = [
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ')

const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173/auth/spotify/callback'

function base64URLEncode(buffer) {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const byte of bytes) str += String.fromCharCode(byte)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateCodeVerifier() {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return base64URLEncode(array.buffer)
}

async function generateCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return base64URLEncode(digest)
}

async function exchangeCode(code, verifier, clientId) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  })
  if (!res.ok) throw new Error('Spotify token exchange failed')
  return res.json()
}

async function refreshToken(refreshToken, clientId) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  })
  if (!res.ok) throw new Error('Spotify token refresh failed')
  return res.json()
}

function getStoredToken() {
  const token = localStorage.getItem('spotify_access_token')
  const expiresAt = Number(localStorage.getItem('spotify_expires_at') ?? 0)
  if (!token || Date.now() > expiresAt - 60_000) return null
  return token
}

function storeTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem('spotify_access_token', access_token)
  localStorage.setItem('spotify_expires_at', String(Date.now() + expires_in * 1000))
  if (refresh_token) localStorage.setItem('spotify_refresh_token', refresh_token)
}

export function useSpotifyAuth() {
  const [accessToken, setAccessToken] = useState(() => getStoredToken())

  const initiateLogin = useCallback(async () => {
    const clientId = localStorage.getItem('spotify_client_id')
    if (!clientId) throw new Error('No Spotify client_id set')

    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    localStorage.setItem('spotify_pkce_verifier', verifier)

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    })
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
  }, [])

  const handleCallback = useCallback(async (code) => {
    const verifier = localStorage.getItem('spotify_pkce_verifier')
    const clientId = localStorage.getItem('spotify_client_id')
    const tokens = await exchangeCode(code, verifier, clientId)
    storeTokens(tokens)
    localStorage.removeItem('spotify_pkce_verifier')
    setAccessToken(tokens.access_token)
    return tokens
  }, [])

  const getAccessToken = useCallback(async () => {
    const stored = getStoredToken()
    if (stored) return stored

    const refreshTok = localStorage.getItem('spotify_refresh_token')
    const clientId = localStorage.getItem('spotify_client_id')
    if (!refreshTok || !clientId) return null

    const tokens = await refreshToken(refreshTok, clientId)
    storeTokens(tokens)
    setAccessToken(tokens.access_token)
    return tokens.access_token
  }, [])

  const logout = useCallback(() => {
    ['spotify_access_token', 'spotify_refresh_token', 'spotify_expires_at',
     'spotify_client_id', 'spotify_pkce_verifier'].forEach(k => localStorage.removeItem(k))
    setAccessToken(null)
  }, [])

  return { accessToken, initiateLogin, handleCallback, getAccessToken, logout }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --run hooks/useSpotifyAuth
```

Expected: 5 PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSpotifyAuth.js frontend/src/hooks/useSpotifyAuth.test.js
git commit -m "feat: add useSpotifyAuth hook with PKCE flow"
```

---

## Task 13: Frontend — update API fetch calls to include Supabase JWT

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/usePlayback.js`
- Modify: `frontend/src/components/DigestPanel.jsx`
- Modify: `frontend/src/components/HomePage.jsx`

All `fetch()` calls to the backend need `Authorization: Bearer <supabase-jwt>` header.

- [ ] **Step 1: Find all fetch calls**

```bash
grep -n "fetch(" frontend/src/App.jsx frontend/src/usePlayback.js \
  frontend/src/components/DigestPanel.jsx frontend/src/components/HomePage.jsx
```

- [ ] **Step 2: Create a shared API fetch helper**

Add this to `frontend/src/App.jsx` (at the top, after imports) or extract to a separate `frontend/src/api.js` file:

```javascript
// frontend/src/api.js
const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export function apiFetch(path, options = {}, session = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers ?? {}),
  }
  return fetch(`${API}${path}`, { ...options, headers })
}
```

- [ ] **Step 3: Write a test for apiFetch**

```javascript
// frontend/src/api.test.js
import { describe, it, expect, vi } from 'vitest'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

describe('apiFetch', () => {
  it('includes Authorization header when session provided', async () => {
    const { apiFetch } = await import('./api')
    const session = { access_token: 'my-jwt' }
    await apiFetch('/library/albums', {}, session)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/library/albums'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt' }),
      })
    )
  })

  it('omits Authorization header when no session', async () => {
    const { apiFetch } = await import('./api')
    await apiFetch('/library/albums', {}, null)
    const call = fetch.mock.calls[0]
    expect(call[1].headers).not.toHaveProperty('Authorization')
  })
})
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend && npm test -- --run src/api
```

Expected: 2 PASSED

- [ ] **Step 5: Update App.jsx to pass session to all fetch calls**

In `App.jsx`, the session will come from `useAuth()`. Pass `session` to `apiFetch`:

```javascript
// At the top of App.jsx, add:
import { apiFetch } from './api'
import { useAuth } from './hooks/useAuth'

// Inside the App component:
const { session } = useAuth()

// Replace every:
fetch(`${API}/library/albums`)
// With:
apiFetch('/library/albums', {}, session)

// Replace every:
fetch(`${API}/some/endpoint`, { method: 'POST', headers: {...}, body: ... })
// With:
apiFetch('/some/endpoint', { method: 'POST', body: JSON.stringify(data) }, session)
```

Do the same substitution in `usePlayback.js`, `DigestPanel.jsx`, `HomePage.jsx`.

For `usePlayback.js`, the session needs to be passed in as a parameter (it's a hook, not a component):
```javascript
export function usePlayback(session) {
  // pass session to all apiFetch calls
}
```

Update App.jsx to pass session: `const playback = usePlayback(session)`

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && npm test -- --run
```

Fix any test failures from the fetch call signature changes (update mocks from `fetch` to `apiFetch`).

Expected: all PASSED

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api.js frontend/src/api.test.js frontend/src/App.jsx \
        frontend/src/usePlayback.js frontend/src/components/DigestPanel.jsx \
        frontend/src/components/HomePage.jsx
git commit -m "feat: add apiFetch helper, wire Supabase JWT into all API calls"
```

---

## Task 14: Frontend — SignupScreen component

**Files:**
- Create: `frontend/src/components/SignupScreen.jsx`
- Create: `frontend/src/components/SignupScreen.test.jsx`

- [ ] **Step 1: Write failing tests**

```javascript
// frontend/src/components/SignupScreen.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignupScreen from './SignupScreen'

vi.stubGlobal('fetch', vi.fn())
vi.mock('../supabaseClient', () => ({
  default: { auth: { signInWithOtp: vi.fn() } }
}))

import supabase from '../supabaseClient'

describe('SignupScreen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders email and invite code fields', () => {
    render(<SignupScreen />)
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/invite code/i)).toBeInTheDocument()
  })

  it('shows invite code field when in signup mode', () => {
    render(<SignupScreen />)
    expect(screen.getByPlaceholderText(/invite code/i)).toBeInTheDocument()
  })

  it('submits invite + email to /auth/redeem-invite', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Magic link sent' }) })
    render(<SignupScreen />)

    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText(/invite code/i), { target: { value: 'CODE123' } })
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/redeem-invite'),
      expect.objectContaining({ method: 'POST' })
    ))
  })

  it('shows success message after sending magic link', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Magic link sent' }) })
    render(<SignupScreen />)

    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText(/invite code/i), { target: { value: 'CODE123' } })
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  })

  it('shows error on invalid invite code', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invite code not found' }),
    })
    render(<SignupScreen />)

    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText(/invite code/i), { target: { value: 'BADCODE' } })
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => expect(screen.getByText(/not found/i)).toBeInTheDocument())
  })

  it('supports return login (no invite code, calls supabase signInWithOtp)', async () => {
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ error: null })
    render(<SignupScreen />)

    fireEvent.click(screen.getByText(/already have an account/i))
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com' })
    ))
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd frontend && npm test -- --run SignupScreen
```

Expected: `Cannot find module './SignupScreen'`

- [ ] **Step 3: Implement SignupScreen.jsx**

```jsx
// frontend/src/components/SignupScreen.jsx
import { useState } from 'react'
import supabase from '../supabaseClient'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export default function SignupScreen() {
  const [email, setEmail] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [isReturnUser, setIsReturnUser] = useState(false)
  const [status, setStatus] = useState(null) // 'sent' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    setErrorMsg('')

    try {
      if (isReturnUser) {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw new Error(error.message)
      } else {
        const res = await fetch(`${API}/auth/redeem-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, invite_code: inviteCode }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail ?? 'Something went wrong')
      }
      setStatus('sent')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-gray-400">We sent a magic link to <strong>{email}</strong>.</p>
        <p className="text-gray-500 text-sm">Click the link to sign in. You can close this tab.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-3xl font-bold">Crate</h1>
      <p className="text-gray-400">Your music library, organized.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="bg-gray-800 rounded-lg px-4 py-2 text-white border border-gray-700 focus:outline-none focus:border-white"
        />
        {!isReturnUser && (
          <input
            type="text"
            placeholder="Invite code"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value.toUpperCase())}
            required
            className="bg-gray-800 rounded-lg px-4 py-2 text-white border border-gray-700 focus:outline-none focus:border-white font-mono tracking-widest"
          />
        )}
        {status === 'error' && (
          <p className="text-red-400 text-sm">{errorMsg}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="bg-white text-black font-semibold rounded-lg px-4 py-2 hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      <button
        onClick={() => setIsReturnUser(r => !r)}
        className="text-gray-500 text-sm hover:text-gray-300"
      >
        {isReturnUser ? 'Have an invite code? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --run SignupScreen
```

Expected: 6 PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SignupScreen.jsx frontend/src/components/SignupScreen.test.jsx
git commit -m "feat: add SignupScreen with invite code + return login"
```

---

## Task 15: Frontend — OnboardingWizard component

**Files:**
- Create: `frontend/src/components/OnboardingWizard.jsx`
- Create: `frontend/src/components/OnboardingWizard.test.jsx`

Shown after first Crate login when `spotify_client_id` is missing from localStorage.

- [ ] **Step 1: Write failing tests**

```javascript
// frontend/src/components/OnboardingWizard.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.stubGlobal('localStorage', (() => {
  let store = {}
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
})())

vi.mock('../hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    initiateLogin: vi.fn(),
    handleCallback: vi.fn().mockResolvedValue({
      access_token: 'acc', refresh_token: 'ref', expires_in: 3600,
    }),
    accessToken: null,
    logout: vi.fn(),
  }),
}))

vi.stubGlobal('fetch', vi.fn())

import OnboardingWizard from './OnboardingWizard'

const fakeSession = { access_token: 'supabase-jwt' }

describe('OnboardingWizard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders step 1: enter client id', () => {
    render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
    expect(screen.getByPlaceholderText(/client id/i)).toBeInTheDocument()
  })

  it('saves client_id to localStorage on submit', async () => {
    const { useSpotifyAuth } = await import('../hooks/useSpotifyAuth')
    useSpotifyAuth().initiateLogin = vi.fn()

    render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/client id/i), {
      target: { value: 'my-client-id' }
    })
    fireEvent.click(screen.getByRole('button', { name: /connect spotify/i }))

    await waitFor(() => {
      expect(localStorage.getItem('spotify_client_id')).toBe('my-client-id')
    })
  })

  it('shows consent step after Spotify auth when onboarding_step=consent', () => {
    localStorage.setItem('onboarding_step', 'consent')
    localStorage.setItem('spotify_client_id', 'cid')
    localStorage.setItem('spotify_access_token', 'tok')
    localStorage.setItem('spotify_expires_at', String(Date.now() + 3600000))

    render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
    expect(screen.getByText(/store your refresh token/i)).toBeInTheDocument()
  })

  it('calls onComplete after consent decision', async () => {
    localStorage.setItem('onboarding_step', 'consent')
    localStorage.setItem('spotify_client_id', 'cid')
    localStorage.setItem('spotify_access_token', 'tok')
    localStorage.setItem('spotify_expires_at', String(Date.now() + 3600000))

    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    const onComplete = vi.fn()
    render(<OnboardingWizard session={fakeSession} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /yes, store it/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd frontend && npm test -- --run OnboardingWizard
```

Expected: `Cannot find module './OnboardingWizard'`

- [ ] **Step 3: Implement OnboardingWizard.jsx**

```jsx
// frontend/src/components/OnboardingWizard.jsx
import { useState, useEffect } from 'react'
import { useSpotifyAuth } from '../hooks/useSpotifyAuth'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export default function OnboardingWizard({ session, onComplete }) {
  const { initiateLogin, handleCallback, accessToken } = useSpotifyAuth()
  const [clientId, setClientId] = useState('')
  const [step, setStep] = useState(
    () => localStorage.getItem('onboarding_step') ?? 'client_id'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Handle return from Spotify OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      // Exchange the auth code for tokens, then move to consent step
      handleCallback(code).then(() => {
        localStorage.setItem('onboarding_step', 'consent')
        setStep('consent')
        window.history.replaceState({}, '', window.location.pathname)
      })
    }
  }, [])

  async function handleClientIdSubmit(e) {
    e.preventDefault()
    if (!clientId.trim()) return
    localStorage.setItem('spotify_client_id', clientId.trim())
    localStorage.setItem('onboarding_step', 'spotify_auth')
    setLoading(true)
    try {
      await initiateLogin()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleConsent(store) {
    setLoading(true)
    try {
      if (store) {
        const refreshToken = localStorage.getItem('spotify_refresh_token')
        const storedClientId = localStorage.getItem('spotify_client_id')
        const expiresAt = localStorage.getItem('spotify_expires_at')
        const expiresIn = Math.floor((Number(expiresAt) - Date.now()) / 1000)
        await fetch(`${API}/auth/spotify-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            client_id: storedClientId,
            access_token: accessToken ?? localStorage.getItem('spotify_access_token'),
            refresh_token: refreshToken,
            expires_in: expiresIn,
          }),
        })
      }
      localStorage.removeItem('onboarding_step')
      onComplete()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (step === 'client_id' || step === 'spotify_auth') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
        <h1 className="text-2xl font-bold">Connect Spotify</h1>
        <p className="text-gray-400 max-w-sm text-center">
          Crate uses your own Spotify developer app. You'll need a free Spotify developer account.
        </p>
        <form onSubmit={handleClientIdSubmit} className="flex flex-col gap-4 w-full max-w-sm">
          <input
            type="text"
            placeholder="Client ID"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            required
            className="bg-gray-800 rounded-lg px-4 py-2 text-white border border-gray-700 focus:outline-none focus:border-white font-mono"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 text-white font-semibold rounded-lg px-4 py-2 hover:bg-green-500 disabled:opacity-50"
          >
            {loading ? 'Redirecting…' : 'Connect Spotify'}
          </button>
        </form>
        <a
          href="https://developer.spotify.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 text-sm hover:text-gray-300"
        >
          Create a Spotify developer app →
        </a>
      </div>
    )
  }

  if (step === 'consent') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
        <h1 className="text-2xl font-bold">One more thing</h1>
        <p className="text-gray-400 max-w-sm text-center">
          Allow Crate to store your refresh token server-side? This enables background library sync when you're not actively using the app.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => handleConsent(true)}
            disabled={loading}
            className="bg-white text-black font-semibold rounded-lg px-6 py-2 hover:bg-gray-200 disabled:opacity-50"
          >
            Yes, store it
          </button>
          <button
            onClick={() => handleConsent(false)}
            disabled={loading}
            className="bg-gray-700 text-white font-semibold rounded-lg px-6 py-2 hover:bg-gray-600 disabled:opacity-50"
          >
            No thanks
          </button>
        </div>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --run OnboardingWizard
```

Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OnboardingWizard.jsx frontend/src/components/OnboardingWizard.test.jsx
git commit -m "feat: add OnboardingWizard for BYOK Spotify setup"
```

---

## Task 16: Frontend — App.jsx auth gate

**Files:**
- Modify: `frontend/src/App.jsx`

Add the top-level auth check: loading → SignupScreen → OnboardingWizard → main app.

- [ ] **Step 1: Add the Spotify callback route handler**

The Spotify OAuth redirect will land at `/auth/spotify/callback?code=...`. Add this to `frontend/src/main.jsx` or handle it inside App.jsx. Since there's no router, handle it inline in App.jsx:

```javascript
// In App.jsx, inside the component, before any data fetching:
const isSpotifyCallback = window.location.pathname === '/auth/spotify/callback'
  && new URLSearchParams(window.location.search).has('code')
```

If `isSpotifyCallback` is true, render `<OnboardingWizard>` directly — it will detect the `?code=` param and process it.

- [ ] **Step 2: Add auth gate logic to App.jsx**

At the top of the `App` component, add:

```javascript
import { useAuth } from './hooks/useAuth'
import SignupScreen from './components/SignupScreen'
import OnboardingWizard from './components/OnboardingWizard'

// Inside App():
const { session, loading: authLoading } = useAuth()

const needsOnboarding = session && !localStorage.getItem('spotify_client_id')
const isSpotifyCallback = window.location.pathname === '/auth/spotify/callback'

// Auth gate — render before anything else
if (authLoading) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500">Loading…</div>
    </div>
  )
}

if (!session) {
  return <SignupScreen />
}

if (needsOnboarding || isSpotifyCallback) {
  return (
    <OnboardingWizard
      session={session}
      onComplete={() => window.location.reload()}
    />
  )
}
```

Place these returns before the existing JSX return.

- [ ] **Step 3: Remove the old /auth/status check**

Find and remove the existing `/auth/status` fetch in App.jsx (it checked if Spotify was authenticated). The auth gate above replaces it.

```bash
grep -n "auth/status" frontend/src/App.jsx
```

Remove the corresponding `useEffect` and any state variables it drove (e.g., `isAuthenticated`, `authChecked`).

- [ ] **Step 4: Update the usePlayback call to pass session**

```javascript
// Find:
const playback = usePlayback()
// Replace with:
const playback = usePlayback(session)
```

- [ ] **Step 5: Run App tests**

```bash
cd frontend && npm test -- --run App.test
```

Fix any test failures from the auth gate additions. You'll need to mock `useAuth` in App.test.jsx:

```javascript
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ session: { access_token: 'test-token' }, loading: false, logout: vi.fn() }),
}))
```

- [ ] **Step 6: Run full frontend test suite**

```bash
cd frontend && npm test -- --run
```

Expected: all PASSED

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: add auth gate in App.jsx (session check, onboarding flow)"
```

---

## Task 17: Run full test suite + smoke test

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && pytest -v 2>&1 | tail -20
```

Expected: all PASSED

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm test -- --run 2>&1 | tail -20
```

Expected: all PASSED

- [ ] **Step 3: Run linting**

```bash
cd backend && ruff check . && ruff format --check .
cd frontend && npm run lint
```

Fix any issues.

- [ ] **Step 4: Update BACKLOG.md**

Mark the multi-user pivot items in BACKLOG.md as in-progress or complete:

```markdown
- [x] Rename local dir + GitHub repo to `crate`
- [x] Rename Railway service (currently still `better-spotify-interface`)
- [x] Confirm Vercel picked up new GitHub repo name
- [ ] **Multi-user pivot (Crate)** — rename, BYOK, multi-user DB schema, invite system, open source
  - [x] Rename local dir + GitHub repo to `crate`
  - [x] Rename Railway service
  - [x] Confirm Vercel picked up new GitHub repo name
  - [x] Multi-user DB schema + RLS (Phase 1)
  - [x] Supabase Auth + magic link login (Phase 1)
  - [x] BYOK Spotify PKCE flow (Phase 2)
  - [x] Invite code system (Phase 1)
  - [x] Onboarding wizard (Phase 3)
```

- [ ] **Step 5: Final commit**

```bash
git add BACKLOG.md
git commit -m "docs: update backlog — multi-user pivot Phase 1-3 complete"
```

---

## Deployment Notes

After merging to main:

1. **Supabase:** Run `007_multi_user.sql` in production SQL editor (⚠️ wipes data)
2. **Railway:** Add env vars: `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`
3. **Vercel:** Add env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SPOTIFY_REDIRECT_URI`
4. Update Spotify Developer Dashboard: add `https://your-vercel-app.vercel.app/auth/spotify/callback` as a redirect URI
5. Generate invite codes: `cd backend && python scripts/generate_invite.py 3`
6. Sign in yourself first, complete onboarding, verify library syncs
