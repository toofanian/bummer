# Unified Collection Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CollectionsBubble and BulkAddBar's inline picker with a single unified CollectionPicker modal/bottom-sheet component.

**Architecture:** New `CollectionPicker` component renders as a modal (desktop) or bottom sheet (mobile). App.jsx manages `pickerAlbumIds` state — null means closed, an array of service_ids means open. AlbumTable and BulkAddBar receive a single `onOpenPicker(albumIds)` callback instead of the four collection-related props.

**Tech Stack:** React 19, Tailwind CSS 4, Vitest + @testing-library/react

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/CollectionPicker.jsx` | Create | Modal/bottom-sheet picker with search, keyboard nav, create-on-no-match |
| `frontend/src/components/CollectionPicker.test.jsx` | Create | Tests for CollectionPicker |
| `frontend/src/components/AlbumTable.jsx` | Modify | Replace 4 collection props with `onOpenPicker`, remove CollectionsBubble import |
| `frontend/src/components/AlbumTable.test.jsx` | Modify | Update tests for new prop |
| `frontend/src/components/BulkAddBar.jsx` | Modify | Remove inline picker, add `onOpenPicker` prop |
| `frontend/src/components/ArtistsView.jsx` | Modify | Replace 4 collection props with `onOpenPicker` passthrough |
| `frontend/src/App.jsx` | Modify | Add `pickerAlbumIds` state, render CollectionPicker, wire handlers |
| `frontend/src/components/CollectionsBubble.jsx` | Delete | Replaced by CollectionPicker |
| `frontend/src/components/CollectionsBubble.test.jsx` | Delete | Tests for deleted component |

---

### Task 1: Create CollectionPicker — tests first

**Files:**
- Create: `frontend/src/components/CollectionPicker.test.jsx`
- Create: `frontend/src/components/CollectionPicker.jsx`

- [ ] **Step 1: Write failing tests for CollectionPicker**

Create `frontend/src/components/CollectionPicker.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionPicker from './CollectionPicker'
import { useIsMobile } from '../hooks/useIsMobile'

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn().mockReturnValue(false) }))

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip' },
  { id: 'col-2', name: '90s classics' },
  { id: 'col-3', name: 'Workout' },
]

const defaultProps = {
  albumIds: ['album-1'],
  collections: COLLECTIONS,
  albumCollectionMap: { 'album-1': ['col-1'] },
  onToggle: vi.fn(),
  onBulkAdd: vi.fn(),
  onCreate: vi.fn(),
  onClose: vi.fn(),
}

function renderPicker(overrides = {}) {
  const props = { ...defaultProps, ...overrides }
  // Reset mocks
  props.onToggle = overrides.onToggle || vi.fn()
  props.onBulkAdd = overrides.onBulkAdd || vi.fn()
  props.onCreate = overrides.onCreate || vi.fn()
  props.onClose = overrides.onClose || vi.fn()
  return { ...render(<CollectionPicker {...props} />), props }
}

afterEach(() => useIsMobile.mockReturnValue(false))

