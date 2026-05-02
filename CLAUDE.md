# Bummer

A personal music library management app that syncs with Spotify and adds custom organization (sorting, tags, ratings, collections) missing from Spotify's native UI. Supports playback control via Spotify Connect.

## Architecture

- **Backend**: FastAPI (Python 3.12) — Spotify OAuth, API sync, custom metadata CRUD
- **Frontend**: React (Vite, JavaScript) — album grid UI, sorting/filtering, playback controls
- **Database**: Supabase (managed Postgres) — stores only user-added metadata; Spotify is source of truth for library data
- **Hosting**: Single Vercel project (monorepo). Backend FastAPI runs via `api/index.py` ASGI shim on Vercel Python 3.12; frontend is the Vite build from `frontend/dist/`. Supabase provides Postgres + Auth + branching.
- **Playback**: Spotify Connect API (controls the native Spotify client on phone/Mac)

## Project Structure

```
bummer/
├── backend/        FastAPI app
│   ├── main.py
│   ├── requirements.txt
│   └── .env        (never commit)
└── frontend/       Vite + React app
    ├── src/
    └── package.json
```

## Backlog and specs

- **Backlog**: `BACKLOG.md` — all open and completed work items, grouped by impact tier
- **Design specs**: `docs/specs/` — each medium+ impact item gets a spec before implementation
- **Implementation plans**: `docs/plans/` — generated from specs before coding begins
- Backlog items must always link to their spec and plan when available
- **Tier ratings (S/A/B/C/D)**: backend fully built and tested, intentionally hidden from UI until the concept is fleshed out more. Do not remove backend code.

## Development approach

- Strict red/green TDD: write a failing test first, then write the minimum code to pass it
- Backend tests: `backend/.venv/bin/python -m pytest` from `backend/` (use `-C` flag or absolute path, never `cd`)
- Frontend tests: `npx vitest --run` from `frontend/` (use `--prefix` or absolute path, never `cd`)
- Never write implementation code without a failing test first
- **Linting (CI-enforced)**: before every commit that touches backend Python files, run both `backend/.venv/bin/ruff check backend/` and `backend/.venv/bin/ruff format --check backend/`. Fix any issues with `ruff check --fix` and `ruff format`. CI runs both checks and will fail the PR if either reports errors.

## Database migrations

- Migrations live in `supabase/migrations/` as timestamped SQL files
- Managed by the Supabase CLI (`brew install supabase/tap/supabase`), tested with v2.84.2
- The baseline (`20260411000000_remote_schema.sql`) was generated via `pg_dump` against the session pooler — `supabase db pull` itself requires Docker, which we're not using
- To add a new migration: `supabase migration new <descriptive_name>`, edit the generated file, commit on a feature branch, push, open a PR
- **How migrations reach prod:** manually, via `supabase db push` (or the Supabase MCP `apply_migration` tool) once the PR is merged. We are not on Supabase Pro, so automatic branch-per-PR application is not available (tracked in `BACKLOG.md` Platform section)
- Always apply migrations to prod BEFORE merging a PR that depends on them — previews share the prod DB, so a pending migration on an open PR will break prod's preview deploy until applied
- Source of truth for what's applied: the remote `supabase_migrations.schema_migrations` table, viewable via the Supabase MCP's `list_migrations` tool

## Preview deploys

