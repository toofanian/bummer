# PWA + Mobile Polish Design
_2026-03-01 — Target device: iPhone 13 Pro (390px wide, iOS Safari / standalone)_

## Goal

Make the app installable as a PWA and genuinely usable on iPhone 13 Pro. All parts of the app are used equally, so improvements must cover the library view, collections view, playback bar, and now-playing pane.

## Approach

CSS-adaptive (B): desktop keeps the existing table layout; mobile (≤768px) gets a purpose-built card list. Minimal new components — mostly CSS + a touch detection hook. No service worker (Spotify auth requires network; offline adds no value here).

## End-state (user-visible)

1. **Installable** — add to home screen yields a full-screen app with a 💿 icon, no Safari chrome.
2. **No layout breakage** — playback bar doesn't overlap the iOS home indicator; viewport fills correctly without the 100vh Safari bug.
3. **Mobile album list** — single-column card list: album art left, album name + artist stacked right, year dimmed. One tap plays.
4. **Touch-friendly controls** — bigger tap targets everywhere; delete buttons always visible on touch devices; volume slider easier to grab.
5. **Now Playing as bottom sheet** — slides up from the bottom on mobile instead of a side panel.

## What changes

### 1. PWA manifest + iOS meta tags
- `frontend/public/manifest.json`: name, short_name, display: standalone, theme_color (#111111), background_color (#111111), icons (192×192, 512×512)
- `frontend/public/` icons: static PNG files (or SVG fallback)
- `frontend/index.html` additions:
  - `<link rel="manifest">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<meta name="apple-touch-icon">`
  - `<meta name="theme-color" content="#111111">`

### 2. iOS layout fixes (index.css / App.css)
- Replace `height: 100vh` with `height: 100dvh` (dynamic viewport height — fixes Safari toolbar overlap)
- Add `padding-bottom: env(safe-area-inset-bottom)` to `.app` so content never hides behind home indicator
- PlaybackBar bottom offset: `bottom: env(safe-area-inset-bottom)` so it sits above the home indicator
- `padding-bottom` on `.app-body` accounts for PlaybackBar height + safe-area-inset

### 3. Mobile album card list (≤768px)
- `@media (max-width: 768px)`: hide `.album-table`, show a new `.album-card-list` layout
- Each card: 44px art thumbnail · album name (bold) + artist (dim) stacked · year (dim, right-aligned)
- Single tap plays the album (replaces double-click)
- Expand for tracks: tap the card to expand inline track list below it
- CollectionsBubble moves inside the card (small badge, tap opens popover)
- No separate column for collections count — bubble badge is sufficient

### 4. Touch-friendly interactions
- `useTouchDevice` hook (`window.matchMedia('(hover: none)')`) — returns boolean
- On touch devices: play on single tap (not double-click) for album rows
- Delete buttons in CollectionsPane: always visible on touch (opacity: 1, no hover required)
- Minimum tap target 44×44px for all interactive elements on mobile
- Volume slider: wider hit area on mobile (full-width on small screens, or hidden — Spotify volume is better controlled natively on phone)

### 5. NowPlayingPane as bottom sheet on mobile
- On mobile (≤768px), NowPlayingPane renders as a fixed bottom sheet (position: fixed, bottom: 0, slides up via transform)
- Height: ~70vh when open
- Drag handle at top (visual only, no drag-to-dismiss needed for v1)
- PlaybackBar remains visible above the sheet (z-index layering)
- On desktop: existing side panel behavior unchanged

## Out of scope
- Service worker / offline caching
- Swipe gestures (drag to dismiss, swipe between views)
- Separate mobile components (all via CSS + one hook)
- Any changes to backend
