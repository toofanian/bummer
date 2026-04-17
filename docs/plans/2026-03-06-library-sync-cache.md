# Library Sync Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the album library instantly on app open using a two-layer cache (frontend localStorage + Supabase-backed backend), with a "Syncing..." badge while a background re-sync runs.

**Architecture:** Frontend reads localStorage on load and renders albums immediately, then fires `GET /library/albums` in the background. The backend checks in-memory cache → Supabase table → Spotify API in order, returning stale data with `syncing: true` when falling back to Supabase, and triggering a background task to re-sync from Spotify and update both caches.

**Tech Stack:** FastAPI BackgroundTasks, Supabase (supabase-py), React useState/useEffect, localStorage API

---

### Task 1: DB Migration — create `library_cache` table

**Files:**
- Create: `backend/migrations/003_library_cache.sql`

**Step 1: Write the migration SQL**

Create `backend/migrations/003_library_cache.sql`:

```sql
create table if not exists library_cache (
  id text primary key,
  albums jsonb not null default '[]'::jsonb,
  total integer not null default 0,
  synced_at timestamptz not null default now()
);
```

**Step 2: Run the migration**

```bash
cd backend
source .venv/bin/activate
python migrate.py migrations/003_library_cache.sql
```

Expected output: `✓ Migration applied: migrations/003_library_cache.sql`

**Step 3: Commit**

```bash
git checkout -b feat/library-sync-cache
git add backend/migrations/003_library_cache.sql
git commit -m "feat: add library_cache table migration"
```

---

### Task 2: Backend — Supabase cache helpers + tests

**Files:**
- Modify: `backend/routers/library.py`
- Modify: `backend/tests/test_library.py`

**Step 1: Write failing tests for the Supabase cache helpers**

Add to `backend/tests/test_library.py`:

```python
from unittest.mock import MagicMock, patch
from db import get_db

# Add these helpers near the top of the file (after existing helpers):

def mock_db_with_cache(albums_data, total):
    """Return a mock Supabase client that has a warm library_cache row."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "albums", "albums": albums_data, "total": total, "synced_at": "2026-01-01T00:00:00Z"}]
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    return db


def mock_db_empty():
    """Return a mock Supabase client with no library_cache row (cold Supabase)."""
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    return db


def override_db(db):
    app.dependency_overrides[get_db] = lambda: db
```

Now add the actual test cases:

```python
def test_get_supabase_cache_returns_row_when_present():
    from routers.library import _get_supabase_cache
    db = mock_db_with_cache([{"spotify_id": "abc"}], 1)
    result = _get_supabase_cache(db)
    assert result is not None
    assert result["total"] == 1
    assert result["albums"] == [{"spotify_id": "abc"}]


def test_get_supabase_cache_returns_none_when_absent():
    from routers.library import _get_supabase_cache
    db = mock_db_empty()
    result = _get_supabase_cache(db)
    assert result is None


def test_save_supabase_cache_calls_upsert():
    from routers.library import _save_supabase_cache
    db = mock_db_empty()
    albums = [{"spotify_id": "abc", "name": "Test"}]
    _save_supabase_cache(db, albums, 1)
    db.table.assert_called_with("library_cache")
    db.table.return_value.upsert.assert_called_once()
    call_args = db.table.return_value.upsert.call_args[0][0]
    assert call_args["id"] == "albums"
    assert call_args["albums"] == albums
    assert call_args["total"] == 1
```

**Step 2: Run tests to confirm they fail**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_library.py::test_get_supabase_cache_returns_row_when_present tests/test_library.py::test_get_supabase_cache_returns_none_when_absent tests/test_library.py::test_save_supabase_cache_calls_upsert -v
```

Expected: `ImportError` or `AttributeError` — functions don't exist yet.

**Step 3: Add helpers to `backend/routers/library.py`**

Add the following imports at the top of `library.py`:

```python
from supabase import Client
from fastapi import BackgroundTasks
from db import get_db
```

Add these functions after `clear_cache()`:

```python
SUPABASE_CACHE_KEY = "albums"


