# Vercel Python + Preview Auth Bypass + Railway Decommission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Crate FastAPI backend onto Vercel Python as part of a monorepo single-project deploy, enable Vercel preview deploys with a `VERCEL_ENV=preview`-gated auth bypass that auto-logs in as a seeded preview user in the **shared prod Supabase DB**, and decommission Railway — all in one atomic PR.

**Architecture:** Re-link the existing Vercel project from `frontend/` to the repo root. A new `api/index.py` ASGI shim imports the FastAPI app from `backend/main.py`. Root `vercel.json` routes `/api/*` to the Python function and serves the Vite build for everything else. Preview auth is short-circuited via `VERCEL_ENV=preview` to use a seeded test user, and `supabase/seed.sql` is applied to prod **once** as a bootstrap (not per preview — Supabase branching is Pro-only and we're on the free tier). The preview user's data is isolated from real users by `user_id` in every table.

**Tech Stack:** Vercel Python 3.12 runtime, FastAPI, React + Vite, Supabase (Postgres + Auth, free tier), pytest, Vitest, Playwright.

**Spec:** [`docs/specs/2026-04-11-vercel-python-branching-cutover-design.md`](../specs/2026-04-11-vercel-python-branching-cutover-design.md)

> **Pivot note (2026-04-11):** This plan was originally written assuming Supabase branching would give every PR an isolated preview DB. Mid-execution we discovered Supabase branching is Pro-only ($25/mo). We pivoted to "shared prod DB with seeded preview user" — see the updated spec for the full design. The pivot affected:
> - **Task 3** (backend bypass): the `_is_preview_env` SUPABASE_URL guard was removed. The actual implementation in `backend/auth_middleware.py` is simpler than what Task 3 below describes.
> - **Task 7** (CLAUDE.md update): the final CLAUDE.md text is different from what Task 7 below describes. Read the current `CLAUDE.md` for truth.
> - **Task 10** (manual prep): rewritten — no Supabase GitHub integration, no Supabase branching, no Supabase Vercel integration. Just re-link Vercel, set env vars, apply seed.sql to prod once.
>
> Tasks 1-9 were executed before the pivot, then Task 3 code + CLAUDE.md were revised in a single pivot commit. Tasks 10-13 below reflect the final Option B design.

---

## Pre-flight

- [ ] **Step 1: Confirm you're on main with a clean working tree**

```
cd /Users/alextoofanian/Documents/20-29_Projects/21_Software/21.01_personal/crate
git status
```

Expected: `On branch main`. No modified tracked files (untracked `.vercel/`, `node_modules/`, etc. are OK).

- [ ] **Step 2: Record backend test baseline**

```
backend/.venv/bin/pytest backend/tests/ -q
```

Expected: all tests passing. **Record the passing count** (e.g., "174 passed") — it's your regression baseline for Task 8.

- [ ] **Step 3: Record frontend test baseline**

```
cd frontend && npm test -- --run
```

Expected: all tests passing. **Record the passing count** — baseline for Task 8. `cd` back to repo root when done.

- [ ] **Step 4: Create the feature branch for the cutover PR**

```
git checkout -b feat/vercel-python-cutover
```

Expected: `Switched to a new branch 'feat/vercel-python-cutover'`. All subsequent commits land on this branch until Task 11 opens the PR.

---

## Task 1: `api/` scaffold — Vercel Python entry point

**Files:**
- Create: `api/index.py`
- Create: `api/requirements.txt`
- Create: `vercel.json` (repo root)

- [ ] **Step 1: Create the `api/` directory**

```
mkdir -p api
```

- [ ] **Step 2: Write `api/index.py`**

```python
"""Vercel Python entry point for the Crate FastAPI backend.

Vercel's Python runtime detects ASGI apps by looking for a top-level
`app` variable. This shim adds the sibling `backend/` directory to
`sys.path` so `from main import app` resolves to `backend/main.py`.
"""
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from main import app  # noqa: E402  (sys.path must be mutated first)

__all__ = ["app"]
```

- [ ] **Step 3: Create `api/requirements.txt` as a copy of `backend/requirements-prod.txt`**

```
cp backend/requirements-prod.txt api/requirements.txt
```

Expected: `api/requirements.txt` exists with the same contents as `backend/requirements-prod.txt`. Vercel will install these deps during the build for the Python function.

- [ ] **Step 4: Write `vercel.json` at the repo root**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "functions": {
    "api/index.py": {
      "runtime": "@vercel/python@4.3.0",
      "maxDuration": 60
    }
  }
}
```

Notes for the engineer:
- `outputDirectory` is where Vite writes the static build — the repo-root `vercel.json` points Vercel at `frontend/dist/`.
- The first rewrite maps `/api/*` to the Python function (`api/index.py` is served as `/api/index`).
- The second rewrite uses a negative lookahead so SPA fallback **only** applies to non-`/api/` paths — otherwise all API calls would get rewritten to `index.html`.
- `framework: null` stops Vercel from auto-detecting Vite at the repo root (Vite lives in `frontend/`, not here).
- The `@vercel/python@4.3.0` runtime pin is required because Vercel no longer auto-detects Python functions without an explicit runtime declaration in the 2025+ builder.

- [ ] **Step 5: Commit the scaffold**

```
git add api/index.py api/requirements.txt vercel.json
git commit -m "$(cat <<'EOF'
feat(vercel): add Vercel Python scaffold for backend hosting

- api/index.py ASGI shim that imports FastAPI app from backend/main.py
- api/requirements.txt mirrors backend/requirements-prod.txt for the
  function build
- Root vercel.json configures the monorepo: Vite build from frontend/,
  /api/* routed to the Python function, SPA rewrite for everything else

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `previewMode` helper (frontend)

**Files:**
- Create: `frontend/src/previewMode.js`

- [ ] **Step 1: Write `frontend/src/previewMode.js`**

```javascript
/**
 * Preview-mode detection for Vercel preview deploys.
 *
 * Vercel injects VERCEL_ENV=preview into preview deploys and
 * VERCEL_ENV=production into production. We expose it to the client
 * bundle via VITE_VERCEL_ENV (set in the Vercel dashboard env vars).
 *
 * When IS_PREVIEW is true, the frontend synthesizes a fake Supabase
 * session for the seeded preview user and skips the Spotify onboarding
 * flow. The backend does the corresponding short-circuit in
 * auth_middleware.py.
 *
 * The hardcoded UUID matches:
 *   - `supabase/seed.sql` (the auth.users row)
 *   - `backend/auth_middleware.py` PREVIEW_USER_ID constant
 */
