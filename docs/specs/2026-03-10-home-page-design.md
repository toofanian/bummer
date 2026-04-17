# Home Page Design

## Overview

Replace the current "jump straight into Albums" landing experience with a Home page that surfaces recent listening activity and discovery suggestions. The app's navigation becomes: **Home | Albums | Collections**.

Primary purpose: recent activity first, discovery second. Keep it clean, not cluttered.

## Data Model

### New table: `play_history`

| Column     | Type          | Notes                              |
|------------|---------------|------------------------------------|
| id         | uuid (PK)     | `gen_random_uuid()`                |
| album_id   | text NOT NULL  | Spotify album ID                   |
| played_at  | timestamptz    | `default now()`, NOT NULL          |

No foreign keys — `album_id` is a plain Spotify ID string. Album metadata (name, art, artists) is resolved from the in-memory album cache at read time.

**Single-user assumption:** No `user_id` column. The app is currently single-user. When multi-user support is added (see backlog), this table will need a `user_id` column and RLS policies. For now, all rows belong to the single user.

### Write path: `POST /history/log`

- Body: `{ "album_id": "<spotify_id>" }`
- Inserts one row into `play_history`
- Returns `204 No Content`
- Called fire-and-forget from the frontend after a successful album play
- Only logged for album-level plays (`handlePlay`), not individual track plays (`handlePlayTrack`)
- No write-side deduplication — reads handle dedup

## Backend

### New router: `backend/routers/home.py`

Router prefix: `/home`. Registered in `main.py` alongside existing routers.

#### `GET /home`

Single endpoint that assembles the entire home page payload. Returns:

```json
{
  "today": [Album, ...],
  "this_week": [Album, ...],
  "rediscover": [Album, ...],
  "recommended": [Album, ...]
}
```

Each `Album` matches the existing shape: `{ spotify_id, name, artists, image_url, release_date }`.

#### Section logic

- **today**: Query `play_history` for rows where `played_at` falls within the current calendar day. The frontend passes its timezone as a query param (`?tz=America/Los_Angeles`), and the backend uses it to determine date boundaries. Deduplicate by album, most recent first.
- **this_week**: Same query but for the last 7 days excluding today. Deduplicate by album.
- **rediscover**: Cross-reference the full album cache against `play_history`. Albums with no plays in the last 60 days (or never played through the app) are candidates. Pick 8 at random. **Cold cache fallback:** If the in-memory album cache (`_cache["albums"]` in `library.py`) is `None`, attempt to load from the Supabase `library_cache` table. If that's also empty, return an empty list for this section.
- **recommended**: Albums from the user's library by artists they play frequently, but albums they haven't played recently. Specifically: find the top 5 most-played artists from `play_history` (last 30 days), then pick library albums by those artists that the user hasn't played in 30+ days. Up to 8 albums, deduplicated. This avoids the deprecated Spotify Recommendations API entirely — all data comes from the user's own library and play history.

#### `POST /history/log`

- Body: `{ "album_id": "<spotify_id>" }`
- Insert row, return 204

Note: Both endpoints live on the same `home` router. The log endpoint path is `/home/history/log`.

### No caching

The endpoint involves a few DB queries (recent plays, play counts for recommendations) but no heavy computation. Data changes with every play, so caching would add staleness for minimal gain. Revisit if performance becomes an issue.

## Frontend

### New component: `HomePage.jsx`

Fetches `GET /home` on mount. Renders four sections as horizontal scroll rows:

```
HomePage
├── Section "Today"          — hidden if empty
├── Section "This Week"      — hidden if empty
├── Section "Rediscover"     — horizontal scroll row
└── Section "You Might Like" — horizontal scroll row, hidden if empty
```

**Empty state** (no play history at all): "Start playing albums to see your listening history here."

### Sub-component: `AlbumRow`

Reusable horizontal scroll strip. Props: `title` (string), `albums` (array), `onPlay` (callback).

- Renders a section heading + a scrollable container of album cards
- Each card: square album art (~120px desktop, ~100px mobile), album name, artist name (dimmed)
- Double-click on a card calls `onPlay(spotify_id)`

### App.jsx changes

- Add `'home'` to the `view` state
- Change default from `'library'` to `'home'`
- Add Home button to nav: `Home | Albums | Collections`
- Render `<HomePage>` when `view === 'home'`
- In `handlePlay`: after successful play, fire-and-forget `POST /history/log`

## Mobile

- `overflow-x: auto` with `overscroll-behavior-x: contain` on scroll rows — prevents page drag when swiping a row
- `scroll-snap-type: x proximity` + `scroll-snap-align: start` on cards — gentle snapping
- Hide scrollbar on mobile: `::-webkit-scrollbar { display: none }`
- Responsive card sizing: ~120px desktop, ~100px mobile with tighter gaps
- Same sections on both platforms, no mobile-specific hiding

## Interaction

- Double-click/double-tap an album card to play it (matches existing library behavior)
- No single-click action for now (until UI is more stable)

## Out of scope

- Play history visualization/stats
- Track-level history logging
- Caching of the home endpoint
- Persisting last-viewed tab across sessions
