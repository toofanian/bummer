# Observability & Product Telemetry Design

**Date:** 2026-04-09
**Status:** Draft

## Problem

Crate has its first external user. There is zero monitoring infrastructure — no way to know if users hit errors, no way to debug issues a user reports without them describing it in detail, and no visibility into how users actually use the app. Backend logs exist on Railway but aren't structured or queryable.

## Goals

1. **Know when users hit errors** — passive monitoring with stack traces and user context
2. **Debug user-reported issues faster** — session replays of what the user actually saw and did
3. **Understand how users use the app** — product analytics, especially around the home page, library navigation patterns, and collection usage

Explicitly **not** in scope: real-time alerting, uptime monitoring, on-call paging. Crate is not at the scale where uptime management matters.

## Solution

Single tool: **PostHog Cloud (free tier, US region)**. Covers errors, session replay, and product analytics in one SDK + dashboard. Free tier (1M events / 5K replays / 1M errors per month) is well above any plausible near-term usage.

Why one tool instead of a specialized stack (e.g. Sentry + analytics): one SDK to install, one dashboard, one mental model. PostHog's error tracking is good enough for our scale, and its session replay is best-in-class.

## Architecture

### Frontend

- `posthog-js` initialized once in `frontend/src/lib/posthog.js` (a thin wrapper module)
- Mounted at app root in `App.jsx` before any other auth/data flow
- On Supabase auth login: `posthog.identify(user.id, { email: user.email })`
- On logout: `posthog.reset()`

### Backend

- `posthog-python` initialized once in `backend/main.py` startup, exposed as a module-level client
- Authenticated requests pass the Supabase user ID into capture calls as `distinct_id`, joining frontend + backend events on a single user timeline
- PostHog's FastAPI integration auto-captures unhandled exceptions

### Claude integration (PostHog MCP)

- PostHog's official MCP server installed via `npx @posthog/wizard@latest mcp add` (writes to `.mcp.json`)
- Auth is one-time browser login
- Future Claude sessions can query errors, events, and replays directly with slash commands like `/posthog:errors`
- Useful for: triaging user-reported bugs, verifying telemetry during implementation, building ad-hoc HogQL queries

### No new Supabase tables

PostHog is the system of record for telemetry. No `error_log` table, no custom event tables. Keeps the implementation focused.

## Frontend events

PostHog autocapture handles pageviews, clicks, and unhandled errors out of the box. On top of that, we define a small set of **domain events** with rich properties. The key pattern: **enrich "moment of value" events with a `source` property** so a small number of events can answer many questions.

### Play events (the core of everything)

Every play action carries a `source` property identifying where it came from. This single field makes plays sliceable across the whole product.

**`album_played`** properties:

| property | example values |
|----------|----------------|
| `source` | `home_recently_played`, `home_recently_added`, `home_recommended`, `home_rediscover`, `library_grid`, `library_search`, `collection_detail`, `artist_detail` |
| `album_id` | spotify ID |
| `position` | index in row/grid (helps see if only top items get clicked) |
| `view` | `albums`, `artists`, `collections` (when applicable) |

**`track_played`** — same pattern, plus `track_id` and `album_id`.

**`collection_played`** — fired when a user plays a full collection as a sequence. Properties: `collection_id`, `album_count`.

### Home page events

| Event | Properties | Question it answers |
|-------|------------|---------------------|
| `home_loaded` | `is_empty` (true when user has no listening history yet) | Are first-time users hitting the empty state? |
| `album_played` (with `source=home_*`) | as above | Which row drives the most plays? Does anyone use Rediscover? |

PostHog autocapture also gives us click counts on each row for free, and session replays show how users actually move through the page.

### Library events

| Event | Properties | Question it answers |
|-------|------------|---------------------|
| `library_search_used` | `query_length`, `result_count` (no raw query stored) | Do users search at all? How often? |
| `library_view_changed` | `view`: `albums` / `artists` / `collections` | Which view do people prefer? |
| `library_sorted` | `sort_key` | Which sorts get used? |
| `album_played` (with `source=library_search` or `library_grid`) | as above | What % of plays come from search vs scroll? |

The `library_search` vs `library_grid` distinction is determined at play time by checking whether the search input is non-empty.

### Collection events

| Event | Properties | Question it answers |
|-------|------------|---------------------|
| `collection_created` | `collection_id` | Are people making collections at all? |
| `collection_viewed` | `collection_id` | Do they open collections after creating them? |
| `collection_played` | `collection_id`, `album_count` | Do they actually play collections as sequences? |
| `album_played` (with `source=collection_detail`) | + `collection_id` | Or do they cherry-pick individual albums from inside? |

This forms a natural funnel in PostHog: **created → viewed → (played OR cherry-picked)**. If many users create collections and never view/play them, that's a clear product signal.

## Backend events

Three high-value events for the silent failures that never reach the UI:

| Event | When | Properties |
|-------|------|------------|
| `spotify_sync_failed` | Library sync raises | `error_type`, `albums_synced_so_far` |
| `spotify_token_refresh_failed` | Refresh token call returns non-2xx | `status_code` |
| `spotify_api_error` | Any non-2xx from Spotify API | `endpoint`, `status_code` |

All carry the authenticated user's ID as `distinct_id`, joining the frontend timeline. Unhandled exceptions auto-captured by `posthog-python`'s FastAPI integration.

## Replay & privacy

- **Inputs masked by default** — PostHog masks all `<input>` elements by default
- **Unmask the search box and collection name input** — these are not PII and are useful in replays
- **Mask the user email** in the user menu via `data-ph-mask` attribute
- **Sample rate**: 100% on free tier (5K replays/month is way more than current usage requires)
- **First-party only** — no cross-domain tracking, no third-party cookies

## Testing

- **Frontend**: mock `posthog-js` in the Vitest setup file so tests don't phone home. Tests assert:
  - `posthog.identify` fires after Supabase login
  - `album_played` is captured with the correct `source` from each entry point (home rows, library, collection detail)
- **Backend**: mock `posthog.capture` in pytest fixtures. Tests assert capture is called on each failure path (`spotify_sync_failed`, `spotify_token_refresh_failed`, `spotify_api_error`) without real network calls
- **Manual verification post-deploy**: trigger a play, confirm the event lands in PostHog within ~30s. Verifiable from Claude directly via the PostHog MCP.

## Implementation order

1. PostHog account + project setup (manual, ~5 min)
2. PostHog MCP install via wizard (`npx @posthog/wizard@latest mcp add`)
3. Frontend SDK install + `identify` on login + `home_loaded` event — smallest end-to-end slice that verifies identity flow before adding more events
4. Frontend domain events with source tagging (`album_played`, `track_played`, `collection_*`, `library_*`)
5. Replay masking config
6. Backend SDK install + `spotify_*` failure events
7. Manual smoke test from deployed app via PostHog MCP

## What this does NOT include

- Real-time alerting, paging, on-call workflows
- Uptime monitoring (`/health` endpoint, UptimeRobot)
- A custom Supabase `error_log` table
- Frontend error boundary UI (user-facing "something went wrong" screen) — separate concern
- Feature flags via PostHog (available, but out of scope for this spec)

## Cost

All free tier:
- PostHog Cloud: 1M events / 5K replays / 1M errors per month
- No Supabase impact (no new tables)
- No infra to manage
