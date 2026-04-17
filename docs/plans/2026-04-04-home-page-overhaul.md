# Home Page UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the home page presentation so album cards fill the desktop viewport in a wrapping grid, merge Today/This Week into "Recently Played", and add a "Recently Added" section.

**Architecture:** Backend adds a `recently_added` field to the `/home` response using the existing `added_at` column from `library_cache`. Frontend merges today/this_week into one deduped array, renders a new section for recently_added, and switches AlbumRow from horizontal scroll to a wrapping CSS grid on desktop (>768px) while keeping horizontal scroll on mobile.

**Tech Stack:** FastAPI (Python), React (Vite, JavaScript), Tailwind CSS, Vitest, pytest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/routers/home.py` | Modify | Add `recently_added` to `/home` response |
| `backend/tests/test_home.py` | Modify | Test `recently_added` field |
| `frontend/src/components/AlbumRow.jsx` | Modify | Wrapping grid on desktop, bigger cards, hover state |
| `frontend/src/components/AlbumRow.test.jsx` | Modify | Test responsive layout classes and hover |
| `frontend/src/components/HomePage.jsx` | Modify | Merge sections, add Recently Added, new ordering |
| `frontend/src/components/HomePage.test.jsx` | Modify | Test merged sections, Recently Added, dedup logic |

---

### Task 1: Backend — Add `recently_added` to `/home` response

**Files:**
- Modify: `backend/routers/home.py:43-124`
- Test: `backend/tests/test_home.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_home.py`, add a new test and update the `ALBUM_CACHE` fixture to include `added_at` fields:

```python
ALBUM_CACHE = [
    {"spotify_id": "album1", "name": "Album One", "artists": ["Artist A"], "image_url": "https://img/1.jpg", "release_date": "2020-01-01", "added_at": "2024-01-15T00:00:00Z"},
    {"spotify_id": "album2", "name": "Album Two", "artists": ["Artist B"], "image_url": "https://img/2.jpg", "release_date": "2021-06-01", "added_at": "2024-03-01T00:00:00Z"},
    {"spotify_id": "album3", "name": "Album Three", "artists": ["Artist A"], "image_url": "https://img/3.jpg", "release_date": "2019-03-15", "added_at": "2023-12-01T00:00:00Z"},
]
```

Then add the test:

```python
@patch("routers.home.get_album_cache", return_value=ALBUM_CACHE)
def test_home_returns_recently_added(mock_cache):
    db = mock_db_with_play_history([])
    setup_overrides(db=db)
    try:
        res = client.get("/home", params={"tz": "UTC"})
        assert res.status_code == 200
        data = res.json()
        assert "recently_added" in data
        ids = [a["spotify_id"] for a in data["recently_added"]]
        # Should be sorted by added_at descending
        assert ids == ["album2", "album1", "album3"]
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_home.py::test_home_returns_recently_added -v`
Expected: FAIL with `KeyError: 'recently_added'`

- [ ] **Step 3: Implement — add `recently_added` to the response**

In `backend/routers/home.py`, in the `get_home` function, before the `return` statement (line ~119), add:

```python
    # Recently added: albums sorted by added_at descending, capped at 20
    recently_added = sorted(
        [a for a in album_cache if a.get("added_at")],
        key=lambda a: a["added_at"],
        reverse=True,
    )[:20]
