# Library Changelog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scrollable library changelog showing dated add/remove history, accessible as a second tab within the existing DigestPanel.

**Architecture:** New `GET /digest/changelog` endpoint diffs consecutive `library_snapshots` pairs and returns paginated entries with album metadata. Frontend extends DigestPanel with a tab switcher to toggle between the existing digest view and the new changelog timeline.

**Tech Stack:** FastAPI, Supabase (PostgreSQL), React, Vitest, pytest

---

## File Structure

**Backend (modify):**
- `backend/routers/digest.py` — add `GET /digest/changelog` endpoint
- `backend/tests/test_digest.py` — add changelog endpoint tests

**Frontend (modify):**
- `frontend/src/components/DigestPanel.jsx` — add tab switcher and changelog tab content
- `frontend/src/components/DigestPanel.test.jsx` — add changelog tab tests

---

## Chunk 1: Backend — `GET /digest/changelog` endpoint

### Task 1: Test and implement changelog with multiple snapshots

**Files:**
- Modify: `backend/tests/test_digest.py`
- Modify: `backend/routers/digest.py`

- [ ] **Step 1: Write failing test — changelog returns entries from consecutive snapshot diffs**

Add to `backend/tests/test_digest.py`:

```python
# --- GET /digest/changelog ---


def test_changelog_returns_entries_from_consecutive_snapshots():
    """Three snapshots → two entries, each showing adds/removes between consecutive pairs."""
    snapshots = [
        {"snapshot_date": "2026-04-03", "album_ids": ["a1", "a2", "a3"], "total": 3},
        {"snapshot_date": "2026-04-02", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1},
    ]

    db = MagicMock()
    call_count = {"n": 0}

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            # First call: fetch snapshots list (limit+1 rows, ordered desc)
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
            return mock_table
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        entries = data["entries"]
        assert len(entries) == 2

        # Most recent entry: 2026-04-03 vs 2026-04-02 → a3 added
        assert entries[0]["date"] == "2026-04-03"
        added_ids_0 = [a["service_id"] for a in entries[0]["added"]]
        assert "a3" in added_ids_0
        assert entries[0]["removed"] == []

        # Older entry: 2026-04-02 vs 2026-04-01 → a2 added
        assert entries[1]["date"] == "2026-04-02"
        added_ids_1 = [a["service_id"] for a in entries[1]["added"]]
        assert "a2" in added_ids_1
        assert entries[1]["removed"] == []
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_digest.py::test_changelog_returns_entries_from_consecutive_snapshots -v
```

Expected: FAIL — no route matches `GET /digest/changelog`.

- [ ] **Step 3: Implement the changelog endpoint**

Add to `backend/routers/digest.py`, after the existing `get_digest` function:

```python
@router.get("/changelog")
def get_changelog(
    limit: int = 50,
    before: date | None = None,
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    # Fetch limit+1 snapshots to compute `limit` diffs (need pairs)
    query = (
        db.table("library_snapshots")
        .select("snapshot_date, album_ids")
        .order("snapshot_date", desc=True)
        .limit(limit + 1)
    )
    if before:
        query = query.lt("snapshot_date", str(before))

    snapshots = query.execute().data

    if len(snapshots) < 2:
        return {"entries": [], "has_more": False, "next_cursor": None}

    # Compute diffs between consecutive pairs
    raw_entries = []
    for i in range(len(snapshots) - 1):
        newer = snapshots[i]
        older = snapshots[i + 1]
        newer_ids = set(newer["album_ids"])
        older_ids = set(older["album_ids"])
        added_ids = list(newer_ids - older_ids)
        removed_ids = list(older_ids - newer_ids)
        if added_ids or removed_ids:
            raw_entries.append({
                "date": newer["snapshot_date"],
                "added_ids": added_ids,
                "removed_ids": removed_ids,
            })

    # Resolve metadata for all referenced album IDs
    all_ids = set()
    for entry in raw_entries:
        all_ids.update(entry["added_ids"])
        all_ids.update(entry["removed_ids"])

    album_cache = get_album_cache(db, user_id=user["user_id"])
    metadata = _resolve_album_metadata(list(all_ids), album_cache, sp)
    meta_lookup = {m["service_id"]: m for m in metadata}

    entries = []
    for entry in raw_entries:
        entries.append({
            "date": entry["date"],
            "added": [meta_lookup[aid] for aid in entry["added_ids"] if aid in meta_lookup],
            "removed": [meta_lookup[aid] for aid in entry["removed_ids"] if aid in meta_lookup],
        })

    # Pagination: if we fetched limit+1 snapshots and used all pairs, there may be more
    has_more = len(snapshots) > limit
    next_cursor = snapshots[-2]["snapshot_date"] if has_more else None

    return {"entries": entries, "has_more": has_more, "next_cursor": next_cursor}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_digest.py::test_changelog_returns_entries_from_consecutive_snapshots -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/digest.py backend/tests/test_digest.py
git commit -m "Add GET /digest/changelog endpoint with consecutive snapshot diffs"
```