describe('CollectionPicker', () => {
  // --- Rendering ---

  it('renders a backdrop overlay', () => {
    renderPicker()
    expect(screen.getByTestId('picker-backdrop')).toBeInTheDocument()
  })

  it('renders a search input with autofocus', () => {
    renderPicker()
    const input = screen.getByPlaceholderText(/search or create/i)
    expect(input).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('renders all collections as rows', () => {
    renderPicker()
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
    expect(screen.getByText('Workout')).toBeInTheDocument()
  })

  it('shows checkmark for collections the album belongs to', () => {
    renderPicker()
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('aria-selected', 'true')
    expect(rows[1]).toHaveAttribute('aria-selected', 'false')
  })

  // --- Close behavior ---

  it('calls onClose when backdrop is clicked', async () => {
    const { props } = renderPicker()
    await userEvent.click(screen.getByTestId('picker-backdrop'))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    const { props } = renderPicker()
    await userEvent.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalled()
  })

  // --- Search/filter ---

  it('filters collections by search text', async () => {
    renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'road')
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.queryByText('90s classics')).not.toBeInTheDocument()
  })

  it('shows "Create [name]" row when search does not match any collection', async () => {
    renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'Chill vibes')
    expect(screen.getByText(/create "chill vibes"/i)).toBeInTheDocument()
  })

  it('does not show "Create" row when search matches an existing collection', async () => {
    renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'Road trip')
    expect(screen.queryByText(/create "road trip"/i)).not.toBeInTheDocument()
  })

  // --- Single album toggle ---

  it('calls onToggle to add when unchecked collection row is clicked', async () => {
    const { props } = renderPicker()
    const rows = screen.getAllByRole('option')
    await userEvent.click(rows[1]) // "90s classics" — not checked
    expect(props.onToggle).toHaveBeenCalledWith('album-1', 'col-2', true)
  })

  it('calls onToggle to remove when checked collection row is clicked', async () => {
    const { props } = renderPicker()
    const rows = screen.getAllByRole('option')
    await userEvent.click(rows[0]) // "Road trip" — checked
    expect(props.onToggle).toHaveBeenCalledWith('album-1', 'col-1', false)
  })

  // --- Bulk mode ---

  it('calls onBulkAdd when a collection row is clicked in bulk mode', async () => {
    const { props } = renderPicker({ albumIds: ['album-1', 'album-2'] })
    const rows = screen.getAllByRole('option')
    await userEvent.click(rows[1])
    expect(props.onBulkAdd).toHaveBeenCalledWith('col-2')
  })

  // --- Create ---

  it('calls onCreate when "Create" row is clicked', async () => {
    const { props } = renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'Chill vibes')
    await userEvent.click(screen.getByText(/create "chill vibes"/i))
    expect(props.onCreate).toHaveBeenCalledWith('Chill vibes')
  })

  it('clears search after creating a collection', async () => {
    renderPicker()
    const input = screen.getByPlaceholderText(/search or create/i)
    await userEvent.type(input, 'Chill vibes')
    await userEvent.click(screen.getByText(/create "chill vibes"/i))
    expect(input).toHaveValue('')
  })

  // --- Keyboard navigation ---

  it('arrow down moves highlight to first collection', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}')
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('data-highlighted', 'true')
  })

  it('arrow down then Enter toggles the highlighted collection', async () => {
    const { props } = renderPicker()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    // First row is "Road trip" which is checked — should remove
    expect(props.onToggle).toHaveBeenCalledWith('album-1', 'col-1', false)
  })

  it('arrow down wraps to first item after last', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('data-highlighted', 'true')
  })

  it('arrow up from first item wraps to last', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}{ArrowUp}')
    const rows = screen.getAllByRole('option')
    expect(rows[rows.length - 1]).toHaveAttribute('data-highlighted', 'true')
  })

  it('typing resets highlight to first item', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'w')
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('data-highlighted', 'true')
  })

  // --- Mobile ---

  it('renders with bottom-sheet positioning on mobile', () => {
    useIsMobile.mockReturnValue(true)
    renderPicker()
    expect(screen.getByTestId('picker-container')).toHaveClass('bottom-0')
  })

  it('search input has font-size 16px on mobile to prevent iOS zoom', () => {
    useIsMobile.mockReturnValue(true)
    renderPicker()
    const input = screen.getByPlaceholderText(/search or create/i)
    expect(input).toHaveClass('text-base')
  })

  // --- Empty state ---

  it('shows create prompt when no collections exist', () => {
    renderPicker({ collections: [] })
    expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/CollectionPicker.test.jsx`
Expected: FAIL — module `./CollectionPicker` not found

- [ ] **Step 3: Write CollectionPicker implementation**

Create `frontend/src/components/CollectionPicker.jsx`:

```jsx
import { useState, useRef, useEffect, useMemo } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

export default function CollectionPicker({
  albumIds,
  collections,
  albumCollectionMap,
  onToggle,
  onBulkAdd,
  onCreate,
  onClose,
}) {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const isMobile = useIsMobile()
  const isBulk = albumIds.length > 1

  const filtered = useMemo(() => {
    if (!search.trim()) return collections
    const q = search.toLowerCase()
    return collections.filter(c => c.name.toLowerCase().includes(q))
  }, [collections, search])

  const exactMatch = useMemo(() => {
    if (!search.trim()) return true
    return collections.some(c => c.name.toLowerCase() === search.trim().toLowerCase())
  }, [collections, search])

  const showCreate = search.trim() && !exactMatch

  // Total navigable rows: filtered collections + optional create row
  const totalRows = filtered.length + (showCreate ? 1 : 0)

  function isChecked(collectionId) {
    if (isBulk) {
      return albumIds.every(id => (albumCollectionMap[id] || []).includes(collectionId))
    }
    return (albumCollectionMap[albumIds[0]] || []).includes(collectionId)
  }

  function handleRowClick(collection) {
    if (isBulk) {
      onBulkAdd(collection.id)
    } else {
      const checked = isChecked(collection.id)
      onToggle(albumIds[0], collection.id, !checked)
    }
  }

  function handleCreate() {
    onCreate(search.trim())
    setSearch('')
    setHighlightIndex(-1)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => {
        if (totalRows === 0) return -1
        return (prev + 1) % totalRows
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => {
        if (totalRows === 0) return -1
        if (prev <= 0) return totalRows - 1
        return prev - 1
      })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        handleRowClick(filtered[highlightIndex])
      } else if (highlightIndex === filtered.length && showCreate) {
        handleCreate()
      }
      return
    }
  }

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIndex(totalRows > 0 ? 0 : -1)
  }, [search])

  // Scroll highlighted row into view
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return
    const row = listRef.current.children[highlightIndex]
    row?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      <div
        data-testid="picker-backdrop"
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        data-testid="picker-container"
        className={`relative z-[501] bg-surface border border-border rounded-lg shadow-xl overflow-hidden ${
          isMobile
            ? 'fixed left-0 right-0 bottom-0 rounded-b-none max-h-[70vh]'
            : 'w-[320px] max-h-[400px]'
        }`}
        role="listbox"
        aria-label="Collection picker"
      >
        <input
          ref={inputRef}
          className={`w-full px-3 py-2.5 border-b border-border bg-surface ${
            isMobile ? 'text-base' : 'text-sm'
          }`}
          placeholder="Search or create collection..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        <div ref={listRef} className="overflow-y-auto max-h-[300px]" style={isMobile ? { maxHeight: 'calc(70vh - 44px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}>
          {filtered.map((c, i) => {
            const checked = isChecked(c.id)
            const highlighted = i === highlightIndex
            return (
              <div
                key={c.id}
                role="option"
                aria-selected={checked}
                data-highlighted={highlighted ? 'true' : 'false'}
                className={`flex justify-between items-center px-3 py-2.5 cursor-pointer text-sm transition-colors duration-100 min-h-[44px] ${
                  highlighted ? 'bg-surface-2' : 'hover:bg-surface-2'
                }`}
                onClick={() => handleRowClick(c)}
              >
                <span className="truncate">{c.name}</span>
                {checked && (
                  <span className="text-accent font-semibold ml-2 flex-shrink-0" aria-hidden="true">✓</span>
                )}
              </div>
            )
          })}
          {showCreate && (
            <div
              role="option"
              aria-selected={false}
              data-highlighted={highlightIndex === filtered.length ? 'true' : 'false'}
              className={`flex items-center px-3 py-2.5 cursor-pointer text-sm min-h-[44px] text-accent ${
                highlightIndex === filtered.length ? 'bg-surface-2' : 'hover:bg-surface-2'
              }`}
              onClick={handleCreate}
            >
              Create "{search.trim()}"
            </div>
          )}
          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2.5 text-sm text-text-dim italic">No collections</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/CollectionPicker.test.jsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CollectionPicker.jsx frontend/src/components/CollectionPicker.test.jsx
