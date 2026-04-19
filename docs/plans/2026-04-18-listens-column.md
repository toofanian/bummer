# Listens Column + Remove Spotify Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sortable "Listens" column to the library album table and remove the out-of-scope Spotify recently_played sync endpoint.

**Architecture:** Remove `POST /home/history/sync` endpoint and its tests. Add `GET /library/listen-counts` endpoint that aggregates `play_history` rows by album. Frontend fetches counts on library load, passes them into AlbumTable as a new sortable column.

**Tech Stack:** FastAPI, Supabase (Postgres), React, Vitest

---

### Task 1: Remove sync endpoint and tests (issue #66)

**Files:**
- Modify: `backend/routers/home.py:34-81` (remove `sync_history` function)
- Modify: `backend/tests/test_home.py:222-334` (remove 4 sync tests)

- [ ] **Step 1: Remove the sync endpoint from home.py**

Delete lines 34–81 in `backend/routers/home.py` — the entire `sync_history` function and its `@router.post("/history/sync")` decorator.

- [ ] **Step 2: Remove sync tests from test_home.py**

Delete these 4 test functions from `backend/tests/test_home.py`:
- `test_sync_history_inserts_new_rows` (lines 222–257)
- `test_sync_history_skips_duplicates` (lines 260–292)
- `test_sync_history_empty_spotify_response` (lines 295–306)
- `test_sync_history_all_duplicates_no_insert` (lines 309–334)

- [ ] **Step 3: Run backend tests**

Run: `cd backend && python -m pytest tests/test_home.py -v`
Expected: All remaining tests pass (5 tests: `test_log_play_inserts_row`, `test_log_play_requires_album_id`, `test_home_returns_today_albums`, `test_home_empty_history`, `test_home_rediscover_returns_unplayed_albums`, `test_home_rediscover_excludes_recently_played`, `test_home_recommended_by_frequent_artists`, `test_home_returns_recently_added`)

- [ ] **Step 4: Commit**

```bash
git add backend/routers/home.py backend/tests/test_home.py
git commit -m "Remove Spotify recently_played sync endpoint (#66)

Endpoint was never part of the digest spec and mixed track-level
Spotify data into album-level play_history.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add listen-counts backend endpoint

**Files:**
- Modify: `backend/routers/library.py` (add `get_listen_counts` endpoint)
- Create: `backend/tests/test_listen_counts.py`

- [ ] **Step 1: Write failing test — basic count aggregation**

Create `backend/tests/test_listen_counts.py`:

```python
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from main import app
from spotify_client import get_user_spotify

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}


def setup_overrides(db=None):
    app.dependency_overrides[get_authed_db] = lambda: db or MagicMock()
    app.dependency_overrides[get_user_spotify] = lambda: MagicMock()
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


def clear_overrides():
    app.dependency_overrides.clear()