export const IS_PREVIEW = import.meta.env.VITE_VERCEL_ENV === 'preview'

export const PREVIEW_USER_ID = '00000000-0000-0000-0000-000000000001'

export const PREVIEW_USER_EMAIL = 'preview@crate.local'
```

- [ ] **Step 2: Commit**

```
git add frontend/src/previewMode.js
git commit -m "$(cat <<'EOF'
feat(frontend): add preview-mode detection helper

Single source of truth for VERCEL_ENV=preview and the hardcoded
preview user UUID. Consumed by useAuth (next task) to bypass real
Supabase auth on preview deploys.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend preview auth bypass

**Files:**
- Modify: `backend/auth_middleware.py`
- Modify: `backend/db.py`
- Modify: `backend/tests/test_auth_middleware.py`

- [ ] **Step 1: Write the failing test for `get_current_user` preview bypass**

Add this test to `backend/tests/test_auth_middleware.py`:

```python
def test_get_current_user_preview_mode_short_circuits(monkeypatch):
    """In VERCEL_ENV=preview, get_current_user returns the hardcoded
    preview user without validating any token. Any Authorization header
    (including missing or garbage) is accepted."""
    import asyncio

    monkeypatch.setenv("VERCEL_ENV", "preview")
    # Also set a non-prod SUPABASE_URL so the belt-and-suspenders guard
    # does not block the bypass.
    monkeypatch.setenv("SUPABASE_URL", "https://preview-branch.supabase.co")

    from auth_middleware import PREVIEW_USER_ID, get_current_user

    result = asyncio.run(get_current_user(authorization="Bearer anything"))
    assert result["user_id"] == PREVIEW_USER_ID
    assert result["token"] == "PREVIEW_FAKE"


def test_get_current_user_production_ignores_preview_bypass(monkeypatch):
    """When VERCEL_ENV is not 'preview', the preview short-circuit is
    inactive and the normal JWT validation path runs."""
    import asyncio

    from fastapi import HTTPException

    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    from auth_middleware import get_current_user

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_current_user(authorization="Bearer invalid"))
    # Either 500 (missing SUPABASE_URL for JWKS) or 401 (invalid token)
    # — either way, we did NOT short-circuit.
    assert exc_info.value.status_code in (401, 500)
```

- [ ] **Step 2: Run the test to verify it fails**

```
backend/.venv/bin/pytest backend/tests/test_auth_middleware.py::test_get_current_user_preview_mode_short_circuits -v
```

Expected: FAIL — `ImportError: cannot import name 'PREVIEW_USER_ID' from 'auth_middleware'`.

- [ ] **Step 3: Implement the preview bypass in `backend/auth_middleware.py`**

Read the current file first:

```
# backend/auth_middleware.py
```

Then edit it. Add at the top of the file (after the existing imports, before `_jwks_client`):

```python
# --- Preview-mode constants ---
# Matches frontend/src/previewMode.js PREVIEW_USER_ID and the auth.users
# row seeded by supabase/seed.sql. When VERCEL_ENV=preview, we short-circuit
# auth to this user. Safe because preview DB contains only this user's
# seeded data.
PREVIEW_USER_ID = "00000000-0000-0000-0000-000000000001"
PREVIEW_FAKE_TOKEN = "PREVIEW_FAKE"


def _is_preview_env() -> bool:
    """True iff we are running on a Vercel preview deploy.

    Belt-and-suspenders: also verify SUPABASE_URL does not contain the
    prod project ref. This prevents a mis-set VERCEL_ENV from ever
    short-circuiting auth against the prod database.
    """
    if os.getenv("VERCEL_ENV") != "preview":
        return False
    url = os.getenv("SUPABASE_URL", "")
    prod_ref = "qahbkhrpqeslmtiovgrb"
    if prod_ref in url:
        # Preview deploy somehow ended up with prod credentials — do
        # NOT activate the bypass, fall through to real auth.
        return False
    return True
```

Then modify `get_current_user` by adding a short-circuit at the very top of the function body:

```python
async def get_current_user(authorization: str = Header(...)) -> dict:
    if _is_preview_env():
        return {"user_id": PREVIEW_USER_ID, "token": PREVIEW_FAKE_TOKEN}

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    # ... rest unchanged
```

Also modify `get_authed_db`: in preview mode it must return a service-role client (bypassing RLS), because the fake JWT would be rejected by postgREST:

```python
async def get_authed_db(user: dict = Depends(get_current_user)) -> Client:
    """Returns a Supabase client authenticated as the requesting user (RLS applies).
    In preview mode, returns the service-role client (bypasses RLS) —
    safe because preview DBs only contain seeded preview data."""
    if _is_preview_env():
        from db import get_service_db
        return get_service_db()

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
```

- [ ] **Step 4: Run the preview test to verify it passes**

