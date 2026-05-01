# Digest: Change Events — Design Spec

## Problem

Daily snapshots (`library_snapshots`) go stale because the cron runs at 6 AM UTC but users sync their library later. Albums added after the cron never appear in that day's snapshot. Snapshots are also wasteful — storing 1700+ album IDs per row when typically only 1–5 change.

## Design

Replace snapshot-based diffing with event-based change tracking. Record diffs at sync time, keep `library_cache` as the current full library.

## Data layer

### New table: `library_changes`

```sql
CREATE TABLE library_changes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    changed_at timestamptz NOT NULL DEFAULT now(),
    added_ids text[] NOT NULL DEFAULT '{}',
    removed_ids text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_library_changes_user_date
    ON library_changes (user_id, changed_at DESC);
```

Each row = one sync event where something changed. If nothing changed, no row is written.

Data is persisted indefinitely (small rows, no pruning needed). The 30-day window is a display concern only.

### Recording changes in `sync-complete`

In `POST /library/sync-complete`, before upserting the cache:

1. Read current `library_cache` album IDs for the user
2. Diff against incoming album list
3. If no prior cache exists (first-ever sync), skip — no changes row written
4. If adds or removes exist, insert one `library_changes` row
5. Upsert `library_cache` as before

### `library_cache`

Unchanged. Remains the single source of "current full library."

### `library_snapshots`

Stop writing, stop reading. Keep table and data in DB. Remove all code paths.

## What gets removed

- `POST /digest/snapshot` endpoint + `vercel.json` cron entry
- `POST /digest/ensure-snapshot` endpoint
- `GET /digest` endpoint (unused by frontend)
- `_find_snapshot()` helper
- Frontend `ensure-snapshot` useEffect in `App.jsx`
- All snapshot-related and `GET /digest` tests

## Endpoint changes

### `GET /digest/changelog` — rewrite

Returns a flat feed of library change events from the last 30 days, sorted by most recent first.

**Aggregation logic:**

1. Query all `library_changes` rows for the user where `changed_at > now() - 30 days`, ordered by `changed_at DESC`
2. Collect all album IDs that appear in any `added_ids` across the window
3. Collect all album IDs that appear in any `removed_ids` across the window
4. Albums in both sets = **bounced**. Timestamp = the most recent event (add or remove) involving that album
5. Albums only in added set = **added**. Timestamp = when they were added
6. Albums only in removed set = **removed**. Timestamp = when they were removed
7. Merge all into one list, sort by timestamp descending
8. Resolve album metadata via existing `_resolve_album_metadata`

**Response:**

```json
{
  "events": [
    {
      "type": "added",
      "album": { "service_id": "...", "name": "...", "artists": ["..."], "image_url": "..." },
      "changed_at": "2026-04-29T..."
    },
    {
      "type": "bounced",
      "album": { "service_id": "...", "name": "...", "artists": ["..."], "image_url": "..." },
      "changed_at": "2026-04-28T..."
    },
    {
      "type": "removed",
      "album": { "service_id": "...", "name": "...", "artists": ["..."], "image_url": "..." },
      "changed_at": "2026-04-25T..."
    }
  ]
}
```

No pagination — 30-day window is bounded.

### Removed endpoints

- `GET /digest` (date-range) — unused by frontend, dead code
- `POST /digest/snapshot` — replaced by sync-time change recording
- `POST /digest/ensure-snapshot` — no longer needed

### Unchanged endpoints

- `GET /digest/history` — reads from `play_history`, unrelated
- `GET /digest/stats` — reads from `play_history`, unrelated

## Frontend changes

### `ChangesSection` in `DigestView.jsx`

Replace current date-grouped added/removed subsections with a single flat feed:

- Each row: album art + name + artists + event badge
- Badge styling:
  - Added: green `+`
  - Removed: red `-` with muted opacity (existing pattern)
  - Bounced: amber `↕`
- Sorted by most recent first (backend sort order)

### `App.jsx`

Remove the `ensure-snapshot` useEffect.

### No changes to

- History tab
- Stats tab
- BottomTabBar

## Edge cases

- **First sync ever (no prior cache):** No `library_changes` row written. Changelog is empty until the second sync where actual changes occur.
- **Sync with no changes:** No row written. `library_cache.synced_at` still updates.
- **Multiple syncs per day with changes:** Each produces its own `library_changes` row. Aggregation handles deduplication and bounce detection.
- **Album added then removed same day:** Detected as bounced.
- **Album bounced multiple times in 30 days:** Still one "bounced" entry, positioned at the most recent event timestamp.

## Migration

Backfill `library_changes` from existing `library_snapshots` data: compute diffs between consecutive snapshots per user, insert as `library_changes` rows. Preserves existing history.
