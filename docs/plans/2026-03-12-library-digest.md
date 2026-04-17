# Library Update Digest Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a library update digest feature that shows albums added, removed, and listened to over a configurable date range, accessible via a header icon that opens a slide-out panel.

**Architecture:** Daily cron snapshots the full Spotify library into a `library_snapshots` Supabase table. A new `GET /digest` endpoint diffs two snapshots and combines with `play_history` data. A new `DigestPanel` React component renders the results in a slide-out panel.

**Tech Stack:** FastAPI, Supabase (PostgreSQL), React, Vitest, pytest, Railway cron

---

## Chunk 1: Backend — Migration, Snapshot Endpoint, Digest Endpoint

### Task 1: Database migration for `library_snapshots`

**Files:**
- Create: `backend/migrations/004_library_snapshots.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
create table if not exists library_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date unique not null,
  album_ids text[] not null default '{}',
  total integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_library_snapshots_date
  on library_snapshots (snapshot_date desc);
```

- [ ] **Step 2: Add `CRON_SECRET` to `.env.example`**

Add to `backend/.env.example`:
```
# Secret for authenticating cron job requests (e.g. POST /digest/snapshot)
CRON_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/004_library_snapshots.sql backend/.env.example
git commit -m "Add library_snapshots migration and CRON_SECRET env var"
```

---

### Task 2: Extract `_fetch_all_albums` to shared utility

**Files:**
- Create: `backend/spotify_helpers.py`
- Modify: `backend/routers/library.py`

The `_fetch_all_albums` function in `routers/library.py:73-87` is needed by both the library router and the new digest router. Extract it to a shared module.

- [ ] **Step 1: Create `backend/spotify_helpers.py`**

```python
import spotipy


def fetch_all_albums(sp: spotipy.Spotify):
    """Fetch all saved albums from Spotify, handling pagination.

    Returns (items, total) where items is a list of raw Spotify album objects
    and total is the user's total saved album count.
    """
    all_items = []
    total = None
    offset = 0
    limit = 50

    while total is None or offset < total:
        result = sp.current_user_saved_albums(limit=limit, offset=offset)
        total = result["total"]
        all_items.extend(result["items"])
        offset += len(result["items"])
        if not result["next"]:
            break

    return all_items, total
```

- [ ] **Step 2: Update `routers/library.py` to import from `spotify_helpers`**

Delete the `_fetch_all_albums` function definition and add this import near the top of the file:

```python
from spotify_helpers import fetch_all_albums
```

Then replace all occurrences of `_fetch_all_albums` with `fetch_all_albums` throughout the file (there are two call sites: one in `_background_spotify_sync` and one in `get_albums`).

- [ ] **Step 3: Run existing library tests to confirm no regression**

Run: `cd backend && python -m pytest tests/test_library.py -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/spotify_helpers.py backend/routers/library.py
git commit -m "Extract fetch_all_albums to shared spotify_helpers module"
```

---

### Task 3: `POST /digest/snapshot` endpoint + tests

**Files:**
- Create: `backend/routers/digest.py`
- Create: `backend/tests/test_digest.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests for `POST /digest/snapshot`**

Create `backend/tests/test_digest.py`:

```python
import os
from datetime import date
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from db import get_db
from spotify_client import get_spotify

client = TestClient(app)


def mock_db():
    db = MagicMock()
    return db


def mock_spotify():
    return MagicMock()


def setup_overrides(db=None, sp=None):
    app.dependency_overrides[get_db] = lambda: (db or mock_db())
    app.dependency_overrides[get_spotify] = lambda: (sp or mock_spotify())


def clear_overrides():
    app.dependency_overrides.clear()


# --- POST /digest/snapshot ---