---

### Task 2: Test edge cases — empty, single snapshot, pagination, removals

**Files:**
- Modify: `backend/tests/test_digest.py`

- [ ] **Step 1: Write failing test — changelog returns empty when fewer than 2 snapshots**

```python
def test_changelog_empty_when_no_snapshots():
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        assert data["entries"] == []
        assert data["has_more"] is False
        assert data["next_cursor"] is None
    finally:
        clear_overrides()


def test_changelog_empty_when_one_snapshot():
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1}]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        assert data["entries"] == []
        assert data["has_more"] is False
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run tests to verify they pass** (these should already pass with the implementation)

```bash
cd backend && python -m pytest tests/test_digest.py::test_changelog_empty_when_no_snapshots tests/test_digest.py::test_changelog_empty_when_one_snapshot -v
```

Expected: PASS

- [ ] **Step 3: Write test — changelog includes removals**

```python
def test_changelog_includes_removals():
    """When an album is in the older snapshot but not the newer, it appears in removed."""
    snapshots = [
        {"snapshot_date": "2026-04-02", "album_ids": ["a1"], "total": 1},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1", "a2"], "total": 2},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        entries = data["entries"]
        assert len(entries) == 1
        assert entries[0]["date"] == "2026-04-02"
        removed_ids = [a["service_id"] for a in entries[0]["removed"]]
        assert "a2" in removed_ids
        assert entries[0]["added"] == []
    finally:
        clear_overrides()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_digest.py::test_changelog_includes_removals -v
```

Expected: PASS

- [ ] **Step 5: Write test — changelog skips no-change pairs**

```python
def test_changelog_skips_unchanged_pairs():
    """Consecutive snapshots with identical album_ids produce no entry."""
    snapshots = [
        {"snapshot_date": "2026-04-03", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-02", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog")
        assert res.status_code == 200
        data = res.json()
        entries = data["entries"]
        # Only one entry: 2026-04-02 vs 2026-04-01 (a2 added)
        # The 2026-04-03 vs 2026-04-02 pair is identical → skipped
        assert len(entries) == 1
        assert entries[0]["date"] == "2026-04-02"
    finally:
        clear_overrides()
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_digest.py::test_changelog_skips_unchanged_pairs -v
```

Expected: PASS

- [ ] **Step 7: Write test — before cursor filters older entries**

```python
def test_changelog_before_cursor():
    """The before param filters to snapshots before the given date."""
    snapshots = [
        {"snapshot_date": "2026-04-02", "album_ids": ["a1", "a2"], "total": 2},
        {"snapshot_date": "2026-04-01", "album_ids": ["a1"], "total": 1},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            # The endpoint adds .lt("snapshot_date", before) before .order/.limit
            mock_table.select.return_value.lt.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=snapshots
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": ALBUM_CACHE}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/changelog", params={"before": "2026-04-05"})
        assert res.status_code == 200
        data = res.json()
        assert len(data["entries"]) == 1
        # Verify .lt was called on the query chain
        db.table.return_value.select.return_value.lt.assert_called()
    finally:
        clear_overrides()
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_digest.py::test_changelog_before_cursor -v
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/tests/test_digest.py
git commit -m "Add changelog edge case tests: empty, removals, no-change skip, cursor"
```

---

## Chunk 2: Frontend — Changelog tab in DigestPanel

### Task 3: Test and implement tab switcher in DigestPanel

**Files:**
- Modify: `frontend/src/components/DigestPanel.test.jsx`
- Modify: `frontend/src/components/DigestPanel.jsx`

- [ ] **Step 1: Write failing test — tab switcher renders with Digest and Changelog tabs**

Add to `frontend/src/components/DigestPanel.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DigestPanel from './DigestPanel'

// Mock apiFetch
vi.mock('../api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ added: [], removed: [], listened: [], period: { start: '2026-04-09', end: '2026-04-16' } }) })),
}))