- Every PR gets an automatic Vercel preview deploy
- Preview deploys share the **prod Supabase DB** (no per-PR branch DB — Supabase branching is Pro-only and we're on the free tier)
- Preview deploys use **real authentication** — Google OAuth login and real Spotify OAuth via the callback proxy
- The Spotify OAuth callback proxy (`backend/routers/auth_proxy.py`) lets preview deploys complete Spotify OAuth by proxying the callback through the prod backend, since Spotify only allows one redirect URI
- `IS_PREVIEW` (computed from `VITE_VERCEL_ENV`) is used only in `useSpotifyAuth.js` to route Spotify OAuth through the proxy; it does not bypass authentication
- Preview users' data lives in the prod DB alongside real users, isolated by `user_id`
- Prod (`VERCEL_ENV=production`) is unaffected: Vercel injects `VERCEL_ENV=production` for prod deploys, which cannot be overridden from the Vercel env-var UI in the Production scope

## Conventions

- Python 3.12 (`/opt/homebrew/bin/python3.12`)
- Backend uses a virtualenv at `backend/.venv`; run tools via `backend/.venv/bin/python`, `backend/.venv/bin/ruff`, etc.
- Use `pip` for Python packages; keep `requirements.txt` up to date
- Use `npm` for frontend packages (no bun, no yarn)
- Never commit `.env` files — use `.env.example` to document required vars

## Shell commands

Avoid patterns that trigger sandbox approval prompts:

- **Never `source`** — use venv binaries directly: `backend/.venv/bin/python -m pytest` not `source .venv/bin/activate && pytest`
- **Never `cd`** — use absolute paths or tool flags: `git -C <repo-root> add` not `cd <repo-root> && git add`
- **Avoid `&&` chains** — use separate Bash tool calls instead of chaining commands. Each call can run in parallel if independent.
- **`npm`/`npx`** — use `--prefix <path>` or run from the correct `path` parameter instead of `cd frontend &&`

## Git workflow

- **`main` is production** — merging to main triggers a Vercel production deploy to live users. Treat every merge as a production release. Never push, force-push, or merge to main without passing CI and user approval.
- **Issue-first**: every code change starts from a GitHub issue
- **Branch from issue**: branch name is `<issue-number>-<short-title>`, e.g. `18-library-sync-wipes-cache`. No `feat/` prefix.
- **Draft PR immediately**: push branch and open a draft PR linking the issue before writing code. This gives visibility and a place for discussion.
- **Auto-commit** when all tests pass — no need to ask permission
- **One commit per agent task** — each background agent should commit its own work when done
- **Never commit directly to `main`** — `main` is branch-protected. All changes go through a PR, no matter how small.
- Commit message format: concise imperative summary + bullet points for details + `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- **Local preview before PR**: after tests pass, run `make dev-bg` (pass `MAIN_REPO=<path-to-main-repo>` if in a worktree) to start dev servers in the background, then tell the user to open `http://localhost:5173` and review. Do not push or open a PR until the user confirms the local preview looks good. Run `make stop` to clean up after. If ports 5173/8000 are already in use (another agent's preview is running), do NOT kill them — just tell the user another preview is active and wait for them to finish that review first.

## Local dev setup

Running locally requires env vars that aren't committed.

### Main repo

1. **Backend `.env`** — must exist at `backend/.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/callback`.
2. **Frontend `.env`** — pull from Vercel preview scope: `vercel env pull frontend/.env --environment=preview --cwd <project-root>`. The project must be linked (`.vercel/project.json`). After pulling, fix these values:
   - `VITE_API_URL` → `"http://127.0.0.1:8000"` (pulled value is `/api` for Vercel)
   - `VITE_VERCEL_ENV` → `"development"` (pulled value `preview` triggers preview auth short-circuit which skips real Google OAuth)
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — remove any trailing `\n` (Vercel CLI bug)
3. **Backend venv** — if `backend/.venv` doesn't exist: `/opt/homebrew/bin/python3.12 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt`
4. **Frontend node_modules** — if `frontend/node_modules` doesn't exist: `npm --prefix frontend install`
5. **Vite entry point** — the app entry is `frontend/app.html`, not `index.html`. A Vite dev server plugin rewrites `/` and `/auth/*` to `app.html`. Browse to `http://localhost:5173` (not `127.0.0.1` — Vite binds to localhost by default).
6. **Spotify redirect URI** — Spotify Dashboard must have `http://127.0.0.1:8000/auth/callback` registered. Spotify rejects `localhost` as insecure; use `127.0.0.1`.

### Worktree setup

In a worktree, complete ALL of these steps before running `make dev-bg`:

1. `npm --prefix frontend install` — node_modules are not shared across worktrees and not symlinked by `make dev-bg`. Without this, Vite fails with `vite: command not found`.
2. Copy `.vercel/project.json` from main repo — needed for `vercel env pull`.
3. Pull and fix `frontend/.env` (see main repo step 2). The main repo may not have one; if not, pull fresh from Vercel.
4. Run: `make dev-bg MAIN_REPO=<path-to-main-repo>` — symlinks `backend/.env` and `backend/.venv` from main repo.
5. Verify both ports before telling user to check: `lsof -i :5173 -i :8000 | grep LISTEN`

### Troubleshooting

- **Black screen** at localhost:5173 → missing or broken `frontend/.env` (no Supabase URL → app can't initialize)
- **`vite: command not found`** in frontend log → `npm --prefix frontend install` was skipped
- **Backend 8000 up but frontend 5173 missing** → check `/tmp/bsi-frontend.log` for errors

- **Merging PRs** — never use `--auto` or `--admin` flags. When the user approves a merge, poll CI checks (`gh pr checks`) until they pass, then run `gh pr merge --squash --repo toofanian/bummer`. Do not ask the user to merge manually.
- Compatible with worktrees — agents can work in isolated worktrees on their branch
- Never commit `.env` files or secrets

## Key APIs

- Supabase Personal Access Token in .env expires ~2026-03-29 — regenerate at supabase.com/dashboard/account/tokens
- Spotify redirect URI must use `http://127.0.0.1:8000/auth/callback` — Spotify Dashboard rejects `localhost` as non-secure; 127.0.0.1 is accepted
- Spotify Web API: library sync, metadata (albums, tracks, artists)
- Spotify Connect API: remote playback control (requires Premium)
- Supabase client: custom metadata persistence

## Testing gotchas

- jsdom has no `setPointerCapture`/`hasPointerCapture` — use optional chaining (`?.`) in pointer event handlers so tests don't crash

## User preferences

- Deployment target: iPhone (mobile browser/PWA) + Mac (desktop browser)
- The user is primarily a Python developer with basic JS/TS exposure

## Collaboration style

- Claude acts as a **PM-orchestrator**: receive requests from the user, immediately spin up background subagents for discrete tasks, return to the user quickly for more input
- Never implement features directly in the main chat thread — always delegate to a background Agent with a detailed prompt
- For any task that touches code, spin up an agent with `run_in_background: true`
- Multiple independent tasks should be parallelized across multiple agents simultaneously
- Keep main-thread responses brief: confirm what agents were launched, then ask what's next
- Only integrate agent output yourself (final wiring, merging results) if agents cannot write to files due to permission issues in their worktree
