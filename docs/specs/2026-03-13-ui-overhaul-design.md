# UI Overhaul Design Spec

**Date:** 2026-03-13
**Scope:** Complete frontend UI overhaul — mobile (iPhone 13 Pro primary) and desktop
**Branch:** `feat/ui-overhaul`
**Backend changes:** None

## Goals

- Make the mobile experience feel like a native music app, not a shrunk-down website
- Systematize the visual design (spacing, typography, radius, transitions) across all components
- Overhaul desktop layouts for consistency and polish
- Adopt Tailwind CSS as the styling framework
- Fully revertible via feature branch

## Design Decisions

1. **Tailwind CSS** replaces vanilla CSS (`App.css` + `index.css`)
2. **Mini playback bar** on mobile — tap to expand full-screen now-playing
3. **Bottom tab bar** on mobile for navigation (Home, Library, Collections, Digest)
4. **All secondary views go full-screen** on mobile — no modals or half-sheets
5. **Minimal aesthetic preserved** — album art is the art, UI stays clean and out of the way
6. **Both mobile and desktop** get overhauled

## 1. Design System Foundation

### Tailwind Theme Configuration

#### Colors

Migrate existing CSS custom properties into Tailwind theme. Dark mode default, light via `prefers-color-scheme`.

```
bg:          #111111 (dark) / #f5f5f5 (light)
surface:     #1c1c1c (dark) / #ffffff (light)
surface-2:   #252525 (dark) / #ebebeb (light)
border:      #2e2e2e (dark) / #d0d0d0 (light)
text:        #f0f0f0 (dark) / #111111 (light)
text-dim:    #888888 (dark) / #666666 (light)
hover:       #1e1e1e (dark) / #e8e8e8 (light)
selected:    #2a2a2a (dark) / #e0e0e0 (light)
accent:      #c0c0c0 (dark) / #606060 (light)
focus-border: #555555 (dark) / #999999 (light)
hover-border: #444444 (dark) / #bbbbbb (light)
now-playing: #1a2a1a (dark) / #e8f5e8 (light)
```

No new colors added. Spotify green (`#1db954`) retained only for collection checkmarks. Delete red (`#c0392b`) retained for destructive actions.

#### Spacing

Tailwind default 4px base scale. Replaces inconsistent hardcoded values (4/6/8/10/12/16/20/24px).

#### Typography

Four sizes, standardized:
- `text-xs` (11px) — metadata, timestamps, date-added
- `text-sm` (13px) — secondary info, table cells, artist names
- `text-base` (15px) — primary content, album names, nav labels
- `text-lg` (18px) — section headers, view titles

#### Border Radius

Three values:
- `rounded` (4px) — buttons, inputs, small elements
- `rounded-lg` (8px) — cards, panels, containers
- `rounded-full` — album art thumbnails, collection bubbles

#### Breakpoints

- `sm`: 390px — iPhone 13 Pro (primary mobile target)
- `md`: 768px — tablet / small laptop
- `lg`: 1024px — desktop

#### Transitions

All interactive elements: 150ms ease. Consistent across hover states, panel animations, view transitions.

## 2. Mobile Layout (iPhone 13 Pro — 390x844)

### Screen Structure (bottom to top)

```
┌─────────────────────────┐
│       Header (view title + search on Library)
├─────────────────────────┤
│                         │
│     Content Area        │
│     (scrollable)        │
│                         │
│                         │
├─────────────────────────┤
│  Mini Playback Bar      │  ~56px
├─────────────────────────┤
│  Bottom Tab Bar         │  ~50px + safe-area-inset-bottom
└─────────────────────────┘
```

### Bottom Tab Bar

- Fixed at screen bottom, above safe area inset
- 4 tabs: Home, Library, Collections, Digest
- Each tab: icon (20px) + label (text-xs) stacked vertically
- Active tab: `text` color. Inactive: `text-dim`
- Background: `surface` with top border `border`
- Height: 50px + `env(safe-area-inset-bottom)`

### Mini Playback Bar

- Sits directly above tab bar
- Height: 56px
- Layout: `[album-art-40px] [track + artist] [play/pause-btn]`
- Album art: 40px square, `rounded` (4px)
- Track name: `text-sm`, single line, truncated
- Artist: `text-xs text-dim`, single line, truncated
- Play/pause button: 36px tap target
- Tap anywhere except play/pause → expand to full-screen now-playing
- Background: `surface` with top border `border`
- Shows nothing when no track is playing

### Full-Screen Now Playing

