# Lazy Rendering App-Wide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a reusable `useLazyRender` hook and apply lazy rendering to all scroll-heavy lists (AlbumTable, ArtistsView, DigestView), then refactor HomePage to use the same hook.

**Architecture:** A custom hook (`useLazyRender`) encapsulates IntersectionObserver + sentinel + batch state. Each scroll-heavy component calls the hook, slices its list to `visible`, and renders a sentinel div when `hasMore` is true. Reorderable modes (DnD) skip lazy rendering since those lists are small.

**Tech Stack:** React hooks, IntersectionObserver API, Vitest + Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/hooks/useLazyRender.js` | Create | Reusable lazy render hook |
| `frontend/src/hooks/useLazyRender.test.js` | Create | Hook unit tests |
| `frontend/src/components/AlbumTable.jsx` | Modify | Apply hook to mobile cards + desktop rows |
| `frontend/src/components/AlbumTable.test.jsx` | Modify | Add lazy rendering tests |
| `frontend/src/components/ArtistsView.jsx` | Modify | Apply hook to artist list |
| `frontend/src/components/ArtistsView.test.jsx` | Modify | Add lazy rendering tests |
| `frontend/src/components/DigestView.jsx` | Modify | Apply hook to ChangesSection + HistorySection |
| `frontend/src/components/DigestView.test.jsx` | Modify | Add lazy rendering tests |
| `frontend/src/components/HomePage.jsx` | Modify | Refactor to use shared hook |
| `frontend/src/components/HomePage.test.jsx` | Modify | Update tests for hook-based implementation |

---

### Task 1: Create `useLazyRender` hook with tests

**Files:**
- Create: `frontend/src/hooks/useLazyRender.js`
- Create: `frontend/src/hooks/useLazyRender.test.js`

- [ ] **Step 1: Write failing tests for the hook**

Create `frontend/src/hooks/useLazyRender.test.js`:

```jsx
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLazyRender } from './useLazyRender'

let intersectionCallback = null
const mockObserverInstance = {
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}

beforeEach(() => {
  vi.restoreAllMocks()
  intersectionCallback = null
  mockObserverInstance.observe.mockClear()
  mockObserverInstance.disconnect.mockClear()
  global.IntersectionObserver = vi.fn(function (callback) {
    intersectionCallback = callback
    return mockObserverInstance
  })
})

