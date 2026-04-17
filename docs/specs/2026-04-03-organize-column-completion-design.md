# Organize Column Completion — Design Spec

**Date:** 2026-04-03
**Scope:** Three features completing the Organize column: drag-reorder, bulk add, and collection playback. Cover art picker (5d) dropped — collection cards already show album art strips.

**Parent spec:** [Product Backlog Design](2026-03-15-product-backlog-design.md) — items 5b, 5c, 6

---

## Feature 1: Drag-Reorder (Collection Albums)

### Problem
Albums in a collection have a `position` column in the database, and the backend reorder endpoint exists, but there's no UI to reorder them.

### Solution
Add drag-and-drop reordering to the collection detail view. Each album row shows a grip icon (⠿) on its left side when rendered inside a collection.

### Frontend

- **AlbumTable enhancement:** New `reorderable` boolean prop. When true, each row renders a drag handle (⠿) on the left.
- **DnD library:** `@dnd-kit/core` + `@dnd-kit/sortable` — React-first, accessible, supports touch and pointer events, lightweight.
- **Interaction:** Press the grip icon and drag to reorder. On drop:
  1. Optimistically reorder the local `collectionAlbums` state
  2. Fire `PUT /collections/{id}/albums/reorder` with `{ "album_ids": [ordered ids] }`
  3. On error, revert to previous order
- **Mobile:** `@dnd-kit` handles touch events natively. The grip icon provides a clear touch target.

### Backend
Already built: `PUT /collections/{id}/albums/reorder` — accepts `{ "album_ids": ["id1", "id2", ...] }`, bulk-updates position values.

---

## Feature 2: Bulk Add (Multi-Select from Library)

### Problem
Adding albums to a collection is one-at-a-time via the collections bubble on each album row. Adding 15 albums to a "Late Night" collection is tedious.

### Solution
Multi-select mode in the library view. Tap album art to toggle selection, then add all selected albums to a collection in one action.

### Frontend

- **Selection state:** New `selectedAlbumIds` state (Set) in App.jsx.
- **Selection toggle:** Tapping album art in the library view toggles that album's selection. When selected, a checkbox overlay appears on the album art.
- **BulkAddBar component:** Floating bar at the bottom of the viewport, visible when 1+ albums are selected. Shows:
  - "{N} selected"
  - "Add to Collection" button — opens the collection picker (reuse existing collections list as a dropdown/modal)
  - "×" button to clear selection
- **Keyboard:** Escape clears selection.
- **After adding:** API call to `POST /collections/{id}/albums/bulk`, then clear selection and refresh collection data.
- **Scope:** Bulk add only appears in the library view (not inside a collection detail view or other views).

### Backend
Already built: `POST /collections/{id}/albums/bulk` — accepts `{ "spotify_ids": ["id1", "id2", ...] }`.

---

## Feature 3: Collection Playback

### Problem
Collections are album sequences, but there's no way to play through a collection front-to-back. The user has to manually start each album.

### Solution
A play button on the collection detail view header. Starts the first album and auto-advances through subsequent albums when each finishes.

### Frontend

- **Collection playback state:** New state in App.jsx: `collectionPlayback` — either `null` or `{ collectionId, albumIds, currentIndex }`.
- **Play button:** Added to `CollectionDetailHeader`. On tap:
  1. Set `collectionPlayback` to `{ collectionId: view.id, albumIds: [ordered spotify_ids], currentIndex: 0 }`
  2. Start playback of the first album via existing `handlePlay`
- **Auto-advance in polling loop:** The existing playback polling loop (in `usePlayback` or App.jsx) gets an enhancement:
  - When `collectionPlayback` is active, check if the current album's last track has finished (detected by: playback context URI no longer matches the current collection album's URI, or playback has stopped)
  - If the current album finished and there's a next album in the sequence: increment `currentIndex`, start the next album
  - If no more albums remain: clear `collectionPlayback` to `null`
- **External override:** If the user changes playback context outside Crate (e.g., in native Spotify), detect the context mismatch and clear `collectionPlayback` state gracefully.
- **No progress indicator:** No "Album 3 of 8" UI. The user knows what collection they started.

### Backend
No changes needed. Uses existing `PUT /playback/play` endpoint with album context URI.

---

## Dropped: Cover Art Picker (5d)

The `cover_album_id` column exists in the database but will not be surfaced in the UI. Collection cards already show an album art strip from the first 5 albums in the collection — this is sufficient and preferred over a single pinned cover.

---

## Implementation Order

1. **Drag-reorder** — self-contained, touches AlbumTable + App.jsx collection wiring
2. **Bulk add** — self-contained, new BulkAddBar component + selection state in App.jsx
3. **Collection playback** — depends on collections being orderable (feature 1), touches playback polling loop

Features 1 and 2 are independent and can be built in parallel. Feature 3 should come after feature 1 (since playback order relies on the user having set a deliberate order).

## Dependencies

- `@dnd-kit/core` and `@dnd-kit/sortable` — new npm dependencies for drag-reorder