- Slides up from mini bar (transform translateY animation, 300ms ease)
- Covers entire screen (100vh, 100vw, z-index above everything)
- Background: `bg`
- Layout (top to bottom):
  - Dismiss handle: chevron-down icon or thin pill indicator at top, tap/swipe-down to dismiss
  - Album art: square, width = 100vw - 48px padding, centered, `rounded-lg`
  - Track name: `text-lg`, centered, single line truncated
  - Artist name: `text-sm text-dim`, centered
  - Progress bar: display-only (no seek — that would be new functionality out of scope for this UI overhaul)
  - Time indicators: `text-xs text-dim`, current / total
  - Playback controls: centered row — previous (44px), play/pause (56px), next (44px)
  - Volume slider: below controls, full width with padding
  - Device selector: icon button, opens device list
  - Track list: scrollable list below, current track highlighted with `now-playing` background
- Swipe down or tap chevron → animate back down to mini bar

### Mobile Views

**Home:**
- Section headers: `text-lg`, left-aligned
- Album rows: horizontal scroll, album art 100px square with `rounded-lg`, album name below (`text-sm`, truncated), artist below that (`text-xs text-dim`)
- Spacing: 16px between sections, 12px gap between albums in a row

**Library:**
- Search input: full width, `rounded-lg`, `surface-2` background, 44px height for touch
- Album card list: vertical stack
  - Each card: `[album-art-48px rounded] [album + artist + year]`
  - Album name: `text-base`, single line truncated
  - Artist + year: `text-sm text-dim`
  - Card height: ~64px with 8px vertical padding
  - Tap to expand track list (animated, same as current)
  - Double-tap or play button to start playback
- CollectionsBubble: 32px diameter (current mobile size, keep it)

**Collections:**
- List of collections, each row:
  - Collection name: `text-base`
  - Album count: `text-sm text-dim`
  - Art strip: row of small album thumbnails (24px, overlapping slightly)
  - Tap → full-screen collection detail view
- Collection detail: full-screen with back button in header, shows album card list (same component as Library)

**Digest:**
- Full-screen view (same as current DigestPanel content but laid out for full width)
- Date range picker at top
- Stat sections below, scrollable

### Mobile Header

- Minimal: view title (`text-lg`) left-aligned
- Search icon in Library view (tap to expand search input)
- No nav buttons in header (moved to bottom tab bar)
- Height: ~44px + safe-area-inset-top

## 3. Desktop Layout

### Screen Structure

```
┌──────────────────────────────────────────────────┐
│  Header: [title] [nav-tabs] [search]             │
├────────────────────────────────┬─────────────────┤
│                                │                 │
│        Content Area            │   Side Panel    │
│        (scrollable)            │   (320px)       │
│                                │   Now Playing   │
│                                │   OR Digest     │
│                                │                 │
├────────────────────────────────┴─────────────────┤
│  Playback Bar (full width)                       │
└──────────────────────────────────────────────────┘
```

### Header

- Height: 56px
- Layout: `[app-title + version] [nav-tabs-center] [search + digest-toggle-right]`
- Version badge (`__APP_VERSION__`) retained next to app title
- Nav tabs: horizontal row — Home, Library, Collections
  - Text labels, `text-sm`
  - Active tab: `text` color + bottom border indicator (2px accent)
  - Inactive: `text-dim`, no border
  - Hover: `text` color
- Search: input field, `rounded`, `surface-2` background, 36px height, ~240px width
- Background: `surface` with bottom border `border`

### Content Area

- Flexible width: fills space minus side panel (when open)
- Max-width: none (fill available space)
- Padding: 24px
- Transition: width adjusts smoothly (200ms ease) when side panel opens/closes

**Home:**
- Section headers: `text-lg`
- Album rows: horizontal scroll, album art 120px square `rounded-lg`, album name + artist below
- More albums visible per row than mobile

**Library:**
- Table view (desktop only):
  - Columns: # | Art (40px) | Album | Artist | Year | Date Added | Collections
  - Sticky header row
  - Row height: 44px
  - Hover: `hover` background
  - Selected: `selected` background
  - Now-playing row: `now-playing` background
  - Keyboard navigation retained (arrow keys, Enter, Escape)
  - All text: `text-sm`
  - Consistent column alignment and padding

**Collections:**
- Grid of collection cards (3 columns on lg, 2 on md)
- Each card: `rounded-lg`, `surface` background, padding 16px
  - Collection name: `text-base`
  - Album count: `text-sm text-dim`
  - Art strip: row of album thumbnails
  - Hover: `hover` background
  - Click → collection detail view (replaces content area, back button in header)

