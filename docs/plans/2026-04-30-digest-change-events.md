# Digest Change Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale daily snapshots with event-based change tracking recorded at sync time.

**Architecture:** New `library_changes` table stores per-sync diffs (added/removed album IDs). `sync-complete` computes diffs against current cache before overwriting. Changelog endpoint reads from `library_changes` and aggregates 30-day window with bounce detection. Snapshot code, cron, and unused `GET /digest` endpoint are removed.

**Tech Stack:** FastAPI, Supabase Postgres, React/Vite, Vitest

---

### Task 1: Create `library_changes` migration

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_library_changes.sql`

- [ ] **Step 1: Generate migration file**

Run from repo root:
```bash
supabase migration new create_library_changes
```

- [ ] **Step 2: Write the migration SQL**

Edit the generated file:
```sql
CREATE TABLE public.library_changes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    changed_at timestamptz NOT NULL DEFAULT now(),
    added_ids text[] NOT NULL DEFAULT '{}',
    removed_ids text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_library_changes_user_date
    ON public.library_changes (user_id, changed_at DESC);

ALTER TABLE public.library_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own changes"
    ON public.library_changes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own changes"
    ON public.library_changes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 3: Apply migration to prod**

Run:
```bash
supabase db push
```
Or use the Supabase MCP `apply_migration` tool.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: create library_changes table [135]"
```

---

### Task 2: Record changes in `sync-complete`

**Files:**
- Modify: `backend/routers/library.py:141-149` (sync_complete function)
- Test: `backend/tests/test_library.py`

- [ ] **Step 1: Write failing test — changes recorded on sync**

Add to `backend/tests/test_library.py`:
```python
def test_sync_complete_records_library_changes():
    """sync-complete diffs against existing cache and inserts a library_changes row."""
    # Existing cache has albums a1, a2
    db = MagicMock()
    cache_albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
        {"service_id": "a2", "name": "Album 2", "artists": [], "image_url": None},
    ]
    # Mock library_cache select to return existing cache
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": FAKE_USER_ID, "albums": cache_albums, "total": 2, "synced_at": "2026-01-01T00:00:00Z"}])
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
    override_db(db)

    # New sync: a1 stays, a2 removed, a3 added
    new_albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
        {"service_id": "a3", "name": "Album 3", "artists": [], "image_url": None},
    ]

    response = client.post("/library/sync-complete", json={"albums": new_albums})
    assert response.status_code == 200

    # Verify library_changes insert was called
    insert_calls = [
        c for c in db.table.call_args_list if c[0][0] == "library_changes"
    ]
    assert len(insert_calls) >= 1
    # Find the insert call on the library_changes table mock
    # We need to check that insert was called with correct data
    # The table mock is shared, so check call args
    all_calls = db.method_calls
    # Look for the insert call with our expected data
    insert_found = False
    for name, args, kwargs in all_calls:
        if "insert" in name and args:
            data = args[0]
            if isinstance(data, dict) and "added_ids" in data:
                assert set(data["added_ids"]) == {"a3"}
                assert set(data["removed_ids"]) == {"a2"}
                assert data["user_id"] == FAKE_USER_ID
                insert_found = True
    assert insert_found, "Expected library_changes insert with added_ids and removed_ids"

    clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_library.py::test_sync_complete_records_library_changes -xvs`
Expected: FAIL — sync_complete doesn't insert into library_changes yet

- [ ] **Step 3: Write failing test — no changes row when nothing changed**

Add to `backend/tests/test_library.py`:
```python
def test_sync_complete_skips_changes_when_no_diff():
    """sync-complete does NOT insert a library_changes row when album list is identical."""
    db = MagicMock()
    cache_albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
    ]
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": FAKE_USER_ID, "albums": cache_albums, "total": 1, "synced_at": "2026-01-01T00:00:00Z"}])
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    override_db(db)

    response = client.post("/library/sync-complete", json={"albums": cache_albums})
    assert response.status_code == 200

    # Verify library_changes was NOT written to
    table_calls = [c[0][0] for c in db.table.call_args_list]
    assert "library_changes" not in table_calls

    clear_overrides()
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_library.py::test_sync_complete_skips_changes_when_no_diff -xvs`
Expected: FAIL

- [ ] **Step 5: Write failing test — no changes row on first sync (no prior cache)**

Add to `backend/tests/test_library.py`:
```python
def test_sync_complete_skips_changes_on_first_sync():
    """First sync (no prior cache) does NOT insert a library_changes row."""
    db = mock_db_empty()
    override_db(db)

    albums = [
        {"service_id": "a1", "name": "Album 1", "artists": [], "image_url": None},
    ]

    response = client.post("/library/sync-complete", json={"albums": albums})
    assert response.status_code == 200

    # Verify library_changes was NOT written to
    table_calls = [c[0][0] for c in db.table.call_args_list]
    assert "library_changes" not in table_calls

    clear_overrides()
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_library.py::test_sync_complete_skips_changes_on_first_sync -xvs`
Expected: FAIL

- [ ] **Step 7: Implement change recording in sync_complete**

Edit `backend/routers/library.py`. Replace the `sync_complete` function:
```python
@router.post("/sync-complete")
def sync_complete(
    body: SyncCompleteRequest,
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]

    # Read current cache to compute diff
    existing = _get_supabase_cache(db, user_id=user_id)
    if existing and existing.get("albums"):
        old_ids = {a["service_id"] for a in existing["albums"]}
        new_ids = {a["service_id"] for a in body.albums}
        added = list(new_ids - old_ids)
        removed = list(old_ids - new_ids)
        if added or removed:
            db.table("library_changes").insert(
                {
                    "user_id": user_id,
                    "added_ids": added,
                    "removed_ids": removed,
                }
            ).execute()

    _save_supabase_cache(db, body.albums, len(body.albums), user_id)
    return {"total": len(body.albums)}