describe('DigestPanel tabs', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onPlay: vi.fn(),
    session: { access_token: 'test' },
  }

  it('renders Digest and Changelog tabs', () => {
    render(<DigestPanel {...defaultProps} />)
    expect(screen.getByRole('tab', { name: /digest/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /changelog/i })).toBeInTheDocument()
  })

  it('shows Digest tab content by default', () => {
    render(<DigestPanel {...defaultProps} />)
    // Date inputs are part of the digest view
    expect(screen.getAllByRole('textbox').length || screen.getAllByDisplayValue(/2026/).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/DigestPanel.test.jsx
```

Expected: FAIL — no tab elements exist yet.

- [ ] **Step 3: Add tab switcher to DigestPanel**

Modify `frontend/src/components/DigestPanel.jsx`. Add state for `activeTab` and render a tab bar between the header and content:

```jsx
// At the top of the DigestPanel component, add:
const [activeTab, setActiveTab] = useState('digest') // 'digest' | 'changelog'

// After the header div and before the date range picker div, add:
<div className="flex border-b border-border flex-shrink-0" role="tablist">
  <button
    role="tab"
    aria-selected={activeTab === 'digest'}
    onClick={() => setActiveTab('digest')}
    className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${activeTab === 'digest' ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'}`}
  >
    Digest
  </button>
  <button
    role="tab"
    aria-selected={activeTab === 'changelog'}
    onClick={() => setActiveTab('changelog')}
    className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${activeTab === 'changelog' ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'}`}
  >
    Changelog
  </button>
</div>

// Wrap the existing date range picker + content in a conditional:
{activeTab === 'digest' && (
  <>
    {/* existing date range picker */}
    {/* existing content div */}
  </>
)}
{activeTab === 'changelog' && (
  <div className="flex-1 overflow-y-auto py-2">
    <div className="px-4 py-6 text-text-dim text-sm italic">Changelog coming soon</div>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/DigestPanel.test.jsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DigestPanel.jsx frontend/src/components/DigestPanel.test.jsx
git commit -m "Add Digest/Changelog tab switcher to DigestPanel"
```

---

### Task 4: Test and implement changelog tab content

**Files:**
- Modify: `frontend/src/components/DigestPanel.test.jsx`
- Modify: `frontend/src/components/DigestPanel.jsx`

- [ ] **Step 1: Write failing test — changelog tab fetches and renders entries**

```jsx
import { apiFetch } from '../api'

describe('Changelog tab', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onPlay: vi.fn(),
    session: { access_token: 'test' },
  }

  it('fetches and renders changelog entries when tab is selected', async () => {
    apiFetch.mockImplementation((url) => {
      if (url.startsWith('/digest/changelog')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entries: [
              {
                date: '2026-04-15',
                added: [{ service_id: 'a1', name: 'New Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' }],
                removed: [],
              },
              {
                date: '2026-04-14',
                added: [],
                removed: [{ service_id: 'a2', name: 'Old Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' }],
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
        })
      }
      // Default digest response
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ added: [], removed: [], listened: [], period: { start: '2026-04-09', end: '2026-04-16' } }),
      })
    })

    render(<DigestPanel {...defaultProps} />)

    // Switch to changelog tab
    fireEvent.click(screen.getByRole('tab', { name: /changelog/i }))

    // Wait for entries to render
    expect(await screen.findByText('New Album')).toBeInTheDocument()
    expect(screen.getByText('Old Album')).toBeInTheDocument()
    expect(screen.getByText('2026-04-15')).toBeInTheDocument()
    expect(screen.getByText('2026-04-14')).toBeInTheDocument()
  })

  it('shows Load more button when has_more is true', async () => {
    apiFetch.mockImplementation((url) => {
      if (url.startsWith('/digest/changelog')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            entries: [{ date: '2026-04-15', added: [{ service_id: 'a1', name: 'Album', artists: ['X'], image_url: null }], removed: [] }],
            has_more: true,
            next_cursor: '2026-04-14',
          }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ added: [], removed: [], listened: [], period: { start: '2026-04-09', end: '2026-04-16' } }) })
    })

    render(<DigestPanel {...defaultProps} />)
    fireEvent.click(screen.getByRole('tab', { name: /changelog/i }))
    expect(await screen.findByText(/load more/i)).toBeInTheDocument()
  })

  it('shows empty message when no changelog entries', async () => {
    apiFetch.mockImplementation((url) => {
      if (url.startsWith('/digest/changelog')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ entries: [], has_more: false, next_cursor: null }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ added: [], removed: [], listened: [], period: { start: '2026-04-09', end: '2026-04-16' } }) })
    })

    render(<DigestPanel {...defaultProps} />)
    fireEvent.click(screen.getByRole('tab', { name: /changelog/i }))
    expect(await screen.findByText(/no changes recorded/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/DigestPanel.test.jsx
```

Expected: FAIL — changelog tab shows placeholder, not actual data.

- [ ] **Step 3: Implement changelog tab content in DigestPanel**

Replace the placeholder `{activeTab === 'changelog' && (...)}` block with a `ChangelogTab` inner component:

```jsx
function ChangelogTab({ onPlay, session }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch('/digest/changelog', {}, session)
      .then(res => {
        if (cancelled) return null
        if (!res.ok) throw new Error('Failed to load changelog')
        return res.json()
      })
      .then(json => {
        if (cancelled || !json) return
        setEntries(json.entries)
        setHasMore(json.has_more)
        setNextCursor(json.next_cursor)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  function handleLoadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    apiFetch(`/digest/changelog?before=${nextCursor}`, {}, session)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load more')
        return res.json()
      })
      .then(json => {
        setEntries(prev => [...prev, ...json.entries])
        setHasMore(json.has_more)
        setNextCursor(json.next_cursor)
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }

  if (loading) return <div className="px-4 py-6 text-text-dim text-sm">Loading changelog...</div>
  if (error) return <div className="px-4 py-6 text-[#f88] text-sm">Error: {error}</div>
  if (entries.length === 0) return <div className="px-4 py-6 text-text-dim text-sm italic">No changes recorded yet.</div>

  return (
    <>
      {entries.map((entry, i) => (
        <div key={entry.date + i} className="py-2">
          <div className="px-4 py-1 text-xs font-bold tracking-wider text-text-dim">{entry.date}</div>
          {entry.added.map(album => (
            <div key={album.service_id} onClick={() => onPlay(album.service_id)}
              className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2">
              <span className="text-green-400 text-xs font-bold flex-shrink-0">+</span>
              {album.image_url && <img src={album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{album.name ?? 'Unknown album'}</div>
                <div className="text-xs text-text-dim truncate">{album.artists?.join(', ') ?? 'Unknown artist'}</div>
              </div>
            </div>
          ))}
          {entry.removed.map(album => (
            <div key={album.service_id} onClick={() => onPlay(album.service_id)}
              className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2"
              style={{ opacity: 0.5 }}>
              <span className="text-red-400 text-xs font-bold flex-shrink-0">&minus;</span>
              {album.image_url && <img src={album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{album.name ?? 'Unknown album'}</div>
                <div className="text-xs text-text-dim truncate">{album.artists?.join(', ') ?? 'Unknown artist'}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {hasMore && (
        <button onClick={handleLoadMore} disabled={loadingMore}
          className="w-full py-3 text-xs text-text-dim hover:text-text transition-colors duration-150 disabled:opacity-50">
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </>
  )
}
```

In the DigestPanel JSX, replace the changelog placeholder with:

```jsx
{activeTab === 'changelog' && (
  <div className="flex-1 overflow-y-auto py-2">
    <ChangelogTab onPlay={onPlay} session={session} />
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/DigestPanel.test.jsx
```

Expected: PASS

- [ ] **Step 5: Run all existing DigestPanel tests to verify no regressions**

```bash
cd frontend && npx vitest run src/components/DigestPanel.test.jsx
```

Expected: All tests PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DigestPanel.jsx frontend/src/components/DigestPanel.test.jsx
git commit -m "Implement changelog tab with dated add/remove entries and pagination"
```

---

## Chunk 3: Full integration verification

### Task 5: Run all tests and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest tests/test_digest.py -v
```

Expected: All tests PASS.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Final commit if any adjustments were needed**

Only if fixes were required. Otherwise skip.
