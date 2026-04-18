# Collections UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade CollectionsPane rows with prominent overlapping album art strips and responsive mobile layout, extracting a shared AlbumArtStrip component.

**Architecture:** Extract the overlapping album thumbnail pattern from BulkAddBar into a shared AlbumArtStrip component. Refactor CollectionsPane from table to div-based layout for responsive stacking. BulkAddBar adopts the shared component with no visual change.

**Tech Stack:** React, Vitest, React Testing Library, Tailwind CSS

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/AlbumArtStrip.jsx` | Shared overlapping album thumbnail strip |
| Create | `frontend/src/components/AlbumArtStrip.test.jsx` | Tests for AlbumArtStrip |
| Modify | `frontend/src/components/BulkAddBar.jsx` | Replace inline art with AlbumArtStrip |
| Modify | `frontend/src/components/BulkAddBar.test.jsx` | Verify BulkAddBar still passes after refactor |
| Modify | `frontend/src/components/CollectionsPane.jsx` | Table-to-div migration, 40px art strip, responsive layout |
| Modify | `frontend/src/components/CollectionsPane.test.jsx` | Update tests for new DOM structure |

---

### Task 1: AlbumArtStrip component (TDD)

**Files:**
- Create: `frontend/src/components/AlbumArtStrip.test.jsx`
- Create: `frontend/src/components/AlbumArtStrip.jsx`

- [ ] **Step 1: Write failing tests for AlbumArtStrip**

Create `frontend/src/components/AlbumArtStrip.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import AlbumArtStrip from './AlbumArtStrip'

const ALBUMS = [
  { service_id: 'a1', name: 'Album One', image_url: 'http://img/1.jpg' },
  { service_id: 'a2', name: 'Album Two', image_url: 'http://img/2.jpg' },
  { service_id: 'a3', name: 'Album Three', image_url: null },
]