```

- [ ] **Step 8: Run all three new tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_library.py::test_sync_complete_records_library_changes tests/test_library.py::test_sync_complete_skips_changes_when_no_diff tests/test_library.py::test_sync_complete_skips_changes_on_first_sync -xvs`
Expected: PASS

- [ ] **Step 9: Run full library test suite**

Run: `cd backend && python -m pytest tests/test_library.py -xvs`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "feat: record library changes on sync-complete [135]"
```

---

### Task 3: Rewrite `GET /digest/changelog`

**Files:**
- Modify: `backend/routers/digest.py` (rewrite `get_changelog` function, remove `_find_snapshot`)
- Modify: `backend/tests/test_digest.py` (replace all changelog tests)

- [ ] **Step 1: Delete all existing changelog and snapshot tests**

In `backend/tests/test_digest.py`, delete these test functions entirely:
- `test_changelog_filters_snapshots_by_user_id`
- `test_find_snapshot_filters_by_user_id`
- `test_changelog_returns_entries_from_consecutive_snapshots`
- `test_changelog_empty_when_no_snapshots`
- `test_changelog_empty_when_one_snapshot`
- `test_changelog_includes_removals`
- `test_changelog_skips_unchanged_pairs`
- `test_changelog_before_cursor`
- `test_snapshot_creates_row`
- `test_snapshot_returns_503_when_cache_empty`
- `test_snapshot_rejects_bad_secret`
- `test_snapshot_rejects_missing_secret`
- `test_digest_returns_added_and_removed`
- `test_digest_returns_listened_with_play_counts`
- `test_digest_404_when_no_snapshots`
- `test_digest_requires_start_and_end`
- `test_ensure_snapshot_creates_when_none_exists`
- `test_ensure_snapshot_skips_when_already_exists`
- `test_ensure_snapshot_returns_503_when_cache_empty`

Also remove the `ALBUM_CACHE` constant and the `os` and `patch` imports if no longer used.

- [ ] **Step 2: Write failing test — changelog returns events with types**

Add to `backend/tests/test_digest.py`:
```python
from datetime import datetime, timedelta, timezone


def test_changelog_returns_added_events():
    """Changelog returns added albums from library_changes in the last 30 days."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=1)).isoformat(),
            "added_ids": ["a1"],
            "removed_ids": [],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        events = data["events"]
        assert len(events) == 1
        assert events[0]["type"] == "added"
        assert events[0]["album"]["service_id"] == "a1"
        assert "changed_at" in events[0]
    finally:
        clear_overrides()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_digest.py::test_changelog_returns_added_events -xvs`
Expected: FAIL — endpoint still uses old snapshot logic

- [ ] **Step 4: Write failing test — removed events**

Add to `backend/tests/test_digest.py`:
```python
def test_changelog_returns_removed_events():
    """Changelog returns removed albums from library_changes."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=2)).isoformat(),
            "added_ids": [],
            "removed_ids": ["a2"],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        events = data["events"]
        assert len(events) == 1
        assert events[0]["type"] == "removed"
        assert events[0]["album"]["service_id"] == "a2"
    finally:
        clear_overrides()
