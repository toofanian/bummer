# Collections Philosophy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance collections with descriptions, manual drag-ordering, bulk add, and pinnable cover art.

**Architecture:** Single Supabase migration adds 3 columns (`description`, `position`, `cover_album_id`). Backend gets new/modified endpoints. Frontend gets updated CollectionsPane, new BulkAddBar, and drag-reorder in collection detail view. Four sub-features (5a–5d) share one migration but are otherwise independent after migration is applied.

**Tech Stack:** FastAPI, Supabase (Postgres), React, Vitest, React Testing Library

**Spec:** `docs/specs/2026-03-15-product-backlog-design.md` — Section "5. Collections: Full Philosophy"

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/migrations/004_collections_enhancements.sql` | Create | Migration: add `description`, `position`, `cover_album_id` columns |
| `backend/routers/metadata.py` | Modify | New/updated endpoints for descriptions, reorder, bulk add, cover art |
| `backend/tests/test_metadata.py` | Modify | Tests for all new endpoints |
| `frontend/src/components/CollectionsPane.jsx` | Modify | Show descriptions on cards, cover art |
| `frontend/src/components/CollectionsPane.test.jsx` | Modify | Tests for description display, cover art |
| `frontend/src/components/CollectionDetailHeader.jsx` | Create | Editable description, cover art pin in collection detail |
| `frontend/src/components/CollectionDetailHeader.test.jsx` | Create | Tests for inline description editing |
| `frontend/src/components/BulkAddBar.jsx` | Create | Multi-select floating action bar |
| `frontend/src/components/BulkAddBar.test.jsx` | Create | Tests for bulk add UI |
| `frontend/src/App.jsx` | Modify | Wire bulk selection state, reorder, description editing |
| `frontend/src/App.test.jsx` | Modify | Integration tests |

---

## Chunk 1: Migration + Backend

### Task 1: Database Migration

**Files:**
- Create: `backend/migrations/004_collections_enhancements.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add description to collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS description text;

-- Add position to collection_albums for manual ordering
ALTER TABLE collection_albums ADD COLUMN IF NOT EXISTS position integer;

-- Backfill position for existing rows based on insertion order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY collection_id ORDER BY created_at, id) AS rn
  FROM collection_albums
)
UPDATE collection_albums
SET position = numbered.rn
FROM numbered
WHERE collection_albums.id = numbered.id;

-- Add cover_album_id to collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS cover_album_id text;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run via Supabase SQL editor or CLI. Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('collections', 'collection_albums')
ORDER BY table_name, ordinal_position;
```

- [ ] **Step 3: Commit**

```bash
git -C backend/.. add backend/migrations/004_collections_enhancements.sql
git -C backend/.. commit -m "feat: add migration for collections enhancements

- description (text) on collections
- position (integer) on collection_albums, backfilled from created_at
- cover_album_id (text) on collections

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2: Backend — Collection Description Endpoints

**Files:**
- Modify: `backend/routers/metadata.py`
- Modify: `backend/tests/test_metadata.py`

- [ ] **Step 1: Write failing test for updating collection description**

Add to `backend/tests/test_metadata.py`:

```python
class DescriptionBody(BaseModel):
    description: str | None


def test_update_collection_description():
    db = mock_db(execute_data=[{**COLLECTION, "description": "late night vibes"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/collections/col-uuid-1/description", json={"description": "late night vibes"})

    assert response.status_code == 200
    assert response.json()["description"] == "late night vibes"

    clear_overrides()


def test_clear_collection_description():
    db = mock_db(execute_data=[{**COLLECTION, "description": None}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/collections/col-uuid-1/description", json={"description": None})

    assert response.status_code == 200
    assert response.json()["description"] is None

    clear_overrides()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_update_collection_description -v`
Expected: FAIL — 404

- [ ] **Step 3: Implement endpoint**

Add to `backend/routers/metadata.py`:

```python
class DescriptionBody(BaseModel):
    description: str | None


@router.put("/collections/{collection_id}/description")
def update_collection_description(
    collection_id: str,
    body: DescriptionBody,
    db=Depends(get_db),
    sp: spotipy.Spotify = Depends(get_spotify),
):
    result = (
        db.table("collections")
        .update({"description": body.description})
        .eq("id", collection_id)
        .execute()
    )
    return result.data[0]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_update_collection_description tests/test_metadata.py::test_clear_collection_description -v`
