# Artist Profile Images — Design Spec

**Issue:** #95
**Date:** 2026-04-21

## Problem

Artists are displayed as text-only throughout the app. The artists view uses album art grids as a proxy thumbnail, and digest top artists show no image at all.

## Solution

Fetch artist profile images from Spotify and display them as circular thumbnails in both the artists view and digest stats top artists.

## Data Layer

### Current state
Artists stored as plain strings in album metadata: `"artists": ["Artist Name"]`

### Target state
Artists stored as objects: `"artists": [{"name": "Artist Name", "id": "spotify_artist_id", "image_url": "https://..."}]`

This lives in the existing `library_cache` JSONB column. No new table, no migration.

### Resolution strategy
- During library sync, store artist objects with `name` and `id` from Spotify's album response (which already includes artist IDs)
- Artist images resolved lazily: when an endpoint needs image URLs, call `sp.artists()` (batch endpoint, up to 50 IDs per call) for artists missing `image_url`
- Write resolved image URLs back to the cache so subsequent loads skip the API call
- Backward compatible: code must handle both old format (plain strings) and new format (objects) during transition

## Backend Changes

### Library sync
- Where albums are cached, store `{"name": ..., "id": ..., "image_url": null}` instead of plain artist name strings
- `image_url` starts null — resolved lazily on first read

### `GET /digest/stats`
- Return `{"artist": name, "play_count": count, "image_url": url_or_null}` for each top artist
- Before returning, batch-resolve any artists missing `image_url` via `sp.artists()`

### Artists view endpoint
- Include `image_url` in artist response data
- Same lazy resolution as stats

## Frontend Changes

### DigestView — top artists section
- Add 32px circular thumbnail left of artist name
- Fallback: first-letter colored avatar when `image_url` is null

### ArtistsView — artist rows
- Add 40px circular artist profile photo on the left side of each row
- Keep existing album art strip (`AlbumArtStrip`) on the right
- Fallback: first-letter colored avatar (already exists)

## Scope exclusions
- No artist detail/profile page
- No artist search
- No dedicated `artists` table in Supabase
- No pre-fetching all artist images during sync (lazy only)