describe('AlbumArtStrip', () => {
  it('renders an img for each album with an image_url', () => {
    render(<AlbumArtStrip albums={ALBUMS} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', 'http://img/1.jpg')
    expect(images[1]).toHaveAttribute('src', 'http://img/2.jpg')
  })

  it('renders a placeholder div for albums without image_url', () => {
    render(<AlbumArtStrip albums={ALBUMS} />)
    const placeholders = document.querySelectorAll('[aria-hidden="true"]')
    expect(placeholders).toHaveLength(1)
  })

  it('renders nothing when albums is empty', () => {
    const { container } = render(<AlbumArtStrip albums={[]} />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('applies custom size to images', () => {
    render(<AlbumArtStrip albums={[ALBUMS[0]]} size={32} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '32')
    expect(img).toHaveAttribute('height', '32')
  })

  it('defaults to 40px size', () => {
    render(<AlbumArtStrip albums={[ALBUMS[0]]} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '40')
    expect(img).toHaveAttribute('height', '40')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AlbumArtStrip.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AlbumArtStrip**

Create `frontend/src/components/AlbumArtStrip.jsx`:

```jsx
export default function AlbumArtStrip({ albums, size = 40 }) {
  return (
    <div className="flex items-center gap-0 min-w-0 overflow-hidden">
      {albums.map((album) => (
        <div key={album.service_id} className="flex-shrink-0 -mr-1 first:ml-0" style={{ width: size, height: size }}>
          {album.image_url
            ? <img src={album.image_url} alt={album.name} width={size} height={size} className="rounded object-cover border border-border" style={{ width: size, height: size }} />
            : <div className="rounded bg-surface-2 border border-border" style={{ width: size, height: size }} aria-hidden="true" />
          }
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AlbumArtStrip.test.jsx`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlbumArtStrip.jsx frontend/src/components/AlbumArtStrip.test.jsx
git commit -m "[52] Add AlbumArtStrip shared component with tests"
```

---

### Task 2: Refactor BulkAddBar to use AlbumArtStrip

**Files:**
- Modify: `frontend/src/components/BulkAddBar.jsx`
- Test: `frontend/src/components/BulkAddBar.test.jsx` (existing, no changes needed)

- [ ] **Step 1: Run existing BulkAddBar tests to confirm green baseline**

Run: `cd frontend && npx vitest run src/components/BulkAddBar.test.jsx`
Expected: 3 passing

- [ ] **Step 2: Replace inline art rendering with AlbumArtStrip**

Modify `frontend/src/components/BulkAddBar.jsx` — replace the entire file:

```jsx
import AlbumArtStrip from './AlbumArtStrip'

export default function BulkAddBar({ selectedAlbums, onOpenPicker, onClear, bottomOffset = 0 }) {
  return (
    <div
      className="fixed left-0 right-0 z-[300] bg-surface border-t border-border"
      style={{ bottom: bottomOffset, paddingBottom: bottomOffset === 0 ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : undefined }}
    >
      <div className="flex items-center justify-between px-4 py-2 gap-3 h-14">
        <div className="flex-1 min-w-0">
          <AlbumArtStrip albums={selectedAlbums} size={40} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="px-3 py-1.5 text-sm font-medium bg-text text-bg rounded-lg"
            aria-label="Add to Collection"
            onClick={onOpenPicker}
          >
            Add to Collection
          </button>
          <button
            className="px-2 py-1.5 text-sm text-text-dim hover:text-text"
            aria-label="Clear selection"
            onClick={onClear}
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run BulkAddBar tests to verify no regressions**

Run: `cd frontend && npx vitest run src/components/BulkAddBar.test.jsx`
Expected: 3 passing (same as baseline)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BulkAddBar.jsx
git commit -m "[52] Refactor BulkAddBar to use shared AlbumArtStrip"
```

---

### Task 3: Redesign CollectionsPane — table-to-div migration + art strip

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`
- Modify: `frontend/src/components/CollectionsPane.test.jsx`

This is the main task. The table layout gets replaced with div-based rows for responsive flexibility. Art thumbnails upgrade from 24px to 40px overlapping strip. Mobile gets a stacked layout (name on top, art below).

- [ ] **Step 1: Run existing CollectionsPane tests to confirm green baseline**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`
Expected: all passing

- [ ] **Step 2: Update tests for new DOM structure**

The table-to-div migration breaks tests that query `table`, `tr`, `td`, `th`, and `columnheader` roles. Update `frontend/src/components/CollectionsPane.test.jsx`:

Tests to **remove** (no longer applicable with div layout):
- `'renders each collection as a visible table row (not hidden)'` — queries `table` element
- `'renders a table with column headers'` — queries `columnheader` roles
- `'shows album count and updated date in separate columns'` — tests column separation
- `'delete button is visible in the last column even for empty collections'` — queries `td` elements
- `'shows relative updated_at date for each collection'` — "Updated" column removed from UI

Tests to **update**:
- `'does not use a multi-column grid layout'` — keep this test, still valid
- `'shows album count in the Albums column when album_count is provided'` — rename to `'shows album count badge'`, same assertion (text "5" and "12" still rendered)

New test to **add**:
```jsx
it('renders AlbumArtStrip for each collection with fetched albums', async () => {
  const albums = [
    { service_id: 'alb-1', name: 'In Rainbows', image_url: 'http://img/1.jpg' },
  ]
  const onFetchAlbums = vi.fn().mockResolvedValue(albums)
  render(
    <CollectionsPane
      collections={[COLLECTIONS[0]]}
      onEnter={() => {}}
      onDelete={() => {}}
      onFetchAlbums={onFetchAlbums}
    />
  )
  await waitFor(() => {
    const img = screen.getByAltText('In Rainbows')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('width', '40')
  })
})
```

Full updated test file for `CollectionsPane.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionsPane from './CollectionsPane'

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip', album_count: 5, updated_at: TWO_DAYS_AGO },
  { id: 'col-2', name: '90s classics', album_count: 12, updated_at: FIVE_DAYS_AGO },
]

const ALBUMS = [
  { service_id: 'alb-1', name: 'In Rainbows', artists: ['Radiohead'], image_url: 'http://img/1.jpg' },
  { service_id: 'alb-2', name: 'OK Computer', artists: ['Radiohead'], image_url: null },
]

describe('CollectionsPane', () => {
  it('renders all collection names', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
  })

  it('shows empty state when no collections', () => {
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByText(/no collections/i)).toBeInTheDocument()
  })

  it('calls onEnter with collection when collection row is clicked', async () => {
    const onEnter = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={onEnter}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getByText('Road trip'))
    expect(onEnter).toHaveBeenCalledWith(COLLECTIONS[0])
  })

  it('calls onDelete with collection id when Delete is confirmed (two-click flow)', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalledWith('col-1')
  })

  it('does not call onEnter when the delete button is clicked', async () => {
    const onEnter = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={onEnter}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('does not render expand arrow buttons', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.queryByRole('button', { name: /expand/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /collapse/i })).not.toBeInTheDocument()
  })

  it('does not show inline album list by default', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.queryByText('In Rainbows')).not.toBeInTheDocument()
  })

  it('fetches albums for each collection on mount and shows art thumbnails', async () => {
    const onFetchAlbums = vi.fn().mockResolvedValue(ALBUMS)
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={onFetchAlbums}
      />
    )
    await waitFor(() => {
      expect(onFetchAlbums).toHaveBeenCalledWith('col-1')
      expect(onFetchAlbums).toHaveBeenCalledWith('col-2')
    })
  })

  it('shows album art thumbnails in each collection row once loaded', async () => {
    const onFetchAlbums = vi.fn().mockResolvedValue(ALBUMS)
    render(
      <CollectionsPane
        collections={[COLLECTIONS[0]]}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={onFetchAlbums}
      />
    )
    await waitFor(() => {
      const img = screen.getByAltText('In Rainbows')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'http://img/1.jpg')
    })
  })

  it('renders AlbumArtStrip with 40px thumbnails for each collection', async () => {
    const albums = [
      { service_id: 'alb-1', name: 'In Rainbows', image_url: 'http://img/1.jpg' },
    ]
    const onFetchAlbums = vi.fn().mockResolvedValue(albums)
    render(
      <CollectionsPane
        collections={[COLLECTIONS[0]]}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={onFetchAlbums}
      />
    )
    await waitFor(() => {
      const img = screen.getByAltText('In Rainbows')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('width', '40')
    })
  })

  it('shows album count badge', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

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

  it('has an input and button to create a new collection', () => {
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByPlaceholderText(/new collection/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('calls onCreate with name when form is submitted', async () => {
    const onCreate = vi.fn()
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={onCreate}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.type(screen.getByPlaceholderText(/new collection/i), 'Rainy day')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Rainy day')
  })

  it('clears the input after creating a collection', async () => {
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const input = screen.getByPlaceholderText(/new collection/i)
    await userEvent.type(input, 'Rainy day')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(input).toHaveValue('')
  })

  it('create input appears before the collection list in the DOM', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const input = screen.getByPlaceholderText(/new collection/i)
    const firstCollectionName = screen.getByText('Road trip')
    expect(input.compareDocumentPosition(firstCollectionName)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('does not use a multi-column grid layout', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const gridEl = document.querySelector('.grid')
    expect(gridEl).not.toBeInTheDocument()
  })

  it('delete button shows confirmation on first click', async () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i })
    await userEvent.click(deleteBtns[0])
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('confirm delete calls onDelete', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i })
    await userEvent.click(deleteBtns[0])
    const confirmBtn = screen.getByRole('button', { name: /confirm delete/i })
    await userEvent.click(confirmBtn)
    expect(onDelete).toHaveBeenCalledWith('col-1')
  })

  it('cancel delete does not call onDelete', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i })
    await userEvent.click(deleteBtns[0])
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await userEvent.click(cancelBtn)
    expect(onDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run updated tests to verify they fail (implementation not yet changed)**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`
Expected: some tests fail (new 40px test fails, removed table tests no longer present)

- [ ] **Step 4: Rewrite CollectionsPane with div-based layout and AlbumArtStrip**

Replace `frontend/src/components/CollectionsPane.jsx` with:

```jsx
import { useState, useEffect } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import AlbumArtStrip from './AlbumArtStrip'

function timeAgo(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.floor(diffDay / 7)
  if (diffWk < 4) return `${diffWk}w ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  const diffYr = Math.floor(diffDay / 365)
  return `${diffYr}y ago`
}

export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onFetchAlbums }) {
  const [newName, setNewName] = useState('')
  const [artMap, setArtMap] = useState({})
  const [confirmingId, setConfirmingId] = useState(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!onFetchAlbums || !collections.length) return
    collections.forEach(col => {
      if (artMap[col.id]) return
      setArtMap(prev => ({ ...prev, [col.id]: { albums: [], loading: true } }))
      onFetchAlbums(col.id).then(albums => {
        setArtMap(prev => ({ ...prev, [col.id]: { albums, loading: false } }))
      })
    })
  }, [collections])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!confirmingId) return
    function handleDocClick() {
      setConfirmingId(null)
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handleDocClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handleDocClick)
    }
  }, [confirmingId])

  function handleCreate() {
    if (!newName.trim()) return
    onCreate(newName.trim())
    setNewName('')
  }

  function handleDeleteClick(e, colId) {
    e.stopPropagation()
    if (confirmingId !== colId) {
      setConfirmingId(colId)
    }
  }

  function handleConfirmDelete(e, colId) {
    e.stopPropagation()
    onDelete(colId)
    setConfirmingId(null)
  }

  function handleCancelDelete(e) {
    e.stopPropagation()
    setConfirmingId(null)
  }

  return (
    <div className="w-full flex flex-col h-full overflow-hidden">
      {/* Sticky create-new input at top */}
      <div className="flex gap-2 px-4 py-3 border-b border-border bg-bg flex-shrink-0 sticky top-0 z-10 opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        <input
          placeholder="New collection name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>Create</button>
      </div>

      {collections.length === 0 ? (
        <p className="p-4 text-sm text-text-dim italic">No collections yet.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {collections.map(col => {
            const artEntry = artMap[col.id]
            const artAlbums = artEntry ? artEntry.albums : []
            const isConfirming = confirmingId === col.id

            return (
              <div
                key={col.id}
                className="border-b border-border cursor-pointer hover:bg-hover transition-colors duration-150 group px-4 py-3"
                onClick={() => onEnter(col)}
              >
                {isMobile ? (
                  /* Mobile: stacked layout — name + count on top, art strip below */
                  <>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text">{col.name}</span>
                          {col.album_count != null && (
                            <span className="text-xs text-text-dim">{col.album_count}</span>
                          )}
                        </div>
                        {col.description && (
                          <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
                        )}
                      </div>
                      <div onClick={e => e.stopPropagation()}>
                        {isConfirming ? (
                          <>
                            <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                            <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                          </>
                        ) : (
                          <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="Delete" onClick={e => handleDeleteClick(e, col.id)}>×</button>
                        )}
                      </div>
                    </div>
                    {artAlbums.length > 0 && (
                      <div className="mt-2">
                        <AlbumArtStrip albums={artAlbums} size={40} />
                      </div>
                    )}
                  </>
                ) : (
                  /* Desktop: single-line — name left, art strip + count + delete right */
                  <div className="flex items-center">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text">{col.name}</div>
                      {col.description && (
                        <div className="text-xs text-text-dim mt-0.5 truncate max-w-xs">{col.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <AlbumArtStrip albums={artAlbums} size={40} />
                      {col.album_count != null && (
                        <span className="text-xs text-text-dim tabular-nums">{col.album_count}</span>
                      )}
                      <div onClick={e => e.stopPropagation()}>
                        {isConfirming ? (
                          <>
                            <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                            <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                          </>
                        ) : (
                          <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="Delete" onClick={e => handleDeleteClick(e, col.id)}>×</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run all CollectionsPane tests**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`
Expected: all passing

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `cd frontend && npx vitest run`
Expected: all passing

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CollectionsPane.jsx frontend/src/components/CollectionsPane.test.jsx
git commit -m "[52] Redesign CollectionsPane with div layout, 40px art strips, responsive stacking"
```
