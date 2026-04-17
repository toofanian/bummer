# PWA + Mobile Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the app installable as a PWA and genuinely usable on iPhone 13 Pro (390px wide, iOS Safari / standalone).

**Architecture:** CSS-adaptive — desktop keeps the existing table layout; mobile (≤768px) gets a card list rendered via a `useIsMobile` hook + conditional JSX. NowPlayingPane becomes a bottom sheet on mobile. No new major components; no service worker.

**Tech Stack:** React + Vite, JavaScript, CSS custom properties, `env(safe-area-inset-*)`, `100dvh`, `window.matchMedia`

---

### Task 1: PWA Manifest + iOS Meta Tags

**Files:**
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/icon.svg`
- Modify: `frontend/index.html`

No automated tests for static files. Verify in browser DevTools → Application → Manifest.

**Step 1: Create `frontend/public/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#111111"/>
  <text x="256" y="360" font-size="300" text-anchor="middle" font-family="system-ui">💿</text>
</svg>
```

**Step 2: Create `frontend/public/manifest.json`**

```json
{
  "name": "Better Spotify",
  "short_name": "Better Spotify",
  "description": "Personal music library with sorting, collections, and playback control",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111111",
  "theme_color": "#111111",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

**Step 3: Update `frontend/index.html`**

Replace the existing `<head>` content with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#111111" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Better Spotify" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💿</text></svg>" />
    <link rel="apple-touch-icon" href="/icon.svg" />
    <link rel="manifest" href="/manifest.json" />
    <title>Better Spotify</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

Key changes from original:
- Added `viewport-fit=cover` — required for `env(safe-area-inset-*)` to return non-zero values
- Added `theme-color`, `apple-mobile-web-app-*` meta tags
- Added `<link rel="manifest">` and `<link rel="apple-touch-icon">`

**Step 4: Commit**

```bash
git checkout -b feat/pwa-mobile-polish
git add frontend/public/manifest.json frontend/public/icon.svg frontend/index.html
git commit -m "Add PWA manifest and iOS meta tags

- manifest.json with standalone display mode and SVG icon
- viewport-fit=cover for safe-area-inset support
- apple-mobile-web-app meta tags for iOS home screen install

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: iOS Layout Fixes (100dvh + Safe Area Insets)

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/components/PlaybackBar.jsx`

No automated tests. The bug being fixed: `height: 100vh` on iOS Safari is computed against the full viewport height including the browser toolbar, so content is clipped when the toolbar is visible. `100dvh` (dynamic viewport height) correctly tracks the visible area. Safe-area-inset-bottom prevents the PlaybackBar from overlapping the iPhone home indicator.

**Step 1: Fix `frontend/src/index.css`**

Change `#root` height:
```css
#root {
  height: 100dvh;   /* was: 100vh — dvh tracks visible area on iOS Safari */
  display: flex;
  flex-direction: column;
}
```

**Step 2: Fix `frontend/src/App.css`**

Change `.app` and `.loading-screen` to `100dvh`, and add safe-area-inset-bottom to `.app-body`:

```css
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100dvh;   /* was: 100vh */
  gap: 16px;
}

.app { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; transition: padding-right 0.25s ease; }

.app-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));  /* was: 64px */
  transition: padding-right 0.25s ease;
}
```

**Step 3: Fix `PlaybackBar.jsx` safe-area inset**

In the `styles.bar` object, update `bottom` and add `paddingBottom`:

```js
bar: {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  minHeight: '64px',                                    // was: height: '64px'
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',    // NEW: pushes content above home indicator
  background: 'var(--surface)',
  borderTop: '1px solid var(--border)',
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  padding: '0 16px',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',    // overrides the shorthand above; use longhand instead:
  zIndex: 200,
  gap: '8px',
},
```

Wait — two `paddingBottom` will conflict. Use longhand correctly:

```js
bar: {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  minHeight: '64px',
  background: 'var(--surface)',
  borderTop: '1px solid var(--border)',
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  paddingTop: '0',
  paddingRight: '16px',
  paddingLeft: '16px',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  zIndex: 200,
  gap: '8px',
},
```

**Step 4: Run existing tests to confirm nothing broke**

```bash
cd frontend && npm test -- --run
```

Expected: all existing tests pass.

**Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/App.css frontend/src/components/PlaybackBar.jsx
git commit -m "Fix iOS layout: use 100dvh and safe-area-inset-bottom

- 100dvh fixes Safari toolbar viewport clipping
- env(safe-area-inset-bottom) prevents PlaybackBar overlapping home indicator
- Requires viewport-fit=cover (added in Task 1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: `useIsMobile` Hook

**Files:**
- Create: `frontend/src/hooks/useIsMobile.js`
- Create: `frontend/src/hooks/useIsMobile.test.js`

**Step 1: Write the failing test**

Create `frontend/src/hooks/useIsMobile.test.js`:

```js
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './useIsMobile'

function mockMatchMedia(matches) {
  const listeners = []
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn((_, cb) => listeners.push(cb)),
    removeEventListener: vi.fn(),
  })
  return listeners
}

describe('useIsMobile', () => {
  it('returns true when matchMedia matches (mobile width)', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when matchMedia does not match (desktop width)', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates when viewport changes from desktop to mobile', () => {
    const listeners = mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => listeners[0]({ matches: true }))
    expect(result.current).toBe(true)
  })

  it('queries (max-width: 768px) by default', () => {
    mockMatchMedia(false)
    renderHook(() => useIsMobile())
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 768px)')
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- --run hooks/useIsMobile
```

Expected: FAIL with "Cannot find module './useIsMobile'"

**Step 3: Create `frontend/src/hooks/useIsMobile.js`**

```js
import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}
```

**Step 4: Run the test to verify it passes**

```bash
cd frontend && npm test -- --run hooks/useIsMobile
```

Expected: 4 passing tests.

**Step 5: Commit**

```bash
git add frontend/src/hooks/useIsMobile.js frontend/src/hooks/useIsMobile.test.js
git commit -m "Add useIsMobile hook with tests

- Returns true when viewport matches (max-width: 768px)
- Subscribes to matchMedia change events
- 4 tests covering initial state, updates, and query string

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Mobile Album Card List CSS

**Files:**
- Modify: `frontend/src/App.css`

No automated tests (pure CSS). Append the following to `App.css`:

**Step 1: Add card list styles to `App.css`**

```css
/* =====================
   Mobile album card list (≤768px)
   ===================== */

.album-card-list {
  display: none; /* hidden by default — shown by media query below */
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
}

.album-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.1s;
  min-height: 64px;  /* 44px min touch target + padding */
}

.album-card:active { background: var(--selected); }
.album-card.now-playing { background: var(--now-playing); }

.album-card img {
  width: 44px;
  height: 44px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.album-card-placeholder {
  width: 44px;
  height: 44px;
  border-radius: 4px;
  background: var(--surface-2);
  flex-shrink: 0;
}

.album-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.album-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-card-artist {
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-card-year {
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}

.album-card-expand-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 8px;
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

/* Track rows inside mobile card list */
.album-card-tracks {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.album-card-track-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 10px 72px; /* 72px = 44px art + 12px gap + 16px padding */
  min-height: 44px;
  cursor: pointer;
  border-top: 1px solid var(--border);
}

.album-card-track-row.now-playing { background: var(--now-playing); }
.album-card-track-row:active { background: var(--selected); }

.album-card-track-number {
  font-size: 12px;
  color: var(--text-dim);
  min-width: 18px;
  text-align: right;
  flex-shrink: 0;
}

.album-card-track-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-card-track-name.active {
  color: var(--text);
  font-weight: 600;
}

.album-card-track-duration {
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}

/* =====================
   Breakpoint: show cards, hide table
   ===================== */
@media (max-width: 768px) {
  .table-wrap { display: none; }
  .album-card-list { display: flex; }

  /* Make collections-bubble-btn a bigger touch target on mobile */
  .collections-bubble-btn {
    width: 32px;
    height: 32px;
    border-radius: 16px;
    font-size: 13px;
  }
}
```

**Step 2: Commit**

```bash
git add frontend/src/App.css
git commit -m "Add mobile album card list CSS (≤768px breakpoint)

- .album-card-list shows on mobile, .table-wrap hides
- 44px min touch targets throughout
- Track rows indented to align with card art

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: AlbumTable Mobile Rendering + Single-Tap Play

**Files:**
- Modify: `frontend/src/components/AlbumTable.jsx`
- Modify: `frontend/src/components/AlbumTable.test.jsx`

**Step 1: Write failing tests**

Open `frontend/src/components/AlbumTable.test.jsx`. Add tests at the end of the file. First, check how existing tests are structured (imports, `render`, mock setup). Then add:

```js
// At top of file, add this import (alongside existing imports):
import { vi } from 'vitest'

// Mock useIsMobile — add near top of file, after imports:
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn() }))

// Add these imports near the top:
import { useIsMobile } from '../hooks/useIsMobile'
```

Then add test cases:

```js
describe('AlbumTable mobile card list', () => {
  const albums = [
    {
      spotify_id: 'abc1',
      name: 'Test Album',
      artists: ['Artist A'],
      release_date: '2020-01-01',
      added_at: '2024-01-01T00:00:00Z',
      image_url: 'http://example.com/art.jpg',
    },
  ]

  beforeEach(() => {
    useIsMobile.mockReturnValue(false)
  })

  it('renders a table on desktop (isMobile=false)', () => {
    useIsMobile.mockReturnValue(false)
    const { queryByRole } = render(
      <AlbumTable albums={albums} loading={false} />
    )
    expect(queryByRole('table')).toBeInTheDocument()
    expect(document.querySelector('.album-card-list')).not.toBeInTheDocument()
  })

  it('renders card list on mobile (isMobile=true)', () => {
    useIsMobile.mockReturnValue(true)
    const { queryByRole } = render(
      <AlbumTable albums={albums} loading={false} />
    )
    expect(queryByRole('table')).not.toBeInTheDocument()
    expect(document.querySelector('.album-card-list')).toBeInTheDocument()
  })

  it('calls onPlay with spotifyId on single tap in mobile card list', async () => {
    useIsMobile.mockReturnValue(true)
    const onPlay = vi.fn()
    const { getByTestId } = render(
      <AlbumTable albums={albums} loading={false} onPlay={onPlay} />
    )
    const card = getByTestId('album-card-abc1')
    fireEvent.click(card)
    expect(onPlay).toHaveBeenCalledWith('abc1')
  })

  it('does not trigger play when expand button is tapped', async () => {
    useIsMobile.mockReturnValue(true)
    const onPlay = vi.fn()
    const { getByLabelText } = render(
      <AlbumTable albums={albums} loading={false} onPlay={onPlay} />
    )
    const expandBtn = getByLabelText('Expand')
    fireEvent.click(expandBtn)
    expect(onPlay).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run the tests to verify they fail**

```bash
cd frontend && npm test -- --run components/AlbumTable
```

Expected: new tests FAIL (card list not yet implemented).

**Step 3: Update `AlbumTable.jsx`**

Add `useIsMobile` import and a mobile card list render path. The full updated file:

At the top, add:
```js
import { useIsMobile } from '../hooks/useIsMobile'
```

Inside the `AlbumTable` component, after the `navigateRow` function definition and before `return (...)`, add:

```js
const isMobile = useIsMobile()
```

Then change the `return` statement to:

```jsx
if (isMobile) {
  return (
    <div className="album-card-list">
      {sorted.map(album => {
        const isExpanded = !!expanded[album.spotify_id]
        const isPlaying = playingId === album.spotify_id
        const exp = expanded[album.spotify_id]

        return (
          <div key={album.spotify_id}>
            <div
              data-testid={`album-card-${album.spotify_id}`}
              className={`album-card${isPlaying ? ' now-playing' : ''}`}
              onClick={() => onPlay && onPlay(album.spotify_id)}
            >
              {album.image_url
                ? <img src={album.image_url} alt={album.name} width={44} height={44} />
                : <div className="album-card-placeholder" />
              }
              <div className="album-card-info">
                <span className="album-card-name">{album.name}</span>
                <span className="album-card-artist">{album.artists.join(', ')}</span>
              </div>
              <span className="album-card-year">{formatYear(album.release_date)}</span>
              <button
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                className="album-card-expand-btn"
                onClick={e => { e.stopPropagation(); handleExpand(album.spotify_id) }}
              >
                <span className={`expand-chevron${isExpanded ? ' expanded' : ''}`}>›</span>
              </button>
            </div>

            {isExpanded && (
              <div className="album-card-tracks">
                {exp.loading ? (
                  <div className="album-card-track-row">
                    <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading tracks…</span>
                  </div>
                ) : (
                  exp.tracks.map(t => {
                    const isActive = playingTrackName && t.name === playingTrackName
                    return (
                      <div
                        key={t.track_number}
                        className={`album-card-track-row${isActive ? ' now-playing' : ''}`}
                        onClick={() => onPlayTrack && onPlayTrack(`spotify:track:${t.spotify_id}`)}
                      >
                        <span className="album-card-track-number">{t.track_number}</span>
                        <span className={`album-card-track-name${isActive ? ' active' : ''}`}>{t.name}</span>
                        <span className="album-card-track-duration">{t.duration}</span>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

return (
  <table className="album-table">
    {/* ... existing table JSX unchanged ... */}
  </table>
)
```

**Step 4: Run all tests to verify they pass**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass including the new mobile card list tests.

**Step 5: Commit**

```bash
git add frontend/src/components/AlbumTable.jsx frontend/src/components/AlbumTable.test.jsx
git commit -m "AlbumTable: render card list on mobile, single-tap to play

- useIsMobile hook drives conditional rendering
- Mobile: .album-card-list with 44px touch targets
- Single tap on card plays album; expand button isolated via stopPropagation
- Track rows with tap-to-play inline below expanded card
- Desktop table behavior unchanged

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: CollectionsPane Touch Fixes

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`
- Modify: `frontend/src/App.css`

**Step 1: Update CollectionsPane to show delete buttons on touch devices**

In `CollectionsPane.jsx`, add `useIsMobile` import:

```js
import { useIsMobile } from '../hooks/useIsMobile'
```

Inside the `CollectionsPane` component, after existing state declarations:

```js
const isMobile = useIsMobile()
```

Find the delete button JSX (currently uses `collection-delete-btn` class with opacity: 0). Add an inline style override when on mobile to make it always visible:

```jsx
<button
  className="collection-delete-btn"
  style={isMobile ? { opacity: 0.6 } : undefined}
  onClick={e => { e.stopPropagation(); setConfirmingId(col.id) }}
  aria-label={`Delete ${col.name}`}
>
  ✕
</button>
```

**Step 2: Add mobile touch target overrides to `App.css`**

In the `@media (max-width: 768px)` block (added in Task 4), add:

```css
@media (max-width: 768px) {
  /* ... existing rules ... */

  /* CollectionsPane: always show delete button, bigger tap target */
  .collection-delete-btn {
    opacity: 0.6 !important;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Bigger row height for easier tapping */
  .collections-table td {
    padding: 12px 8px;
  }

  /* Search input: full width on mobile */
  .search-input {
    width: 100%;
    margin-left: 0;
  }
}
```

**Step 3: Run existing tests to confirm nothing broke**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add frontend/src/components/CollectionsPane.jsx frontend/src/App.css
git commit -m "CollectionsPane: always-visible delete buttons and bigger touch targets on mobile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: NowPlayingPane as Bottom Sheet on Mobile

**Files:**
- Modify: `frontend/src/components/NowPlayingPane.jsx`

**Step 1: Import `useIsMobile` in NowPlayingPane**

```js
import { useIsMobile } from '../hooks/useIsMobile'
```

**Step 2: Update pane styles to support bottom sheet on mobile**

Inside `NowPlayingPane`, add:

```js
const isMobile = useIsMobile()
```

The current `styles.pane` is a function `(open) => ({...})`. Update it to also accept `isMobile`:

```js
const paneStyle = isMobile
  ? {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '70vh',
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      borderRadius: '16px 16px 0 0',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 150,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.3s ease',
      overflowY: 'auto',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }
  : {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',  // updated from 64px
      width: `${PANE_WIDTH}px`,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 150,
      transform: open ? 'translateX(0)' : `translateX(${PANE_WIDTH}px)`,
      transition: 'transform 0.25s ease',
      overflowY: 'auto',
    }
```

Also add a drag handle element at the top of the mobile pane (visual only):

```jsx
{isMobile && (
  <div style={{
    width: '36px',
    height: '4px',
    background: 'var(--border)',
    borderRadius: '2px',
    margin: '10px auto 4px',
    flexShrink: 0,
  }} />
)}
```

Place this as the first child inside the `<aside>` element, before the header `<div>`.

For the vinyl record on mobile, reduce its size. The `VinylRecord` component renders an SVG with `width="180" height="180"`. Pass a size prop:

```jsx
<VinylRecord
  isPlaying={state.is_playing}
  albumImageUrl={albumImageUrl}
  size={isMobile ? 120 : 180}
/>
```

Update `VinylRecord` to accept a `size` prop (default 180):

```jsx
function VinylRecord({ isPlaying, albumImageUrl, size = 180 }) {
  return (
    <>
      <style>{SPIN_STYLE}</style>
      <svg
        role="img"
        aria-label="Vinyl record"
        width={size}
        height={size}
        viewBox="0 0 200 200"
        style={{
          animation: 'spin-record 3s linear infinite',
          animationPlayState: isPlaying ? 'running' : 'paused',
          display: 'block',
        }}
      >
        {/* ... rest unchanged ... */}
      </svg>
    </>
  )
}
```

**Step 3: Run existing NowPlayingPane tests to confirm nothing broke**

```bash
cd frontend && npm test -- --run components/NowPlayingPane
```

Expected: all existing tests pass.

**Step 4: Commit**

```bash
git add frontend/src/components/NowPlayingPane.jsx
git commit -m "NowPlayingPane: bottom sheet on mobile, side panel on desktop

- Mobile: slides up from bottom (70vh, translateY), rounded top corners, drag handle
- Desktop: existing side panel behavior, bottom adjusted for safe-area
- Vinyl record shrinks to 120px on mobile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: PlaybackBar Mobile Adaptations

**Files:**
- Modify: `frontend/src/components/PlaybackBar.jsx`

**Step 1: Import `useIsMobile` and conditionally adapt layout**

Add import:
```js
import { useIsMobile } from '../hooks/useIsMobile'
```

Inside `PlaybackBar`, after existing state/variable declarations:
```js
const isMobile = useIsMobile()
```

**Step 2: Hide volume slider on mobile**

The volume slider (`VolumeSlider`) is currently rendered unconditionally when `onSetVolume != null`. On mobile, the phone controls volume natively and the slider takes up precious space. Wrap it:

```jsx
{!isMobile && onSetVolume != null && (
  <VolumeSlider
    value={volume}
    onChange={(v) => { setVolume(v); debouncedSetVolume(v) }}
  />
)}
```

**Step 3: Hide device name on mobile (save horizontal space)**

```jsx
{!isMobile && device && (
  <span style={styles.deviceName}>▸ {device.name}</span>
)}
```

**Step 4: Adjust now-playing card width on mobile**

The card has `width: 200px` (in `App.css`). On a 390px screen this is too wide. Add to the `@media (max-width: 768px)` block in `App.css`:

```css
@media (max-width: 768px) {
  /* ... existing rules ... */

  /* Shrink now-playing card on mobile */
  .now-playing-card {
    width: auto;
    max-width: 150px;
  }
}
```

**Step 5: Run all PlaybackBar tests**

```bash
cd frontend && npm test -- --run components/PlaybackBar
```

Expected: all tests pass (volume slider and device name tests may need mocking — check existing tests and update them if they assert on elements that are now hidden on mobile. If tests use `isMobile=false` context via matchMedia mock, they should still pass as-is since `useIsMobile()` defaults to false in jsdom where matchMedia returns false.)

If any test fails because `useIsMobile` isn't mocked: add the same mock pattern used in Task 5 to the PlaybackBar test file's top:

```js
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn().mockReturnValue(false) }))
```

**Step 6: Run all tests**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add frontend/src/components/PlaybackBar.jsx frontend/src/App.css
git commit -m "PlaybackBar: hide volume and device name on mobile, shrink now-playing card

- Volume slider hidden on mobile (Spotify controls volume natively)
- Device name hidden on mobile (saves space)
- Now-playing card max-width: 150px on mobile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Final: Merge to Main

After all tasks complete and all tests pass on `feat/pwa-mobile-polish`:

```bash
git checkout main
git merge feat/pwa-mobile-polish
```

Then deploy frontend to Vercel (push to main triggers auto-deploy if configured).

**Manual verification checklist (on iPhone 13 Pro):**
- [ ] Open app in Safari — no layout clipping under toolbar
- [ ] Tap Share → Add to Home Screen — icon appears (💿 or solid color)
- [ ] Launch from home screen — opens full-screen, no Safari chrome
- [ ] PlaybackBar visible above home indicator (not behind it)
- [ ] Album list shows as cards, not table
- [ ] Tap a card → album plays
- [ ] Tap expand button → tracks appear
- [ ] Collections pane: delete buttons visible without hovering
- [ ] Now Playing button in PlaybackBar → sheet slides up from bottom
- [ ] Volume slider hidden (not rendered)
