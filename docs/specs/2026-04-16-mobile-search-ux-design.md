# Mobile Search UX — Design Spec

**Issue:** [#28](https://github.com/toofanian/bummer/issues/28)
**Date:** 2026-04-16 (revised 2026-04-17)

## Problem

Search on mobile is an afterthought — a tiny inline input crammed into the header alongside title, toggle, and settings button. ~150px usable width. Only appears on library/collections views. Not discoverable, not comfortable to use. Search should be primary navigation, not a filter box.

## Solution: Full-screen search overlay

Replace inline search input with a search icon in the header that opens a full-screen search overlay. Follows the Spotify/Apple Music pattern.

## Out of scope
- Search persistence across dismiss (intentionally clears)
- Desktop layout changes (separate code path)
- Search across non-library content (collections search comes later if needed)
- iOS keyboard handling (h-dvh + viewport-fit=cover already correct)

---

## Trigger: Search icon in header

**File:** `frontend/src/App.jsx` (mobile header, ~line 717)

- Remove inline `<input>` from header (lines 730-737)
- Add search icon button in header, visible on **all views** (not just library/collections)
- Icon: magnifying glass (inline SVG, match existing icon style)
- Tapping opens SearchOverlay
- New state: `const [searchOpen, setSearchOpen] = useState(false)`

**Header after change:**
```
[Title] [LibraryViewToggle?] [SearchIcon] [SettingsIcon]
```

## SearchOverlay component

**New file:** `frontend/src/components/SearchOverlay.jsx`

**Position & z-index:**
- `fixed inset-0 z-[350]` — full-screen, above playback bars (z-190/200/300) but below modals (z-400+)
- `bg-surface` — opaque, not transparent/blurred
- Respects safe-area-inset-top and safe-area-inset-bottom

**Layout (top to bottom):**
1. **Search bar row** — `sticky top-0`, safe-area-inset-top padding
   - Search input: full width, autofocused, large tap target (py-3), text-base (not text-sm)
   - Cancel button: text button, right side, dismisses overlay
2. **Results area** — `flex-1 overflow-y-auto`
   - Renders `MobileAlbumCard` for each match (reuse from AlbumTable.jsx)
   - Uses existing `filterAlbums()` logic against full album list
   - Empty query: show nothing (blank) or optional "Start typing to search" hint
   - No matches: "No results" text
3. **No tab bar** — BottomTabBar hidden while overlay is open

**Props:**
```js
{
  albums,           // full album list to search
  search,           // current search string
  onSearchChange,   // setter
  onClose,          // dismiss overlay
  onPlay,           // play album/track
  playback,         // current playback state (for now-playing indicator)
  // pass through any props MobileAlbumCard needs
}
```

**Behavior:**
- Input autofocuses on mount
- ESC key or Cancel button dismisses
- Search string clears on dismiss
- Album cards behave identically to library view: expand tracks, tap to play
- BulkAddBar still works during search (selectedAlbumIds state lives in App.jsx)

## State wiring in App.jsx

- New state: `searchOpen` (boolean)
- Existing `search` / `setSearch` state reused, wired to overlay instead of inline input
- On overlay close: `setSearchOpen(false); setSearch('')`
- BottomTabBar: conditionally hidden when `searchOpen` (or overlay covers it via z-index)
- MiniPlaybackBar: stays visible below overlay? **No** — overlay is full-screen opaque, covers everything

## MobileAlbumCard extraction

`MobileAlbumCard` is currently defined inside `AlbumTable.jsx` (~line 72). Need to either:
- **Option A:** Extract to own file `components/MobileAlbumCard.jsx` for reuse
- **Option B:** Import/export from AlbumTable

**Go with A** — cleaner, AlbumTable.jsx is already large.

## Sticky header fix (from original spec)

Keep `sticky top-0 z-[100]` on mobile header. Already applied.

## Search input focus states

Move to SearchOverlay input instead. Larger input + ring focus:
- `focus:ring-2 focus:ring-accent/40 focus:outline-none`
- Larger size: `text-base py-3 px-4` (not the old text-sm py-1)

## Z-index ladder (final)

| z-index | Component |
|---------|-----------|
| 100 | Sticky header |
| 190 | MiniPlaybackBar |
| 200 | BottomTabBar |
| 300 | BulkAddBar |
| 350 | **SearchOverlay** |
| 400-401 | DevicePicker modal |
| 500 | CollectionPicker modal |

## Testing

- **Unit (Vitest):** SearchOverlay renders, input autofocuses, typing filters results, cancel dismisses, escape dismisses
- **Unit:** Header shows search icon on all mobile views
- **Unit:** MobileAlbumCard renders identically when used from SearchOverlay vs AlbumTable
- **Existing tests:** AlbumTable tests still pass after MobileAlbumCard extraction