**Digest:**
- Digest is NOT a nav tab on desktop. It remains a toggle button (separate from the nav tabs) that opens as a side panel, same as current behavior.
- Opens as side panel (same slot as now-playing, mutual exclusion maintained)
- Width: 320px (same as now-playing for consistency)

### Side Panel (Now Playing / Digest)

- Width: 320px (changed from 300px now-playing / 340px digest — unified to one width)
- Fixed to right side of content area
- Slides in/out with 200ms ease transition
- Background: `surface`
- Left border: `border`
- Now Playing layout:
  - Album art at top (full panel width minus padding)
  - Track name: `text-base`
  - Artist: `text-sm text-dim`
  - Track list below, scrollable
  - Current track: `now-playing` background
- Close button: X icon, top-right corner

### Playback Bar (Desktop)

- Fixed bottom, full width
- Height: 64px
- Background: `surface` with top border `border`
- Three-column grid layout:
  - Left: now-playing info — album art (48px) + track name + artist
  - Center: playback controls — previous, play/pause, next + progress bar below
  - Right: volume slider + device selector
- All buttons: minimum 32px tap/click target
- Progress bar: thin track, hover to show time tooltip

## 4. Component Architecture

### New Components (Mobile)

- `BottomTabBar.jsx` — mobile navigation tabs
- `MiniPlaybackBar.jsx` — collapsed playback indicator
- `FullScreenNowPlaying.jsx` — expanded now-playing view

### Modified Components

- `App.jsx` — layout orchestration, swap between mobile/desktop layouts
- `PlaybackBar.jsx` — desktop only (mobile uses MiniPlaybackBar)
- `NowPlayingPane.jsx` — desktop side panel only (mobile uses FullScreenNowPlaying)
- `DigestPanel.jsx` — desktop: side panel, mobile: full-screen view
- `CollectionsPane.jsx` — desktop: grid cards, mobile: full-screen list
- `AlbumTable.jsx` — desktop only
- `HomePage.jsx` — responsive album row sizing
- `AlbumRow.jsx` — responsive album card sizing

### Removed

- `RowMenu.jsx` + `RowMenu.test.jsx` — legacy, not used
- `App.css` — replaced entirely by Tailwind utilities
- `index.css` — theme tokens move to `@theme` block in Tailwind entry CSS. Global button/input/body styles from `index.css` must be migrated into a `@layer base` block in the Tailwind entry CSS file before deletion. Tailwind Preflight handles the rest.

### Retained

- `useIsMobile.js` — retained at 768px breakpoint (`md`). This is the JS threshold for swapping component trees (e.g., PlaybackBar vs MiniPlaybackBar, NowPlayingPane vs FullScreenNowPlaying). Tailwind's `sm` (390px) breakpoint is for CSS-only responsive adjustments within mobile layouts.
- `usePlayback.js` — no changes
- `filterAlbums.js` — no changes
- `CollectionsBubble.jsx` — minor styling updates only
- `TierSelector.jsx` — remains hidden, no changes

## 5. Migration Strategy

### Order of Operations

1. **Install and configure Tailwind** — add to Vite config, set up `tailwind.config.js` with theme tokens, verify it works alongside existing CSS
1b. **Migrate global base styles** — move button/input/body styles from `index.css` into a `@layer base` block in the Tailwind entry CSS file (before any component migration)
2. **Migrate base layout** — App.jsx shell, header, content area structure. Loading/error screen states migrated as part of this step.
3. **Build new mobile components** — BottomTabBar, MiniPlaybackBar, FullScreenNowPlaying
4. **Migrate existing components one at a time** — replace CSS classes with Tailwind utilities per component
5. **Desktop layout refinements** — header tabs, collections grid, side panel transitions
6. **Delete old CSS files** — once all components are migrated
7. **Delete RowMenu.jsx** — legacy unused component
8. **Polish pass** — animations, transitions, edge cases, safe area insets

### Testing Strategy

- All existing Vitest unit tests must continue to pass throughout
- Manual testing on iPhone 13 Pro (390x844) viewport throughout
- Test both dark and light mode
- Test with and without active playback
- Test all views: Home, Library, Collections (list + detail), Digest
- Test full-screen now-playing expand/collapse
- Playwright E2E tests updated for new selectors/structure

### Revert Strategy

- Entire overhaul on `feat/ui-overhaul` branch
- `main` branch unchanged until merge
- If anything goes wrong: `git checkout main` and the branch can be deleted or revisited later