@patch.dict(os.environ, {"CRON_SECRET": "test-secret"})
@patch("routers.digest.fetch_all_albums")
def test_snapshot_creates_row(mock_fetch):
    mock_fetch.return_value = (
        [
            {"album": {"id": "a1", "name": "Album1", "artists": [], "images": []}},
            {"album": {"id": "a2", "name": "Album2", "artists": [], "images": []}},
        ],
        2,
    )
    db = mock_db()
    sp = mock_spotify()
    setup_overrides(db=db, sp=sp)
    try:
        res = client.post(
            "/digest/snapshot",
            headers={"X-Cron-Secret": "test-secret"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 2
        assert data["snapshot_date"] == str(date.today())
        db.table.assert_called_with("library_snapshots")
        upsert_call = db.table.return_value.upsert.call_args[0][0]
        assert set(upsert_call["album_ids"]) == {"a1", "a2"}
        assert upsert_call["total"] == 2
    finally:
        clear_overrides()


@patch.dict(os.environ, {"CRON_SECRET": "test-secret"})
def test_snapshot_rejects_bad_secret():
    setup_overrides()
    try:
        res = client.post(
            "/digest/snapshot",
            headers={"X-Cron-Secret": "wrong"},
        )
        assert res.status_code == 403
    finally:
        clear_overrides()


@patch.dict(os.environ, {"CRON_SECRET": "test-secret"})
def test_snapshot_rejects_missing_secret():
    setup_overrides()
    try:
        res = client.post("/digest/snapshot")
        assert res.status_code == 403
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_digest.py -v`
Expected: FAIL (module `routers.digest` does not exist)

- [ ] **Step 3: Implement `POST /digest/snapshot`**

Create `backend/routers/digest.py`:

```python
import os
from datetime import date

import spotipy
from fastapi import APIRouter, Depends, Header, HTTPException
from supabase import Client

from db import get_db
from spotify_helpers import fetch_all_albums
from spotify_client import get_spotify

router = APIRouter(prefix="/digest", tags=["digest"])


@router.post("/snapshot")
def create_snapshot(
    db: Client = Depends(get_db),
    sp: spotipy.Spotify = Depends(get_spotify),
    x_cron_secret: str | None = Header(default=None),
):
    expected = os.getenv("CRON_SECRET", "")
    if not expected or x_cron_secret != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    all_items, total = fetch_all_albums(sp)
    album_ids = [item["album"]["id"] for item in all_items]
    today = date.today()

    db.table("library_snapshots").upsert(
        {
            "snapshot_date": str(today),
            "album_ids": album_ids,
            "total": total,
        },
        on_conflict="snapshot_date",
    ).execute()

    return {"snapshot_date": str(today), "total": total}
```

- [ ] **Step 4: Register the router in `main.py`**

Add to imports in `backend/main.py`:
```python
from routers import auth, digest, home, library, metadata, playback
```

Add after the other `include_router` calls:
```python
app.include_router(digest.router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_digest.py -v`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/digest.py backend/tests/test_digest.py backend/main.py
git commit -m "Add POST /digest/snapshot endpoint with cron auth"
```

---

### Task 4: `GET /digest` endpoint + tests

**Files:**
- Modify: `backend/routers/digest.py`
- Modify: `backend/tests/test_digest.py`

- [ ] **Step 1: Write failing tests for `GET /digest`**

Append to `backend/tests/test_digest.py`:

```python
from datetime import datetime, timedelta, timezone


ALBUM_CACHE = [
    {"spotify_id": "a1", "name": "Album One", "artists": ["Artist A"], "image_url": "https://img/1.jpg"},
    {"spotify_id": "a2", "name": "Album Two", "artists": ["Artist B"], "image_url": "https://img/2.jpg"},
    {"spotify_id": "a3", "name": "Album Three", "artists": ["Artist C"], "image_url": "https://img/3.jpg"},
]


def test_digest_returns_added_and_removed():
    start_snapshot = {"snapshot_date": "2026-03-01", "album_ids": ["a1", "a2"], "total": 2}
    end_snapshot = {"snapshot_date": "2026-03-08", "album_ids": ["a1", "a3"], "total": 2}

    # The DB mock returns the single matching snapshot per query.
    # We need two separate calls for start and end snapshots.
    db = MagicMock()
    call_count = {"n": 0}

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            snapshot = end_snapshot if call_count["n"] > 0 else start_snapshot
            call_count["n"] += 1
            mock_table.select.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[snapshot]
            )
        elif table_name == "play_history":
            mock_table.select.return_value.gte.return_value.lte.return_value.execute.return_value = MagicMock(
                data=[]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{"albums": ALBUM_CACHE}]
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest", params={"start": "2026-03-01", "end": "2026-03-08"})
        assert res.status_code == 200
        data = res.json()
        added_ids = [a["spotify_id"] for a in data["added"]]
        removed_ids = [a["spotify_id"] for a in data["removed"]]
        assert "a3" in added_ids
        assert "a2" in removed_ids
        assert "a1" not in added_ids
        assert "a1" not in removed_ids
    finally:
        clear_overrides()


def test_digest_returns_listened_with_play_counts():
    snapshot = {"snapshot_date": "2026-03-01", "album_ids": ["a1"], "total": 1}
    plays = [
        {"album_id": "a1", "played_at": "2026-03-02T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-03-03T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-03-04T10:00:00+00:00"},
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[snapshot]
            )
        elif table_name == "play_history":
            mock_table.select.return_value.gte.return_value.lte.return_value.execute.return_value = MagicMock(
                data=plays
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{"albums": ALBUM_CACHE}]
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest", params={"start": "2026-03-01", "end": "2026-03-08"})
        assert res.status_code == 200
        data = res.json()
        listened = data["listened"]
        assert len(listened) == 1
        assert listened[0]["spotify_id"] == "a1"
        assert listened[0]["play_count"] == 3
    finally:
        clear_overrides()


def test_digest_404_when_no_snapshots():
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "library_snapshots":
            mock_table.select.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[]
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[]
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest", params={"start": "2026-03-01", "end": "2026-03-08"})
        assert res.status_code == 404
    finally:
        clear_overrides()


def test_digest_requires_start_and_end():
    setup_overrides()
    try:
        res = client.get("/digest")
        assert res.status_code == 422
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd backend && python -m pytest tests/test_digest.py -v`
Expected: The 3 snapshot tests PASS, the 4 new digest tests FAIL

- [ ] **Step 3: Implement `GET /digest`**

Add to `backend/routers/digest.py`:

```python
from collections import Counter

from routers.library import get_album_cache


def _find_snapshot(db: Client, target_date: str):
    """Find the snapshot with the greatest date <= target_date (floor strategy)."""
    result = (
        db.table("library_snapshots")
        .select("*")
        .lte("snapshot_date", target_date)
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _resolve_album_metadata(album_ids: list[str], album_cache: list[dict], sp: spotipy.Spotify):
    """Resolve metadata for album IDs. Uses cache first, then Spotify API fallback."""
    lookup = {a["spotify_id"]: a for a in album_cache}
    resolved = []
    for aid in album_ids:
        if aid in lookup:
            a = lookup[aid]
            resolved.append({
                "spotify_id": aid,
                "name": a["name"],
                "artists": a["artists"],
                "image_url": a.get("image_url"),
            })
        else:
            try:
                album = sp.album(aid)
                images = album.get("images", [])
                largest = max(images, key=lambda i: i.get("height", 0), default=None)
                resolved.append({
                    "spotify_id": aid,
                    "name": album["name"],
                    "artists": [a["name"] for a in album.get("artists", [])],
                    "image_url": largest["url"] if largest else None,
                })
            except Exception:
                resolved.append({
                    "spotify_id": aid,
                    "name": None,
                    "artists": None,
                    "image_url": None,
                })
    return resolved


@router.get("")
def get_digest(
    start: date,
    end: date,
    sp: spotipy.Spotify = Depends(get_spotify),
    db: Client = Depends(get_db),
):
    start_str = str(start)
    end_str = str(end)
    start_snap = _find_snapshot(db, start_str)
    end_snap = _find_snapshot(db, end_str)

    if not start_snap or not end_snap:
        raise HTTPException(
            status_code=404,
            detail="No snapshots found for the requested date range. Digests require at least one day of library tracking.",
        )

    start_ids = set(start_snap["album_ids"])
    end_ids = set(end_snap["album_ids"])

    added_ids = list(end_ids - start_ids)
    removed_ids = list(start_ids - end_ids)

    # Play history in the date range
    play_rows = (
        db.table("play_history")
        .select("album_id, played_at")
        .gte("played_at", start_str)
        .lte("played_at", end_str)
        .execute()
    ).data

    play_counts = Counter(row["album_id"] for row in play_rows)
    listened_ids = [aid for aid, _ in play_counts.most_common()]

    album_cache = get_album_cache(db)

    all_ids = set(added_ids) | set(removed_ids) | set(listened_ids)
    metadata = _resolve_album_metadata(list(all_ids), album_cache, sp)
    meta_lookup = {m["spotify_id"]: m for m in metadata}

    def enrich(ids):
        return [meta_lookup[aid] for aid in ids if aid in meta_lookup]

    def enrich_listened(ids):
        result = []
        for aid in ids:
            if aid in meta_lookup:
                entry = {**meta_lookup[aid], "play_count": play_counts[aid]}
                result.append(entry)
        return result

    return {
        "period": {"start": start_str, "end": end_str},
        "added": enrich(added_ids),
        "removed": enrich(removed_ids),
        "listened": enrich_listened(listened_ids),
    }
```

- [ ] **Step 4: Run all digest tests**

Run: `cd backend && python -m pytest tests/test_digest.py -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Run full backend test suite to confirm no regressions**

Run: `cd backend && python -m pytest -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/digest.py backend/tests/test_digest.py
git commit -m "Add GET /digest endpoint with snapshot diffing and play history"
```

---

## Chunk 2: Frontend — DigestPanel Component and App Integration

### Task 5: DigestPanel component + tests

**Files:**
- Create: `frontend/src/components/DigestPanel.jsx`
- Create: `frontend/src/components/DigestPanel.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/DigestPanel.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DigestPanel from './DigestPanel'

const API = 'http://127.0.0.1:8000'

const mockDigestData = {
  period: { start: '2026-03-05', end: '2026-03-12' },
  added: [
    { spotify_id: 'a1', name: 'New Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
  ],
  removed: [
    { spotify_id: 'a2', name: 'Old Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
  ],
  listened: [
    { spotify_id: 'a3', name: 'Played Album', artists: ['Artist C'], image_url: 'https://img/3.jpg', play_count: 5 },
  ],
}

describe('DigestPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete global.fetch
  })

  it('renders loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) // never resolves
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders digest sections after successful fetch', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument()
      expect(screen.getByText('Old Album')).toBeInTheDocument()
      expect(screen.getByText('Played Album')).toBeInTheDocument()
    })
  })

  it('renders error state on fetch failure', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument()
    })
  })

  it('renders no-snapshots state on 404', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }))
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/tracked/i)).toBeInTheDocument()
    })
  })

  it('renders empty sections when no changes', async () => {
    const emptyData = {
      period: { start: '2026-03-05', end: '2026-03-12' },
      added: [],
      removed: [],
      listened: [],
    }
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(emptyData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/no albums added/i)).toBeInTheDocument()
    })
  })

  it('calls onClose when close button clicked', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    const onClose = vi.fn()
    render(<DigestPanel open={true} onClose={onClose} onPlay={() => {}} />)
    await waitFor(() => screen.getByText('New Album'))
    await userEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows play count badge for listened albums', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('re-fetches when date range changes', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => screen.getByText('New Album'))
    const callsBefore = global.fetch.mock.calls.length

    const startInput = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/)[0]
    await userEvent.clear(startInput)
    await userEvent.type(startInput, '2026-01-01')

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/DigestPanel.test.jsx`
Expected: FAIL (DigestPanel module not found)

- [ ] **Step 3: Implement `DigestPanel.jsx`**

Create `frontend/src/components/DigestPanel.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

