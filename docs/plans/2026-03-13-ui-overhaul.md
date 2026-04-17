# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the entire frontend UI — adopt Tailwind CSS, build native-feeling mobile experience (iPhone 13 Pro), and systematize desktop layouts.

**Architecture:** Replace all vanilla CSS (App.css + index.css) with Tailwind utilities. Mobile gets bottom tab bar + mini playback bar + full-screen now-playing. Desktop gets refined header tabs, grid collections, unified 320px side panel. All on `feat/ui-overhaul` branch for safe revert.

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-ui-overhaul-design.md`

---

## Chunk 1: Foundation — Tailwind Setup + Base Styles + Branch

### Task 1: Create feature branch and install Tailwind

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/tailwind.css` (Tailwind entry file — renamed from `app.css` to avoid macOS case-insensitive collision with `App.css`)

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/ui-overhaul
```

- [ ] **Step 2: Install Tailwind CSS v4 + Vite plugin**

```bash
cd frontend && npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Add Tailwind Vite plugin to `vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'
    ),
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
```

Note: Tailwind CSS v4 does NOT use a `tailwind.config.js` file. All configuration is done in the CSS file using `@theme` blocks.

- [ ] **Step 4: Create Tailwind entry CSS file at `frontend/src/tailwind.css`**

This file replaces both `index.css` and `App.css`. It imports Tailwind, defines the theme, and migrates global base styles.

```css
@import "tailwindcss";

/* === Theme: design tokens === */
@theme {
  /* Colors — dark mode defaults */
  --color-bg: #111111;
  --color-surface: #1c1c1c;
  --color-surface-2: #252525;
  --color-border: #2e2e2e;
  --color-text: #f0f0f0;
  --color-text-dim: #888888;
  --color-hover: #1e1e1e;
  --color-selected: #2a2a2a;
  --color-accent: #c0c0c0;
  --color-focus-border: #555555;
  --color-hover-border: #444444;
  --color-now-playing: #1a2a1a;
  --color-spotify-green: #1db954;
  --color-delete-red: #c0392b;

  /* Breakpoints */
  --breakpoint-sm: 390px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
}

/* === Light mode overrides ===
   NOTE: @theme cannot be nested inside @media in Tailwind v4.
   Instead, override the CSS custom properties directly on :root.
   The @theme block above registers these as Tailwind tokens (so bg-bg, text-text etc. work),
   and the @media block below swaps the underlying values at runtime.
   spotify-green and delete-red are mode-independent — same value in both modes. */
@media (prefers-color-scheme: light) {
  :root {
    --color-bg: #f5f5f5;
    --color-surface: #ffffff;
    --color-surface-2: #ebebeb;
    --color-border: #d0d0d0;
    --color-text: #111111;
    --color-text-dim: #666666;
    --color-hover: #e8e8e8;
    --color-selected: #e0e0e0;
    --color-accent: #606060;
    --color-focus-border: #999999;
    --color-hover-border: #bbbbbb;
    --color-now-playing: #e8f5e8;
  }
}

/* === Base styles (migrated from index.css) === */
@layer base {
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--color-bg);
    color: var(--color-text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -webkit-user-select: none;
    user-select: none;
  }

  input { -webkit-user-select: text; user-select: text; }

  #root {
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  button {
    background: var(--color-surface-2);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 5px 14px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s;
  }

  button:hover { background: var(--color-surface-2); border-color: var(--color-hover-border); }

  input[type="text"],
  input:not([type="checkbox"]) {
    background: var(--color-surface-2);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 5px 10px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }

  input:not([type="checkbox"]):focus { border-color: var(--color-focus-border); }

  h1 { font-size: 1.2rem; font-weight: 600; }
  h2 { font-size: 1rem; font-weight: 600; }
}

/* === Animations (used across components) === */
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-4px); }
  40%       { transform: translateX(4px); }
  60%       { transform: translateX(-3px); }
  80%       { transform: translateX(2px); }
}

@keyframes eq-bounce {
  0%, 100% { transform: scaleY(0.3); }
  50%       { transform: scaleY(1); }
}

@keyframes pulse-opacity {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

@keyframes spin-record {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

- [ ] **Step 5: Update `main.jsx` to import new CSS**

Replace `import './index.css'` with `import './tailwind.css'` in `frontend/src/main.jsx`. Keep `index.css` imported alongside during migration — it will be removed in Task 9.

Keep `import './App.css'` in `App.jsx` for now — old CSS classes still in use. It will be removed in Task 9 after all components are migrated.

- [ ] **Step 6: Run existing tests to verify nothing broke**

```bash
cd frontend && npx vitest run
```

Expected: All existing tests pass. Tailwind CSS is additive at this point — old CSS still loaded.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Install Tailwind CSS v4 and configure theme tokens

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: New Mobile Components

### Task 2: BottomTabBar component

**Files:**
- Create: `frontend/src/components/BottomTabBar.jsx`
- Create: `frontend/src/components/BottomTabBar.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
// BottomTabBar.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BottomTabBar from './BottomTabBar'

