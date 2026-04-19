# Album Art Strip Carousel — Design Spec

**Issue:** #75
**Date:** 2026-04-18

## Problem

`AlbumArtStrip` renders all thumbnails in a flex row with no overflow handling. When a collection or artist has more albums than fit the viewport width, art overflows off-screen with no way to see the rest.

## Fix

Add horizontal scroll to `AlbumArtStrip` with hidden scrollbar. Touch swipe, trackpad scroll, and click-drag all work via native CSS `overflow-x: auto`. Last visible thumbnail naturally clips to hint at more content.

## Changes

- **`AlbumArtStrip.jsx` only** — add `overflow-x: auto`, `scrollbar-width: none`, webkit scrollbar hide
- No new components, no arrow buttons, no fade gradients
- Both `CollectionsPane` and `ArtistsView` inherit the fix via the shared component

## Testing

- Container has correct overflow and scrollbar-hide styles
- Albums render inside scrollable container