```
backend/.venv/bin/pytest backend/tests/test_auth_middleware.py::test_get_current_user_preview_mode_short_circuits -v backend/tests/test_auth_middleware.py::test_get_current_user_production_ignores_preview_bypass -v
```

Expected: both PASS.

- [ ] **Step 5: Run the full auth_middleware test module to confirm no regressions**

```
backend/.venv/bin/pytest backend/tests/test_auth_middleware.py -v
```

Expected: all existing tests still pass plus the two new ones.

- [ ] **Step 6: Add service-role key fallback in `backend/db.py`**

The Supabase Vercel integration injects `SUPABASE_SERVICE_ROLE_KEY` (canonical Supabase name), but our project uses `SUPABASE_SERVICE_KEY`. Accept both so the integration works without extra env var renaming:

Replace the `key = os.getenv("SUPABASE_SERVICE_KEY")` line in `get_service_db` with:

```python
        key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv(
            "SUPABASE_SERVICE_ROLE_KEY"
        )
```

- [ ] **Step 7: Run full backend test suite to catch any regressions**

```
backend/.venv/bin/pytest backend/tests/ -q
```

Expected: passing count = Pre-flight Step 2 baseline + 2 (the two new preview tests). No failures.

- [ ] **Step 8: Commit**

```
git add backend/auth_middleware.py backend/db.py backend/tests/test_auth_middleware.py
git commit -m "$(cat <<'EOF'
feat(auth): add VERCEL_ENV=preview short-circuit for preview deploys

- PREVIEW_USER_ID constant matches seed.sql and frontend/previewMode.js
- get_current_user short-circuits to the preview user when
  VERCEL_ENV=preview, guarded against prod SUPABASE_URL leakage
- get_authed_db returns the service-role client in preview mode
  (preview DBs only contain seeded data, so RLS bypass is safe)
- db.py accepts SUPABASE_SERVICE_ROLE_KEY as a fallback for the
  Supabase-Vercel integration's default env var name
- Tests cover both preview short-circuit and prod-mode non-activation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend preview session bypass

**Files:**
- Modify: `frontend/src/hooks/useAuth.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/hooks/useAuth.test.js` (create if it doesn't exist)

- [ ] **Step 1: Check whether `useAuth.test.js` exists**

```
ls frontend/src/hooks/
```

If `useAuth.test.js` does not exist, you will create it in step 2.

- [ ] **Step 2: Write the failing test for `useAuth` preview bypass**

Create or append to `frontend/src/hooks/useAuth.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

describe('useAuth preview mode', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns a synthesized session without calling supabase.auth when VITE_VERCEL_ENV is "preview"', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'preview')

    // Mock supabase client so the real auth methods are NOT called.
    const getSession = vi.fn()
    const onAuthStateChange = vi.fn()
    vi.doMock('../supabaseClient', () => ({
      default: {
        auth: { getSession, onAuthStateChange, signOut: vi.fn() },
      },
    }))

    const { useAuth } = await import('./useAuth')
    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.session).not.toBeNull()
    expect(result.current.session.user.id).toBe(
      '00000000-0000-0000-0000-000000000001'
    )
    expect(result.current.session.access_token).toBe('PREVIEW_FAKE')
    expect(getSession).not.toHaveBeenCalled()
    expect(onAuthStateChange).not.toHaveBeenCalled()
  })

  it('falls through to real supabase.auth when VITE_VERCEL_ENV is not "preview"', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'production')

    const getSession = vi
      .fn()
      .mockResolvedValue({ data: { session: null } })
    const onAuthStateChange = vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    vi.doMock('../supabaseClient', () => ({
      default: {
        auth: { getSession, onAuthStateChange, signOut: vi.fn() },
      },
    }))

    const { useAuth } = await import('./useAuth')
    renderHook(() => useAuth())

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(onAuthStateChange).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```
cd frontend && npm test -- --run src/hooks/useAuth.test.js
```

Expected: FAIL — the current `useAuth` always calls `supabase.auth.getSession`, so the preview-mode test fails.

- [ ] **Step 4: Modify `frontend/src/hooks/useAuth.js` with the preview bypass**

Rewrite `frontend/src/hooks/useAuth.js`:

```javascript
import { useState, useEffect } from 'react'
import supabase from '../supabaseClient'
import { IS_PREVIEW, PREVIEW_USER_ID, PREVIEW_USER_EMAIL } from '../previewMode'

const PREVIEW_SESSION = {
  access_token: 'PREVIEW_FAKE',
  refresh_token: 'PREVIEW_FAKE',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: PREVIEW_USER_ID,
    email: PREVIEW_USER_EMAIL,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
}

export function useAuth() {
  const [session, setSession] = useState(IS_PREVIEW ? PREVIEW_SESSION : null)
  const [loading, setLoading] = useState(!IS_PREVIEW)

  useEffect(() => {
    if (IS_PREVIEW) return

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
    if (IS_PREVIEW) return
    await supabase.auth.signOut()
  }

  return { session, loading, logout }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```
