# Mobile Search UX — Implementation Plan

**Spec:** `docs/specs/2026-04-16-mobile-search-ux-design.md`
**Issue:** [#28](https://github.com/toofanian/bummer/issues/28)

## Step 1: Extract MobileAlbumCard

**Why first:** SearchOverlay and AlbumTable both need it. Extract before building overlay.

1. Create `frontend/src/components/MobileAlbumCard.jsx`
2. Move MobileAlbumCard function from `AlbumTable.jsx` (~line 72-151) to new file
3. Export from new file, import in AlbumTable.jsx
4. Run tests: `npm test` — AlbumTable tests must still pass
5. Commit

## Step 2: Build SearchOverlay component (TDD)

1. Create test file `frontend/src/components/SearchOverlay.test.jsx`
2. Write failing tests:
   - Renders search input that is autofocused
   - Typing in input filters albums using filterAlbums logic
   - Displays MobileAlbumCard for each result
   - Shows "No results" when query has no matches
   - Shows empty state when query is blank
   - Cancel button calls onClose
   - Escape key calls onClose
3. Create `frontend/src/components/SearchOverlay.jsx`
4. Implement until all tests pass:
   - `fixed inset-0 z-[350] bg-surface` full-screen overlay
   - Top bar: search input (text-base, py-3, autofocus, focus:ring-2 focus:ring-accent/40) + Cancel button
   - Results: filtered MobileAlbumCards
   - Safe-area padding top and bottom
5. Commit

## Step 3: Wire SearchOverlay into App.jsx

1. Add tests to `App.mobile-layout.test.jsx`:
   - Search icon visible in header on all mobile views
   - Tapping search icon opens SearchOverlay
   - SearchOverlay cancel closes overlay and clears search
2. In App.jsx mobile layout:
   - Add `searchOpen` state
   - Remove inline search `<input>` from header (lines 730-737)
   - Add search icon button in header (all views)
   - Render `<SearchOverlay>` when `searchOpen` is true
   - Wire props: albums, search, onSearchChange, onClose, onPlay, playback
   - onClose: `setSearchOpen(false); setSearch('')`
3. Run full test suite
4. Commit

## Step 4: Clean up and verify

1. Remove any dead search-related code (old inline input styles, etc.)
2. Run full test suite: `npm test`
3. Final commit
