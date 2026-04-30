# Home Page Lazy Load Design [#124]

## Goal

Increase home page scroll rows from 30 to 60 items per section while keeping initial render fast via lazy loading.

## Approach

Backend returns 60 items per section in a single API call (same shape as today). Frontend renders the first 30, then appends the remaining 30 when the user scrolls near the bottom of a section column.

## Backend Changes

**File: `backend/routers/home.py`**

Change all `30` caps to `60`:
- `recent_ids = _dedup_album_ids(recent_rows)[:60]` (line 67)
- `rediscover` sample: `min(60, len(rediscover_candidates))` (line 85)
- `recommended` sample: `min(60, len(recommended_candidates))` (line 104)
- `recently_added` slice: `[:60]` (line 112)

Also bump the `play_history` fetch limit from 300 to 600 to ensure enough rows for 60 unique albums after dedup.

No new endpoints, no query params, no schema changes.

## Frontend Changes

**File: `frontend/src/components/HomePage.jsx`**

Modify `AlbumList` to accept a `batchSize` prop (default 30):
- Track `visibleCount` state, starting at `batchSize`
- Render only `albums.slice(0, visibleCount)`
- Use an `IntersectionObserver` on a sentinel element at the bottom of the rendered list
- When sentinel enters viewport, increment `visibleCount` by `batchSize` (capped at `albums.length`)

This gives lazy rendering for both mobile (tab view, vertical scroll) and desktop (column view, vertical scroll). No changes to the scroll container structure.

## Testing

### Backend (`backend/tests/test_home.py`)
- Update existing `test_home_recently_played_capped_at_30` to assert cap of 60
- Same for any other tests asserting the 30-item cap

### Frontend (`frontend/src/components/__tests__/`)
- Test that only first 30 items render initially
- Test that scrolling (triggering IntersectionObserver) renders remaining items
- Test that sections with <= 30 items render all without a sentinel

## Scope

- No new API endpoints
- No database changes
- No new dependencies
- Images already lazy-load natively via browser behavior; this only defers DOM insertion
