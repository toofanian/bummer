# Library Changelog — Design Spec

## Summary

A scrollable add/remove history showing what changed in the user's Spotify library over time, with dates. Each entry represents a diff between two consecutive daily snapshots. Accessible as a second tab within the existing DigestPanel.

## Data Layer

No new tables. Reuses existing `library_snapshots` table (album_ids text[], snapshot_date date, user_id uuid). Diffs are computed on-the-fly between consecutive snapshots, same set-operation pattern used by `GET /digest`.

## Backend API

### New endpoint: `GET /digest/changelog`

Added to existing `routers/digest.py`.

**Query params:**
- `limit` (int, default 50, max 200) — max number of changelog entries to return
- `before` (date, optional) — cursor for pagination; only return entries with `snapshot_date < before`

**Algorithm:**
1. Fetch snapshots ordered by `snapshot_date DESC`, filtered by authenticated user (RLS handles this via `get_authed_db`), with `limit + 1` rows (need pairs to compute diffs)
2. If `before` is provided, add `.lt("snapshot_date", before)` filter
3. Walk pairs: for each consecutive pair `(newer, older)`, compute `added = newer.album_ids - older.album_ids` and `removed = older.album_ids - newer.album_ids`
4. Skip pairs where both added and removed are empty (no changes that day)
5. Resolve album metadata for all IDs using existing `_resolve_album_metadata` (cache first, Spotify API fallback)
6. Return response

**Response:**
```json
{
  "entries": [
    {
      "date": "2026-04-15",
      "added": [{ "service_id": "...", "name": "...", "artists": ["..."], "image_url": "..." }],
      "removed": [{ "service_id": "...", "name": "...", "artists": ["..."], "image_url": "..." }]
    }
  ],
  "has_more": true,
  "next_cursor": "2026-04-10"
}
```

**Auth:** `Depends(get_user_spotify)` + `Depends(get_authed_db)` + `Depends(get_current_user)` — same as `GET /digest`.

**Edge cases:**
- 0 or 1 snapshots → return `{ "entries": [], "has_more": false, "next_cursor": null }`
- All consecutive pairs have no diff → return empty entries with `has_more` based on whether more snapshots exist

## Frontend UI

### DigestPanel tab extension

Add a two-tab switcher at the top of DigestPanel: **Digest** (existing date-range view) and **Changelog** (new scrollable timeline).

**Changelog tab contents:**
- Scrollable list of dated entries, newest first
- Each entry: date header, then added albums (green `+` prefix) and removed albums (red `−` prefix, muted opacity like existing digest removed section)
- Album rows reuse the same layout as DigestSection (thumbnail, name, artist)
- Clicking an album row calls `onPlay(service_id)` — same as digest
- "Load more" button at bottom when `has_more` is true
- Loading/empty/error states follow existing DigestPanel patterns

**Tab switcher styling:**
- Two small text buttons below the "Library Digest" header, above the content area
- Active tab: `text-text` with bottom accent border
- Inactive tab: `text-text-dim`, clickable

**When Digest tab is active:** existing date range picker + digest content (unchanged)
**When Changelog tab is active:** no date picker, just the scrollable changelog entries

## Non-goals

- No infinite scroll — explicit "Load more" button is simpler and sufficient
- No filtering/search within changelog
- No play history in changelog (that's what the digest "Listened" section is for)