const PANE_WIDTH = 340

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return { start: formatDate(start), end: formatDate(end) }
}

export default function DigestPanel({ open, onClose, onPlay }) {
  const [range, setRange] = useState(defaultRange)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [noSnapshots, setNoSnapshots] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setNoSnapshots(false)
    setData(null)

    fetch(`${API}/digest?start=${range.start}&end=${range.end}`)
      .then(res => {
        if (cancelled) return null
        if (res.status === 404) {
          setNoSnapshots(true)
          setLoading(false)
          return null
        }
        if (!res.ok) throw new Error('Failed to load digest')
        return res.json()
      })
      .then(json => {
        if (cancelled) return
        if (json) setData(json)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, range.start, range.end])

  const paneStyle = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '80vh',
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
        bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
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

  return (
    <aside
      role="complementary"
      aria-label="Library digest"
      aria-hidden={open ? undefined : 'true'}
      style={paneStyle}
    >
      {isMobile && (
        <div style={{
          width: '36px', height: '4px', background: 'var(--border)',
          borderRadius: '2px', margin: '10px auto 4px', flexShrink: 0,
        }} />
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--text-dim)',
        }}>Library Digest</span>
        <button
          aria-label="Close digest"
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', padding: '4px 6px', borderRadius: '4px',
            fontSize: '16px', lineHeight: 1,
          }}
        >✕</button>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text-dim)' }}>
          <input
            type="date"
            value={range.start}
            onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
            style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 6px', fontSize: '12px' }}
          />
          <span>to</span>
          <input
            type="date"
            value={range.end}
            onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
            style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 6px', fontSize: '12px' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading && (
          <div style={{ padding: '24px 16px', color: 'var(--text-dim)', fontSize: '13px' }}>
            Loading digest...
          </div>
        )}

        {error && (
          <div style={{ padding: '24px 16px', color: '#f88', fontSize: '13px' }}>
            Error: {error}
          </div>
        )}

        {noSnapshots && (
          <div style={{ padding: '24px 16px', color: 'var(--text-dim)', fontSize: '13px', fontStyle: 'italic' }}>
            Digests will appear after your library has been tracked for at least a day.
          </div>
        )}

        {data && (
          <>
            <DigestSection title="Added" albums={data.added} emptyText="No albums added this period" onPlay={onPlay} />
            <DigestSection title="Removed" albums={data.removed} emptyText="No albums removed this period" onPlay={onPlay} muted />
            <DigestSection title="Listened" albums={data.listened} emptyText="No albums played this period" onPlay={onPlay} showPlayCount />
          </>
        )}
      </div>
    </aside>
  )
}