cd frontend && npm test -- --run src/hooks/useAuth.test.js
```

Expected: both `useAuth preview mode` tests PASS.

- [ ] **Step 6: Modify `App.jsx` onboarding gate to skip Spotify onboarding in preview**

The current gate logic in `frontend/src/App.jsx` (around lines 578-599) checks for stored Spotify client ID, then calls `/auth/spotify-status`, then conditionally initiates a Spotify PKCE redirect. In preview mode, all of that must be skipped — the seeded `music_tokens` row is enough for backend API calls to succeed.

Find this block (near line 578):

```javascript
// Auth gate
const isSpotifyCallback = window.location.pathname === '/auth/spotify/callback'
const hasLocalClientId = !!localStorage.getItem('spotify_client_id')
// Onboarding check state: 'idle' | 'checking' | 'needs_onboarding' | 'reconnecting' | 'ready'
const [onboardingCheckState, setOnboardingCheckState] = useState(() => {
  if (!session) return 'idle'
  if (isSpotifyCallback) return 'needs_onboarding' // OnboardingWizard handles callback
  if (hasLocalClientId) return 'ready'
  return 'checking'
})
```

Replace the initial state computation with:

```javascript
// Auth gate
const isSpotifyCallback = window.location.pathname === '/auth/spotify/callback'
const hasLocalClientId = !!localStorage.getItem('spotify_client_id')
// Onboarding check state: 'idle' | 'checking' | 'needs_onboarding' | 'reconnecting' | 'ready'
const [onboardingCheckState, setOnboardingCheckState] = useState(() => {
  if (IS_PREVIEW) return 'ready' // Preview deploys skip onboarding entirely
  if (!session) return 'idle'
  if (isSpotifyCallback) return 'needs_onboarding' // OnboardingWizard handles callback
  if (hasLocalClientId) return 'ready'
  return 'checking'
})
```

Also guard the two `useEffect`s that transition out of `'idle'` and out of `'checking'` (around lines 590-629) so they no-op in preview mode. Add `|| IS_PREVIEW` to each effect's early-return condition:

```javascript
// Transition from 'idle' once session arrives
useEffect(() => {
  if (IS_PREVIEW) return
  if (onboardingCheckState !== 'idle' || !session) return
  // ... rest unchanged
}, [onboardingCheckState, session, isSpotifyCallback, hasLocalClientId])

useEffect(() => {
  if (IS_PREVIEW) return
  if (onboardingCheckState !== 'checking' || !session) return
  // ... rest unchanged
}, [onboardingCheckState, session, spotifyAuth])
```

Add the import at the top of `App.jsx` (near the other imports):

```javascript
import { IS_PREVIEW } from './previewMode'
```

- [ ] **Step 7: Run the full frontend test suite**

```
cd frontend && npm test -- --run
```

Expected: passing count = Pre-flight Step 3 baseline + 2 (the two new preview-mode tests). No failures.

- [ ] **Step 8: Commit**

```
git add frontend/src/hooks/useAuth.js frontend/src/hooks/useAuth.test.js frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(frontend): synthesize preview session + skip Spotify onboarding

- useAuth returns a hardcoded PREVIEW_SESSION when IS_PREVIEW, never
  calling real supabase.auth methods
- App.jsx onboarding gate short-circuits to 'ready' in preview mode
  and the gate useEffects no-op so we never initiate a Spotify PKCE
  redirect on a preview deploy
- Tests cover both preview short-circuit and prod-mode fallthrough

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `supabase/seed.sql` — minimal preview fixtures

**Files:**
- Modify: `supabase/seed.sql` (replace placeholder)

This file runs automatically on every Supabase preview branch after migrations. It creates the single preview user plus minimal fixtures so the UI renders against realistic data.

- [ ] **Step 1: Inspect the library_cache schema to know what columns to populate**

```
grep -A 20 "CREATE TABLE.*library_cache" supabase/migrations/*.sql
```

Record the column list for `public.library_cache` — you'll need it when writing the INSERT statements. Same for `public.collections`, `public.collection_albums`, `public.profiles`, `public.music_tokens`.

- [ ] **Step 2: Overwrite `supabase/seed.sql` with the preview fixtures**

Write the following to `supabase/seed.sql`. You may need to adjust column names in the INSERTs to match what Step 1 revealed in the actual schema — the shape below is the intended fixture, not the literal schema.

