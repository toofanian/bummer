# Library Update Digest — Design Spec

## Summary

A library update digest feature that shows users what changed in their Spotify library over a configurable time window: albums added, albums removed, and albums listened to. Accessible via an icon in the header that opens a slide-out panel.

## Data Layer

### New table: `library_snapshots`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Default `gen_random_uuid()` |
| `snapshot_date` | date, unique | One snapshot per day |
| `album_ids` | text[] | Array of Spotify album IDs in the library at time of snapshot |
| `total` | int | Count of albums |
| `created_at` | timestamptz | Default `now()` |

Diffing two snapshots produces added/removed albums. No changes to existing tables. Play history is already tracked in `play_history`.

## Backend API

### New router: `routers/digest.py`

**`GET /digest?start=<date>&end=<date>`**

- Authenticated via `Depends(get_spotify)` (same as all other user-facing endpoints)
- `start` and `end` are ISO date strings (e.g., `2026-03-04`)
- Snapshot lookup uses **floor strategy**: find the snapshot with the greatest `snapshot_date <= start` and greatest `snapshot_date <= end`. If no snapshot exists for a given bound, return 404 with a clear error message.
- Diffs `album_ids` arrays: IDs in end but not start = added, IDs in start but not end = removed
- Queries `play_history` for plays between start and end, aggregates by album, sorts by play count descending
- **Metadata resolution:** For all album IDs in the diff, first check the library cache. For IDs not found in the cache (e.g., removed albums no longer cached), fall back to the Spotify API (`sp.album(spotify_id)`). If Spotify lookup also fails, return partial metadata (`spotify_id` only, `name`/`artists`/`image_url` as null).
- Response uses `artists` (plural, array) to match existing `_normalize_album` convention:
  ```json
  {
    "period": { "start": "2026-03-04", "end": "2026-03-11" },
    "added": [{ "spotify_id": "...", "name": "...", "artists": ["..."], "image_url": "..." }],
    "removed": [{ "spotify_id": "...", "name": "...", "artists": ["..."], "image_url": "..." }],
    "listened": [{ "spotify_id": "...", "name": "...", "artists": ["..."], "image_url": "...", "play_count": 5 }]
  }
  ```

**`POST /digest/snapshot`**

- Internal endpoint called by Railway cron daily
- Authenticated via `X-Cron-Secret` header checked against `CRON_SECRET` env var. Returns 403 on mismatch.
- Reuses the existing `_fetch_all_albums` function from `routers/library.py` (extract to a shared utility if needed to avoid importing a private function)
- Upserts row into `library_snapshots` for today's date
- Idempotent — safe to run multiple times per day
- Add `CRON_SECRET` to `.env.example`

## Scheduled Job

- **Railway cron service** runs daily at 4:00 AM UTC
- Hits `POST /digest/snapshot` on the backend with `CRON_SECRET` header
- No snapshot pruning needed initially (~365 rows/year)

## Frontend UI

### Header icon

- Small changelog/activity icon in the top bar (e.g., newspaper or list icon)
- Clicking opens a slide-out panel from the right (similar to NowPlayingPane)
- Opening DigestPanel closes NowPlayingPane and vice versa — only one right-side panel open at a time
- No notification badge — passive, opened on demand

### DigestPanel component

- **Date range picker** at the top — defaults to "last 7 days," user can adjust start/end
- **Three sections**, each a list of album cards:
  - **Added** — albums added to library in the period, with album art + name + artist
  - **Removed** — same format, visually muted/greyed
  - **Listened** — sorted by play count descending, showing count badge
- **Loading state** while API call is in flight (spinner or skeleton)
- **Error state** if the API call fails
- **No snapshots state** if the user has no snapshot history yet (e.g., "Digests will appear after your library has been tracked for a day")
- Empty states per section (e.g., "No albums added this period")
- Album cards clickable to start playback (reusing existing playback logic)

## Testing

- **Backend:** `tests/test_digest.py` — pytest with mocked Supabase/Spotify
  - `GET /digest`: diffing logic, date handling, edge cases (missing snapshots, empty library)
  - `POST /digest/snapshot`: auth validation, upsert behavior
- **Frontend:** `frontend/src/components/DigestPanel.test.jsx` — Vitest + React Testing Library
  - Renders sections correctly, handles loading/error/empty/no-snapshot states, date range changes trigger re-fetch
- TDD throughout — failing test before implementation