git commit -m "feat: add CollectionPicker component with tests (#27)"
```

---

### Task 2: Simplify BulkAddBar — remove inline picker

**Files:**
- Modify: `frontend/src/components/BulkAddBar.jsx`

- [ ] **Step 1: Write failing test for new BulkAddBar behavior**

There are no existing BulkAddBar tests. Add a minimal test file `frontend/src/components/BulkAddBar.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkAddBar from './BulkAddBar'

describe('BulkAddBar', () => {
  it('calls onOpenPicker when "Add to Collection" is clicked', async () => {
    const onOpenPicker = vi.fn()
    render(
      <BulkAddBar
        selectedCount={3}
        onOpenPicker={onOpenPicker}
        onClear={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(onOpenPicker).toHaveBeenCalled()
  })

  it('shows selected count', () => {
    render(
      <BulkAddBar
        selectedCount={5}
        onOpenPicker={() => {}}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('5 selected')).toBeInTheDocument()
  })

  it('calls onClear when clear button is clicked', async () => {
    const onClear = vi.fn()
    render(
      <BulkAddBar
        selectedCount={3}
        onOpenPicker={() => {}}
        onClear={onClear}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/BulkAddBar.test.jsx`
Expected: FAIL — `onOpenPicker` not called (old component uses `collections` + `onAddToCollection`)

- [ ] **Step 3: Rewrite BulkAddBar**

Replace `frontend/src/components/BulkAddBar.jsx` with:

```jsx
export default function BulkAddBar({ selectedCount, onOpenPicker, onClear }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-primary font-medium">{selectedCount} selected</span>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm font-medium bg-accent text-on-accent rounded-lg"
            aria-label="Add to Collection"
            onClick={onOpenPicker}
          >
            Add to Collection
          </button>
          <button
            className="px-2 py-1.5 text-sm text-secondary hover:text-primary"
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/BulkAddBar.test.jsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BulkAddBar.jsx frontend/src/components/BulkAddBar.test.jsx
git commit -m "refactor: simplify BulkAddBar, remove inline picker (#27)"
```

---

### Task 3: Update AlbumTable — replace collection props with onOpenPicker

**Files:**
- Modify: `frontend/src/components/AlbumTable.jsx:5,73,115-122,161,238-245,367-379,451-466,480-498`
- Modify: `frontend/src/components/AlbumTable.test.jsx:656-669`

- [ ] **Step 1: Update the mobile CollectionsBubble test to use onOpenPicker**

In `frontend/src/components/AlbumTable.test.jsx`, find the test at line 656 "renders CollectionsBubble for each card when collections prop is provided" and replace it:

```jsx
  it('renders collection button for each card when onOpenPicker is provided', () => {
    const onOpenPicker = vi.fn()
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onOpenPicker={onOpenPicker}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    expect(buttons).toHaveLength(ALBUMS.length)
  })

  it('calls onOpenPicker with album id when collection button is tapped on mobile', () => {
    const onOpenPicker = vi.fn()
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onOpenPicker={onOpenPicker}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    fireEvent.click(buttons[0])
    expect(onOpenPicker).toHaveBeenCalledWith(['id1'])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: FAIL — old component still uses CollectionsBubble

- [ ] **Step 3: Update AlbumTable implementation**

In `frontend/src/components/AlbumTable.jsx`:

1. Remove the import of `CollectionsBubble` (line 5).

2. In `MobileAlbumCard` (line 73), replace `collections, albumCollectionIds, onToggleCollection, onCreateCollection` props with `onOpenPicker`. Replace the CollectionsBubble JSX block (lines 115-122) with:

```jsx
        {onOpenPicker && (
          <button
            className="bg-transparent border border-transparent text-text-dim cursor-pointer w-[22px] h-[22px] rounded-full text-xs font-semibold flex items-center justify-center p-0"
            aria-label="Add to collection"
            onClick={(e) => { e.stopPropagation(); onOpenPicker([album.service_id]) }}
          >
            +
          </button>
        )}
```

3. In `DesktopAlbumRow` (line 161), replace `collections, albumCollectionIds, onToggleCollection, onCreateCollection` props with `onOpenPicker`. Replace the CollectionsBubble JSX block (lines 238-245) with:

```jsx
        {onOpenPicker && (
          <button
            className="bg-transparent border border-transparent text-text-dim cursor-pointer w-[22px] h-[22px] rounded-full text-xs font-semibold flex items-center justify-center p-0"
            aria-label="Add to collection"
            onClick={(e) => { e.stopPropagation(); onOpenPicker([album.service_id]) }}
          >
            +
          </button>
        )}
```

4. In the `AlbumTable` component props (lines 367-386), remove `collections`, `albumCollectionMap`, `onToggleCollection`, `onCreateCollection` and add `onOpenPicker`.

5. In `renderMobileCard` (lines 451-478), remove the four old collection props from `commonProps` and add `onOpenPicker`.

6. In `renderDesktopRow` (lines 480-509), remove `albumCollectionIds`, `collections`, `onToggleCollection`, `onCreateCollection` from `commonProps` and add `onOpenPicker`.

- [ ] **Step 4: Run AlbumTable tests**

Run: `cd frontend && npx vitest run src/components/AlbumTable.test.jsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlbumTable.jsx frontend/src/components/AlbumTable.test.jsx
git commit -m "refactor: replace collection props with onOpenPicker in AlbumTable (#27)"
```

---

### Task 4: Update ArtistsView — replace collection props

**Files:**
- Modify: `frontend/src/components/ArtistsView.jsx:55-56,100-101`

- [ ] **Step 1: Update ArtistsView**

In `frontend/src/components/ArtistsView.jsx`:

1. Replace the two collection-related props (`onToggleCollection`, `onCreateCollection`) with `onOpenPicker` in both the component's destructured props (around line 55-56) and where they're passed to AlbumTable (around lines 100-101). Also remove `collections` and `albumCollectionMap` from both locations.

The AlbumTable call should pass `onOpenPicker={onOpenPicker}` instead of the four old props.

- [ ] **Step 2: Run full test suite to check nothing broke**

Run: `cd frontend && npx vitest run`
Expected: PASS (some CollectionsBubble tests will fail — that's expected, they're deleted next task)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ArtistsView.jsx
git commit -m "refactor: replace collection props with onOpenPicker in ArtistsView (#27)"
```

---

### Task 5: Wire up App.jsx — add picker state, render CollectionPicker

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add pickerAlbumIds state and handlers**

At the top of App.jsx, after the existing state declarations (around line 73 after `selectedAlbumIds`), add:

```jsx
const [pickerAlbumIds, setPickerAlbumIds] = useState(null)
```

Add handler functions (after `handleClearSelection` around line 540):

```jsx
function handleOpenPicker(albumIds) {
  setPickerAlbumIds(albumIds)
}

function handleClosePicker() {
  setPickerAlbumIds(null)
}
```

- [ ] **Step 2: Update AlbumTable usages — replace 4 collection props with onOpenPicker**

There are 4 `<AlbumTable>` renders in App.jsx (2 in mobile layout, 2 in desktop layout). In each one:

Remove these props:
```
collections={collections}
albumCollectionMap={albumCollectionMap}
onToggleCollection={handleToggleCollection}
onCreateCollection={handleCreateCollection}
```

Add this prop:
```
onOpenPicker={handleOpenPicker}
```

- [ ] **Step 3: Update ArtistsView usages — replace collection props with onOpenPicker**

There are 2 `<ArtistsView>` renders. In each one:

Remove:
```
collections={collections}
albumCollectionMap={albumCollectionMap}
onToggleCollection={handleToggleCollection}
onCreateCollection={handleCreateCollection}
```

Add:
```
onOpenPicker={handleOpenPicker}
```

- [ ] **Step 4: Update BulkAddBar usages — replace props**

There are 2 `<BulkAddBar>` renders. Replace each with:

```jsx
<BulkAddBar
  selectedCount={selectedAlbumIds.size}
  onOpenPicker={() => handleOpenPicker([...selectedAlbumIds])}
  onClear={handleClearSelection}
/>
```

- [ ] **Step 5: Add CollectionPicker import and render**

Add import at top of App.jsx:
```jsx
import CollectionPicker from './components/CollectionPicker'
```

Remove the BulkAddBar import line since we're keeping it, but remove the CollectionsBubble import if it was here (it's not — it's in AlbumTable).

Render CollectionPicker at the end of both mobile and desktop layouts, just before the closing `</div>`. Add it right before the device picker overlay in both layouts:

```jsx
{pickerAlbumIds && (
  <CollectionPicker
    albumIds={pickerAlbumIds}
    collections={collections}
    albumCollectionMap={albumCollectionMap}
    onToggle={handleToggleCollection}
    onBulkAdd={(collectionId) => {
      handleBulkAdd(collectionId)
      setPickerAlbumIds(null)
    }}
    onCreate={handleCreateCollection}
    onClose={handleClosePicker}
  />
)}
```

- [ ] **Step 6: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All PASS except CollectionsBubble tests (deleted next)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: wire CollectionPicker into App.jsx (#27)"
```

---

### Task 6: Delete CollectionsBubble

**Files:**
- Delete: `frontend/src/components/CollectionsBubble.jsx`
- Delete: `frontend/src/components/CollectionsBubble.test.jsx`

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/components/CollectionsBubble.jsx frontend/src/components/CollectionsBubble.test.jsx
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "CollectionsBubble" frontend/src/
```

Expected: No results

- [ ] **Step 3: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add -u frontend/src/components/CollectionsBubble.jsx frontend/src/components/CollectionsBubble.test.jsx
git commit -m "chore: delete CollectionsBubble, replaced by CollectionPicker (#27)"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify single album picker**

Click the `+` button on any album row. Modal should open with search input focused. Type to filter. Click a collection to toggle. Press Esc to close.

- [ ] **Step 3: Verify bulk add**

Select multiple albums (click album art). Bottom bar appears. Click "Add to Collection". Same modal opens. Click a collection — albums are added, selection clears, picker closes.

- [ ] **Step 4: Verify keyboard nav**

Open picker. Arrow down through collections. Enter to toggle. Esc to close.

- [ ] **Step 5: Verify mobile**

Open browser devtools, toggle mobile viewport. Repeat steps 2-4. Picker should render as bottom sheet. Input should not trigger zoom.