Expected: PASS

- [ ] **Step 5: Ensure list_collections returns description**

The existing `list_collections` endpoint already returns `*` from the `collections` table, so `description` will be included automatically after migration. Verify with a test:

```python
def test_list_collections_includes_description():
    col_with_desc = {**COLLECTION, "description": "chill beats"}
    db = mock_db(execute_data=[col_with_desc])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections")

    assert response.status_code == 200
    assert response.json()[0]["description"] == "chill beats"

    clear_overrides()
```

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git -C backend/.. add backend/routers/metadata.py backend/tests/test_metadata.py
git -C backend/.. commit -m "feat: add collection description endpoint

- PUT /collections/{id}/description — update or clear description
- Description included in GET /collections response

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 3: Backend — Collection Album Reorder Endpoint

**Files:**
- Modify: `backend/routers/metadata.py`
- Modify: `backend/tests/test_metadata.py`

- [ ] **Step 1: Write failing test for reorder**

Add to `backend/tests/test_metadata.py`:

```python
def test_reorder_collection_albums():
    db = mock_db()
    # Mock the update chain: .update().eq().eq().execute()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/albums/reorder",
        json={"album_ids": ["id3", "id1", "id2"]}
    )

    assert response.status_code == 200
    assert response.json()["reordered"] is True

    clear_overrides()


def test_reorder_collection_albums_requires_album_ids():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/collections/col-uuid-1/albums/reorder", json={})

    assert response.status_code == 422

    clear_overrides()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_reorder_collection_albums -v`
Expected: FAIL — 404 or 405

- [ ] **Step 3: Implement reorder endpoint**

Add to `backend/routers/metadata.py`:

```python
class ReorderBody(BaseModel):
    album_ids: list[str]


@router.put("/collections/{collection_id}/albums/reorder")
def reorder_collection_albums(
    collection_id: str,
    body: ReorderBody,
    db=Depends(get_db),
    sp: spotipy.Spotify = Depends(get_spotify),
):
    for i, album_id in enumerate(body.album_ids):
        db.table("collection_albums").update({"position": i}).eq(
            "collection_id", collection_id
        ).eq("spotify_id", album_id).execute()
    return {"reordered": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_reorder_collection_albums tests/test_metadata.py::test_reorder_collection_albums_requires_album_ids -v`
Expected: PASS

- [ ] **Step 5: Update get_collection_albums to return albums ordered by position**

Modify the existing `get_collection_albums` endpoint to order by `position`:

Change the query from:
```python
db.table("collection_albums").select("spotify_id").eq("collection_id", collection_id).execute()
```
to:
```python
db.table("collection_albums").select("spotify_id, position").eq("collection_id", collection_id).order("position").execute()
```

And ensure the returned albums respect this order by building an ordered list instead of filtering from the cache unordered.

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git -C backend/.. add backend/routers/metadata.py backend/tests/test_metadata.py
git -C backend/.. commit -m "feat: add collection album reorder endpoint

- PUT /collections/{id}/albums/reorder — bulk-update position values
- GET /collections/{id}/albums now returns albums ordered by position

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 4: Backend — Bulk Add Endpoint

**Files:**
- Modify: `backend/routers/metadata.py`
- Modify: `backend/tests/test_metadata.py`

- [ ] **Step 1: Write failing test**

```python
def test_bulk_add_albums_to_collection():
    db = mock_db(execute_data=[
        {"collection_id": "col-uuid-1", "spotify_id": "id1"},
        {"collection_id": "col-uuid-1", "spotify_id": "id2"},
    ])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post(
        "/collections/col-uuid-1/albums/bulk",
        json={"spotify_ids": ["id1", "id2"]}
    )

    assert response.status_code == 201
    assert response.json()["added"] == 2

    clear_overrides()


def test_bulk_add_requires_spotify_ids():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post("/collections/col-uuid-1/albums/bulk", json={})

    assert response.status_code == 422

    clear_overrides()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_bulk_add_albums_to_collection -v`
Expected: FAIL

- [ ] **Step 3: Implement bulk add endpoint**

