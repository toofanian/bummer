# Home Page Lazy Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase home page scroll rows from 30 to 60 items with lazy rendering so the initial paint stays fast.

**Architecture:** Backend bumps all section caps from 30 to 60 and returns everything in a single API call (same shape). Frontend renders the first 30 items per section, then appends the rest when the user scrolls near the bottom using IntersectionObserver on a sentinel element.

**Tech Stack:** Python/FastAPI (backend), React/Vitest (frontend), IntersectionObserver API (no new deps)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/routers/home.py` | Bump all 30 caps to 60, increase play_history fetch limit |
| Modify | `backend/tests/test_home.py` | Update cap assertion from 30 to 60, add 60-cap test |
| Modify | `frontend/src/components/HomePage.jsx` | Add lazy rendering via IntersectionObserver to AlbumList |
| Modify | `frontend/src/components/HomePage.test.jsx` | Add tests for batch rendering and scroll-to-load |

---

### Task 1: Backend — Update cap from 30 to 60

**Files:**
- Modify: `backend/tests/test_home.py:158-189` (cap test)
- Modify: `backend/routers/home.py:58-112` (all section caps)

- [ ] **Step 1: Update the failing test to assert 60-item cap**

In `backend/tests/test_home.py`, update `test_home_recently_played_capped_at_30`:

```python
@patch("routers.home.get_album_cache")
def test_home_recently_played_capped_at_60(mock_cache):
    """When more than 60 unique albums are played, only the 60 most recent are returned."""
    albums = [
        {
            "service_id": f"album{i}",
            "name": f"Album {i}",
            "artists": ["Artist X"],
            "image_url": f"https://img/{i}.jpg",
            "release_date": "2020-01-01",
            "added_at": "2024-01-01T00:00:00Z",
        }
        for i in range(1, 66)
    ]
    mock_cache.return_value = albums

    now = datetime.now(timezone.utc)
    # 65 unique plays, most recent first
    rows = [
        {"album_id": f"album{i}", "played_at": (now - timedelta(hours=i)).isoformat()}
        for i in range(1, 66)
    ]
    db = mock_db_with_play_history(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/home")
        assert res.status_code == 200
        data = res.json()
        assert len(data["recently_played"]) == 60
        ids = [a["service_id"] for a in data["recently_played"]]
        assert ids == [f"album{i}" for i in range(1, 61)]
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_home.py::test_home_recently_played_capped_at_60 -v`
Expected: FAIL — returns 30 items, not 60.

- [ ] **Step 3: Update backend caps from 30 to 60**

In `backend/routers/home.py`, make these changes:

1. Line 64: Change `.limit(300)` to `.limit(600)`
2. Line 67: Change `[:30]` to `[:60]`
3. Line 85: Change `min(30, len(rediscover_candidates))` to `min(60, len(rediscover_candidates))`
4. Line 104: Change `min(30, len(recommended_candidates))` to `min(60, len(recommended_candidates))`
5. Line 112: Change `[:30]` to `[:60]`

Also update the comment on line 58 from "last 30" to "last 60".

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_home.py::test_home_recently_played_capped_at_60 -v`
Expected: PASS

- [ ] **Step 5: Update rediscover cap assertion**

In `backend/tests/test_home.py`, update `test_home_rediscover_returns_unplayed_albums` (line 206):
Change `assert len(rediscover_ids) <= 30` to `assert len(rediscover_ids) <= 60`

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && python -m pytest tests/test_home.py -v`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/home.py backend/tests/test_home.py
git commit -m "Bump home page section caps from 30 to 60 [124]"
```

---

### Task 2: Frontend — Lazy rendering with IntersectionObserver

**Files:**
- Modify: `frontend/src/components/HomePage.test.jsx` (add lazy rendering tests)
- Modify: `frontend/src/components/HomePage.jsx` (add IntersectionObserver to AlbumList)

- [ ] **Step 1: Write failing test — only first batch renders initially**

In `frontend/src/components/HomePage.test.jsx`, add a new test data set and test. Add this near the top of the file after `HOME_DATA`:

```javascript
// 45 albums to test batch rendering (more than BATCH_SIZE=30)
const LARGE_SECTION = Array.from({ length: 45 }, (_, i) => ({
  service_id: `lg${i}`,
  name: `Large Album ${i}`,
  artists: ['Artist X'],
  image_url: `https://img/lg${i}.jpg`,
}))
```

Add this test inside the `describe('HomePage', ...)` block:

```javascript
it('renders only first 30 albums initially when section has more', async () => {
  const largeData = {
    ...HOME_DATA,
    recently_played: LARGE_SECTION,
  }
  global.fetch.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(largeData) })
  )
  useIsMobile.mockReturnValue(true)
  render(<HomePage onPlay={() => {}} />)
  await waitFor(() => {
    expect(screen.getByTestId('album-item-lg0')).toBeInTheDocument()
  })
  // First 30 should be present
  expect(screen.getByTestId('album-item-lg29')).toBeInTheDocument()
  // Item 31+ should NOT be rendered yet
  expect(screen.queryByTestId('album-item-lg30')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/HomePage.test.jsx`
Expected: FAIL — all 45 items render because there's no batching yet.

- [ ] **Step 3: Implement lazy rendering in AlbumList**

In `frontend/src/components/HomePage.jsx`, update the imports and `AlbumList` component:

Replace the existing import line:
```javascript
import { useState, useEffect } from 'react'
```
with:
```javascript
import { useState, useEffect, useRef, useCallback } from 'react'
```

Replace the entire `AlbumList` function (lines 6-29) with:

```javascript
const BATCH_SIZE = 30

function AlbumList({ albums, onPlay }) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const sentinelRef = useRef(null)

  // Reset visible count when albums change (e.g. tab switch)
  useEffect(() => {
    setVisibleCount(BATCH_SIZE)
  }, [albums])

  const handleIntersect = useCallback((entries) => {
    if (entries[0].isIntersecting) {
      setVisibleCount(prev => Math.min(prev + BATCH_SIZE, albums.length))
    }
  }, [albums.length])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(handleIntersect, { threshold: 0 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleIntersect])

  if (!albums || albums.length === 0) {
    return <div className="px-4 py-6 text-text-dim text-sm italic">Nothing yet</div>
  }

  const visible = albums.slice(0, visibleCount)
  const hasMore = visibleCount < albums.length

  return (
    <div className="grid grid-cols-3 gap-1 pt-0 px-2 pb-2">
      {visible.map(album => (
        <div
          key={album.service_id}
          data-testid={`album-item-${album.service_id}`}
          onClick={() => onPlay(album.service_id)}
          className="cursor-pointer active:scale-95 active:opacity-80 transition-transform duration-150"
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/HomePage.test.jsx`
Expected: PASS — the new test passes, and all existing tests still pass.

- [ ] **Step 5: Write test — sentinel triggers loading remaining items**

Add this test inside the `describe('HomePage', ...)` block in `HomePage.test.jsx`:

```javascript
it('renders remaining albums when sentinel becomes visible', async () => {
  const largeData = {
    ...HOME_DATA,
    recently_played: LARGE_SECTION,
  }
  global.fetch.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(largeData) })
  )
  useIsMobile.mockReturnValue(true)
  render(<HomePage onPlay={() => {}} />)
  await waitFor(() => {
    expect(screen.getByTestId('album-item-lg0')).toBeInTheDocument()
  })

  // Simulate IntersectionObserver triggering
  const sentinel = screen.getByTestId('load-more-sentinel')
  // Get the IntersectionObserver callback that was registered
  const observer = new IntersectionObserver(() => {})
  // Manually trigger the callback with isIntersecting: true
  const [observerCallback] = IntersectionObserver.mock.calls.at(-1)
  observerCallback([{ isIntersecting: true }])

  await waitFor(() => {
    expect(screen.getByTestId('album-item-lg44')).toBeInTheDocument()
  })
})
```

**Note:** This test requires mocking IntersectionObserver in the test setup. Add this to the `beforeEach` block:

```javascript
const mockIntersectionObserver = vi.fn((callback) => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}))
global.IntersectionObserver = mockIntersectionObserver
```

Wait — jsdom doesn't have IntersectionObserver. We need to mock it globally. Add this mock **before** the `beforeEach`:

```javascript
let intersectionCallback = null
const mockObserverInstance = {
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}
global.IntersectionObserver = vi.fn((callback) => {
  intersectionCallback = callback
  return mockObserverInstance
})
```

Then the test becomes:

```javascript
it('renders remaining albums when sentinel becomes visible', async () => {
  const largeData = {
    ...HOME_DATA,
    recently_played: LARGE_SECTION,
  }
  global.fetch.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(largeData) })
  )
  useIsMobile.mockReturnValue(true)
  render(<HomePage onPlay={() => {}} />)
  await waitFor(() => {
    expect(screen.getByTestId('album-item-lg0')).toBeInTheDocument()
  })

  // Trigger the IntersectionObserver callback
  intersectionCallback([{ isIntersecting: true }])

  await waitFor(() => {
    expect(screen.getByTestId('album-item-lg44')).toBeInTheDocument()
  })
  // Sentinel should be gone since all items are now visible
  expect(screen.queryByTestId('load-more-sentinel')).not.toBeInTheDocument()
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/HomePage.test.jsx`
Expected: All tests pass, including the new sentinel trigger test.

- [ ] **Step 7: Write test — sections with <= 30 items render all without sentinel**

Add this test:

```javascript
it('renders all items without sentinel when section has 30 or fewer', async () => {
  useIsMobile.mockReturnValue(true)
  render(<HomePage onPlay={() => {}} />)
  await waitFor(() => {
    expect(screen.getByTestId('album-item-a1')).toBeInTheDocument()
  })
  expect(screen.queryByTestId('load-more-sentinel')).not.toBeInTheDocument()
})
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/HomePage.test.jsx`
Expected: PASS — no sentinel for small sections (HOME_DATA has <=2 items per section).

- [ ] **Step 9: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/HomePage.jsx frontend/src/components/HomePage.test.jsx
git commit -m "Add lazy rendering to home page sections with IntersectionObserver [124]"
```
