# Listens Column + Remove Spotify Sync — Design Spec

**Issues:** #59, #66
**Date:** 2026-04-18

## Goal

Add a sortable "Listens" column to the library album table showing all-time play count per album. Also remove the out-of-scope Spotify `recently_played` sync that was never part of the digest spec.

## Scope

- **In scope:** New listens column (backend endpoint + frontend column), removal of `POST /home/history/sync` endpoint and its data, related test changes
- **Out of scope:** Digest feature changes, play history UI, time-windowed counts

## Part 1: Remove Spotify Sync (issue #66)

### Backend

- Remove `POST /home/history/sync` endpoint from `backend/routers/home.py`
- Remove related tests from `backend/tests/`

### Frontend

- Remove any calls to `/home/history/sync`

### Migration

- New migration: `DELETE FROM play_history WHERE source = 'spotify_sync'`
- Drop `source` column from `play_history` if nothing else references it

## Part 2: Listens Column (issue #59)

### Backend

New endpoint: `GET /library/listen-counts`

- Query: `SELECT album_id, COUNT(*) as count FROM play_history WHERE user_id = :uid GROUP BY album_id`
- Returns: `{ "counts": { "album_id_1": 5, "album_id_2": 12, ... } }`
- No time filtering — all-time counts

### Frontend

**AlbumTable (desktop):**
- New column "Listens" between Date Added and Collections
- Displays integer count (0 if album has no plays)
- Sortable: toggle asc/desc, descending first click

**Mobile cards:**
- Small count indicator on album card

**Data fetching:**
- Fetch listen counts on library load, merge into album data
- Add `listens` sort option to existing sort logic

## Testing

- **Backend:** `tests/test_listen_counts.py` — endpoint returns correct counts, handles zero-play albums, user isolation
- **Backend:** Verify sync endpoint removal — 404 on `POST /home/history/sync`
- **Frontend:** AlbumTable renders listens column, sorting works, zero-count display