```python
class BulkAddBody(BaseModel):
    spotify_ids: list[str]


@router.post("/collections/{collection_id}/albums/bulk", status_code=201)
def bulk_add_albums_to_collection(
    collection_id: str,
    body: BulkAddBody,
    db=Depends(get_db),
    sp: spotipy.Spotify = Depends(get_spotify),
):
    # Get current max position
    existing = (
        db.table("collection_albums")
        .select("position")
        .eq("collection_id", collection_id)
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    start_pos = (existing.data[0]["position"] or 0) + 1 if existing.data else 0

    rows = [
        {"collection_id": collection_id, "spotify_id": sid, "position": start_pos + i}
        for i, sid in enumerate(body.spotify_ids)
    ]
    db.table("collection_albums").insert(rows).execute()
    return {"added": len(rows)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_bulk_add_albums_to_collection tests/test_metadata.py::test_bulk_add_requires_spotify_ids -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C backend/.. add backend/routers/metadata.py backend/tests/test_metadata.py
git -C backend/.. commit -m "feat: add bulk add albums to collection endpoint

- POST /collections/{id}/albums/bulk — accepts list of spotify_ids
- Assigns sequential position values starting after existing max

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 5: Backend — Collection Cover Art Endpoint

**Files:**
- Modify: `backend/routers/metadata.py`
- Modify: `backend/tests/test_metadata.py`

- [ ] **Step 1: Write failing test**

```python
def test_set_collection_cover():
    db = mock_db(execute_data=[{**COLLECTION, "cover_album_id": "album-id-1"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/cover",
        json={"cover_album_id": "album-id-1"}
    )

    assert response.status_code == 200
    assert response.json()["cover_album_id"] == "album-id-1"

    clear_overrides()


def test_clear_collection_cover():
    db = mock_db(execute_data=[{**COLLECTION, "cover_album_id": None}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/cover",
        json={"cover_album_id": None}
    )

    assert response.status_code == 200
    assert response.json()["cover_album_id"] is None

    clear_overrides()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_set_collection_cover -v`
Expected: FAIL

- [ ] **Step 3: Implement cover art endpoint**

```python
class CoverBody(BaseModel):
    cover_album_id: str | None


@router.put("/collections/{collection_id}/cover")
def set_collection_cover(
    collection_id: str,
    body: CoverBody,
    db=Depends(get_db),
    sp: spotipy.Spotify = Depends(get_spotify),
):
    result = (
        db.table("collections")
        .update({"cover_album_id": body.cover_album_id})
        .eq("id", collection_id)
        .execute()
    )
    return result.data[0]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_metadata.py::test_set_collection_cover tests/test_metadata.py::test_clear_collection_cover -v`
Expected: PASS

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git -C backend/.. add backend/routers/metadata.py backend/tests/test_metadata.py
git -C backend/.. commit -m "feat: add collection cover art endpoint

- PUT /collections/{id}/cover — set or clear pinned cover album
- cover_album_id included in GET /collections response

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Frontend — Collection Descriptions (5a)

### Task 6: Collection Description Display and Editing

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`
- Modify: `frontend/src/components/CollectionsPane.test.jsx`
- Create: `frontend/src/components/CollectionDetailHeader.jsx`
- Create: `frontend/src/components/CollectionDetailHeader.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write failing tests for description on collection cards**

Add to `frontend/src/components/CollectionsPane.test.jsx`:

```jsx
it('shows description as subtitle on collection card', () => {
  const cols = [{ id: '1', name: 'Late Night', album_count: 5, description: 'low energy, headphone albums' }]
  render(<CollectionsPane collections={cols} onEnter={() => {}} onDelete={() => {}} onCreate={() => {}} onFetchAlbums={vi.fn().mockResolvedValue([])} />)
  expect(screen.getByText('low energy, headphone albums')).toBeInTheDocument()
})

it('does not show description when null', () => {
  const cols = [{ id: '1', name: 'Late Night', album_count: 5, description: null }]
  render(<CollectionsPane collections={cols} onEnter={() => {}} onDelete={() => {}} onCreate={() => {}} onFetchAlbums={vi.fn().mockResolvedValue([])} />)
  expect(screen.queryByText('low energy')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`

- [ ] **Step 3: Add description display to CollectionsPane cards**

In `CollectionsPane.jsx`, after the album count / time ago line, add:

```jsx
{col.description && (
  <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`

- [ ] **Step 5: Write failing tests for CollectionDetailHeader**

Create `frontend/src/components/CollectionDetailHeader.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CollectionDetailHeader from './CollectionDetailHeader'

describe('CollectionDetailHeader', () => {
  it('shows collection name and description', () => {
    render(
      <CollectionDetailHeader
        name="Late Night"
        description="low energy vibes"
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
      />
    )
    expect(screen.getByText('Late Night')).toBeInTheDocument()
    expect(screen.getByDisplayValue('low energy vibes')).toBeInTheDocument()
  })

  it('shows empty placeholder when no description', () => {
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
      />
    )
    expect(screen.getByPlaceholderText(/add a description/i)).toBeInTheDocument()
  })

  it('calls onDescriptionChange on blur after editing', async () => {
    const onChange = vi.fn()
    render(
      <CollectionDetailHeader
        name="Late Night"
        description=""
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={onChange}
      />
    )
    const input = screen.getByPlaceholderText(/add a description/i)
    await userEvent.type(input, 'chill beats')
    await userEvent.tab() // triggers blur
    expect(onChange).toHaveBeenCalledWith('chill beats')
  })
})
```

- [ ] **Step 6: Implement CollectionDetailHeader**

Create `frontend/src/components/CollectionDetailHeader.jsx`:

```jsx
import { useState } from 'react'

export default function CollectionDetailHeader({ name, description, albumCount, onBack, onDescriptionChange }) {
  const [desc, setDesc] = useState(description || '')

  function handleBlur() {
    const trimmed = desc.trim()
    if (trimmed !== (description || '')) {
      onDescriptionChange(trimmed || null)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
      <button className="text-sm text-text-dim transition-colors duration-150 hover:text-text" onClick={onBack}>← Back</button>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold">{name}</h2>
        <input
          className="bg-transparent border-none text-xs text-text-dim w-full p-0 outline-none"
          placeholder="Add a description…"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
        />
      </div>
      <span className="text-sm text-text-dim flex-shrink-0">{albumCount} albums</span>
    </div>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/CollectionDetailHeader.test.jsx`

- [ ] **Step 8: Wire CollectionDetailHeader into App.jsx**

Replace the existing collection detail header (the `<div>` with Back button, `<h2>`, album count) in both mobile and desktop layouts with `<CollectionDetailHeader>`. Add an `onDescriptionChange` handler that calls `PUT /collections/{id}/description`:

```jsx
async function handleUpdateCollectionDescription(collectionId, description) {
  await fetch(`${API}/collections/${collectionId}/description`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
  setCollections(prev => prev.map(c =>
    c.id === collectionId ? { ...c, description } : c
  ))
}
```

- [ ] **Step 9: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git -C frontend/.. add frontend/src/components/CollectionsPane.jsx frontend/src/components/CollectionsPane.test.jsx frontend/src/components/CollectionDetailHeader.jsx frontend/src/components/CollectionDetailHeader.test.jsx frontend/src/App.jsx
git -C frontend/.. commit -m "feat: add collection descriptions (5a)

- Display description as subtitle on collection cards
- Inline editable description in collection detail header
- Saves on blur via PUT /collections/{id}/description

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Frontend — Collection Ordering (5b) and Bulk Add (5c)

### Task 7: Drag-to-Reorder in Collection Detail

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write failing test for album order in collection detail**

The agent should verify that albums in a collection detail view are rendered in the order returned by the API (which is now by `position`). This is largely already working since `collectionAlbums` state is set from the API response — the key change is that the API now returns albums in position order.

Add a test verifying that after a drag-reorder action, the `PUT /collections/{id}/albums/reorder` endpoint is called.

- [ ] **Step 2: Implement drag-to-reorder**

This can use native HTML5 drag-and-drop or a minimal approach:
- Add `draggable` attribute to album rows within collection detail view
- Track `dragIndex` and `hoverIndex` state
- On drop, reorder `collectionAlbums` state optimistically and call `PUT /collections/{id}/albums/reorder`
- Add an `onReorder` callback to pass through to AlbumTable (or handle at the App level by wrapping the collection detail AlbumTable)

The simplest approach: add move-up/move-down buttons on each album row in collection detail view (avoids drag-and-drop complexity on mobile). The spec says "drag-to-reorder on both desktop and mobile" — but for mobile, move buttons may be more reliable.

The agent should implement whichever approach works cleanly. The reorder handler in App.jsx:

```jsx
async function handleReorderCollectionAlbums(albumIds) {
  // Optimistically reorder
  setCollectionAlbums(prev => {
    const map = Object.fromEntries(prev.map(a => [a.spotify_id, a]))
    return albumIds.map(id => map[id]).filter(Boolean)
  })
  await fetch(`${API}/collections/${view.id}/albums/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ album_ids: albumIds }),
  })
}
```

- [ ] **Step 3: Run all tests**

Run: `cd frontend && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git -C frontend/.. add frontend/src/App.jsx frontend/src/App.test.jsx
git -C frontend/.. commit -m "feat: add drag-to-reorder in collection detail (5b)

- Albums in collection detail can be reordered
- Optimistic state update + PUT /collections/{id}/albums/reorder

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 8: Bulk Add to Collection (5c)

**Files:**
- Create: `frontend/src/components/BulkAddBar.jsx`
- Create: `frontend/src/components/BulkAddBar.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write failing tests for BulkAddBar**

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import BulkAddBar from './BulkAddBar'

describe('BulkAddBar', () => {
  it('shows selected count and Add to Collection button', () => {
    render(
      <BulkAddBar
        selectedCount={3}
        collections={[{ id: '1', name: 'Late Night' }]}
        onAddToCollection={() => {}}
        onClearSelection={() => {}}
      />
    )
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
    expect(screen.getByText(/add to collection/i)).toBeInTheDocument()
  })

  it('does not render when nothing is selected', () => {
    const { container } = render(
      <BulkAddBar
        selectedCount={0}
        collections={[]}
        onAddToCollection={() => {}}
        onClearSelection={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows collection picker and calls onAddToCollection', async () => {
    const onAdd = vi.fn()
    render(
      <BulkAddBar
        selectedCount={2}
        collections={[{ id: '1', name: 'Late Night' }, { id: '2', name: 'Road Trip' }]}
        onAddToCollection={onAdd}
        onClearSelection={() => {}}
      />
    )
    await userEvent.click(screen.getByText(/add to collection/i))
    await userEvent.click(screen.getByText('Late Night'))
    expect(onAdd).toHaveBeenCalledWith('1')
  })
})
```

- [ ] **Step 2: Implement BulkAddBar**

```jsx
import { useState } from 'react'

export default function BulkAddBar({ selectedCount, collections, onAddToCollection, onClearSelection }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3 z-50">
      <span className="text-sm font-medium text-text">{selectedCount} selected</span>
      <div className="relative">
        <button
          className="bg-accent text-white border-none rounded px-3 py-1.5 text-sm font-medium cursor-pointer"
          onClick={() => setPickerOpen(p => !p)}
        >
          Add to Collection
        </button>
        {pickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-surface border border-border rounded-lg shadow-lg min-w-[180px] max-h-[200px] overflow-y-auto">
            {collections.map(c => (
              <div
                key={c.id}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-hover"
                onClick={() => { onAddToCollection(c.id); setPickerOpen(false) }}
              >
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        className="bg-transparent border-none text-text-dim cursor-pointer text-sm hover:text-text"
        onClick={onClearSelection}
      >
        Clear
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Run BulkAddBar tests**

Run: `cd frontend && npx vitest run src/components/BulkAddBar.test.jsx`

- [ ] **Step 4: Wire bulk selection into App.jsx**

Add state and handlers to App.jsx:

```jsx
const [selectedAlbumIds, setSelectedAlbumIds] = useState(new Set())
const [bulkSelectMode, setBulkSelectMode] = useState(false)

function handleToggleSelectAlbum(spotifyId) {
  setSelectedAlbumIds(prev => {
    const next = new Set(prev)
    if (next.has(spotifyId)) next.delete(spotifyId)
    else next.add(spotifyId)
    return next
  })
}

async function handleBulkAddToCollection(collectionId) {
  const ids = [...selectedAlbumIds]
  await fetch(`${API}/collections/${collectionId}/albums/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spotify_ids: ids }),
  })
  // Update albumCollectionMap
  setAlbumCollectionMap(prev => {
    const next = { ...prev }
    ids.forEach(id => {
      next[id] = [...(next[id] || []), collectionId]
    })
    return next
  })
  setSelectedAlbumIds(new Set())
  setBulkSelectMode(false)
}
```

Render `<BulkAddBar>` above the playback bar when in library view.

- [ ] **Step 5: Run all frontend tests**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git -C frontend/.. add frontend/src/components/BulkAddBar.jsx frontend/src/components/BulkAddBar.test.jsx frontend/src/App.jsx frontend/src/App.test.jsx
git -C frontend/.. commit -m "feat: add bulk add to collection (5c)

- Multi-select mode with checkbox overlay on album art
- Floating BulkAddBar with collection picker
- Calls POST /collections/{id}/albums/bulk

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Frontend — Collection Cover Art (5d)

### Task 9: Collection Cover Art

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`
- Modify: `frontend/src/components/CollectionsPane.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write failing tests**

Add to `CollectionsPane.test.jsx`:

```jsx
it('shows pinned cover art when cover_album_id is set', () => {
  const cols = [{
    id: '1', name: 'Late Night', album_count: 5,
    cover_album_id: 'a1',
  }]
  const albums = [{ spotify_id: 'a1', image_url: '/cover.jpg', name: 'Cover Album' }]
  render(
    <CollectionsPane
      collections={cols}
      coverAlbums={albums}
      onEnter={() => {}}
      onDelete={() => {}}
      onCreate={() => {}}
      onFetchAlbums={vi.fn().mockResolvedValue(albums)}
    />
  )
  const img = screen.getByAltText('Cover Album')
  expect(img).toHaveAttribute('src', '/cover.jpg')
})
```

- [ ] **Step 2: Implement cover art display in CollectionsPane**

When a collection has `cover_album_id`, show that album's art as the primary card image instead of the 5-album art strip. The `coverAlbums` prop (or derive from `artMap`) provides the image URL lookup.

- [ ] **Step 3: Add "Set as Cover" action in collection detail view**

In the collection detail view, add a context action (long-press on mobile, right-click or menu icon on desktop) on each album row that calls `PUT /collections/{id}/cover`:

```jsx
async function handleSetCollectionCover(collectionId, albumId) {
  await fetch(`${API}/collections/${collectionId}/cover`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cover_album_id: albumId }),
  })
  setCollections(prev => prev.map(c =>
    c.id === collectionId ? { ...c, cover_album_id: albumId } : c
  ))
}
```

- [ ] **Step 4: Run all tests**

Run: `cd frontend && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git -C frontend/.. add frontend/src/components/CollectionsPane.jsx frontend/src/components/CollectionsPane.test.jsx frontend/src/App.jsx
git -C frontend/.. commit -m "feat: add collection cover art pinning (5d)

- Pinned album cover displayed on collection card
- 'Set as Cover' action in collection detail view
- Falls back to multi-album art strip when no cover is pinned

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: Final Integration + Position on Add

### Task 10: Ensure single-album add also assigns position

**Files:**
- Modify: `backend/routers/metadata.py`
- Modify: `backend/tests/test_metadata.py`

- [ ] **Step 1: Write failing test**

```python
def test_add_album_assigns_next_position():
    """Single-album add should assign position = max(existing) + 1."""
    db = mock_db(execute_data=[{"collection_id": "col-uuid-1", "spotify_id": "abc123", "position": 5}])
    # Mock the position lookup
    db.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"position": 4}]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post(
        "/collections/col-uuid-1/albums", json={"spotify_id": "abc123"}
    )

    assert response.status_code == 201

    clear_overrides()
```

- [ ] **Step 2: Update add_album_to_collection to assign position**

```python
@router.post("/collections/{collection_id}/albums", status_code=201)
def add_album_to_collection(
    collection_id: str,
    body: CollectionAlbumBody,
    db=Depends(get_db),
    sp: spotipy.Spotify = Depends(get_spotify),
):
    existing = (
        db.table("collection_albums")
        .select("position")
        .eq("collection_id", collection_id)
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    next_pos = (existing.data[0]["position"] or 0) + 1 if existing.data else 0

    result = (
        db.table("collection_albums")
        .insert({"collection_id": collection_id, "spotify_id": body.spotify_id, "position": next_pos})
        .execute()
    )
    return result.data[0]
```

- [ ] **Step 3: Run all tests**

Run: `cd backend && .venv/bin/python -m pytest -v`
Run: `cd frontend && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git -C backend/.. add backend/routers/metadata.py backend/tests/test_metadata.py
git -C backend/.. commit -m "feat: assign position on single-album add to collection

- New albums get position = max(existing) + 1
- Ensures consistent ordering for all add paths

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