def mock_db_with_counts(rows):
    """Mock DB where play_history select returns the given rows."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=rows)
    )
    return db


def test_listen_counts_returns_aggregated_counts():
    rows = [
        {"album_id": "a1"},
        {"album_id": "a1"},
        {"album_id": "a1"},
        {"album_id": "a2"},
    ]
    db = mock_db_with_counts(rows)
    setup_overrides(db=db)
    try:
        res = client.get("/library/listen-counts")
        assert res.status_code == 200
        data = res.json()
        assert data["counts"] == {"a1": 3, "a2": 1}
    finally:
        clear_overrides()


def test_listen_counts_empty_history():
    db = mock_db_with_counts([])
    setup_overrides(db=db)
    try:
        res = client.get("/library/listen-counts")
        assert res.status_code == 200
        assert res.json() == {"counts": {}}
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_listen_counts.py -v`
Expected: FAIL — 404 because endpoint doesn't exist yet

- [ ] **Step 3: Write minimal implementation**

Add to `backend/routers/library.py`, after the `get_album_tracks` endpoint (before the `get_album_cache` function):

```python
@router.get("/listen-counts")
def get_listen_counts(
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    rows = (
        db.table("play_history")
        .select("album_id")
        .eq("user_id", user["user_id"])
        .execute()
    ).data
    counts = {}
    for row in rows:
        aid = row["album_id"]
        counts[aid] = counts.get(aid, 0) + 1
    return {"counts": counts}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_listen_counts.py -v`
Expected: 2 tests PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/routers/library.py backend/tests/test_listen_counts.py
git commit -m "Add GET /library/listen-counts endpoint (#59)

Returns all-time play count per album from play_history (log rows only).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add Listens column to AlbumTable (desktop)

**Files:**
- Modify: `frontend/src/components/AlbumTable.jsx`
- Modify: `frontend/src/components/AlbumTable.test.jsx`

- [ ] **Step 1: Write failing test — Listens column header renders**

Add to `frontend/src/components/AlbumTable.test.jsx`, inside the `describe('AlbumTable', ...)` block, after existing header tests:

```jsx
it('renders Listens column header', () => {
  render(<AlbumTable albums={ALBUMS} />)
  expect(screen.getByRole('columnheader', { name: /listens/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: FAIL — no Listens column header

- [ ] **Step 3: Add Listens to COLUMNS array and render**

In `frontend/src/components/AlbumTable.jsx`:

Update `COLUMNS` (line 10–15) to add listens between `added_at` and the Collections header:

```javascript
const COLUMNS = [
  { key: 'name',        label: 'Album'      },
  { key: 'artists',     label: 'Artist'     },
  { key: 'release_date',label: 'Year',       width: 64  },
  { key: 'added_at',    label: 'Date Added', width: 110 },
  { key: 'listens',     label: 'Listens',    width: 80  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: The new Listens header test passes. Some existing tests may fail due to column count changes — fix in next steps.

- [ ] **Step 5: Update TrackList totalColumns**

In `TrackList` function (~line 158), update `totalColumns` to account for the new column:

```javascript
const totalColumns = hasHandleColumn ? 9 : 8
```

And add an extra empty `<td></td>` in the track header row and track data rows to match the new column count.

- [ ] **Step 6: Add listenCounts prop and render count in DesktopAlbumRow**

Add `listenCounts` prop to `AlbumTable`, pass it through to `DesktopAlbumRow`.

In `DesktopAlbumRow`, add `listenCount` prop and render it in a new `<td>` after the Date Added cell and before the Collections cell:

```jsx
<td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle text-center text-text-dim">{listenCount ?? 0}</td>
```

In `AlbumTable`, pass `listenCount={(listenCounts || {})[album.service_id] || 0}` to `DesktopAlbumRow`.

- [ ] **Step 7: Write test — listens count displays in row**

Add test:

```jsx
it('displays listen count for each album', () => {
  const counts = { id1: 5, id2: 12 }
  render(<AlbumTable albums={ALBUMS} listenCounts={counts} />)
  expect(screen.getByText('5')).toBeInTheDocument()
  expect(screen.getByText('12')).toBeInTheDocument()
})

it('displays 0 for albums with no listens', () => {
  render(<AlbumTable albums={ALBUMS} listenCounts={{}} />)
  const zeroCells = screen.getAllByText('0')
  expect(zeroCells.length).toBe(2)
})
```

- [ ] **Step 8: Run tests**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: All tests pass

- [ ] **Step 9: Update sortAlbums for listens**

In `sortAlbums` function, handle `listens` key by comparing numeric values:

```javascript
function sortAlbums(albums, key, direction, listenCounts) {
  return [...albums].sort((a, b) => {
    let aVal, bVal
    if (key === 'artists') {
      aVal = a.artists.join(', ')
      bVal = b.artists.join(', ')
    } else if (key === 'listens') {
      aVal = (listenCounts || {})[a.service_id] || 0
      bVal = (listenCounts || {})[b.service_id] || 0
    } else {
      aVal = a[key] ?? ''
      bVal = b[key] ?? ''
    }
    if (aVal < bVal) return direction === 'asc' ? -1 : 1
    if (aVal > bVal) return direction === 'asc' ? 1 : -1
    return 0
  })
}
```

Update the `useMemo` call for `sorted` to pass `listenCounts`:

```javascript
const sorted = useMemo(
  () => reorderable ? albums : sortAlbums(albums, sortKey, sortDir, listenCounts),
  [albums, sortKey, sortDir, reorderable, listenCounts],
)
```

Update `handleHeaderClick` so listens defaults to descending on first click:

```javascript
function handleHeaderClick(key) {
  if (reorderable) return
  if (key === sortKey) {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc')
  } else {
    setSortKey(key)
    setSortDir(key === 'listens' ? 'desc' : 'asc')
  }
}
```

- [ ] **Step 10: Write sort test**

```jsx
it('sorts by listens descending on first click', async () => {
  const counts = { id1: 3, id2: 10 }
  render(<AlbumTable albums={ALBUMS} listenCounts={counts} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('columnheader', { name: /listens/i }))
  const rows = screen.getAllByRole('row').filter(r => r.classList.contains('album-row'))
  // id2 (10) should come before id1 (3) when sorted desc
  expect(rows[0]).toHaveTextContent('Room On Fire')
  expect(rows[1]).toHaveTextContent('Love Deluxe')
})
```

- [ ] **Step 11: Run all AlbumTable tests**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: All pass

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/AlbumTable.jsx frontend/src/components/AlbumTable.test.jsx
git commit -m "Add sortable Listens column to AlbumTable (#59)

Column shows all-time play count per album. Defaults to descending
sort on first click. Positioned between Date Added and Collections.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add listens to MobileAlbumCard

**Files:**
- Modify: `frontend/src/components/MobileAlbumCard.jsx`
- Modify: `frontend/src/components/AlbumTable.test.jsx` (mobile tests)

- [ ] **Step 1: Write failing test**

Add to `describe('AlbumTable mobile card list', ...)`:

```jsx
it('shows listen count on mobile card', () => {
  useIsMobile.mockReturnValue(true)
  const counts = { id1: 7 }
  render(<AlbumTable albums={ALBUMS} loading={false} listenCounts={counts} />)
  expect(screen.getByText('7')).toBeInTheDocument()
  useIsMobile.mockReturnValue(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: FAIL

- [ ] **Step 3: Add listenCount to MobileAlbumCard**

In `frontend/src/components/MobileAlbumCard.jsx`, add `listenCount` prop to `MobileAlbumCard`. Render a small count badge before the expand chevron, after the collection button:

```jsx
{listenCount > 0 && (
  <span className="text-xs text-text-dim tabular-nums">{listenCount}</span>
)}
```

In `AlbumTable.jsx`, pass `listenCount` to `MobileAlbumCard` in `renderMobileCard`:

```javascript
listenCount: (listenCounts || {})[album.service_id] || 0,
```

Also pass it through `SortableMobileCard`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MobileAlbumCard.jsx frontend/src/components/AlbumTable.jsx frontend/src/components/AlbumTable.test.jsx
git commit -m "Add listen count to MobileAlbumCard (#59)

Shows play count as small text badge on mobile album cards.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Fetch listen counts in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write failing test**

Add to `frontend/src/App.test.jsx` — a test that verifies the app fetches `/library/listen-counts` and passes counts to AlbumTable:

```jsx
it('fetches listen counts and passes to AlbumTable', async () => {
  const countsData = { counts: { album1: 5 } }
  global.fetch = vi.fn((url) => {
    if (url.includes('/library/albums') && !url.includes('/tracks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })
    }
    if (url.includes('/library/listen-counts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(countsData) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
  // Render app, navigate to library, verify listen counts are fetched
  // (exact assertions depend on existing test patterns in this file)
})
```

Note: Adapt this test to match the existing mock patterns in `App.test.jsx`. The key assertion is that `fetch` was called with a URL containing `/library/listen-counts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: FAIL — App doesn't fetch listen-counts yet

- [ ] **Step 3: Add listen counts fetch to App.jsx**

In `App.jsx`:

1. Add state: `const [listenCounts, setListenCounts] = useState({})`

2. In the `loadLibrary` function (around line 167), after fetching `/library/albums`, add a parallel fetch for listen counts:

```javascript
// Fetch listen counts (fire-and-forget, non-blocking)
apiFetch('/library/listen-counts', {}, sessionRef.current)
  .then(r => r.json())
  .then(data => setListenCounts(data.counts || {}))
  .catch(() => {}) // Non-critical — table works without counts
```

3. Pass `listenCounts` to all `<AlbumTable>` instances that show library albums:

```jsx
<AlbumTable
  ...existing props...
  listenCounts={listenCounts}
/>
```

Note: Collection detail AlbumTable instances should also receive `listenCounts` since albums in collections can have play counts too.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: PASS

- [ ] **Step 5: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "Fetch and pass listen counts to AlbumTable (#59)

Fetches GET /library/listen-counts on library load. Non-blocking —
table renders with 0 counts if fetch fails.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Increment listen count on play

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write failing test**

Add test to `App.test.jsx` that verifies after playing an album (which calls `/home/history/log`), the local `listenCounts` state is optimistically incremented so the count updates without refetching.

- [ ] **Step 2: Add optimistic count increment**

In `App.jsx`, in the `handlePlay` function (which already calls `POST /home/history/log`), after the log call, optimistically increment the count:

```javascript
setListenCounts(prev => ({
  ...prev,
  [albumId]: (prev[albumId] || 0) + 1,
}))
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: PASS

- [ ] **Step 4: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "Optimistically increment listen count on play (#59)

Updates local count immediately when user plays an album,
without waiting for a refetch from the server.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