describe('BottomTabBar', () => {
  const defaultProps = {
    activeTab: 'home',
    onTabChange: vi.fn(),
  }

  it('renders all four tabs', () => {
    render(<BottomTabBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /library/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collections/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /digest/i })).toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    render(<BottomTabBar {...defaultProps} activeTab="library" />)
    const libraryBtn = screen.getByRole('button', { name: /library/i })
    expect(libraryBtn.className).toContain('text-text')
  })

  it('calls onTabChange when a tab is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<BottomTabBar {...defaultProps} onTabChange={onTabChange} />)
    await user.click(screen.getByRole('button', { name: /collections/i }))
    expect(onTabChange).toHaveBeenCalledWith('collections')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/BottomTabBar.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```jsx
// BottomTabBar.jsx

const TABS = [
  { id: 'home', label: 'Home', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2L2 9h3v7h4v-4h2v4h4V9h3L10 2z" />
    </svg>
  )},
  { id: 'library', label: 'Library', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 3h2v14H4V3zm4 0h2v14H8V3zm4 2h2v12h-2V5zm4-2h2v14h-2V3z" />
    </svg>
  )},
  { id: 'collections', label: 'Collections', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zm-8 8h6v6H3v-6zm8 0h6v6h-6v-6z" />
    </svg>
  )},
  { id: 'digest', label: 'Digest', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 4h12v2H4V4zm0 4h12v2H4V8zm0 4h8v2H4v-2z" />
    </svg>
  )},
]

export default function BottomTabBar({ activeTab, onTabChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[200] flex items-stretch justify-around bg-surface border-t border-border pb-[env(safe-area-inset-bottom,0px)]"
         style={{ height: `calc(50px + env(safe-area-inset-bottom, 0px))` }}
    >
      {TABS.map(tab => (
        <button
          key={tab.id}
          aria-label={tab.label}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 bg-transparent border-none p-0 rounded-none transition-colors duration-150 ${
            activeTab === tab.id ? 'text-text' : 'text-text-dim'
          }`}
        >
          {tab.icon}
          <span className="text-[11px]">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/BottomTabBar.test.jsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomTabBar.jsx src/components/BottomTabBar.test.jsx
git commit -m "Add BottomTabBar component for mobile navigation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: MiniPlaybackBar component

**Files:**
- Create: `frontend/src/components/MiniPlaybackBar.jsx`
- Create: `frontend/src/components/MiniPlaybackBar.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
// MiniPlaybackBar.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MiniPlaybackBar from './MiniPlaybackBar'

describe('MiniPlaybackBar', () => {
  const track = { name: 'Test Track', artists: ['Artist 1'], album: 'Test Album' }

  it('renders nothing when no track is playing', () => {
    const { container } = render(
      <MiniPlaybackBar state={{ is_playing: false, track: null }} onPlayPause={vi.fn()} onExpand={vi.fn()} />
    )
    expect(container.querySelector('[data-testid="mini-playback-bar"]')).toBeNull()
  })

  it('renders track name and artist when playing', () => {
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track }}
        albumImageUrl="https://example.com/art.jpg"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
      />
    )
    expect(screen.getByText('Test Track')).toBeInTheDocument()
    expect(screen.getByText('Artist 1')).toBeInTheDocument()
  })

  it('calls onPlayPause when play/pause button is clicked', async () => {
    const user = userEvent.setup()
    const onPlayPause = vi.fn()
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track }}
        onPlayPause={onPlayPause}
        onExpand={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: /pause/i }))
    expect(onPlayPause).toHaveBeenCalled()
  })

  it('calls onExpand when bar area is clicked', async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track }}
        onPlayPause={vi.fn()}
        onExpand={onExpand}
      />
    )
    await user.click(screen.getByTestId('mini-playback-bar'))
    expect(onExpand).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/MiniPlaybackBar.test.jsx
```

- [ ] **Step 3: Write implementation**

```jsx
// MiniPlaybackBar.jsx

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2h4v12H3V2zm6 0h4v12H9V2z" />
    </svg>
  )
}

export default function MiniPlaybackBar({ state, albumImageUrl, onPlayPause, onExpand }) {
  const { is_playing, track } = state

  if (!track) return null

  return (
    <div
      data-testid="mini-playback-bar"
      className="fixed left-0 right-0 z-[190] flex items-center gap-3 px-3 bg-surface border-t border-border h-14 cursor-pointer"
      style={{ bottom: `calc(50px + env(safe-area-inset-bottom, 0px))` }}
      onClick={onExpand}
    >
      {albumImageUrl ? (
        <img src={albumImageUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded bg-surface-2 flex items-center justify-center flex-shrink-0 text-text-dim">♪</div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-sm font-semibold text-text truncate">{track.name}</span>
        <span className="text-xs text-text-dim truncate">{track.artists.join(', ')}</span>
      </div>

      <button
        aria-label={is_playing ? 'Pause' : 'Play'}
        className="w-9 h-9 flex items-center justify-center bg-transparent border-none text-text p-0 rounded-full"
        onClick={e => { e.stopPropagation(); onPlayPause() }}
      >
        {is_playing ? <PauseIcon /> : <PlayIcon />}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/MiniPlaybackBar.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/MiniPlaybackBar.jsx src/components/MiniPlaybackBar.test.jsx
git commit -m "Add MiniPlaybackBar component for mobile

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: FullScreenNowPlaying component

**Files:**
- Create: `frontend/src/components/FullScreenNowPlaying.jsx`
- Create: `frontend/src/components/FullScreenNowPlaying.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
// FullScreenNowPlaying.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FullScreenNowPlaying from './FullScreenNowPlaying'