def _get_supabase_cache(db: Client):
    """Return the cached library_cache row from Supabase, or None if absent."""
    result = (
        db.table("library_cache")
        .select("*")
        .eq("id", SUPABASE_CACHE_KEY)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None


def _save_supabase_cache(db: Client, albums: list, total: int):
    """Upsert the album list into Supabase library_cache."""
    db.table("library_cache").upsert(
        {
            "id": SUPABASE_CACHE_KEY,
            "albums": albums,
            "total": total,
            "synced_at": "now()",
        }
    ).execute()
```

**Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_library.py::test_get_supabase_cache_returns_row_when_present tests/test_library.py::test_get_supabase_cache_returns_none_when_absent tests/test_library.py::test_save_supabase_cache_calls_upsert -v
```

Expected: all 3 PASS.

**Step 5: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "feat: add Supabase cache helpers to library router"
```

---

### Task 3: Backend — Update `get_albums` endpoint for 3-tier cache

**Files:**
- Modify: `backend/routers/library.py`
- Modify: `backend/tests/test_library.py`

**Step 1: Write failing tests for the new endpoint paths**

Add to `backend/tests/test_library.py`:

```python
def test_get_albums_returns_supabase_cache_when_in_memory_cold():
    """When in-memory is cold but Supabase has data, return it immediately."""
    cached_albums = [{"spotify_id": "abc123", "name": "Cached Album", "artists": ["Artist"], "release_date": "2020", "total_tracks": 10, "image_url": None, "added_at": "2021-01-01T00:00:00Z"}]
    db = mock_db_with_cache(cached_albums, 1)
    override_db(db)
    sp = MagicMock()  # Spotify should NOT be called
    override_spotify(sp)

    response = client.get("/library/albums")

    assert response.status_code == 200
    data = response.json()
    assert data["syncing"] is True
    assert len(data["albums"]) == 1
    assert data["albums"][0]["spotify_id"] == "abc123"
    sp.current_user_saved_albums.assert_not_called()

    clear_overrides()


def test_get_albums_returns_syncing_false_on_cold_start():
    """Cold start (no in-memory, no Supabase): fetch from Spotify, syncing=False."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    response = client.get("/library/albums")

    assert response.status_code == 200
    data = response.json()
    assert data["syncing"] is False
    assert len(data["albums"]) == 1
    sp.current_user_saved_albums.assert_called_once()

    clear_overrides()


def test_get_albums_saves_to_supabase_on_cold_start():
    """Cold start should persist fetched albums to Supabase."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    client.get("/library/albums")

    db.table.assert_any_call("library_cache")
    db.table.return_value.upsert.assert_called_once()

    clear_overrides()


def test_get_albums_returns_syncing_false_when_in_memory_fresh():
    """In-memory cache hit: syncing=False, no Supabase/Spotify calls."""
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    client.get("/library/albums")   # warms in-memory
    db.reset_mock()

    response = client.get("/library/albums")  # should hit in-memory only

    assert response.json()["syncing"] is False
    db.table.return_value.select.assert_not_called()
    assert sp.current_user_saved_albums.call_count == 1  # not called again

    clear_overrides()
```

Also update `clear_overrides()` to reset the `get_db` override too — it already does this via `app.dependency_overrides.clear()`, so no change needed there.

Update all **existing** tests that call `GET /library/albums` to add `override_db(mock_db_empty())` before the call. Here are all the tests that need it (add `override_db(mock_db_empty())` at the start of each):
- `test_get_albums_returns_normalized_album_list`
- `test_get_albums_uses_largest_image`
- `test_get_albums_handles_missing_image`
- `test_get_albums_fetches_all_pages`
- `test_get_albums_uses_cache_on_second_request`
- `test_get_albums_refetches_after_cache_expires`
- `test_cache_can_be_invalidated_explicitly`

Example of updated test:

```python
def test_get_albums_returns_normalized_album_list():
    db = mock_db_empty()
    override_db(db)
    sp = make_spotify_mock([{"items": [SAVED_ALBUM], "total": 1, "next": None}])
    override_spotify(sp)

    response = client.get("/library/albums")
    # ... rest of assertions unchanged
    clear_overrides()
```

**Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_library.py -v -k "supabase or syncing or cold_start or saves_to_supabase" 2>&1 | tail -20
```

Expected: multiple failures.

**Step 3: Update `get_albums` in `backend/routers/library.py`**

Replace the existing `get_albums` function and add a background sync helper:

```python
def _background_spotify_sync(sp: spotipy.Spotify, db: Client):
    """Re-sync from Spotify and update both in-memory and Supabase cache."""
    all_items, total = _fetch_all_albums(sp)
    albums = [_normalize_album(item) for item in all_items]
    _cache["albums"] = albums
    _cache["total"] = total
    _cache["fetched_at"] = time.time()
    _save_supabase_cache(db, albums, total)


@router.get("/albums")
def get_albums(
    background_tasks: BackgroundTasks,
    sp: spotipy.Spotify = Depends(get_spotify),
    db: Client = Depends(get_db),
):
    # Tier 1: in-memory cache
    if _is_cache_fresh():
        return {"albums": _cache["albums"], "total": _cache["total"], "syncing": False}

    # Tier 2: Supabase cache
    supabase_row = _get_supabase_cache(db)
    if supabase_row:
        _cache["albums"] = supabase_row["albums"]
        _cache["total"] = supabase_row["total"]
        _cache["fetched_at"] = time.time()
        background_tasks.add_task(_background_spotify_sync, sp, db)
        return {"albums": _cache["albums"], "total": _cache["total"], "syncing": True}

    # Tier 3: cold start — fetch from Spotify
    all_items, total = _fetch_all_albums(sp)
    albums = [_normalize_album(item) for item in all_items]
    _cache["albums"] = albums
    _cache["total"] = total
    _cache["fetched_at"] = time.time()
    _save_supabase_cache(db, albums, total)
    return {"albums": albums, "total": total, "syncing": False}
```

Also update `invalidate_cache` to also clear Supabase:

```python
@router.post("/albums/invalidate-cache")
def invalidate_cache(
    sp: spotipy.Spotify = Depends(get_spotify),
    db: Client = Depends(get_db),
):
    clear_cache()
    db.table("library_cache").delete().eq("id", SUPABASE_CACHE_KEY).execute()
    return {"cache": "cleared"}
```

**Step 4: Run all library tests**

```bash
pytest tests/test_library.py -v 2>&1 | tail -30
```

Expected: all tests PASS (including the existing ones you updated).

**Step 5: Run full backend test suite**

```bash
pytest -v 2>&1 | tail -20
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "feat: add 3-tier library cache (in-memory, Supabase, Spotify) with background sync"
```

---

### Task 4: Frontend — localStorage cache + syncing badge

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

**Step 1: Write failing frontend tests**

Open `frontend/src/App.test.jsx`. Find where `GET /library/albums` is mocked. Add these test cases:

```javascript
// Add localStorage helpers at top of test file:
const CACHE_KEY = 'bsi_albums_cache'

const CACHED_ALBUMS = [
  { spotify_id: 'abc123', name: 'Cached Album', artists: ['Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' }
]

function seedLocalStorageCache(albums = CACHED_ALBUMS) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ albums, total: albums.length, cachedAt: new Date().toISOString() }))
}

function clearLocalStorageCache() {
  localStorage.removeItem(CACHE_KEY)
}
```

Add test cases (place near existing App load tests):

```javascript
it('renders albums immediately from localStorage cache without loading screen', async () => {
  seedLocalStorageCache()
  // Mock the background fetch to return same albums (syncing: false)
  server.use(
    http.get('*/library/albums', () =>
      HttpResponse.json({ albums: CACHED_ALBUMS, total: 1, syncing: false })
    )
  )

  render(<App />)

  // Albums should be visible before the loading screen disappears
  expect(screen.queryByText(/syncing your spotify library/i)).not.toBeInTheDocument()
  expect(await screen.findByText('Cached Album')).toBeInTheDocument()

  clearLocalStorageCache()
})

it('shows syncing badge while background fetch is in progress', async () => {
  seedLocalStorageCache()
  let resolveAlbums
  server.use(
    http.get('*/library/albums', () =>
      new Promise(resolve => { resolveAlbums = resolve })
    )
  )

  render(<App />)

  expect(await screen.findByText(/syncing/i)).toBeInTheDocument()

  resolveAlbums(HttpResponse.json({ albums: CACHED_ALBUMS, total: 1, syncing: false }))
  await waitForElementToBeRemoved(() => screen.queryByText(/syncing/i))

  clearLocalStorageCache()
})

it('hides syncing badge after background fetch completes', async () => {
  seedLocalStorageCache()
  server.use(
    http.get('*/library/albums', () =>
      HttpResponse.json({ albums: CACHED_ALBUMS, total: 1, syncing: false })
    )
  )

  render(<App />)
  await screen.findByText('Cached Album')
  await waitFor(() => expect(screen.queryByText(/syncing/i)).not.toBeInTheDocument())

  clearLocalStorageCache()
})

it('updates localStorage after background fetch completes', async () => {
  seedLocalStorageCache()
  const freshAlbums = [
    ...CACHED_ALBUMS,
    { spotify_id: 'new123', name: 'New Album', artists: ['New Artist'], image_url: null, release_date: '2025', total_tracks: 8, added_at: '2025-01-01T00:00:00Z' }
  ]
  server.use(
    http.get('*/library/albums', () =>
      HttpResponse.json({ albums: freshAlbums, total: 2, syncing: false })
    )
  )

  render(<App />)
  await screen.findByText('New Album')

  const stored = JSON.parse(localStorage.getItem(CACHE_KEY))
  expect(stored.albums).toHaveLength(2)

  clearLocalStorageCache()
})
```

**Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- --run --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗|Error" | tail -20
```

Expected: new tests fail.

**Step 3: Update `App.jsx` — add localStorage cache and syncing state**

At the top of the `App` component, add the new state:

```javascript
const CACHE_KEY = 'bsi_albums_cache'
const [syncing, setSyncing] = useState(false)
```

Replace the `loadData` function body with this new version:

```javascript
const loadData = useCallback(() => {
  setError(null)
  setLoadingMessage('Checking authentication...')
  setCollections([])
  setCollectionAlbums([])
  setAlbumCollectionMap({})

  // Try to load from localStorage immediately
  const cached = (() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) } catch { return null }
  })()

  if (cached?.albums?.length) {
    setAlbums(cached.albums)
    setLoading(false)
    setSyncing(true)
  } else {
    setAlbums([])
    setLoading(true)
  }

  return fetch(`${API}/auth/status`)
    .then(r => r.json())
    .then(({ authenticated }) => {
      if (!authenticated) { window.location.href = `${API}/auth/login`; return }
      if (!cached?.albums?.length) {
        setLoadingMessage('Syncing your Spotify library... this may take a moment')
      }
      return fetch(`${API}/library/albums`)
        .then(r => r.json())
        .then(libraryData => {
          setAlbums(libraryData.albums)
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              albums: libraryData.albums,
              total: libraryData.total,
              cachedAt: new Date().toISOString(),
            }))
          } catch { /* storage full or unavailable */ }
          setSyncing(false)
          setLoadingMessage('Loading collections...')
          return fetch(`${API}/collections`)
            .then(r => r.json())
            .then(collectionsData => {
              setCollections(collectionsData)
              return Promise.all(
                collectionsData.map(col =>
                  fetch(`${API}/collections/${col.id}/albums`)
                    .then(r => r.json())
                    .catch(() => ({ albums: [] }))
                )
              ).then(results => {
                const map = {}
                results.forEach((data, i) => {
                  const colId = collectionsData[i].id
                  ;(data.albums ?? []).forEach(album => {
                    if (!map[album.spotify_id]) map[album.spotify_id] = []
                    map[album.spotify_id].push(colId)
                  })
                })
                setAlbumCollectionMap(map)
              })
            })
        })
    })
    .catch(err => setError(err.message))
    .finally(() => { setLoading(false); setSyncing(false) })
}, [])
```

**Step 4: Add the syncing badge to the Albums nav button**

In the `<nav>` section, update the Albums button:

```jsx
<button className={view === 'library' ? 'active' : ''} onClick={() => { setView('library'); setSearch('') }}>
  Albums {albums.length ? `(${albums.length})` : ''}
  {syncing && <span className="syncing-badge">Syncing</span>}
</button>
```

**Step 5: Add syncing badge styles to `frontend/src/App.css`**

Add at the end of `App.css`:

```css
.syncing-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 10px;
  vertical-align: middle;
  animation: pulse-opacity 1.5s ease-in-out infinite;
}

@keyframes pulse-opacity {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
```

**Step 6: Run frontend tests**

```bash
cd frontend && npm test -- --run 2>&1 | tail -20
```

Expected: all tests PASS.

**Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.css frontend/src/App.test.jsx
git commit -m "feat: show cached albums instantly with background sync indicator

- Read localStorage on load, render immediately, show Syncing badge
- Fire GET /library/albums in background, update state + localStorage when done
- Badge disappears when sync completes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Final verification

**Step 1: Run full test suites**

```bash
cd backend && source .venv/bin/activate && pytest -v 2>&1 | tail -10
cd ../frontend && npm test -- --run 2>&1 | tail -10
```

Expected: all backend tests pass, all frontend tests pass.

**Step 2: Merge to main and push**

```bash
git checkout main
git merge feat/library-sync-cache
git push origin main
```