describe('useLazyRender', () => {
  it('returns first batchSize items as visible', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 30))
    expect(result.current.visible).toHaveLength(30)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.sentinelRef).toBeDefined()
  })

  it('returns all items when list is smaller than batchSize', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 30))
    expect(result.current.visible).toHaveLength(10)
    expect(result.current.hasMore).toBe(false)
  })

  it('loads next batch when intersection fires', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 20))
    expect(result.current.visible).toHaveLength(20)

    act(() => {
      intersectionCallback([{ isIntersecting: true }])
    })

    expect(result.current.visible).toHaveLength(40)
    expect(result.current.hasMore).toBe(true)
  })

  it('does not exceed items length', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 20))

    act(() => {
      intersectionCallback([{ isIntersecting: true }])
    })

    expect(result.current.visible).toHaveLength(25)
    expect(result.current.hasMore).toBe(false)
  })

  it('resets visibleCount when items identity changes', () => {
    const items1 = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result, rerender } = renderHook(
      ({ items }) => useLazyRender(items, 20),
      { initialProps: { items: items1 } }
    )

    act(() => {
      intersectionCallback([{ isIntersecting: true }])
    })
    expect(result.current.visible).toHaveLength(40)

    const items2 = Array.from({ length: 50 }, (_, i) => ({ id: i + 100 }))
    rerender({ items: items2 })

    expect(result.current.visible).toHaveLength(20)
  })

  it('ignores intersection when not isIntersecting', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 20))

    act(() => {
      intersectionCallback([{ isIntersecting: false }])
    })

    expect(result.current.visible).toHaveLength(20)
  })

  it('returns empty visible for empty items', () => {
    const { result } = renderHook(() => useLazyRender([], 30))
    expect(result.current.visible).toHaveLength(0)
    expect(result.current.hasMore).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx --prefix frontend vitest --run src/hooks/useLazyRender.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useLazyRender.js`:

```js
import { useState, useEffect, useRef, useCallback } from 'react'

export function useLazyRender(items, batchSize = 30) {
  const [visibleCount, setVisibleCount] = useState(batchSize)
  const sentinelRef = useRef(null)

  useEffect(() => {
    setVisibleCount(batchSize)
  }, [items, batchSize])

  const handleIntersect = useCallback((entries) => {
    if (entries[0].isIntersecting) {
      setVisibleCount(prev => Math.min(prev + batchSize, items.length))
    }
  }, [items.length, batchSize])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(handleIntersect, { threshold: 0 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleIntersect])

  const visible = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  return { visible, hasMore, sentinelRef }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx --prefix frontend vitest --run src/hooks/useLazyRender.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git -C <repo-root> add frontend/src/hooks/useLazyRender.js frontend/src/hooks/useLazyRender.test.js
git -C <repo-root> commit -m "Add useLazyRender hook with tests [134]

- IntersectionObserver + sentinel pattern extracted from HomePage
- Batch size configurable, defaults to 30
- Resets visible count when items identity changes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Apply lazy rendering to AlbumTable

**Files:**
- Modify: `frontend/src/components/AlbumTable.jsx`
- Modify: `frontend/src/components/AlbumTable.test.jsx`

- [ ] **Step 1: Write failing tests for AlbumTable lazy rendering**

Add to `frontend/src/components/AlbumTable.test.jsx`, at the end of the `describe('AlbumTable mobile card list')` block (before its closing `}`):

```jsx
  it('renders only first 30 mobile cards initially when list exceeds batch size', () => {
    const manyAlbums = Array.from({ length: 45 }, (_, i) => ({
      service_id: `alb${i}`,
      name: `Album ${i}`,
      artists: ['Artist'],
      image_url: `https://img/${i}.jpg`,
      release_date: '2024-01-01',
      added_at: '2024-01-01T00:00:00Z',
    }))
    render(<AlbumTable albums={manyAlbums} loading={false} />)
    const cards = document.querySelectorAll('.album-card')
    expect(cards).toHaveLength(30)
    expect(document.querySelector('[data-testid="load-more-sentinel"]')).toBeInTheDocument()
  })

  it('renders all mobile cards when list is 30 or fewer', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} />)
    expect(document.querySelector('[data-testid="load-more-sentinel"]')).not.toBeInTheDocument()
  })

  it('does not apply lazy rendering in reorderable mode on mobile', () => {
    const manyAlbums = Array.from({ length: 45 }, (_, i) => ({
      service_id: `alb${i}`,
      name: `Album ${i}`,
      artists: ['Artist'],
      image_url: `https://img/${i}.jpg`,
      release_date: '2024-01-01',
      added_at: '2024-01-01T00:00:00Z',
    }))
    render(<AlbumTable albums={manyAlbums} loading={false} reorderable onReorder={() => {}} />)
    const cards = document.querySelectorAll('.album-card')
    expect(cards).toHaveLength(45)
  })
