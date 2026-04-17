# Vercel Python + Preview Auth Bypass + Railway Decommission — Design Spec

**Date:** 2026-04-11 (revised 2026-04-11 after discovering Supabase branching is Pro-only)
**Sub-project:** C (of prod/dev environment split; A and B complete)
**Status:** Approved, ready for implementation plan

## Goal

Replace Railway-hosted FastAPI with Vercel Python in a monorepo layout, enable Vercel preview deploys with a preview-mode auth bypass so every PR gets a smoke-testable preview URL that auto-logs in as a seeded test user, and decommission Railway. All preview deploys share the prod Supabase DB — per-PR DB isolation is parked until we upgrade to Supabase Pro.

## Non-goals

- **Supabase branching / per-PR DB isolation.** Supabase moved branching behind Pro ($25/mo) and we're on the free tier. Previews share the prod DB. This is explicitly a tradeoff: we lose schema isolation between PRs but keep the project at $0/mo recurring cost. Revisit when revenue or real-user incidents justify the upgrade. Tracked in `BACKLOG.md` Platform section.
- Local Supabase via Docker. Dev happens against the cloud prod DB; no `supabase start`, no Docker Desktop.
- Real Spotify OAuth on preview deploys. Previews use seeded fixtures and a short-circuited auth path.
- Refactoring routers, SQL, or frontend code beyond what the cutover requires.

## Background

- **Sub-project A** refactored `backend/routers/library.py` to be serverless-compatible (no in-memory cache dict, no FastAPI `BackgroundTasks`; `POST /library/sync` is now a chunked endpoint driven by the frontend).
- **Sub-project B** cut over from `backend/migrate.py` to Supabase CLI migrations. Baseline lives at `supabase/migrations/20260411000000_remote_schema.sql`, generated via `pg_dump` against the session pooler.
- `supabase/seed.sql` contains preview-user fixtures (1 user, 10 albums, 1 collection) and is applied to prod **once** as a bootstrap, rather than per preview branch.
- `CLAUDE.md` currently says "How migrations get applied to prod: TBD — resolved in sub-project C." C resolves this to "manual `supabase db push` after merge, always apply before merging a migration-bearing PR" because we don't have Pro branching.
- Current deploy: backend on Railway (`backend/Procfile`, `backend/railway.json`, `backend/requirements-prod.txt`), frontend on Vercel from `frontend/` subdirectory (`frontend/vercel.json`).
- Frontend uses `VITE_API_URL` to reach the backend and `VITE_SPOTIFY_REDIRECT_URI` for Spotify PKCE. Google OAuth flows through Supabase Auth.

## Architecture

### Single Vercel project, monorepo layout

Re-link the existing Vercel project from `frontend/` to the repo root. New root-level `vercel.json` defines:

