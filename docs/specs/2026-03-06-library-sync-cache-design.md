# Library Sync Cache Design

**Date:** 2026-03-06
**Status:** Approved

## Problem

On every cold backend start (Railway restart), the in-memory album cache is wiped. The app blocks on a full paginated Spotify fetch before rendering anything, causing a noticeable loading delay on app open.

## Solution

Two cache layers: frontend localStorage for instant render, Supabase-backed backend cache for server-restart resilience. Data is always shown immediately; a background sync keeps it fresh.

## Architecture

### Frontend (localStorage)

- Key: `bsi_albums_cache`
- Shape: `{ albums: [], total: N, cachedAt: ISO }`
- On load: read localStorage, render albums immediately, show "Syncing..." badge, fire `GET /library/albums` in background
- On response: update albums state + localStorage, clear badge
- No localStorage: existing loading spinner behavior until fetch resolves

### Backend (Supabase cache)

New table `library_cache` (single row, id = `"albums"`):

| column      | type        |
|-------------|-------------|
| id          | text PK     |
| albums      | jsonb       |
| total       | integer     |
| synced_at   | timestamptz |

Cache lookup order in `GET /library/albums`:

1. In-memory cache fresh (< 1hr TTL) → return immediately, `syncing: false`
2. Supabase cache exists → populate in-memory, return immediately with `syncing: true`, trigger FastAPI `BackgroundTask` to re-sync from Spotify
3. Cold (no cache anywhere) → full Spotify fetch, save to Supabase + in-memory, return `syncing: false`

Background task updates both in-memory cache and Supabase row.

## Data Flow

```
App opens
  ├─ localStorage hit → render albums, show "Syncing..." badge
  │     └─ GET /library/albums (background)
  │           ├─ in-memory fresh → {albums, syncing: false}
  │           ├─ Supabase hit   → {albums, syncing: true} + background Spotify re-sync
  │           └─ cold           → full Spotify fetch → {albums, syncing: false}
  └─ no localStorage → loading spinner → GET resolves → render
```

## UI

- "Syncing..." pill badge near the Albums tab header
- Appears when background fetch is in progress, disappears on completion
- Non-blocking; user can interact with the library while it runs

## Testing

### Backend
- In-memory cache hit: returns albums, no Supabase/Spotify calls
- Supabase cache hit: returns albums, triggers background sync, `syncing: true`
- Cold start: fetches from Spotify, persists to Supabase, returns `syncing: false`
- Background sync: updates Supabase row and in-memory cache
- All paths mock Supabase client and Spotify client

### Frontend
- localStorage hit: albums rendered immediately, syncing badge visible, badge clears on fetch complete
- No localStorage: loading spinner shown, albums render after fetch
- Albums state and localStorage updated correctly on sync complete