```

- [ ] **Step 5: Write failing test — bounce detection**

Add to `backend/tests/test_digest.py`:
```python
def test_changelog_detects_bounced_albums():
    """Album that appears in both added and removed within 30 days = bounced."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=1)).isoformat(),
            "added_ids": [],
            "removed_ids": ["a1"],
        },
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=5)).isoformat(),
            "added_ids": ["a1"],
            "removed_ids": [],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        events = data["events"]
        assert len(events) == 1
        assert events[0]["type"] == "bounced"
        assert events[0]["album"]["service_id"] == "a1"
        # Positioned at the most recent event (the removal, 1 day ago)
        assert events[0]["changed_at"] == (now - timedelta(days=1)).isoformat()
    finally:
        clear_overrides()
```

- [ ] **Step 6: Write failing test — empty when no changes**

Add to `backend/tests/test_digest.py`:
```python
def test_changelog_empty_when_no_changes():
    """No library_changes rows returns empty events list."""
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
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
        assert data["events"] == []
    finally:
        clear_overrides()
```

- [ ] **Step 7: Write failing test — events sorted by most recent first**

Add to `backend/tests/test_digest.py`:
```python
def test_changelog_events_sorted_most_recent_first():
    """Events are sorted by changed_at descending."""
    now = datetime.now(timezone.utc)
    changes = [
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=1)).isoformat(),
            "added_ids": ["a1"],
            "removed_ids": [],
        },
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=3)).isoformat(),
            "added_ids": ["a2"],
            "removed_ids": [],
        },
        {
            "user_id": FAKE_USER_ID,
            "changed_at": (now - timedelta(days=2)).isoformat(),
            "added_ids": [],
            "removed_ids": ["a3"],
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_changes":
            mock_table.select.return_value.eq.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
                data=changes
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
        events = res.json()["events"]
        assert len(events) == 3
        assert events[0]["album"]["service_id"] == "a1"
        assert events[1]["album"]["service_id"] == "a3"
        assert events[2]["album"]["service_id"] == "a2"
    finally:
        clear_overrides()
```

- [ ] **Step 8: Run all new changelog tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_digest.py -k "changelog" -xvs`
Expected: FAIL

- [ ] **Step 9: Implement the new `get_changelog` endpoint**

In `backend/routers/digest.py`, replace the `get_changelog` function and remove `_find_snapshot`:

Delete `_find_snapshot` function (lines 25-35).

Replace `get_changelog` with:
```python
@router.get("/changelog")
def get_changelog(
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()

    rows = (
        db.table("library_changes")
        .select("changed_at, added_ids, removed_ids")
        .eq("user_id", user["user_id"])
        .gte("changed_at", thirty_days_ago)
        .order("changed_at", desc=True)
        .execute()
    ).data

    if not rows:
        return {"events": []}

    # Collect all album appearances with timestamps
    added_albums = {}  # album_id -> latest changed_at
    removed_albums = {}  # album_id -> latest changed_at
    for row in rows:
        for aid in row["added_ids"]:
            if aid not in added_albums:
                added_albums[aid] = row["changed_at"]
        for aid in row["removed_ids"]:
            if aid not in removed_albums:
                removed_albums[aid] = row["changed_at"]

    # Detect bounces (in both sets)
    bounced_ids = set(added_albums) & set(removed_albums)

    # Build events list
    raw_events = []
    for aid in bounced_ids:
        ts = max(added_albums[aid], removed_albums[aid])
        raw_events.append({"album_id": aid, "type": "bounced", "changed_at": ts})
    for aid in set(added_albums) - bounced_ids:
        raw_events.append({"album_id": aid, "type": "added", "changed_at": added_albums[aid]})
    for aid in set(removed_albums) - bounced_ids:
        raw_events.append({"album_id": aid, "type": "removed", "changed_at": removed_albums[aid]})

    # Sort by most recent first
    raw_events.sort(key=lambda e: e["changed_at"], reverse=True)

    # Resolve metadata
    all_ids = [e["album_id"] for e in raw_events]
    album_cache = get_album_cache(db, user_id=user["user_id"])
    metadata = _resolve_album_metadata(all_ids, album_cache, sp)
    meta_lookup = {m["service_id"]: m for m in metadata}

    events = []
    for e in raw_events:
        album_meta = meta_lookup.get(e["album_id"])
        if album_meta:
            events.append({
                "type": e["type"],
                "album": _flatten_album_artists(album_meta),
                "changed_at": e["changed_at"],
            })

    return {"events": events}
```

Add `timedelta` to the existing `datetime` import at the top of the file:
```python
from datetime import date, datetime, timedelta
```

- [ ] **Step 10: Run all new changelog tests**

Run: `cd backend && python -m pytest tests/test_digest.py -k "changelog" -xvs`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
git add backend/routers/digest.py backend/tests/test_digest.py
git commit -m "feat: rewrite changelog to use library_changes events [135]"
```

---

### Task 4: Remove dead snapshot code and endpoints

**Files:**
- Modify: `backend/routers/digest.py` (remove snapshot/ensure-snapshot/digest endpoints)
- Modify: `backend/tests/test_digest.py` (remove dead test imports if needed)
- Modify: `vercel.json` (remove cron)
- Modify: `frontend/src/App.jsx` (remove ensure-snapshot useEffect)
- Modify: `frontend/src/App.test.jsx` (remove ensure-snapshot mock)
- Modify: `frontend/src/App.mobile-layout.test.jsx` (remove ensure-snapshot mock)

- [ ] **Step 1: Remove backend snapshot endpoints**

In `backend/routers/digest.py`, delete these functions entirely:
- `get_digest` (the `@router.get("")` endpoint)
- `create_snapshot` (the `@router.post("/snapshot")` endpoint)
- `ensure_snapshot` (the `@router.post("/ensure-snapshot")` endpoint)

Remove the `os` import if no longer used (was only needed for `CRON_SECRET`).
Remove the `from db import get_db` import if no longer used.
Remove the `Header` import from fastapi if no longer used.

- [ ] **Step 2: Remove cron from vercel.json**

In `vercel.json`, remove the `crons` line:
```json
"crons": [{ "path": "/api/digest/snapshot", "schedule": "0 6 * * *" }],
```

- [ ] **Step 3: Remove ensure-snapshot useEffect from App.jsx**

In `frontend/src/App.jsx`, delete lines 262-268:
```javascript
  // Fire-and-forget: ensure a library snapshot exists for today once the user
  // is authenticated (indicated by albums being loaded and no loading state).
  useEffect(() => {
    if (!albumsLoading && albums.length > 0) {
      apiFetch('/digest/ensure-snapshot', { method: 'POST' }, sessionRef.current).catch(() => {})
    }
  }, [albumsLoading, albums.length])
```

- [ ] **Step 4: Remove ensure-snapshot mock from App.test.jsx**

In `frontend/src/App.test.jsx`, remove the lines:
```javascript
      if (url.includes('/digest/ensure-snapshot')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
```

- [ ] **Step 5: Remove ensure-snapshot mock from App.mobile-layout.test.jsx**

In `frontend/src/App.mobile-layout.test.jsx`, remove the lines:
```javascript
    if (url.includes('/digest/ensure-snapshot')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
```

- [ ] **Step 6: Run backend tests**

Run: `cd backend && python -m pytest -x`
Expected: All pass

- [ ] **Step 7: Run frontend tests**

Run: `cd frontend && npm test -- --run`
Expected: All pass

- [ ] **Step 8: Lint**

Run: `cd backend && ruff check .`
Expected: Clean

- [ ] **Step 9: Commit**

```bash
git add backend/routers/digest.py backend/tests/test_digest.py vercel.json frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/App.mobile-layout.test.jsx
git commit -m "chore: remove snapshot cron, ensure-snapshot, and unused GET /digest [135]"
```

---

### Task 5: Update `ChangesSection` frontend

**Files:**
- Modify: `frontend/src/components/DigestView.jsx` (rewrite ChangesSection)
- Modify: `frontend/src/components/DigestView.test.jsx` (update tests)

- [ ] **Step 1: Write failing test — renders event types**

Replace the `renders change entries` test in `frontend/src/components/DigestView.test.jsx`. First update the `changelogData` mock at the top of the file:

```javascript
const changelogData = {
  events: [
    { type: 'added', album: { service_id: 'a1', name: 'New Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' }, changed_at: '2026-04-29T10:00:00Z' },
    { type: 'removed', album: { service_id: 'a2', name: 'Old Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' }, changed_at: '2026-04-28T10:00:00Z' },
    { type: 'bounced', album: { service_id: 'a3', name: 'Tried Album', artists: ['Artist C'], image_url: 'https://img/3.jpg' }, changed_at: '2026-04-27T10:00:00Z' },
  ],
}
```

Replace the `renders change entries` test:
```javascript
  it('renders change events with type badges', async () => {
    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument()
      expect(screen.getByText('Old Album')).toBeInTheDocument()
      expect(screen.getByText('Tried Album')).toBeInTheDocument()
      // Check badges
      expect(screen.getByText('+')).toBeInTheDocument()
      expect(screen.getByText('\u2212')).toBeInTheDocument()  // minus sign
      expect(screen.getByText('\u2195')).toBeInTheDocument()  // up-down arrow
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run DigestView`
Expected: FAIL — ChangesSection still renders old format

- [ ] **Step 3: Rewrite ChangesSection**

In `frontend/src/components/DigestView.jsx`, replace the `ChangesSection` function:

```javascript
function ChangesSection({ onPlay, session }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch('/digest/changelog', {}, session)
      .then(res => {
        if (cancelled) return null
        if (!res.ok) throw new Error('Failed to load changes')
        return res.json()
      })
      .then(json => {
        if (cancelled || !json) return
        setEvents(json.events)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="px-4 py-6 text-text-dim text-sm">Loading changes...</div>
  if (error) return <div className="px-4 py-6 text-[#f88] text-sm">Error: {error}</div>
  if (events.length === 0) return <div className="px-4 py-6 text-text-dim text-sm italic">No changes recorded yet.</div>

  const badgeMap = {
    added: { symbol: '+', color: 'text-green-400' },
    removed: { symbol: '\u2212', color: 'text-red-400' },
    bounced: { symbol: '\u2195', color: 'text-amber-400' },
  }

  return (
    <div>
      {events.map(event => {
        const badge = badgeMap[event.type] || badgeMap.added
        const dimStyle = event.type === 'removed' ? { opacity: 0.5 } : {}
        return (
          <div key={event.album.service_id} onClick={() => onPlay(event.album.service_id)}
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2"
            style={dimStyle}>
            <span className={`${badge.color} text-xs font-bold flex-shrink-0`}>{badge.symbol}</span>
            {event.album.image_url && <img src={event.album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text truncate">{event.album.name ?? 'Unknown album'}</div>
              <div className="text-xs text-text-dim truncate">{event.album.artists?.join(', ') ?? 'Unknown artist'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm test -- --run DigestView`
Expected: All PASS

- [ ] **Step 5: Run full frontend test suite**

Run: `cd frontend && npm test -- --run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DigestView.jsx frontend/src/components/DigestView.test.jsx
git commit -m "feat: rewrite ChangesSection as flat event feed with bounce badges [135]"
```

---

### Task 6: Backfill `library_changes` from existing snapshots

**Files:**
- Create: `backend/scripts/backfill_changes.py`

- [ ] **Step 1: Write backfill script**

Create `backend/scripts/backfill_changes.py`:
```python
"""Backfill library_changes from existing library_snapshots.