- Build: `cd frontend && npm install && npm run build`, output at `frontend/dist/`.
- Routes: `/api/*` → Vercel Python function; everything else → `frontend/dist/index.html` (SPA rewrite, with a negative lookahead so API routes don't get fallback-rewritten to HTML).
- Functions: `api/index.py` on Python 3.12 runtime with `maxDuration: 60`.

`api/index.py` is a thin ASGI shim that adds `backend/` to `sys.path` and imports `app` from `backend/main.py`. Vercel's Python runtime auto-wraps ASGI apps, so no Mangum/adapter code is needed.

`api/requirements.txt` contains the same subset that `backend/requirements-prod.txt` used to contain. We duplicate rather than symlink because Vercel's build step reads `api/requirements.txt` from its literal location.

### Request flow

**Prod** (`crate.vercel.app`):
- Frontend fetches `/api/library/albums` → same-origin → Vercel routes to `api/index.py` → FastAPI → prod Supabase.
- `VITE_API_URL=""` (empty); frontend uses relative `/api` prefix.

**Preview** (`crate-<branch>.vercel.app`):
- Same request flow, but `VERCEL_ENV=preview` flips the auth bypass on.
- Preview deploys use the **same** Supabase credentials as prod (we do NOT have per-PR branch DBs). Vercel env vars are set in both the Production and Preview scopes for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- The preview bypass routes every request to the seeded preview user (`00000000-0000-0000-0000-000000000001`). The preview user's rows live in prod but are isolated from real users by `user_id`.

**Local dev** unchanged: `localhost:5173` (Vite) hits `localhost:8000` (uvicorn) via `VITE_API_URL=http://127.0.0.1:8000`. Local backend points at prod Supabase via `.env`.

### Cold starts

Vercel Python is serverless. First request after ~15 min idle boots a container (~2-3s wall clock: image pull, Python start, import FastAPI + Supabase client + Spotipy + routers). Warm requests are ~100-400ms. For a 3-user personal app this is acceptable; no keep-warm cron or Fluid Compute needed now.

### Safety rails on the preview bypass

The bypass lives in two files and is gated entirely on Vercel's `VERCEL_ENV` system variable:

- `backend/auth_middleware.py`: `_is_preview_env()` returns `True` iff `VERCEL_ENV == 'preview'`. No SUPABASE_URL guard — in this design the preview legitimately shares the prod Supabase URL.
- `frontend/src/previewMode.js`: `IS_PREVIEW` is `import.meta.env.VITE_VERCEL_ENV === 'preview'`, which Vercel substitutes at build time from its system `VERCEL_ENV`.

Why this is safe enough:

1. `VERCEL_ENV` is a Vercel-system-set variable. It cannot be overridden from the Production scope of the Vercel env-var UI; Vercel forcibly sets it to `production` for prod deploys, `preview` for preview deploys, `development` for `vercel dev`. A misconfigured project cannot flip prod into preview mode.
2. The seeded preview user has `00000000-0000-0000-0000-000000000001` — a fixed UUID. No real Google OAuth account can mint a JWT with that `sub` claim, so no real user can accidentally log in as the preview user through the prod auth path.
3. Writes from preview deploys modify only the preview user's rows (isolated by `user_id` in every table). They never touch real users' data.
4. The preview user's state persists across preview deploys (since all previews share one DB). If a PR's smoke test leaves the preview user in a weird state, either (a) the next PR fixes it, or (b) we reset via `supabase/seed.sql`.

## Components

### 1. `vercel.json` (new, repo root)

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

### 2. `api/index.py` (new)

```python
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from main import app  # noqa: E402
```

### 3. `api/requirements.txt` (new)

Copy of `backend/requirements-prod.txt` contents. Vercel reads this to install the function's Python deps during build.

### 4. `backend/auth_middleware.py` — preview bypass

- `PREVIEW_USER_ID` and `PREVIEW_FAKE_TOKEN` constants match `frontend/src/previewMode.js` and the prod `auth.users` row seeded by `supabase/seed.sql`.
- `_is_preview_env()` returns `True` iff `os.getenv("VERCEL_ENV") == "preview"`. Relies solely on the Vercel-injected system variable.
- `get_current_user` short-circuits to `{"user_id": PREVIEW_USER_ID, "token": PREVIEW_FAKE_TOKEN}` when `_is_preview_env()` is `True`.
- `get_authed_db` returns `get_service_db()` (the service-role client) when `_is_preview_env()` is `True`, because the fake JWT can't authenticate against postgREST. RLS is bypassed, but every query still naturally filters by `user_id == PREVIEW_USER_ID` because that's what routers pass down.

### 5. `backend/db.py` — service-role env var fallback

`get_service_db()` now accepts either `SUPABASE_SERVICE_KEY` (current name) or `SUPABASE_SERVICE_ROLE_KEY` (the canonical Supabase name). Safe to carry forward regardless of tier.

### 6. `frontend/src/previewMode.js` (new)

Exports `IS_PREVIEW`, `PREVIEW_USER_ID`, `PREVIEW_USER_EMAIL`. `IS_PREVIEW` is computed at module-load time from `import.meta.env.VITE_VERCEL_ENV`.

### 7. `frontend/src/hooks/useAuth.js` — preview auto-login

When `IS_PREVIEW` is `true`, `useAuth` returns a synthesized `PREVIEW_SESSION` (access_token = `"PREVIEW_FAKE"`, user.id = `PREVIEW_USER_ID`) without calling `supabase.auth.getSession()`. In prod, unchanged.

### 8. `frontend/src/App.jsx` — onboarding gate bypass

When `IS_PREVIEW` is `true`:
- Initial `onboardingCheckState` is `'ready'` (skip the Spotify onboarding flow).
- The two `useEffect`s that transition out of `'idle'` and `'checking'` no-op early (so we never initiate a Spotify PKCE redirect).

### 9. `supabase/seed.sql` — preview user fixtures

Contains fixtures for the preview user: auth row, profile, music_tokens (fake Spotify creds), library_cache (10 real album IDs), collections, collection_albums. This file is **applied to prod once** during the cutover pre-flight. It is idempotent via `ON CONFLICT DO NOTHING` — safe to re-apply if we ever need to reset preview state.

### 10. Deleted files

- `backend/Procfile`
- `backend/railway.json`
- `backend/requirements-prod.txt`
- `frontend/vercel.json`

### 11. `CLAUDE.md` updates

- **Hosting** line: replace "Backend on Railway or Render; frontend on Vercel" with single Vercel monorepo description.
- **Database migrations** section: resolve the "TBD" note with "manual `supabase db push` after merge; always apply before merging a migration-bearing PR."
- New **Preview deploys** subsection explaining the shared-prod-DB tradeoff, the seeded preview user, the `VERCEL_ENV`-gated bypass, and the data isolation by `user_id`.

## One-time bootstrap: seed the preview user into prod

Before the cutover PR merges, `supabase/seed.sql` must be applied to the **prod Supabase database** as a one-time bootstrap. This inserts the preview user rows in `auth.users`, `public.profiles`, `public.music_tokens`, `public.library_cache`, `public.collections`, and `public.collection_albums`.

Apply via the Supabase MCP `execute_sql` tool. The file uses `ON CONFLICT DO NOTHING` on every insert, so re-applying is a no-op. Safe to run against prod.

After this bootstrap, the preview user exists in prod forever. All subsequent preview deploys just authenticate as them via the bypass; no per-PR seeding is needed.

## Dev workflow after C ships

1. Create a feature branch, push, open PR.
2. Vercel builds a preview deploy pointed at the prod Supabase DB with `VERCEL_ENV=preview` set.
3. Click the preview URL — the app auto-logs in as the preview user and renders seeded library data.
4. Smoke-test.
5. If the PR adds a migration, apply it to prod first (manually via the Supabase MCP or `supabase db push`), then merge. Previews share prod, so a pending migration on an open PR will break any other open PR's preview as soon as the schema diverges.
6. Merge to main. Vercel redeploys prod.

## Env var setup (manual, in Vercel dashboard)

Most vars can be set for **both** Production and Preview scopes simultaneously (check both boxes in the Vercel UI). Only a few differ between scopes.

### Vars shared between Production and Preview scopes

| Name | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | *(existing, from Railway)* |
| `SPOTIFY_CLIENT_SECRET` | *(existing)* |
| `SUPABASE_URL` | *(prod URL)* |
| `SUPABASE_ANON_KEY` | *(prod anon key)* |
| `SUPABASE_SERVICE_KEY` | *(prod service role key)* |
| `VITE_API_URL` | *(empty)* |
| `VITE_SUPABASE_URL` | *(prod URL — same as backend SUPABASE_URL)* |
| `VITE_SUPABASE_ANON_KEY` | *(prod anon key)* |
| `VITE_SPOTIFY_REDIRECT_URI` | `https://crate.vercel.app/auth/spotify/callback` |

### Vars that differ

| Name | Production | Preview |
|---|---|---|
| `ENVIRONMENT` | `production` | `preview` |
| `ALLOWED_ORIGINS` | `https://crate.vercel.app` | `*` |
| `VITE_VERCEL_ENV` | `production` | `preview` |

### What we do NOT need

- **Supabase GitHub integration** — only useful with Pro branching. Skip.
- **Supabase Vercel integration** — only useful with Pro branching (it auto-injects per-branch credentials). Skip.

## Rollback

- **Vercel Python surprise post-cutover** → revert the cutover PR merge. Railway itself was deleted at the end of Task 13, so "rollback" means re-provisioning a Railway service from the reverted state. Alternative: since the cutover is atomic and brief downtime was accepted, fix-forward instead of rolling back.
- **Bad migration applied to prod** → write a forward-only revert migration, apply manually. Standard practice.
- **Preview user's state gets corrupted during smoke testing** → re-apply `supabase/seed.sql` to prod. Idempotent via `ON CONFLICT`. For a full reset, `DELETE FROM ... WHERE user_id = '00000000-0000-0000-0000-000000000001'` first, then re-apply.

## Cutover PR

One atomic PR lands all code changes. Downtime during the cutover is acceptable.

**Pre-PR (manual):**

1. Apply `supabase/seed.sql` to prod via the Supabase MCP `execute_sql` tool.
2. Re-link Vercel project from `frontend/` to repo root.
3. Set Vercel env vars (Production + Preview scopes as described above).

**The PR contains:**

1. Root `vercel.json`, `api/index.py`, `api/requirements.txt`.
2. `backend/auth_middleware.py` preview bypass + `backend/db.py` service-role fallback.
3. `frontend/src/previewMode.js` + `frontend/src/hooks/useAuth.js` + `frontend/src/App.jsx` preview session injection and onboarding bypass.
4. `supabase/seed.sql` real fixtures replacing the placeholder (this file stays in the repo for re-application and documentation, even though it's applied to prod manually).
5. Deletes: `backend/Procfile`, `backend/railway.json`, `backend/requirements-prod.txt`, `frontend/vercel.json`.
6. Tests: new backend test for preview bypass, new frontend test for preview session injection.
7. `CLAUDE.md` updates (hosting, migrations, preview deploys sections).
8. `BACKLOG.md` updates (mark sub-project C complete, add Supabase Pro upgrade note).
9. E2E test fixes (Playwright config uses `VITE_VERCEL_ENV=preview`, stale test assertions updated).

**Merge steps:**

1. Smoke-test the PR's own preview deploy first. Confirm seeded albums render, collection opens, auth bypass worked.
2. Merge to main.
3. Vercel builds prod deploy (~2 min). Brief downtime acceptable.
4. First prod request cold-starts the Python function (~2-3s).
5. Verify: log in with real Google, real library renders, tap play, confirm Spotify Connect actually plays music.

**Post-merge cleanup:**

1. Delete the Railway service from the Railway dashboard.
2. Mark sub-project C complete in `BACKLOG.md` (already in the cutover PR — just verify).

## Testing strategy

- **Backend pytest** — all existing tests pass. Two new tests: `VERCEL_ENV=preview` causes `get_current_user` to return `PREVIEW_USER_ID`; when unset or `production`, the normal path runs.
- **Frontend vitest** — all existing tests pass. Two new tests: `useAuth` preview mode synthesizes a session without calling real auth; production mode falls through to real `supabase.auth` calls.
- **Playwright E2E** — launches the Vite dev server with `VITE_VERCEL_ENV=preview` plus stubbed `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` so the app auto-logs in. Replaces the old pattern of mocking `/auth/status` and `/auth/login` (dead endpoints since the Google OAuth migration).
- **Manual prod smoke test post-merge** — open the real prod URL, log in via Google, verify library, tap play, verify Spotify Connect playback.

## Open questions

None. All prior TBDs are resolved:

- **Migration apply to prod:** manual via Supabase MCP or `supabase db push`; always apply before merging a migration-bearing PR.
- **Local Supabase DB:** not in scope; cloud-only dev.
- **Spotify OAuth on previews:** previews don't run Spotify OAuth; seeded fixtures + short-circuited auth.
- **Seed fixtures:** ~10 albums, 1 collection, 1 test user — defined in `supabase/seed.sql`.
- **Cutover strategy:** atomic, brief downtime OK.
- **Vercel deployment shape:** monorepo, single project, root `vercel.json`, `api/index.py` ASGI shim.
- **Per-PR DB isolation:** parked until Supabase Pro. Tracked in `BACKLOG.md` Platform section.