```sql
-- Seed data for Supabase preview branches.
--
-- Supabase Branching (enabled via the GitHub integration) creates an
-- isolated DB for every PR, runs supabase/migrations/*.sql, then runs
-- this file. It is NOT applied to the prod database — only preview
-- branches.
--
-- The preview user has a hardcoded UUID that matches:
--   - backend/auth_middleware.py    PREVIEW_USER_ID
--   - frontend/src/previewMode.js   PREVIEW_USER_ID
--
-- The preview deploy short-circuits both frontend and backend auth to
-- this user, so previews render the seeded library without running
-- Spotify OAuth or Google OAuth.

-- ---------------------------------------------------------------
-- 1. Preview auth user
-- ---------------------------------------------------------------
-- Insert directly into auth.users. The encrypted_password is a valid
-- bcrypt hash of the string 'preview-unused' but password auth is
-- never invoked on preview deploys (frontend bypasses getSession).
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data,
    raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'preview@crate.local',
    '$2a$10$CwTycUXWue0Thq9StjUM0uJ8pCc9n0p4l1E6pP4p7y9RZfJj7cL1S',
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Preview User"}'::jsonb,
    false,
    false,
    false
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. Profile row
-- ---------------------------------------------------------------
INSERT INTO public.profiles (id, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Music tokens (fake Spotify credentials)
-- ---------------------------------------------------------------
-- Real Spotify API calls with these tokens will fail — that is
-- intentional. Preview deploys cannot hit api.spotify.com; all
-- library data comes from seeded library_cache rows below.
INSERT INTO public.music_tokens (
    user_id, service, access_token, refresh_token, expires_at,
    client_id, created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'spotify',
    'PREVIEW_FAKE_ACCESS',
    'PREVIEW_FAKE_REFRESH',
    now() - interval '1 day',  -- pre-expired so refresh attempts fail fast
    'PREVIEW_FAKE_CLIENT_ID',
    now(),
    now()
)
ON CONFLICT (user_id, service) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Library cache (~10 real Spotify album IDs)
-- ---------------------------------------------------------------
-- Using real Spotify album IDs so cover art URLs (i.scdn.co) resolve.
-- Cover art on Spotify's CDN is public — no token required.
INSERT INTO public.library_cache (
    user_id, service_id, name, artist, image_url, added_at, service
)
VALUES
    ('00000000-0000-0000-0000-000000000001', '5ht7ItJgpBH7W6vJ5BqpPr', 'Radiodread',              'Easy Star All-Stars',   'https://i.scdn.co/image/ab67616d0000b2735b8c3a6a8d2b5b8b4f0e2a3b', now() - interval '10 days', 'spotify'),
    ('00000000-0000-0000-0000-000000000001', '6dVIqQ8qmQ5GBnJ9shOYGE', 'Currents',                'Tame Impala',           'https://i.scdn.co/image/ab67616d0000b2739e1cfc756886ac782e363d79', now() - interval '9 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '1bt6q2SruMsBtcerNVtpZB', 'Channel Orange',          'Frank Ocean',           'https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526', now() - interval '8 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '2ANVost0y2y52ema1E9xAZ', 'To Pimp a Butterfly',     'Kendrick Lamar',        'https://i.scdn.co/image/ab67616d0000b273cdb645498cd3d8a2db4d05e1', now() - interval '7 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '7dqftJ3kas6D0VAdmt3k3V', 'Blonde',                  'Frank Ocean',           'https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526', now() - interval '6 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '0JGOiO34nwfUdDrD612dOp', 'The Dark Side of the Moon','Pink Floyd',           'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe', now() - interval '5 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '4LH4d3cOWNNsVw41Gqt2kv', 'The Dark Side of the Moon','Pink Floyd',           'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe', now() - interval '4 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '6FJxoadUE4JNVwWHghBwnb', 'In Rainbows',             'Radiohead',             'https://i.scdn.co/image/ab67616d0000b2738f3f8ab55f8580c47cb4f2c9', now() - interval '3 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '0JWYKonHNBqYG24TeBS2Oo', 'Kid A',                   'Radiohead',             'https://i.scdn.co/image/ab67616d0000b27364b0fb8f69ac83323ba57db9', now() - interval '2 days',  'spotify'),
    ('00000000-0000-0000-0000-000000000001', '2noRn2Aes5aoNVsU6iWThc', 'Ctrl',                    'SZA',                   'https://i.scdn.co/image/ab67616d0000b273d08c0bb2a4b1c87cf8f8a7c5', now() - interval '1 day',   'spotify');

-- ---------------------------------------------------------------
-- 5. A single collection with 3 albums
-- ---------------------------------------------------------------
INSERT INTO public.collections (id, user_id, name, description, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000001',
    'Sample Collection',
    'Preview fixture — seeded by supabase/seed.sql',
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.collection_albums (collection_id, album_service_id, position, added_at)
VALUES
    ('00000000-0000-0000-0000-0000000000a1', '6dVIqQ8qmQ5GBnJ9shOYGE', 0, now()),
    ('00000000-0000-0000-0000-0000000000a1', '1bt6q2SruMsBtcerNVtpZB', 1, now()),
    ('00000000-0000-0000-0000-0000000000a1', '7dqftJ3kas6D0VAdmt3k3V', 2, now())
ON CONFLICT DO NOTHING;
```

**Important:** The column names above (e.g., `service_id`, `added_at`, `image_url`, `album_service_id`, `position`) are what the spec requires conceptually. The real column names may differ slightly — confirm against what you found in Step 1 and adjust the INSERTs to match. If a required column is NOT NULL and doesn't have a default, you must supply a value.

- [ ] **Step 3: Run `supabase db lint` to catch obvious SQL errors**

```
supabase db lint --schema public
```

Expected: no errors. If it complains about column names, fix the INSERT statements. `supabase db lint` works without a running local DB — it lints the migration+seed files only.

- [ ] **Step 4: Commit**

```
git add supabase/seed.sql
git commit -m "$(cat <<'EOF'
feat(seed): add preview fixtures for Supabase branching

Replaces the empty placeholder with real fixtures Supabase preview
branches load automatically:
- auth.users row with preview UUID (matches backend + frontend)
- profiles row
- music_tokens with fake Spotify credentials (Spotify API calls fail
  intentionally — previews render from cache, not live sync)
- 10 library_cache rows using real Spotify album IDs so cover art
  URLs resolve against the public CDN
- 1 collection with 3 collection_albums rows

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Delete Railway + `frontend/vercel.json`

**Files:**
- Delete: `backend/Procfile`
- Delete: `backend/railway.json`
- Delete: `backend/requirements-prod.txt`
- Delete: `frontend/vercel.json`

- [ ] **Step 1: Verify nothing at runtime references these files**

```
grep -rn "Procfile\|railway.json\|requirements-prod" backend/ frontend/ --include="*.py" --include="*.js" --include="*.jsx"
```

Expected: empty output, or only references inside files being deleted. Documentation references under `docs/` are fine.

- [ ] **Step 2: Delete the files**

```
rm backend/Procfile
rm backend/railway.json
rm backend/requirements-prod.txt
rm frontend/vercel.json
```

- [ ] **Step 3: Run backend tests to confirm nothing broke**

```
backend/.venv/bin/pytest backend/tests/ -q
```

Expected: same passing count as Task 3 Step 7 (pre-flight + 2). No failures.

- [ ] **Step 4: Commit**

```
git add backend/Procfile backend/railway.json backend/requirements-prod.txt frontend/vercel.json
git commit -m "$(cat <<'EOF'
chore: delete Railway + old frontend Vercel config

