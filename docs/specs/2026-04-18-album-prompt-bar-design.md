# Album Prompt Bar — Design Spec

## Overview

A persistent bottom panel on the collections page that surfaces albums for quick collection assignment. Two horizontally scrollable rows present recently added and recently played albums with visual indicators for collection membership and selection state.

GitHub Issue: #71

## Layout

- Fixed to bottom of CollectionsPane, full width
- Two horizontal rows stacked vertically:
  - Top row: "Recently Added" — albums sorted by `added_at` DESC from library cache
  - Bottom row: "Recently Played" — albums from play history (today + this week, deduplicated)
- Small text label left-aligned above each row
- Album art thumbnails ~56px square, small gap (~8px) between items
- Each row scrolls independently

## Scroll Behavior

- Manual scroll only — user swipes (mobile) or drags/scroll-wheel (desktop)
- Smooth momentum scrolling, no snap points
- No auto-scroll or looping

## Album Art States

Four visual states for each album thumbnail:

1. **Default** — Clean album art, no overlay
2. **In collection(s)** — Semi-transparent dark overlay with centered collection count number (white text)
3. **Selected** — Checkmark overlay + subtle border/glow ring around the thumbnail
4. **In collection + selected** — Checkmark overlay with border/glow, collection count still visible (smaller/repositioned so both indicators coexist)

## Interaction Flow

1. Tap/click album thumbnail → toggles selected state (local to Album Prompt Bar)
2. When 1+ albums selected → action button appears (e.g., "Add to Collection" pill/button)
3. Action button opens existing `CollectionPicker` modal
4. User selects or creates a collection
5. On confirm → POST to existing `/collections/{collection_id}/albums/bulk` endpoint
6. On success → clear selection, refresh `albumCollectionMap` so overlays update

## Data Sources

- **Recently Added**: Fetched from existing `GET /home?tz={timezone}` endpoint → `recently_added` array (up to 20 albums, sorted by `added_at` DESC from `library_cache`)
- **Recently Played**: Same endpoint → `today` + `this_week` arrays, merged and deduplicated by `service_id` (same merge logic as HomePage)
- **Collection counts**: `albumCollectionMap` already computed in App.jsx — maps `service_id` → array of collection IDs. Count = array length.
- Fetch home data on collections page mount

## Component Architecture

### New Components

- **`AlbumPromptBar.jsx`** — Container component. Fixed bottom position, renders two `AlbumPromptRow` instances. Manages selection state (selected album IDs set). Renders action button when selection is non-empty. Handles CollectionPicker open/close and bulk-add callback.
- **`AlbumPromptRow.jsx`** — Single horizontal scrollable row. Receives array of albums, label text, `albumCollectionMap`, selected IDs set, and `onToggleSelect` callback. Renders album thumbnails with appropriate overlays.

### Existing Components Used

- **`CollectionPicker`** — Reused as-is for collection selection/creation
- **`apiFetch`** — For the bulk-add API call

### Integration Point

- `CollectionsPane.jsx` renders `AlbumPromptBar` at the bottom
- App.jsx passes `albumCollectionMap` down to CollectionsPane (if not already available)
- After bulk-add success, App.jsx's `albumCollectionMap` refresh mechanism is triggered (same as existing BulkAddBar flow)

## Responsive Behavior

- Mobile: touch/swipe scroll, same stacked two-row layout
- Desktop: mouse drag or horizontal scroll wheel
- Album art size stays consistent (~56px) across breakpoints

## Edge Cases

- No recently added albums → hide "Recently Added" row entirely
- No recently played albums → hide "Recently Played" row entirely
- Both empty → hide entire Album Prompt Bar
- Album appears in both rows → shown in both, selection state shared (selecting in one row selects in the other)
- Album already in target collection → existing endpoint handles upsert gracefully (no error, no duplicate)

## Testing Strategy

- **Frontend unit tests** (Vitest + React Testing Library):
  - AlbumPromptBar renders two rows with correct labels
  - Albums with collections show count overlay
  - Tap toggles selection state
  - Action button appears/disappears based on selection
  - CollectionPicker opens on action button click
  - Selection clears after successful bulk add
  - Empty rows are hidden
  - Shared selection state across rows for duplicate albums
- **No new backend work** — reuses existing endpoints