```

Add a new `describe` block at the end of the file for desktop lazy rendering:

```jsx
describe('AlbumTable — lazy rendering (desktop)', () => {
  let intersectionCallback = null
  const mockObserverInstance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  }

  beforeEach(() => {
    useIsMobile.mockReturnValue(false)
    intersectionCallback = null
    global.IntersectionObserver = vi.fn(function (callback) {
      intersectionCallback = callback
      return mockObserverInstance
    })
  })

  afterEach(() => useIsMobile.mockReturnValue(false))

  it('renders only first 30 desktop rows initially when list exceeds batch size', () => {
    const manyAlbums = Array.from({ length: 45 }, (_, i) => ({
      service_id: `alb${i}`,
      name: `Album ${i}`,
      artists: ['Artist'],
      image_url: `https://img/${i}.jpg`,
      release_date: '2024-01-01',
      added_at: '2024-01-01T00:00:00Z',
    }))
    render(<AlbumTable albums={manyAlbums} loading={false} />)
    const albumRows = screen.getAllByRole('row').filter(r => r.classList.contains('album-row'))
    expect(albumRows).toHaveLength(30)
  })

  it('does not apply lazy rendering in reorderable mode on desktop', () => {
    const manyAlbums = Array.from({ length: 45 }, (_, i) => ({
      service_id: `alb${i}`,
      name: `Album ${i}`,
      artists: ['Artist'],
      image_url: `https://img/${i}.jpg`,
      release_date: '2024-01-01',
      added_at: '2024-01-01T00:00:00Z',
    }))
    render(<AlbumTable albums={manyAlbums} loading={false} reorderable onReorder={() => {}} />)
    const albumRows = screen.getAllByRole('row').filter(r => r.classList.contains('album-row'))
    expect(albumRows).toHaveLength(45)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx --prefix frontend vitest --run src/components/AlbumTable.test.jsx`
Expected: New lazy rendering tests FAIL (all 45 items rendered), existing tests still PASS

- [ ] **Step 3: Implement lazy rendering in AlbumTable**

Modify `frontend/src/components/AlbumTable.jsx`:

1. Add import at top:
```js
import { useLazyRender } from '../hooks/useLazyRender'
```

2. Inside the `AlbumTable` component, after the `sorted` and `sortableIds` useMemo calls (~line 330), add:
```js
const { visible: lazyVisible, hasMore: lazyHasMore, sentinelRef: lazySentinelRef } = useLazyRender(sorted)
const displayItems = reorderable ? sorted : lazyVisible
```

3. Replace `sorted.map(album => renderMobileCard(album))` (line 405) with:
```js
displayItems.map(album => renderMobileCard(album))
```

4. After the mobile card map, before the closing `</div>` of `cardList`, add the sentinel:
```jsx
{!reorderable && lazyHasMore && <div ref={lazySentinelRef} data-testid="load-more-sentinel" className="h-1" />}
```

5. Replace `sorted.map(album => renderDesktopRow(album))` (line 445) with:
```js
{displayItems.map(album => renderDesktopRow(album))}
{!reorderable && lazyHasMore && (
  <tr><td ref={lazySentinelRef} data-testid="load-more-sentinel" colSpan={reorderable ? 9 : 8} className="h-1" /></tr>
)}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx --prefix frontend vitest --run src/components/AlbumTable.test.jsx`
Expected: All tests PASS (both new and existing)

- [ ] **Step 5: Commit**

```bash
git -C <repo-root> add frontend/src/components/AlbumTable.jsx frontend/src/components/AlbumTable.test.jsx
git -C <repo-root> commit -m "Apply lazy rendering to AlbumTable mobile and desktop [134]

- Uses useLazyRender hook for both mobile cards and desktop rows
- Skips lazy rendering in reorderable mode (DnD needs all items)
- Sentinel element triggers next batch on scroll

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Apply lazy rendering to ArtistsView

**Files:**
- Modify: `frontend/src/components/ArtistsView.jsx`
- Modify: `frontend/src/components/ArtistsView.test.jsx`

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/components/ArtistsView.test.jsx`, new `describe` block at end:

```jsx
describe('ArtistsView — lazy rendering', () => {
  let intersectionCallback = null
  const mockObserverInstance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  }

  beforeEach(() => {
    intersectionCallback = null
    global.IntersectionObserver = vi.fn(function (callback) {
      intersectionCallback = callback
      return mockObserverInstance
    })
  })

  it('renders only first 30 artist rows when list exceeds batch size', () => {
    const manyAlbums = Array.from({ length: 35 }, (_, i) => ({
      service_id: `a${i}`,
      name: `Album ${i}`,
      artists: [{ name: `Artist ${i}`, id: `ar${i}` }],
      image_url: `/img${i}.jpg`,
      release_date: '2024',
      added_at: '2024-01-01',
      total_tracks: 10,
    }))
    render(<ArtistsView {...defaultProps} albums={manyAlbums} />)
    const rows = screen.getAllByTestId(/^artist-row-/)
    expect(rows).toHaveLength(30)
    expect(document.querySelector('[data-testid="load-more-sentinel"]')).toBeInTheDocument()
  })

  it('renders all artist rows when list is 30 or fewer', () => {
    render(<ArtistsView {...defaultProps} />)
    expect(document.querySelector('[data-testid="load-more-sentinel"]')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `npx --prefix frontend vitest --run src/components/ArtistsView.test.jsx`
Expected: New lazy rendering tests FAIL

- [ ] **Step 3: Implement lazy rendering in ArtistsView**

Modify `frontend/src/components/ArtistsView.jsx`:

1. Add import:
```js
import { useLazyRender } from '../hooks/useLazyRender'
```

2. Inside the component, after `filteredGroups` useMemo (line 96), add:
```js
const { visible: lazyGroups, hasMore, sentinelRef } = useLazyRender(filteredGroups)
```

3. In the artist list JSX (line 143), replace `filteredGroups.map(group => (` with `lazyGroups.map(group => (`.

4. After the `.map()` closing, before the closing `</div>` (line 180), add:
```jsx
{hasMore && <div ref={sentinelRef} data-testid="load-more-sentinel" className="h-1" />}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx --prefix frontend vitest --run src/components/ArtistsView.test.jsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git -C <repo-root> add frontend/src/components/ArtistsView.jsx frontend/src/components/ArtistsView.test.jsx
git -C <repo-root> commit -m "Apply lazy rendering to ArtistsView artist list [134]

- Artist rows render in batches of 30 using useLazyRender hook
- Artist detail view (AlbumTable) gets lazy rendering from Task 2

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Apply lazy rendering to DigestView (ChangesSection + HistorySection)

**Files:**
- Modify: `frontend/src/components/DigestView.jsx`
- Modify: `frontend/src/components/DigestView.test.jsx`

The Digest sections group items by day. The approach: flatten all items into a single array with day markers, apply lazy rendering to the flat list, then render day headers when the day changes.

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/components/DigestView.test.jsx`, new `describe` block at end:

```jsx
describe('DigestView — lazy rendering', () => {
  let intersectionCallback = null
  const mockObserverInstance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    useIsMobile.mockReturnValue(false)
    intersectionCallback = null
    global.IntersectionObserver = vi.fn(function (callback) {
      intersectionCallback = callback
      return mockObserverInstance
    })
  })

  afterEach(() => {
    delete global.fetch
  })

  it('renders only first 30 change events when list exceeds batch size', async () => {
    const manyEvents = Array.from({ length: 35 }, (_, i) => ({
      type: 'added',
      album: { service_id: `ce${i}`, name: `Change Album ${i}`, artists: ['Artist'], image_url: `https://img/ce${i}.jpg` },
      changed_at: `2026-04-29T${String(i).padStart(2, '0')}:00:00Z`,
    }))
    const largeChangelog = { days: [{ date: '2026-04-29', events: manyEvents }] }
    global.fetch = vi.fn((url) => {
      if (url.includes('/digest/changelog')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(largeChangelog) })
      }
      if (url.includes('/digest/history')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(historyData) })
      }
      if (url.includes('/digest/stats')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(statsData) })
      }
      return Promise.resolve({ ok: false })
    })

    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Change Album 0')).toBeInTheDocument()
    })
    expect(screen.getByText('Change Album 29')).toBeInTheDocument()
    expect(screen.queryByText('Change Album 30')).not.toBeInTheDocument()
  })

  it('renders only first 30 history plays when list exceeds batch size', async () => {
    const manyPlays = Array.from({ length: 35 }, (_, i) => ({
      album: { service_id: `hp${i}`, name: `History Album ${i}`, artists: ['Artist'], image_url: `https://img/hp${i}.jpg` },
      played_at: `2026-04-16T${String(i).padStart(2, '0')}:00:00Z`,
    }))
    const largeHistory = { days: [{ date: '2026-04-16', plays: manyPlays }], has_more: false, next_cursor: null }
    global.fetch = vi.fn((url) => {
      if (url.includes('/digest/changelog')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(changelogData) })
      }
      if (url.includes('/digest/history')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(largeHistory) })
      }
      if (url.includes('/digest/stats')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(statsData) })
      }
      return Promise.resolve({ ok: false })
    })

    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('History Album 0')).toBeInTheDocument()
    })
    expect(screen.getByText('History Album 29')).toBeInTheDocument()
    expect(screen.queryByText('History Album 30')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `npx --prefix frontend vitest --run src/components/DigestView.test.jsx`
Expected: New lazy rendering tests FAIL (all 35 items rendered)

- [ ] **Step 3: Implement lazy rendering in DigestView**

Modify `frontend/src/components/DigestView.jsx`:

1. Add import at top:
```js
import { useLazyRender } from '../hooks/useLazyRender'
```

2. In `ChangesSection`, flatten all events and apply lazy rendering. Replace the rendering logic after the loading/error/empty guards:

```jsx
// Flatten all events across days for lazy rendering
const allEvents = useMemo(() => {
  const flat = []
  for (const day of days) {
    for (const event of day.events) {
      flat.push({ ...event, _date: day.date })
    }
  }
  return flat
}, [days])

const { visible, hasMore, sentinelRef } = useLazyRender(allEvents)

// Group visible events back by day for rendering
let lastDate = null

return (
  <div>
    {visible.map((event, i) => {
      const showDate = event._date !== lastDate
      lastDate = event._date
      const badge = badgeMap[event.type] || badgeMap.added
      const dimStyle = event.type === 'removed' ? { opacity: 0.5 } : {}
      return (
        <div key={`${event.album.service_id}-${i}`}>
          {showDate && (
            <div className="px-4 py-1 text-xs font-bold tracking-wider text-text-dim">{event._date}</div>
          )}
          <div onClick={() => onPlay(event.album.service_id)}
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2"
            style={dimStyle}>
            <span className={`${badge.color} text-xs font-bold flex-shrink-0`}>{badge.symbol}</span>
            {event.album.image_url && <img src={event.album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text truncate">{event.album.name ?? 'Unknown album'}</div>
              <div className="text-xs text-text-dim truncate">{event.album.artists?.join(', ') ?? 'Unknown artist'}</div>
            </div>
            <span className="text-xs text-text-dim flex-shrink-0">{formatTime(event.changed_at)}</span>
          </div>
        </div>
      )
    })}
    {hasMore && <div ref={sentinelRef} data-testid="load-more-sentinel" className="h-1" />}
  </div>
)
```

Note: `useMemo` must be added to the import in `ChangesSection`. Since `ChangesSection` is a function component inside the file, add `useMemo` to the existing React import at the top of the file (line 1): change `import { useEffect, useState } from 'react'` to `import { useEffect, useState, useMemo } from 'react'`.

3. Apply the same pattern to `HistorySection`. Flatten `days[].plays[]`, apply `useLazyRender`, group back by day:

```jsx
const allPlays = useMemo(() => {
  const flat = []
  for (const day of days) {
    for (const play of day.plays) {
      flat.push({ ...play, _date: day.date })
    }
  }
  return flat
}, [days])

const { visible: visiblePlays, hasMore: hasMorePlays, sentinelRef: playsSentinelRef } = useLazyRender(allPlays)

let lastPlayDate = null

return (
  <div>
    {visiblePlays.map((play, i) => {
      const showDate = play._date !== lastPlayDate
      lastPlayDate = play._date
      return (
        <div key={`${play.album.service_id}-${i}`}>
          {showDate && (
            <div className="px-4 py-1 text-xs font-bold tracking-wider text-text-dim">{play._date}</div>
          )}
          <div onClick={() => onPlay(play.album.service_id)}
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2">
            {play.album.image_url && <img src={play.album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text truncate">{play.album.name ?? 'Unknown album'}</div>
              <div className="text-xs text-text-dim truncate">{play.album.artists?.join(', ') ?? 'Unknown artist'}</div>
            </div>
            <span className="text-xs text-text-dim flex-shrink-0">{formatTime(play.played_at)}</span>
          </div>
        </div>
      )
    })}
    {hasMorePlays && <div ref={playsSentinelRef} data-testid="load-more-sentinel" className="h-1" />}
    {!hasMorePlays && hasMore && (
      <button onClick={handleLoadMore} disabled={loadingMore}
        className="w-full py-3 text-xs text-text-dim hover:text-text transition-colors duration-150 disabled:opacity-50">
        {loadingMore ? 'Loading...' : 'Load more'}
      </button>
    )}
  </div>
)
```

Note: The "Load more" button (server-side pagination) now only shows after all lazy-rendered items are visible.

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx --prefix frontend vitest --run src/components/DigestView.test.jsx`
Expected: All tests PASS (both new and existing)

- [ ] **Step 5: Commit**

```bash
git -C <repo-root> add frontend/src/components/DigestView.jsx frontend/src/components/DigestView.test.jsx
git -C <repo-root> commit -m "Apply lazy rendering to DigestView changes and history [134]

- Flatten day-grouped items for lazy rendering, re-group by day header
- History 'Load more' button only shows after all lazy items visible
- Stats section skipped (small fixed lists)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Refactor HomePage to use `useLazyRender` hook

**Files:**
- Modify: `frontend/src/components/HomePage.jsx`
- Modify: `frontend/src/components/HomePage.test.jsx`

- [ ] **Step 1: Verify existing HomePage tests pass before refactor**

Run: `npx --prefix frontend vitest --run src/components/HomePage.test.jsx`
Expected: All existing tests PASS

- [ ] **Step 2: Refactor HomePage AlbumList to use the hook**

Modify `frontend/src/components/HomePage.jsx`:

1. Replace the import line (line 1):
```js
import { useState, useEffect } from 'react'
```
with:
```js
import { useEffect, useState } from 'react'
```

2. Add import for the hook:
```js
import { useLazyRender } from '../hooks/useLazyRender'
```

3. Remove `BATCH_SIZE` constant (line 6).

4. Replace the entire `AlbumList` component (lines 8-56) with:

```jsx
function AlbumList({ albums, onPlay }) {
  const { visible, hasMore, sentinelRef } = useLazyRender(albums)

  if (!albums || albums.length === 0) {
    return <div className="px-4 py-6 text-text-dim text-sm italic">Nothing yet</div>
  }

  return (
    <div className="grid grid-cols-3 gap-1 pt-0 px-2 pb-2">
      {visible.map(album => (
        <div
          key={album.service_id}
          data-testid={`album-item-${album.service_id}`}
          onClick={() => onPlay(album.service_id)}
          className="cursor-pointer will-change-transform hover:scale-105 hover:brightness-110 active:scale-95 active:opacity-80 transition-all duration-200 ease-out"
        >
          {album.image_url ? (
            <img src={album.image_url} alt={album.name} className="w-full aspect-square rounded-md object-cover block" />
          ) : (
            <div className="w-full aspect-square rounded-md bg-surface-2" />
          )}
        </div>
      ))}
      {hasMore && <div ref={sentinelRef} data-testid="load-more-sentinel" className="h-1" />}
    </div>
  )
}
```

- [ ] **Step 3: Run tests to verify all pass**

Run: `npx --prefix frontend vitest --run src/components/HomePage.test.jsx`
Expected: All tests PASS — behavior unchanged, just using the shared hook now

- [ ] **Step 4: Commit**

```bash
git -C <repo-root> add frontend/src/components/HomePage.jsx
git -C <repo-root> commit -m "Refactor HomePage to use useLazyRender hook [134]

- Replace inline IntersectionObserver logic with shared hook
- No behavior change, just DRY

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all frontend tests**

Run: `npx --prefix frontend vitest --run`
Expected: All tests PASS

- [ ] **Step 2: Run linting**

Run: `npx --prefix frontend eslint src/ --ext .jsx,.js 2>/dev/null || echo "No eslint config"`
Expected: No new errors

- [ ] **Step 3: If all pass, no commit needed — verification complete**