- backend/Procfile, backend/railway.json: no longer deploying to Railway
- backend/requirements-prod.txt: superseded by api/requirements.txt
- frontend/vercel.json: superseded by repo-root vercel.json

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Hosting line in the Architecture section**

Find the line:

```
- **Hosting**: Backend on Railway or Render; frontend on Vercel
```

Replace with:

```
- **Hosting**: Single Vercel project (monorepo). Backend FastAPI runs via `api/index.py` ASGI shim on Vercel Python 3.12; frontend is the Vite build from `frontend/dist/`. Supabase provides Postgres + Auth + branching.
```

- [ ] **Step 2: Rewrite the "Database migrations" section**

Find the existing section that starts `## Database migrations`. Replace its contents with:

```markdown
## Database migrations

- Migrations live in `supabase/migrations/` as timestamped SQL files
- Managed by the Supabase CLI (`brew install supabase/tap/supabase`), tested with v2.84.2
- The baseline (`20260411000000_remote_schema.sql`) was generated via `pg_dump` against the session pooler
- To add a new migration: `supabase migration new <descriptive_name>`, edit the generated file, commit on a feature branch, push, open a PR
- **How migrations reach prod:** automatically via the Supabase GitHub integration. On PR open, Supabase creates an isolated preview branch DB and applies all pending migrations + `supabase/seed.sql` to it. On PR merge to main, Supabase auto-applies the new migrations to the prod database
- Source of truth for what's applied: the remote `supabase_migrations.schema_migrations` table (viewable via the Supabase MCP `list_migrations` tool)
```

- [ ] **Step 3: Add a new "Preview deploys" section immediately after "Database migrations"**

```markdown
## Preview deploys

- Every PR gets an automatic Vercel preview deploy backed by an isolated Supabase branch DB
- Preview deploys short-circuit authentication: frontend synthesizes a fake Supabase session for the hardcoded preview user (`00000000-0000-0000-0000-000000000001`), and backend `get_current_user` returns the same UUID without validating tokens when `VERCEL_ENV=preview`
- The preview short-circuit is defined in `backend/auth_middleware.py` and `frontend/src/previewMode.js` — both reference the same UUID, which must also match the `auth.users` row seeded by `supabase/seed.sql`
- Real Spotify API calls do NOT work on previews (seeded tokens are fake). Previews render seeded library data from `library_cache`; playback and live sync are expected to fail
- Google OAuth is never invoked on previews — the frontend auto-logs in as the preview user
- Prod (`VERCEL_ENV=production`) is completely unaffected: the preview code paths are dead code in prod. A belt-and-suspenders guard in `_is_preview_env()` refuses to activate the bypass if `SUPABASE_URL` still contains the prod project ref
```

- [ ] **Step 4: Commit**

```
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md for Vercel Python + preview deploys

- Hosting line: Railway out, monorepo Vercel project in
- Database migrations section: resolve the "TBD — sub-project C"
  note with the Supabase GitHub integration auto-apply answer
- New "Preview deploys" section explaining the VERCEL_ENV=preview
  short-circuit, preview user UUID, and prod safety guards

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full regression run

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

```
backend/.venv/bin/pytest backend/tests/ -q
```

Expected: passing count = Pre-flight Step 2 baseline + 2 (the two new preview tests). Zero failures.

- [ ] **Step 2: Run the full frontend test suite**

```
cd frontend && npm test -- --run
```

Expected: passing count = Pre-flight Step 3 baseline + 2 (the two new preview-mode tests). Zero failures.

- [ ] **Step 3: Run the Playwright E2E suite to confirm the local dev flow still works**

```
cd frontend && npm run test:e2e
```

Expected: same pass count as before the branch. The E2E suite runs against `localhost:5173` / `localhost:8000` — no preview-env vars set locally, so it exercises the production code path.

If any E2E tests fail with `VERCEL_ENV` leakage, check that `vi.unstubAllEnvs()` ran correctly in the unit tests (Playwright is a separate process so it shouldn't be affected, but it's worth checking).

---

## Task 9: Push the feature branch

**Files:** none (git only)

- [ ] **Step 1: Confirm commit sequence looks correct**

```
git log --oneline main..HEAD
```

Expected: roughly 7 commits, one per task (Tasks 1-7), in order.

- [ ] **Step 2: Push the branch to origin**

```
git push -u origin feat/vercel-python-cutover
```

Expected: push succeeds. **Do not open a PR yet** — Task 10's manual prep must be done first: seed the preview user into prod Supabase, re-link Vercel to the repo root, and set the env vars. Without those, the preview deploy will build but fail to render the library.

---

## Task 10: Manual prep (USER ACTION REQUIRED)

**Files:** none (dashboard + one SQL execution)

This task is manual — the user completes these steps in the Vercel dashboard plus one SQL execution against prod Supabase. Nothing happens in git.

**Why this task shrank vs the original plan:** The original plan assumed Supabase branching (Supabase GitHub app + Branching + Supabase-Vercel integration). Supabase moved branching to the Pro plan ($25/mo), so we're using a simpler model: previews share the prod Supabase DB and auth-bypass to a seeded preview user. No Supabase integrations to install.

- [ ] **Step 1: Apply `supabase/seed.sql` to the prod Supabase DB (one-time bootstrap)**

This inserts the preview user rows in prod. The file is idempotent (`ON CONFLICT DO NOTHING`), so re-applying is safe.

Run via the Supabase MCP:

```
mcp__supabase__execute_sql query="$(cat supabase/seed.sql)"
```

Or, if the MCP tool errors on auth.users inserts (some Supabase MCP versions restrict writes to the `auth` schema), copy the SQL into the Supabase dashboard SQL editor and run it there: https://supabase.com/dashboard/project/qahbkhrpqeslmtiovgrb/sql/new

Expected: all INSERT statements succeed or are silently no-oped by the `ON CONFLICT DO NOTHING` clause. Verify with:

```
mcp__supabase__execute_sql query="SELECT id, email FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'"
```

Expected: one row returned.

- [ ] **Step 2: Re-link the Vercel project from `frontend/` to repo root**

1. Vercel dashboard → `crate` project → Settings → General → Root Directory.
2. Change from `frontend` to empty (or `.`).
3. Save. Vercel will now read `vercel.json` from the repo root.

- [ ] **Step 3: Set env vars in the Vercel dashboard**

Under Vercel project → Settings → Environment Variables. Most vars apply to **both** Production and Preview scopes — check both boxes when adding. Only three vars differ between scopes.

**Vars shared (check both Production and Preview boxes):**

| Name | Value | Source |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | *(copy from Railway)* | existing |
| `SPOTIFY_CLIENT_SECRET` | *(copy from Railway)* | existing |
| `SUPABASE_URL` | *(prod Supabase URL)* | backend |
| `SUPABASE_ANON_KEY` | *(prod anon key)* | backend |
| `SUPABASE_SERVICE_KEY` | *(prod service role key)* | backend |
| `VITE_API_URL` | *(empty)* | frontend same-origin |
| `VITE_SUPABASE_URL` | *(prod Supabase URL, same as backend)* | frontend bundle |
| `VITE_SUPABASE_ANON_KEY` | *(prod anon key, same as backend)* | frontend bundle |
| `VITE_SPOTIFY_REDIRECT_URI` | `https://crate.vercel.app/auth/spotify/callback` | frontend PKCE |

