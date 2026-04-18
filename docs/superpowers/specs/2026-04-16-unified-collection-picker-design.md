# Unified Collection Picker — Design Spec

**Issue:** #27  
**Date:** 2026-04-16  
**Branch:** `27-unified-collection-picker`

## Problem

Two diverged UIs for adding albums to collections:
- `CollectionsBubble` — per-row dropdown for single album, fixed positioning causes jank
- `BulkAddBar` — bottom bar with inline picker for multi-select

Both feel like different features. Mobile picker triggers browser zoom on input focus.

## Solution

Single `CollectionPicker` component — modal on desktop, bottom sheet on mobile. Works for 1 or N albums.

## Component: `CollectionPicker`

### Props

```
albumIds: string[]          — albums to add/remove (1 for single, N for bulk)
collections: { id, name }[] — all collections
albumCollectionMap: object   — { [service_id]: string[] } membership map
onToggle: (albumId, collectionId, add) => void  — single album toggle
onBulkAdd: (collectionId) => void               — bulk add (when albumIds.length > 1)
onCreate: (name) => void                        — create new collection
onClose: () => void
```

### Layout

1. Backdrop overlay (click to close)
2. Modal container (centered desktop, bottom-anchored mobile)
3. Single text input — filters collection list by name, doubles as "create" input
4. Scrollable collection list:
   - Each row: collection name + checkmark if album(s) belong to it
   - For single album: checkmark = album is in collection
   - For multi album: checkmark = all selected albums are in collection (partial state not shown)
5. "Create [typed name]" row appears at bottom when input text doesn't match any existing collection name

### Keyboard Navigation

- Input always holds focus
- Arrow up/down moves highlight cursor through visible collection rows
- Enter on highlighted collection row: toggles membership
- Enter on "Create" row: creates collection and adds album(s) to it
- Esc: closes picker
- Typing: filters list, resets highlight to first item

### Behavior: Single Album (albumIds.length === 1)

- Toggling a collection adds or removes the album (calls `onToggle`)
- Checkmark reflects current membership from `albumCollectionMap`

### Behavior: Multi Album (albumIds.length > 1)

- Toggling a collection bulk-adds all selected albums (calls `onBulkAdd`)
- No remove support in bulk mode (ambiguous which albums to remove)
- Checkmark shown if all selected albums are in the collection

### Mobile

- Renders as bottom sheet (anchored to bottom, slides up)
- Input `font-size: 16px` to prevent iOS auto-zoom
- Touch-friendly row height (44px minimum tap target)
- `env(safe-area-inset-bottom)` padding

## Trigger Points

### Per-Row Button (replaces CollectionsBubble)

- Small `+` / count badge button in each album row
- Click opens `CollectionPicker` with `albumIds: [this_album_id]`
- Button appearance unchanged from current CollectionsBubble trigger

### BulkAddBar (modified)

- Bottom bar still shows when `selectedAlbumIds.size > 0`
- "Add to Collection" button opens `CollectionPicker` with `albumIds: [...selectedAlbumIds]`
- Inline picker removed from BulkAddBar — bar only has: count label, "Add to Collection" button, clear button

## State Management (App.jsx)

New state:
```
pickerAlbumIds: string[] | null  — null means picker closed, array means open with those albums
```

New handler:
```
handleOpenPicker(albumIds: string[]) — sets pickerAlbumIds
handleClosePicker() — sets pickerAlbumIds to null
```

Existing handlers reused:
- `handleToggleCollection(albumId, collectionId, add)` — single album
- `handleBulkAdd(collectionId)` — multi album (already clears selection)
- `handleCreateCollection(name)` — create

## Files Changed

### New
- `frontend/src/components/CollectionPicker.jsx` — the unified picker
- `frontend/src/components/CollectionPicker.test.jsx` — tests

### Modified
- `frontend/src/App.jsx` — add `pickerAlbumIds` state, render `CollectionPicker`, pass `onOpenPicker` down
- `frontend/src/components/AlbumTable.jsx` — replace `collections`/`albumCollectionMap`/`onToggleCollection`/`onCreateCollection` props with `onOpenPicker`
- `frontend/src/components/BulkAddBar.jsx` — remove inline picker, add `onOpenPicker` prop

### Removed
- `frontend/src/components/CollectionsBubble.jsx`
- `frontend/src/components/CollectionsBubble.test.jsx`

## What NOT to Build

- No drag-drop
- No fancy animations (simple opacity transition on open/close is fine)
- No partial-selection indicator for bulk mode
- No collection reordering in picker