describe('FullScreenNowPlaying', () => {
  const track = {
    name: 'Test Track',
    artists: ['Artist 1'],
    album: 'Test Album',
    progress_ms: 60000,
    duration_ms: 180000,
  }

  const defaultProps = {
    state: { is_playing: true, track, device: { name: 'iPhone' } },
    open: true,
    onClose: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onSetVolume: vi.fn(),
    onFetchTracks: vi.fn().mockResolvedValue([]),
    onPlayTrack: vi.fn(),
    albumSpotifyId: 'abc123',
    albumImageUrl: 'https://example.com/art.jpg',
    onFetchDevices: vi.fn().mockResolvedValue([]),
    onTransferPlayback: vi.fn(),
  }

  it('renders album art and track info when open', () => {
    render(<FullScreenNowPlaying {...defaultProps} />)
    expect(screen.getByText('Test Track')).toBeInTheDocument()
    expect(screen.getByText('Artist 1')).toBeInTheDocument()
    expect(screen.getByAltText('Album art')).toBeInTheDocument()
  })

  it('is hidden when not open', () => {
    render(<FullScreenNowPlaying {...defaultProps} open={false} />)
    const pane = screen.getByRole('dialog')
    expect(pane).toHaveAttribute('aria-hidden', 'true')
  })

  it('calls onClose when dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<FullScreenNowPlaying {...defaultProps} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders playback controls', () => {
    render(<FullScreenNowPlaying {...defaultProps} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/FullScreenNowPlaying.test.jsx
```

- [ ] **Step 3: Write implementation**

This component combines the now-playing display, playback controls, volume, device picker, and track list into one full-screen mobile view. It reuses the existing `usePlayback` state and track-fetching props from App.

```jsx
// FullScreenNowPlaying.jsx
import { useState, useEffect, useRef, useCallback } from 'react'

function PreviousIcon() {
  return <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h2v12H3V2zm4 6l7-5v10L7 8z" /></svg>
}
function NextIcon() {
  return <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><path d="M11 2h2v12h-2V2zM2 3l7 5-7 5V3z" /></svg>
}
function PlayIcon() {
  return <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z" /></svg>
}
function PauseIcon() {
  return <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h4v12H3V2zm6 0h4v12H9V2z" /></svg>
}
function ChevronDown() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
}
function VolumeIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 5h3l4-3v12l-4-3H2V5zm10 1a4 4 0 010 4M11 3a7 7 0 010 10" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" /></svg>
}

function formatTime(ms) {
  if (ms == null || ms < 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function useDebouncedCallback(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

export default function FullScreenNowPlaying({
  state,
  open,
  onClose,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSetVolume,
  onFetchTracks,
  onPlayTrack,
  albumSpotifyId,
  albumImageUrl,
  onFetchDevices,
  onTransferPlayback,
}) {
  const { is_playing, track, device } = state
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [volume, setVolume] = useState(50)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [devices, setDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(false)

  const debouncedSetVolume = useDebouncedCallback(
    (v) => { if (onSetVolume) onSetVolume(v) },
    300
  )

  useEffect(() => {
    if (!albumSpotifyId) { setTracks([]); return }
    let cancelled = false
    setTracksLoading(true)
    const promise = onFetchTracks(albumSpotifyId)
    if (!promise || typeof promise.then !== 'function') {
      setTracksLoading(false)
      return () => { cancelled = true }
    }
    promise.then(result => {
      if (!cancelled) { setTracks(result); setTracksLoading(false) }
    })
    return () => { cancelled = true }
  }, [albumSpotifyId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleOpenDevicePicker() {
    setDevicesOpen(true)
    setDevicesLoading(true)
    const list = await onFetchDevices()
    setDevices(list)
    setDevicesLoading(false)
  }

  const currentTrackName = track?.name ?? null

  return (
    <div
      role="dialog"
      aria-label="Now playing"
      aria-hidden={!open ? 'true' : undefined}
      className={`fixed inset-0 z-[300] bg-bg flex flex-col transition-transform duration-300 ease-out ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Dismiss button */}
      <div className="flex justify-center pt-2 pb-1">
        <button
          aria-label="Close now playing"
          onClick={onClose}
          className="bg-transparent border-none text-text-dim p-2"
        >
          <ChevronDown />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center px-6">
        {/* Album art */}
        {albumImageUrl ? (
          <img
            src={albumImageUrl}
            alt="Album art"
            className="w-full max-w-[342px] aspect-square object-cover rounded-lg mt-2"
          />
        ) : (
          <div className="w-full max-w-[342px] aspect-square rounded-lg bg-surface-2 flex items-center justify-center text-text-dim text-4xl mt-2">♪</div>
        )}

        {/* Track info */}
        <div className="w-full max-w-[342px] mt-6 text-center">
          <div className="text-lg font-semibold text-text truncate">{track?.name ?? 'Nothing playing'}</div>
          <div className="text-sm text-text-dim truncate mt-1">{track?.artists?.join(', ') ?? ''}</div>
        </div>

        {/* Progress bar (display-only) */}
        {track && track.duration_ms != null && (
          <div className="w-full max-w-[342px] mt-4">
            <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-text rounded-full transition-[width] duration-300 ease-linear"
                style={{ width: `${Math.min(100, ((track.progress_ms || 0) / track.duration_ms) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-text-dim tabular-nums">{formatTime(track.progress_ms)}</span>
              <span className="text-xs text-text-dim tabular-nums">{formatTime(track.duration_ms)}</span>
            </div>
          </div>
        )}

        {/* Playback controls */}
        <div className="flex items-center gap-6 mt-6">
          <button
            aria-label="Previous track"
            onClick={onPrevious}
            className="w-11 h-11 flex items-center justify-center bg-transparent border-none text-text-dim rounded-full"
          >
            <PreviousIcon />
          </button>
          <button
            aria-label={is_playing ? 'Pause' : 'Play'}
            onClick={is_playing ? onPause : onPlay}
            className="w-14 h-14 flex items-center justify-center bg-text text-bg border-none rounded-full"
          >
            {is_playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            aria-label="Next track"
            onClick={onNext}
            className="w-11 h-11 flex items-center justify-center bg-transparent border-none text-text-dim rounded-full"
          >
            <NextIcon />
          </button>
        </div>

        {/* Volume */}
        <div className="w-full max-w-[342px] mt-6 flex items-center gap-3">
          <VolumeIcon />
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={e => { const v = Number(e.target.value); setVolume(v); debouncedSetVolume(v) }}
            className="flex-1 accent-text"
            aria-label="Volume"
          />
        </div>

        {/* Device selector */}
        {device && onFetchDevices && (
          <div className="mt-3 relative">
            <button
              className="text-xs text-text-dim bg-transparent border-none"
              onClick={handleOpenDevicePicker}
            >
              Playing on {device.name} ▾
            </button>
            {devicesOpen && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface border border-border rounded-lg p-1 min-w-[200px] shadow-lg z-[310]">
                {devicesLoading ? (
                  <div className="p-2 text-sm text-text-dim">...</div>
                ) : devices.length === 0 ? (
                  <div className="p-2 text-sm text-text-dim italic">No other devices</div>
                ) : devices.map(d => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-2 p-2 text-sm cursor-pointer rounded ${d.is_active ? 'text-text-dim cursor-default' : 'text-text'}`}
                    onClick={d.is_active ? undefined : () => { setDevicesOpen(false); onTransferPlayback(d.id) }}
                  >
                    <span className="w-3.5 flex-shrink-0">{d.is_active ? '✓' : ''}</span>
                    <span>{d.name}</span>
                    <span className="text-xs text-text-dim ml-auto">{d.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Track list */}
        {track && (
          <div className="w-full max-w-[342px] mt-6 mb-8 border-t border-border pt-4">
            <div className="text-xs font-bold tracking-wider uppercase text-text-dim mb-2">Tracks</div>
            {tracksLoading ? (
              <div className="text-sm text-text-dim py-2">Loading tracks...</div>
            ) : tracks.map(t => {
              const isActive = t.name === currentTrackName
              return (
                <div
                  key={t.track_number}
                  className={`flex items-center gap-3 py-2 px-2 rounded cursor-pointer transition-colors duration-100 ${
                    isActive ? 'bg-now-playing' : 'hover:bg-surface-2'
                  }`}
                  onClick={() => onPlayTrack?.(`spotify:track:${t.spotify_id}`)}
                >
                  <span className="text-xs text-text-dim w-5 text-right flex-shrink-0">{t.track_number}</span>
                  <span className={`flex-1 text-sm truncate ${isActive ? 'text-text font-semibold' : 'text-text-dim'}`}>{t.name}</span>
                  <span className="text-xs text-text-dim flex-shrink-0">{t.duration}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/FullScreenNowPlaying.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/FullScreenNowPlaying.jsx src/components/FullScreenNowPlaying.test.jsx
git commit -m "Add FullScreenNowPlaying component for mobile

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Integrate Mobile Components into App.jsx

### Task 5: Wire mobile layout into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

This task integrates the three new mobile components and restructures App.jsx to swap between mobile and desktop layouts using the existing `useIsMobile()` hook.

- [ ] **Step 1: Write smoke test for App with mobile layout**

Create `frontend/src/App.test.jsx` (or add to existing). Mock `fetch` and `matchMedia` to verify the app renders without crashing in both mobile and desktop modes, and that the correct components appear.

```jsx
// App.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// Mock fetch to prevent real API calls
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ authenticated: true }),
    ok: true,
  })
})

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

describe('App layout', () => {
  it('renders without crashing on desktop', () => {
    mockMatchMedia(false) // > 768px
    expect(() => render(<App />)).not.toThrow()
  })

  it('renders without crashing on mobile', () => {
    mockMatchMedia(true) // <= 768px
    expect(() => render(<App />)).not.toThrow()
  })
})
```

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: FAIL (App.test.jsx doesn't exist yet or new imports not wired).

- [ ] **Step 2: Modify App.jsx layout**

Key changes to `App.jsx`:
1. Import new components: `BottomTabBar`, `MiniPlaybackBar`, `FullScreenNowPlaying`
2. Add `nowPlayingOpen` state for full-screen now-playing toggle
3. On mobile: render BottomTabBar + MiniPlaybackBar instead of PlaybackBar, use BottomTabBar for navigation instead of header nav, DigestPanel renders full-screen
4. On desktop: keep current layout (header nav + PlaybackBar + side panels)
5. Mobile content area gets bottom padding for mini bar + tab bar instead of just playback bar
6. Map BottomTabBar's `onTabChange` to existing `setView` + related state resets

The `view` state already handles 'home' | 'library' | 'collections' | collection object. The BottomTabBar `onTabChange` maps directly:
- 'home' → `setView('home'); setSearch('')`
- 'library' → `setView('library'); setSearch('')`
- 'collections' → `setView('collections'); setSearch('')`
- 'digest' → toggle `digestOpen` (on mobile this opens full-screen digest view)

Mobile header simplification: remove nav buttons, keep only view title + search (in library view).

**Important:** Keep the old `import './App.css'` for now — existing CSS classes are still used by components not yet migrated (AlbumTable, CollectionsPane, etc). It gets removed in Task 9.

- [ ] **Step 3: Run all existing tests**

```bash
cd frontend && npx vitest run
```

Expected: All pass. The structural change should not break existing component tests since they render in isolation.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Integrate mobile layout: bottom tabs, mini bar, full-screen now-playing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Migrate Existing Components to Tailwind

### Task 6: Migrate PlaybackBar to Tailwind (desktop only)

**Files:**
- Modify: `frontend/src/components/PlaybackBar.jsx`

- [ ] **Step 1: Replace inline `styles` object with Tailwind classes**

The PlaybackBar currently uses a large inline `styles` object. Convert each style to Tailwind utility classes. The component is already desktop-only (mobile uses MiniPlaybackBar).

Key mappings:
- `styles.bar` → `fixed bottom-0 left-0 right-0 min-h-16 bg-surface border-t border-border grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-[env(safe-area-inset-bottom,0px)] z-[200] gap-2`
- `styles.leftZone` → `flex items-center gap-2.5 min-w-0 overflow-hidden`
- `styles.centerZone` → `flex flex-col items-center gap-0.5 flex-shrink-0`
- `styles.rightZone` → `flex items-center gap-2 justify-end min-w-0`
- Each button uses appropriate Tailwind classes instead of style objects

Remove the `const styles = { ... }` object entirely.

Keep the VolumeSlider and ProgressBar sub-components — they can keep minimal inline styles for the slider thumb positioning (dynamic values that depend on JS state). Convert their static styles to Tailwind where possible.

- [ ] **Step 2: Run PlaybackBar tests**

```bash
cd frontend && npx vitest run src/components/PlaybackBar.test.jsx
```

Expected: PASS — tests check behavior (clicks, rendering), not specific styles.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlaybackBar.jsx
git commit -m "Migrate PlaybackBar to Tailwind utilities

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Migrate NowPlayingPane to Tailwind (desktop only)

**Files:**
- Modify: `frontend/src/components/NowPlayingPane.jsx`

- [ ] **Step 1: Replace inline `styles` object with Tailwind classes**

NowPlayingPane is now desktop-only (mobile uses FullScreenNowPlaying). Remove the mobile branch of `paneStyle`.

Key changes:
- Remove `isMobile` check and mobile pane style — this component no longer renders on mobile
- Remove `useIsMobile` import
- Unified panel width: 320px (was 300px)
- Convert `styles` object to Tailwind classes
- Keep the VinylRecord SVG component as-is (inline SVG doesn't benefit from Tailwind)
- The `styles.pane(open)` dynamic transform → use conditional Tailwind classes: `translate-x-0` vs `translate-x-[320px]`

- [ ] **Step 2: Run NowPlayingPane tests**

```bash
cd frontend && npx vitest run src/components/NowPlayingPane.test.jsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NowPlayingPane.jsx
git commit -m "Migrate NowPlayingPane to Tailwind, desktop-only, unified 320px width

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8a: Migrate DigestPanel to Tailwind

**Files:**
- Modify: `frontend/src/components/DigestPanel.jsx`

- [ ] **Step 1: Replace inline styles with Tailwind classes**

Desktop: side panel, 320px width (was 340px). Use same panel pattern as NowPlayingPane.
Mobile: full-screen view (no longer a bottom sheet). When `digestOpen && isMobile`, render as a full-screen overlay similar to FullScreenNowPlaying but showing digest content.

Key Tailwind mappings:
- Desktop pane: `fixed top-0 right-0 w-[320px] bg-surface border-l border-border flex flex-col z-[150]` with `bottom: calc(64px + env(safe-area-inset-bottom, 0px))`
- Transform: `translate-x-0` (open) vs `translate-x-[320px]` (closed), `transition-transform duration-200 ease`
- Mobile full-screen: `fixed inset-0 z-[300] bg-bg flex flex-col transition-transform duration-300 ease-out translate-y-0/translate-y-full`
- Header: `flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border`
- Date range picker: `px-4 py-3 border-b border-border flex gap-2 items-center text-xs text-text-dim`
- Section title: `px-4 py-1 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim`
- Album rows: `flex items-center gap-2.5 px-4 py-1.5 cursor-pointer`

Remove the mobile bottom-sheet style (border-radius 16px, 80vh height). Replace with full-screen pattern.

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run src/components/DigestPanel.test.jsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DigestPanel.jsx
git commit -m "Migrate DigestPanel to Tailwind, full-screen on mobile, 320px on desktop

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8b: Migrate CollectionsPane + CollectionsBubble to Tailwind

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`
- Modify: `frontend/src/components/CollectionsBubble.jsx`

- [ ] **Step 1: Migrate CollectionsPane**

Keep the existing table structure for now — the grid conversion happens in Task 11 (desktop refinements). This task only converts CSS classes → Tailwind utilities.

Key Tailwind mappings:
- `.collections-pane` → `w-full flex flex-col h-full overflow-hidden`
- `.create-row` → `flex gap-2 px-4 py-3 border-b border-border bg-bg flex-shrink-0 sticky top-0 z-10 opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150`
- `.collections-table` → `w-full border-collapse`
- `.collections-table thead th` → `sticky top-0 z-2 bg-bg px-2 py-2.5 text-left text-xs font-semibold tracking-wider uppercase text-text-dim border-b border-border select-none whitespace-nowrap`
- `.collection-name` → `text-text text-base font-semibold`
- `.collection-delete-btn` → `bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150`
- `.collection-confirm-delete` → `bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap`
- `.collection-art-strip` → `flex gap-0.5 overflow-hidden flex-nowrap flex-1 min-w-0`
- `.collection-art-thumb` → `w-7 h-7 rounded-sm object-cover flex-shrink-0 block`

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`

- [ ] **Step 2: Migrate CollectionsBubble**

Minor changes — convert CSS classes to Tailwind equivalents. The dropdown positioning uses JS-calculated `pos` values, keep those as inline styles.

Key Tailwind mappings:
- `.collections-bubble-btn` → `bg-transparent border border-transparent text-text-dim cursor-pointer w-[22px] h-[22px] rounded-full text-xs font-semibold flex items-center justify-center p-0 transition-all duration-100` (mobile: `md:w-[22px] w-8 md:h-[22px] h-8`)
- `.collections-bubble-btn.has-collections` → `bg-surface-2 border-accent text-accent`
- `.collections-bubble-dropdown` → `z-[1000] bg-surface border border-border rounded-lg min-w-[200px] max-w-[240px] shadow-lg overflow-hidden`
- `.collections-bubble-item` → `flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors duration-100 hover:bg-surface-2`
- `.collections-bubble-check` → `w-[18px] h-[18px] rounded-full bg-spotify-green text-white flex items-center justify-center text-xs flex-shrink-0 ml-auto`

Run: `cd frontend && npx vitest run src/components/CollectionsBubble.test.jsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/CollectionsPane.jsx src/components/CollectionsBubble.jsx
git commit -m "Migrate CollectionsPane and CollectionsBubble to Tailwind

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8c: Migrate AlbumTable to Tailwind

**Files:**
- Modify: `frontend/src/components/AlbumTable.jsx`

This is the largest component (~358 lines). It has both desktop table and mobile card list views.

- [ ] **Step 1: Migrate desktop table view**

Key Tailwind mappings:
- `.album-table` → `w-full border-collapse` with `table-layout: fixed` as inline style
- `.album-table thead th` → `sticky top-0 z-2 bg-bg px-2 py-2.5 text-left text-xs font-semibold tracking-wider uppercase text-text-dim border-b border-border cursor-pointer select-none whitespace-nowrap`
- Column widths: keep as inline styles (1st: 36px, 2nd: 52px, 5th: 60px, 6th: 110px, 7th: 120px)
- `.album-table tbody tr` → `border-b border-border transition-colors duration-100`
- Hover: `hover:bg-hover`
- Selected: conditional `bg-selected`
- Now-playing: conditional `bg-now-playing`
- Focus: `focus:outline-none focus:bg-selected focus:shadow-[inset_3px_0_0_var(--color-accent)]`
- `.album-table td` → `px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle`
- Album art: `rounded-sm object-cover block`

- [ ] **Step 2: Migrate mobile card list view**

Key Tailwind mappings:
- `.album-card-list` → `hidden md:hidden flex-col flex-1 overflow-y-auto` (shown on mobile via `isMobile` JS check, not CSS media query — since the component already returns early for mobile, just use `flex flex-col flex-1 overflow-y-auto`)
- `.album-card` → `flex items-center gap-3 px-4 py-2.5 border-b border-border cursor-pointer transition-colors duration-100 min-h-16 active:bg-selected`
- `.album-card.now-playing` → conditional `bg-now-playing`
- `.album-card img` → `w-11 h-11 rounded object-cover flex-shrink-0`
- `.album-card-info` → `flex-1 min-w-0 flex flex-col gap-0.5`
- `.album-card-name` → `text-sm font-semibold text-text truncate`
- `.album-card-artist` → `text-xs text-text-dim truncate`
- `.album-card-expand-btn` → `bg-transparent border-none text-text-dim cursor-pointer p-2 text-lg flex-shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded`
- `.album-card-track-row` → `flex items-center gap-2.5 px-4 py-2.5 pl-[72px] min-h-11 cursor-pointer border-t border-border`
- Expand chevron: use inline `transform: rotate(90deg)` with `transition-transform duration-150` or keep the existing `expand-chevron` pattern as a small utility class in `tailwind.css`

- [ ] **Step 3: Migrate equalizer indicator styles**

The eq-bounce animation and now-playing-indicator styles are used by AlbumTable. Keep these as utility classes in `tailwind.css` since they involve keyframe animations:

Add to `tailwind.css` (already has the `eq-bounce` keyframe from Task 1):
```css
@layer utilities {
  .eq-bar {
    display: inline-block;
    width: 2px;
    background: var(--color-accent);
    border-radius: 1px;
    height: 100%;
    transform-origin: bottom;
    animation: eq-bounce 0.9s ease-in-out infinite;
  }
  .expand-chevron {
    display: inline-block;
    transition: transform 0.18s ease;
  }
  .expand-chevron.expanded {
    transform: rotate(90deg);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/components/AlbumTable.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/AlbumTable.jsx src/tailwind.css
git commit -m "Migrate AlbumTable to Tailwind (desktop table + mobile cards)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8d: Migrate HomePage, AlbumRow, and App loading/error screens to Tailwind

**Files:**
- Modify: `frontend/src/components/HomePage.jsx`
- Modify: `frontend/src/components/AlbumRow.jsx`
- Modify: `frontend/src/App.jsx` (loading/error screens)

- [ ] **Step 1: Migrate HomePage**

Key Tailwind mappings:
- `.home-page` → `p-4 md:px-6 md:py-4`
- `.home-empty` → `flex items-center justify-center min-h-[40vh] text-text-dim text-base`
- `.home-loading` → `p-6 text-text-dim`

- [ ] **Step 2: Migrate AlbumRow**

Key Tailwind mappings:
- `.album-row-section` → `mb-6`
- `.album-row-title` → `text-lg font-semibold mb-3 text-text`
- `.album-row-scroll` → `flex gap-4 md:gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2` with `scroll-snap-type: x proximity` and `-webkit-overflow-scrolling: touch` as inline styles
- `.album-row-card` → `flex-shrink-0 w-[100px] md:w-[120px] cursor-pointer` with `scroll-snap-align: start`
- `.album-row-card-art` → `w-[100px] h-[100px] md:w-[120px] md:h-[120px] rounded object-cover block`
- `.album-row-card-name` → `text-sm mt-1.5 text-text truncate`
- `.album-row-card-artist` → `text-xs text-text-dim truncate`

- [ ] **Step 3: Migrate App.jsx loading/error screens**

Loading screen:
```jsx
<div className="flex flex-col items-center justify-center h-dvh gap-4">
  <div className="w-9 h-9 border-3 border-border border-t-accent rounded-full animate-spin" />
  {loadingMessage && <p className="text-sm text-text-dim">{loadingMessage}</p>}
</div>
```

Error screen:
```jsx
<div className="p-8">
  <p className="text-[#f88]">Error: {error}</p>
  <button onClick={loadData} disabled={loading} className="mt-4 px-5 py-2 bg-surface-2 text-text border border-border rounded-lg text-base disabled:text-text-dim disabled:cursor-default">
    {loading ? 'Loading…' : 'Retry'}
  </button>
</div>
```

- [ ] **Step 4: Run all tests**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/components/HomePage.jsx src/components/AlbumRow.jsx src/App.jsx
git commit -m "Migrate HomePage, AlbumRow, and App loading/error screens to Tailwind

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: Cleanup + Desktop Refinements + Polish

### Task 9: Delete old CSS files and legacy components

**Files:**
- Delete: `frontend/src/App.css`
- Delete: `frontend/src/index.css`
- Delete: `frontend/src/components/RowMenu.jsx`
- Delete: `frontend/src/components/RowMenu.test.jsx`
- Modify: `frontend/src/App.jsx` — remove `import './App.css'`
- Modify: `frontend/src/main.jsx` — verify `import './index.css'` is already removed (done in Task 1)

- [ ] **Step 1: Verify RowMenu is unreferenced**

```bash
grep -r "RowMenu" frontend/src/ --include="*.jsx" --include="*.js"
```

Expected: only hits in `RowMenu.jsx` and `RowMenu.test.jsx` themselves. If any other file imports it, remove that import first.

- [ ] **Step 2: Remove CSS imports and delete files**

Remove `import './App.css'` from `App.jsx`.
Delete `App.css`, `index.css`, `RowMenu.jsx`, `RowMenu.test.jsx`.

- [ ] **Step 3: Run all tests**

```bash
cd frontend && npx vitest run
```

Expected: All pass. If any test references RowMenu, it should fail — fix by removing that test.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/main.jsx
git rm src/App.css src/index.css src/components/RowMenu.jsx src/components/RowMenu.test.jsx
git commit -m "Delete legacy CSS files and unused RowMenu component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Desktop header refinement

**Files:**
- Modify: `frontend/src/App.jsx` (header section)

- [ ] **Step 1: Restyle desktop header**

Desktop header layout: `[app-title + version] [nav-tabs-center] [search + digest-toggle-right]`

Nav tabs: horizontal row with text labels, active tab gets bottom border indicator (2px accent). Digest remains a separate toggle button (clipboard emoji), not a nav tab.

```
h-14 bg-surface border-b border-border flex items-center px-5 gap-6
```

Nav tabs use flex with gap, each tab is a button with `text-sm` and conditional `border-b-2 border-accent text-text` for active state.

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Refine desktop header with tab-style navigation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Desktop collections grid

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`

- [ ] **Step 1: Convert collections to card grid on desktop**

Replace table layout with grid: `grid grid-cols-2 lg:grid-cols-3 gap-4 p-4`.

Each card: `bg-surface rounded-lg p-4 cursor-pointer hover:bg-hover transition-colors duration-150`
- Collection name: `text-base font-semibold`
- Album count: `text-sm text-text-dim`
- Art strip: flex row of 24px thumbnails

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx vitest run src/components/CollectionsPane.test.jsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CollectionsPane.jsx
git commit -m "Convert desktop collections to card grid layout

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Polish pass — animations, transitions, safe areas

**Files:**
- Various component files as needed

- [ ] **Step 1: Verify consistent transitions**

All interactive elements should use `transition-colors duration-150` or `transition-all duration-150`.
Panel slide animations: `duration-200 ease` for desktop panels, `duration-300 ease-out` for full-screen mobile.

- [ ] **Step 2: Verify safe area insets**

- Mobile: content area must have bottom padding accounting for mini bar (56px) + tab bar (50px) + safe area
- Full-screen now-playing: top padding for safe-area-inset-top
- Desktop playback bar: bottom padding for safe-area-inset-bottom

- [ ] **Step 3: Verify consistent spacing**

Check all padding/margin values use Tailwind's scale (multiples of 4px).
No more hardcoded pixel values outside of specific fixed-size elements (album art, icons).

- [ ] **Step 4: Verify consistent typography**

All text should use one of: `text-xs`, `text-sm`, `text-base`, `text-lg`.
No more scattered 11px, 12px, 13px, 14px, 15px values.

- [ ] **Step 5: Run all tests**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 6: Build production bundle to verify no errors**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Polish pass: consistent transitions, spacing, typography, safe areas

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 13: Update Playwright E2E tests

**Files:**
- Modify: `frontend/e2e/` (existing E2E test files)

- [ ] **Step 1: Update selectors**

Audit E2E tests for any selectors that reference deleted CSS classes or changed DOM structure. Update to use `data-testid` attributes or role-based selectors.

- [ ] **Step 2: Add mobile viewport E2E test**

Add at least one E2E test that runs at iPhone 13 Pro viewport (390x844) to verify:
- Bottom tab bar renders
- Mini playback bar shows when track is playing
- Tab navigation works

- [ ] **Step 3: Run E2E tests**

```bash
cd frontend && npm run test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Update E2E tests for new UI structure

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Task | Description | New files | Modified files |
|------|-------------|-----------|----------------|
| 1 | Install Tailwind + theme | tailwind.css (tailwind entry) | vite.config.js, package.json, main.jsx |
| 2 | BottomTabBar | BottomTabBar.jsx + test | — |
| 3 | MiniPlaybackBar | MiniPlaybackBar.jsx + test | — |
| 4 | FullScreenNowPlaying | FullScreenNowPlaying.jsx + test | — |
| 5 | Wire mobile layout | — | App.jsx |
| 6 | Migrate PlaybackBar | — | PlaybackBar.jsx |
| 7 | Migrate NowPlayingPane | — | NowPlayingPane.jsx |
| 8a | Migrate DigestPanel | — | DigestPanel.jsx |
| 8b | Migrate CollectionsPane + CollectionsBubble | — | CollectionsPane.jsx, CollectionsBubble.jsx |
| 8c | Migrate AlbumTable | — | AlbumTable.jsx, tailwind.css |
| 8d | Migrate HomePage + AlbumRow + App screens | — | HomePage.jsx, AlbumRow.jsx, App.jsx |
| 9 | Delete old CSS + RowMenu | — | Delete 4 files, modify App.jsx |
| 10 | Desktop header | — | App.jsx |
| 11 | Desktop collections grid (builds on 8b's Tailwind migration) | — | CollectionsPane.jsx |
| 12 | Polish pass | — | Various |
| 13 | E2E test updates | — | e2e/ files |

**Dependency chain:** Tasks 1→2,3,4 (parallel) →5→6,7 (parallel) →8a,8b,8c,8d (parallel) →9→10,11 (parallel) →12→13