function DigestSection({ title, albums, emptyText, onPlay, muted, showPlayCount }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{
        padding: '4px 16px 8px', fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)',
      }}>
        {title} ({albums.length})
      </div>
      {albums.length === 0 ? (
        <div style={{ padding: '4px 16px 12px', fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
          {emptyText}
        </div>
      ) : (
        albums.map(album => (
          <div
            key={album.spotify_id}
            onClick={() => onPlay(album.spotify_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '6px 16px', cursor: 'pointer',
              opacity: muted ? 0.5 : 1,
            }}
          >
            {album.image_url && (
              <img
                src={album.image_url}
                alt=""
                style={{ width: '36px', height: '36px', borderRadius: '3px', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '13px', fontWeight: 500, color: 'var(--text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {album.name ?? 'Unknown album'}
              </div>
              <div style={{
                fontSize: '11px', color: 'var(--text-dim)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {album.artists?.join(', ') ?? 'Unknown artist'}
              </div>
            </div>
            {showPlayCount && album.play_count != null && (
              <span style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)',
                background: 'var(--border)', borderRadius: '10px',
                padding: '2px 7px', flexShrink: 0,
              }}>
                {album.play_count}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/DigestPanel.test.jsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DigestPanel.jsx frontend/src/components/DigestPanel.test.jsx
git commit -m "Add DigestPanel component with date range picker and three sections"
```

---

### Task 6: Integrate DigestPanel into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx` (if digest integration tests are needed)

- [ ] **Step 1: Add digest state and icon to App.jsx**

**Import:** Add at the top of `App.jsx` with the other component imports:
```jsx
import DigestPanel from './components/DigestPanel'
```

**State:** Add near the other `useState` declarations (next to `const [paneOpen, setPaneOpen]`):
```jsx
const [digestOpen, setDigestOpen] = useState(false)
```

**Header icon:** In the `<nav>` element inside `<header>`, add a digest button after the Collections button:
```jsx
<button
  onClick={() => {
    setDigestOpen(d => {
      if (!d) setPaneOpen(false) // close NowPlaying when opening digest
      return !d
    })
  }}
  aria-label="Library digest"
  style={{ fontSize: '16px', padding: '6px 10px' }}
  title="Library Digest"
>
  &#x1f4cb;
</button>
```

**Mutual exclusion on PlaybackBar:** Find the `onTogglePane` prop on the `<PlaybackBar>` component (currently `onTogglePane={() => setPaneOpen(p => !p)}`). Replace it with:
```jsx
onTogglePane={() => {
  setPaneOpen(p => {
    if (!p) setDigestOpen(false) // close digest when opening NowPlaying
    return !p
  })
}}
```

**Padding adjustment:** Find the `style` prop on the root `<div className="app">` (currently `style={paneOpen && !isMobile ? { paddingRight: '300px' } : {}}`). Replace it with:
```jsx
style={(paneOpen || digestOpen) && !isMobile ? { paddingRight: digestOpen ? '340px' : '300px' } : {}}
```

**DigestPanel component:** Add the `<DigestPanel>` between the `<NowPlayingPane>` and `<PlaybackBar>` components:
```jsx
<DigestPanel
  open={digestOpen}
  onClose={() => setDigestOpen(false)}
  onPlay={handlePlay}
/>
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "Integrate DigestPanel into App with header icon and mutual exclusion"
```

---

### Task 7: Run migration on Supabase

**Files:** None (infrastructure task)

- [ ] **Step 1: Run the migration**

**This is a manual user step.** From the `backend/` directory, with the virtualenv activated:

```bash
python migrate.py migrations/004_library_snapshots.sql
```

Expected: Table `library_snapshots` created successfully.

- [ ] **Step 2: Set `CRON_SECRET` env var**

Add `CRON_SECRET` to the backend's `.env` file locally and on Railway.

- [ ] **Step 3: Smoke test the snapshot endpoint locally**

```bash
curl -X POST http://127.0.0.1:8000/digest/snapshot -H "X-Cron-Secret: <your-secret>"
```

Expected: `{"snapshot_date": "2026-03-12", "total": <number>}`

---

### Task 8: Final integration test and cleanup

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: All tests PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Run backend linter**

Run: `cd backend && ruff check .`
Expected: No errors

- [ ] **Step 4: Run frontend linter**

Run: `cd frontend && npx eslint src/`
Expected: No errors

- [ ] **Step 5: Final commit if any cleanup was needed**