**Vars that differ between scopes (add twice, once per scope):**

| Name | Production value | Preview value |
|---|---|---|
| `ENVIRONMENT` | `production` | `preview` |
| `ALLOWED_ORIGINS` | `https://crate.vercel.app` | `*` |
| `VITE_VERCEL_ENV` | `production` | `preview` |

To "copy from Railway", open the Railway project dashboard → Variables tab → copy the value into Vercel.

- [ ] **Step 4: Verify the Spotify app redirect URI allowlist**

In the Spotify developer dashboard, confirm the redirect URIs list contains:
- `http://localhost:5173/auth/spotify/callback` (local dev — already present)
- `http://127.0.0.1:5173/auth/spotify/callback` (local dev fallback — already present)
- The prod Vercel URL: `https://crate.vercel.app/auth/spotify/callback` (add if missing)

Previews do not need a Spotify redirect URI because previews skip Spotify OAuth entirely (seeded fake tokens; real Spotify API calls will fail intentionally on previews).

---

## Task 11: Open the PR and smoke-test the preview deploy

**Files:** none (verification only)

- [ ] **Step 1: Open the PR**

```
gh pr create \
  --base main \
  --head feat/vercel-python-cutover \
  --title "feat: Vercel Python + preview auth bypass + Railway decommission (sub-project C)" \
  --body "$(cat <<'EOF'
## Summary

Cuts over the Crate backend from Railway to Vercel Python and ships a
preview-mode auth short-circuit so every PR gets a working preview
deploy that auto-logs in as a seeded preview user.

Note: Supabase branching is Pro-only and we're on the free tier, so
previews share the prod Supabase DB rather than getting isolated
per-PR branch DBs. The preview user is isolated from real users by
user_id. Tracked as a future upgrade in BACKLOG.md Platform section.

Completes sub-project C of the prod/dev environment split (A and B
already shipped).

## What's in this PR

- api/index.py ASGI shim + root vercel.json (monorepo layout)
- backend/auth_middleware.py: VERCEL_ENV=preview short-circuit
- frontend/src/previewMode.js + useAuth: preview session synth
- frontend/src/App.jsx: skip Spotify onboarding in preview
- supabase/seed.sql: 1 user + 10 albums + 1 collection preview fixtures
  (applied to prod as a one-time bootstrap pre-PR)
- Deletes: backend/Procfile, backend/railway.json,
  backend/requirements-prod.txt, frontend/vercel.json
- CLAUDE.md + BACKLOG.md updates
- E2E fixes: playwright.config.js runs Vite in preview mode;
  stale /auth/status + /auth/login mocks removed; home.spec.js
  section names + mobile/playback idle mocks updated; real bug
  fix in DevicePicker.jsx (event bubbling through backdrop)

## Test plan

- [x] Backend unit tests pass (176 = 174 baseline + 2 new preview tests)
- [x] Frontend unit tests pass (410 = 408 baseline + 2 new preview tests)
- [x] Playwright E2E passes (51/51, up from 1/52 before this branch)
- [x] Preview user seeded into prod Supabase via MCP
- [ ] Vercel preview deploy builds the Python function + Vite bundle
- [ ] Preview URL renders the seeded library, collection opens,
      logout button does not crash
- [ ] Post-merge: prod URL loads, real Google login works, real
      library renders, real Spotify playback works on a real device

Spec: docs/specs/2026-04-11-vercel-python-branching-cutover-design.md
Plan: docs/plans/2026-04-11-vercel-python-branching-cutover.md
EOF
)"
```

- [ ] **Step 2: Wait for the Vercel preview deploy**

Vercel should post a preview URL on the PR within a minute or two (e.g., `crate-git-feat-vercel-python-cutover-<user>.vercel.app`). If the build fails, read the Vercel logs — common failures:
- `api/requirements.txt` missing a package used at import time → add it.
- `vercel.json` rewrite syntax error → fix regex.
- `api/index.py` failing to import `main` → check that `sys.path` manipulation is working; may need to adjust `_BACKEND` path.
- Missing env vars in the Preview scope → go back to Task 10 Step 3 and verify all the shared vars were checked for both scopes.