```

Then update the return dict to include `recently_added`:

```python
    return {
        "today": resolve(today_ids),
        "this_week": resolve(week_ids),
        "rediscover": rediscover,
        "recommended": recommended,
        "recently_added": recently_added,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_home.py -v`
Expected: All tests PASS (including the new one)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/home.py backend/tests/test_home.py
git commit -m "feat: add recently_added to /home response"
```

---

### Task 2: Frontend — Responsive AlbumRow (wrapping grid on desktop, scroll on mobile)

**Files:**
- Modify: `frontend/src/components/AlbumRow.jsx`
- Test: `frontend/src/components/AlbumRow.test.jsx`

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/components/AlbumRow.test.jsx` with:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AlbumRow from './AlbumRow'

const ALBUMS = [
  { spotify_id: 'a1', name: 'Album One', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
  { spotify_id: 'a2', name: 'Album Two', artists: ['Artist B', 'Artist C'], image_url: 'https://img/2.jpg' },
]

describe('AlbumRow', () => {
  it('renders section title', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('renders album cards with name and artist', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    expect(screen.getByText('Album One')).toBeInTheDocument()
    expect(screen.getByText('Artist A')).toBeInTheDocument()
    expect(screen.getByText('Album Two')).toBeInTheDocument()
    expect(screen.getByText('Artist B, Artist C')).toBeInTheDocument()
  })

  it('renders album art images', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', 'https://img/1.jpg')
  })

  it('calls onPlay with spotify_id on click', () => {
    const onPlay = vi.fn()
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={onPlay} />)
    fireEvent.click(screen.getByText('Album One').closest('[data-testid]'))
    expect(onPlay).toHaveBeenCalledWith('a1')
  })

  it('renders nothing when albums is empty', () => {
    const { container } = render(<AlbumRow title="Today" albums={[]} onPlay={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('uses grid layout classes on the container', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const container = screen.getByText('Album One').closest('[data-testid]').parentElement
    expect(container.className).toContain('md:grid')
  })

  it('applies hover scale class to album cards', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const card = screen.getByTestId('album-card-a1')
    expect(card.className).toContain('md:hover:scale-[1.03]')
  })

  it('uses rounded-md on album images', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const img = screen.getAllByRole('img')[0]
    expect(img.className).toContain('rounded-md')
  })
})
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd frontend && npm test -- --run src/components/AlbumRow.test.jsx`
Expected: 3 new tests FAIL (grid layout, hover scale, rounded-md)

- [ ] **Step 3: Implement responsive AlbumRow**

Replace `frontend/src/components/AlbumRow.jsx` with:

```jsx
import { useRef } from 'react'

export default function AlbumRow({ title, albums, onPlay }) {
  const pointerStart = useRef({ x: 0, y: 0 })

  if (!albums || albums.length === 0) return null

  return (
    <section className="mb-6 md:mb-8">
      <h2 className="text-lg font-semibold mb-3 text-text">{title}</h2>
      <div
        className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 md:grid md:overflow-visible md:pb-0"
        style={{
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        }}
      >
        {albums.map(album => (
          <div
            key={album.spotify_id}
            className="flex-shrink-0 w-[110px] md:w-auto cursor-pointer active:scale-95 active:opacity-80 md:hover:scale-[1.03] md:hover:shadow-lg transition-transform duration-150"
            style={{ scrollSnapAlign: 'start' }}
            data-testid={`album-card-${album.spotify_id}`}
            onPointerDown={e => { pointerStart.current = { x: e.clientX, y: e.clientY } }}
            onClick={e => {
              const dx = Math.abs(e.clientX - pointerStart.current.x)
              const dy = Math.abs(e.clientY - pointerStart.current.y)
              if (dx > 10 || dy > 10) return
              onPlay(album.spotify_id)
            }}
          >
            {album.image_url ? (
              <img
                className="w-[110px] h-[110px] md:w-full md:h-auto md:aspect-square rounded-md object-cover block"
                src={album.image_url}
                alt={album.name}
              />
            ) : (
              <div className="w-[110px] h-[110px] md:w-full md:h-auto md:aspect-square rounded-md bg-surface-2" />
            )}
            <div className="text-sm mt-1.5 text-text truncate">{album.name}</div>
            <div className="text-xs text-text-dim truncate">{album.artists.join(', ')}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

Key changes:
- Container: `flex` on mobile with horizontal scroll, `md:grid` on desktop with wrapping grid via `gridTemplateColumns` inline style
- Cards: `w-[110px]` on mobile (bumped from 100px), `md:w-auto` on desktop (fills grid cell)
- Images: `w-[110px] h-[110px]` mobile, `md:w-full md:h-auto md:aspect-square` desktop
- Hover: `md:hover:scale-[1.03] md:hover:shadow-lg` (desktop only)
- Rounded: `rounded-md` (upgraded from `rounded`)
- Section spacing: `mb-6 md:mb-8`

- [ ] **Step 4: Run all AlbumRow tests**

Run: `cd frontend && npm test -- --run src/components/AlbumRow.test.jsx`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlbumRow.jsx frontend/src/components/AlbumRow.test.jsx
git commit -m "feat: responsive AlbumRow — wrapping grid on desktop, larger cards, hover state"
```

---

### Task 3: Frontend — HomePage section restructure

**Files:**
- Modify: `frontend/src/components/HomePage.jsx`
- Test: `frontend/src/components/HomePage.test.jsx`

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/components/HomePage.test.jsx` with:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import HomePage from './HomePage'

const HOME_DATA = {
  today: [
    { spotify_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
  ],
  this_week: [
    { spotify_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
  ],
  recently_added: [
    { spotify_id: 'a5', name: 'New Album', artists: ['Artist D'], image_url: 'https://img/5.jpg' },
  ],
  rediscover: [
    { spotify_id: 'a3', name: 'Old Gem', artists: ['Artist C'], image_url: 'https://img/3.jpg' },
  ],
  recommended: [
    { spotify_id: 'a4', name: 'Try This', artists: ['Artist A'], image_url: 'https://img/4.jpg' },
  ],
}

beforeEach(() => {
  global.fetch = vi.fn()
})

describe('HomePage', () => {
  it('renders merged Recently Played section instead of Today/This Week', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HOME_DATA) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
      expect(screen.queryByText('Today')).not.toBeInTheDocument()
      expect(screen.queryByText('This Week')).not.toBeInTheDocument()
    })
  })

  it('deduplicates albums in Recently Played (keeps first occurrence)', async () => {
    const duped = {
      ...HOME_DATA,
      today: [
        { spotify_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
      ],
      this_week: [
        { spotify_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
        { spotify_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
      ],
    }
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(duped) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      // a1 appears in both today and this_week — should only render once
      const cards = screen.getAllByTestId(/^album-card-a1$/)
      expect(cards).toHaveLength(1)
    })
  })

  it('renders Recently Added section', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HOME_DATA) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.getByText('New Album')).toBeInTheDocument()
    })
  })

  it('renders sections in correct order', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HOME_DATA) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      const headings = screen.getAllByRole('heading')
      const titles = headings.map(h => h.textContent)
      expect(titles).toEqual(['Recently Played', 'Recently Added', 'You Might Like', 'Rediscover'])
    })
  })

  it('always shows Recently Played and Recently Added even when empty', async () => {
    const sparse = {
      today: [], this_week: [], recently_added: [],
      rediscover: HOME_DATA.rediscover, recommended: [],
    }
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(sparse) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.queryByText('You Might Like')).not.toBeInTheDocument()
    })
  })

  it('shows empty state when all sections are empty', async () => {
    const empty = { today: [], this_week: [], recently_added: [], rediscover: [], recommended: [] }
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(empty) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/start playing albums/i)).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}))
    render(<HomePage onPlay={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd frontend && npm test -- --run src/components/HomePage.test.jsx`
Expected: Multiple tests FAIL (no "Recently Played" heading, no "Recently Added" section, wrong section order)

- [ ] **Step 3: Implement the new HomePage**

Replace `frontend/src/components/HomePage.jsx` with:

```jsx
import { useState, useEffect } from 'react'
import AlbumRow from './AlbumRow'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

function AlwaysRow({ title, albums, onPlay }) {
  if (albums && albums.length > 0) {
    return <AlbumRow title={title} albums={albums} onPlay={onPlay} />
  }
  return (
    <section className="mb-6 md:mb-8">
      <h2 className="text-lg font-semibold mb-3 text-text">{title}</h2>
      <p className="text-sm text-text-dim italic">Nothing yet</p>
    </section>
  )
}

function mergeRecentlyPlayed(today, thisWeek) {
  const seen = new Set()
  const merged = []
  for (const album of [...today, ...thisWeek]) {
    if (!seen.has(album.spotify_id)) {
      seen.add(album.spotify_id)
      merged.push(album)
    }
  }
  return merged
}

export default function HomePage({ onPlay }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    fetch(`${API}/home?tz=${encodeURIComponent(tz)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p className="p-6 text-text-dim">Loading...</p>

  const recentlyPlayed = data ? mergeRecentlyPlayed(data.today, data.this_week) : []
  const recentlyAdded = data?.recently_added ?? []

  const isEmpty = data &&
    recentlyPlayed.length === 0 &&
    recentlyAdded.length === 0 &&
    data.rediscover.length === 0 &&
    data.recommended.length === 0

  if (!data || isEmpty) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-text-dim text-base">
        <p>Start playing albums to see your listening history here.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:px-6 md:py-4">
      <AlwaysRow title="Recently Played" albums={recentlyPlayed} onPlay={onPlay} />
      <AlwaysRow title="Recently Added" albums={recentlyAdded} onPlay={onPlay} />
      <AlbumRow title="You Might Like" albums={data.recommended} onPlay={onPlay} />
      <AlbumRow title="Rediscover" albums={data.rediscover} onPlay={onPlay} />
    </div>
  )
}
```

Key changes:
- `mergeRecentlyPlayed()` concatenates `today` + `this_week`, deduplicates by `spotify_id` keeping first occurrence (more recent)
- "Recently Played" replaces separate Today/This Week sections
- "Recently Added" uses `data.recently_added` from backend
- Section order: Recently Played → Recently Added → You Might Like → Rediscover
- `AlwaysRow` updated with `md:mb-8` to match AlbumRow section spacing
- Empty state checks updated to include `recentlyAdded`

- [ ] **Step 4: Run all HomePage tests**

Run: `cd frontend && npm test -- --run src/components/HomePage.test.jsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Run full frontend test suite**

Run: `cd frontend && npm test -- --run`
Expected: All tests PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && source .venv/bin/activate && pytest -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/HomePage.jsx frontend/src/components/HomePage.test.jsx
git commit -m "feat: restructure home page — merge Recently Played, add Recently Added, new section order"
```