Run once after deploying the library_changes table.
Usage: cd backend && python scripts/backfill_changes.py
"""
import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
db = create_client(url, key)


def backfill():
    # Get all users with snapshots
    users = (
        db.table("library_snapshots")
        .select("user_id")
        .execute()
    ).data
    unique_users = list({r["user_id"] for r in users})
    print(f"Found {len(unique_users)} users with snapshots")

    for user_id in unique_users:
        snapshots = (
            db.table("library_snapshots")
            .select("snapshot_date, album_ids")
            .eq("user_id", user_id)
            .order("snapshot_date", desc=False)
            .execute()
        ).data

        if len(snapshots) < 2:
            print(f"  User {user_id[:8]}...: {len(snapshots)} snapshot(s), skipping")
            continue

        changes_created = 0
        for i in range(1, len(snapshots)):
            older = set(snapshots[i - 1]["album_ids"])
            newer = set(snapshots[i]["album_ids"])
            added = list(newer - older)
            removed = list(older - newer)
            if added or removed:
                db.table("library_changes").insert(
                    {
                        "user_id": user_id,
                        "changed_at": snapshots[i]["snapshot_date"] + "T06:00:00+00:00",
                        "added_ids": added,
                        "removed_ids": removed,
                    }
                ).execute()
                changes_created += 1

        print(f"  User {user_id[:8]}...: {len(snapshots)} snapshots -> {changes_created} change events")

    print("Backfill complete.")


if __name__ == "__main__":
    backfill()
```

- [ ] **Step 2: Run the backfill**

```bash
cd backend && python scripts/backfill_changes.py
```

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/backfill_changes.py
git commit -m "chore: add backfill script for library_changes from snapshots [135]"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && python -m pytest -x`
Expected: All pass

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npm test -- --run`
Expected: All pass

- [ ] **Step 3: Lint**

Run: `cd backend && ruff check .`
Expected: Clean

- [ ] **Step 4: Verify no remaining snapshot references in code**

Run: `grep -r "library_snapshots\|ensure.snapshot\|_find_snapshot\|/digest/snapshot" backend/routers/ frontend/src/ --include="*.py" --include="*.jsx" --include="*.js"`
Expected: No matches (only in backfill script and migration files)