Iterate until the Vercel preview is green on the PR.

- [ ] **Step 3: Smoke-test the preview URL in a real browser**

Open the preview URL. Expected behavior:
- App loads immediately (no login screen).
- Library grid shows the 10 seeded albums with cover art from Spotify's public CDN.
- Click an album → track list opens (may be empty; that's fine, no tracks are seeded).
- Click the Collections tab → "Sample Collection" appears with 3 albums.
- Tap play on an album → playback bar updates state but the actual Spotify playback call fails silently (expected — seeded music_tokens are fake, real Spotify API calls are not supposed to work on previews).

If the preview URL shows a login screen, a blank page, or fails to render the library, something is wrong with the preview bypass. Most likely causes:
- `VITE_VERCEL_ENV` not set to `preview` in the Preview scope (check in browser devtools: `import.meta.env.VITE_VERCEL_ENV`).
- Backend did not pick up `VERCEL_ENV=preview` from the Vercel runtime (check the function logs in Vercel dashboard).
- `supabase/seed.sql` was not applied to prod, so the preview user rows don't exist. Verify via `SELECT id FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'`.

Do not merge until the preview is fully green and the smoke test passes.

---

## Task 12: Merge and verify prod

**Files:** none (verification only)

- [ ] **Step 1: Merge the PR to main**

```
gh pr merge --merge feat/vercel-python-cutover
```

Expected: merge succeeds. Vercel automatically builds a new prod deploy.

- [ ] **Step 2: Wait for the prod Vercel deploy to finish**

Watch the deploy in the Vercel dashboard. First prod request after the deploy will cold-start the Python function (~2-3s). Any import errors or missing env vars will show up in Vercel runtime logs, not at build time.

- [ ] **Step 3: Smoke-test the real prod URL**

Open the prod URL (e.g., `crate.vercel.app`) in a browser. Expected:
- Login screen appears (real Google OAuth via Supabase).
- Log in with your real Google account.
- Library renders real albums from the prod database.
- Tap an album, tap play, confirm Spotify Connect actually plays music on a real device.

If any of this fails, **do not delete Railway yet**. Investigate the error first. The Railway service is still running and the DB is shared, so the fallback is to revert the `VITE_API_URL` env var in Vercel to point at the old Railway URL and redeploy — but to do that you'd need to re-add `VITE_API_URL` since we just removed it.

- [ ] **Step 4: Verify Supabase auto-applied migrations to prod**

Use the Supabase MCP to confirm no new migrations were applied (this PR didn't add any):

```
mcp__supabase__list_migrations
```

Expected: same 1 migration entry as before (`20260411000000_remote_schema`). The cutover PR did not add any new migrations, so the `schema_migrations` table is unchanged.

---

## Task 13: Post-merge cleanup

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Mark sub-project C complete in `BACKLOG.md`**

The BACKLOG.md sub-project C line was already updated during the Option B pivot commit (to reflect the new title "Vercel Python hosting + preview auth bypass + Railway decommission"), but the checkbox is still `- [ ]`. Flip it to `- [x]`:

Find:

```
  - [ ] Sub-project C: Vercel Python hosting + preview auth bypass + Railway decommission | [spec](docs/specs/2026-04-11-vercel-python-branching-cutover-design.md) | [plan](docs/plans/2026-04-11-vercel-python-branching-cutover.md)
```

Replace with:

```
  - [x] Sub-project C: Vercel Python hosting + preview auth bypass + Railway decommission | [spec](docs/specs/2026-04-11-vercel-python-branching-cutover-design.md) | [plan](docs/plans/2026-04-11-vercel-python-branching-cutover.md)
```

Then check the parent bullet — if sub-projects A, B, and C are all marked complete, mark the parent "Prod + dev environment split" as complete too.

- [ ] **Step 2: Commit and push directly to main**

```
git checkout main
git pull
git add BACKLOG.md
git commit -m "$(cat <<'EOF'
docs: mark prod/dev sub-project C complete

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 3: Delete the Railway service (USER ACTION)**

1. Railway dashboard → `crate` project (or whatever name Railway shows) → Settings → Danger Zone → Delete Service.
2. Confirm deletion.
3. Railway no longer runs the Crate backend. All traffic now flows through Vercel.

- [ ] **Step 4: Confirm the app still works 1-2 hours after Railway deletion**

Open the prod URL, verify library loads, play a song. If anything broke between Step 3 and now, check Vercel logs — you may have a leftover Railway-only env var that was silently being depended on.

---

## Rollback plan

If something breaks after merge and cleanup needs undoing:

1. **Revert the cutover PR merge:**
   ```
   git revert -m 1 <merge-commit-sha>
   git push origin main
   ```
   Vercel will rebuild with the old Railway-dependent layout, but since Railway is deleted, prod will be down until you redeploy Railway or push forward to fix Vercel.

2. **If Railway is still running (cleanup Task 13 Step 3 not yet done):**
   - In Vercel env vars, re-add `VITE_API_URL` pointing at the Railway URL.
   - Trigger a new Vercel deploy. The frontend will now hit Railway for API calls while the Python function on Vercel is unused.
   - Investigate the Vercel Python failure, fix, re-ship.

3. **Bad migration on prod:**
   - The cutover PR doesn't add migrations, so this isn't an immediate concern.
   - Future migration issues: write a forward-only revert migration and ship as a normal PR.

4. **Supabase preview branch stuck / orphaned:**
   - Close the PR, Supabase deletes the branch.
   - If the branch doesn't clean up, go to Supabase dashboard → Branching → delete it manually.

Prod data is untouched throughout C — no risk of data loss from the cutover itself.
