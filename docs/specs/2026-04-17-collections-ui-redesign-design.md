# Collections UI Redesign — Design Spec

**Issue:** #52
**Date:** 2026-04-17

## Goal

Upgrade CollectionsPane rows with prominent album art strips to match the visual polish of DigestPanel and BulkAddBar. Make collections feel like a first-class feature.

## Scope

- **In scope:** CollectionsPane row layout, shared AlbumArtStrip component, BulkAddBar refactor to use shared component
- **Out of scope:** Collection detail view, CollectionPicker, new features/functionality

## Design

### Shared component: AlbumArtStrip

Extract the overlapping album art pattern from BulkAddBar into a reusable component.

**Props:**
- `albums` — array of `{ service_id, image_url, name }`
- `size` — thumbnail size in px (default: 40)

**Rendering:**
- Horizontal flex row, `overflow-hidden`
- Each thumbnail: `flex-shrink-0`, sized per `size` prop, `-mr-1` overlap
- `rounded object-cover border border-border`
- Missing art fallback: `bg-surface-2` div with same dimensions and border
- Keyed by `service_id`

### CollectionsPane row redesign

**Desktop (sm+):**
- Keep table layout with columns: Name | Art Strip | Delete
- Remove separate "Albums" count column and "Updated" column — album count becomes a badge after the art strip
- Art strip: 40px thumbnails, overlapping, right-aligned, overflow clips
- Album count badge: `text-xs text-text-dim` after the strip (e.g. "12")
- Collection name: `text-sm font-medium text-text` (change from `font-semibold`)

**Mobile (<sm):**
- Switch from table to div-based list (table doesn't support stacked layouts well)
- Two-line stacked layout per row: collection name on top, art strip below spanning full width
- Same 40px overlapping thumbnails
- Album count badge inline after collection name
- Currently mobile hides art entirely — this change makes collections visually distinct on phone

**Shared styling (both breakpoints):**
- Row padding: `px-4 py-3`
- Hover: `hover:bg-hover transition-colors duration-150`
- Delete controls: unchanged behavior and positioning
- Create input at top: unchanged

### BulkAddBar refactor

Replace inline album art rendering (lines 8-17 of BulkAddBar.jsx) with `<AlbumArtStrip albums={selectedAlbums} size={40} />`. No visual change.

### Table-to-div migration

The current `<table>` layout limits responsive flexibility. Replace with div-based rows using flex. This is necessary for the mobile stacked layout and simplifies the responsive breakpoint handling (no more `hidden sm:table-cell`).

**Header row:** Kept as a flex div with same `text-xs font-semibold text-text-dim uppercase tracking-wide` styling. Simplified to just "Collection" label.

## Testing

- Unit test: AlbumArtStrip renders correct number of images, handles missing art, respects size prop
- Unit test: CollectionsPane renders art strip on each row, shows album count badge
- Unit test: BulkAddBar still renders correctly after refactor
- Visual check: mobile stacked layout, desktop side-by-side layout
