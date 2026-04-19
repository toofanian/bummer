# Album Prompt Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent bottom panel to the collections page that surfaces recently added/played albums for quick collection assignment.

**Architecture:** Two new components — `AlbumPromptBar` (container with selection state and action button) and `AlbumPromptRow` (single scrollable row of album thumbnails with overlays). Integrated into `CollectionsPane` and wired to App.jsx's existing `albumCollectionMap` and bulk-add flow. Data fetched from existing `GET /home` endpoint.

**Tech Stack:** React, Vitest, React Testing Library, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/AlbumPromptRow.jsx` | Create | Single horizontal scrollable row of album thumbnails with collection-count and selected overlays |
| `frontend/src/components/AlbumPromptRow.test.jsx` | Create | Tests for AlbumPromptRow |
| `frontend/src/components/AlbumPromptBar.jsx` | Create | Container: fetches home data, manages selection state, renders two AlbumPromptRow instances + action button, opens CollectionPicker |
| `frontend/src/components/AlbumPromptBar.test.jsx` | Create | Tests for AlbumPromptBar |
| `frontend/src/components/CollectionsPane.jsx` | Modify | Render AlbumPromptBar at bottom |
| `frontend/src/components/CollectionsPane.test.jsx` | Modify | Test that AlbumPromptBar renders |
| `frontend/src/App.jsx` | Modify | Pass `albumCollectionMap`, `collections`, `session`, and bulk-add handler to CollectionsPane |

---

### Task 1: AlbumPromptRow — Rendering & Collection Count Overlay

**Files:**
- Create: `frontend/src/components/AlbumPromptRow.jsx`
- Create: `frontend/src/components/AlbumPromptRow.test.jsx`

- [ ] **Step 1: Write failing tests for AlbumPromptRow**

Create `frontend/src/components/AlbumPromptRow.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlbumPromptRow from './AlbumPromptRow'

const ALBUMS = [
  { service_id: 'a1', name: 'Album One', image_url: 'https://example.com/1.jpg' },
  { service_id: 'a2', name: 'Album Two', image_url: 'https://example.com/2.jpg' },
  { service_id: 'a3', name: 'Album Three', image_url: null },
]

const COLLECTION_MAP = {
  a1: ['col1', 'col2'],  // in 2 collections
  // a2 not in any
  // a3 not in any
}

describe('AlbumPromptRow', () => {
  it('renders label and album thumbnails', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    expect(screen.getByText('Recently Added')).toBeInTheDocument()
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2) // a3 has no image_url
    expect(images[0]).toHaveAttribute('src', 'https://example.com/1.jpg')
  })

  it('shows collection count overlay for albums in collections', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={COLLECTION_MAP}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    expect(screen.getByText('2')).toBeInTheDocument() // a1 is in 2 collections
  })

  it('does not show overlay for albums not in any collection', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={COLLECTION_MAP}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    // Only one count overlay (for a1)
    const overlays = screen.queryAllByTestId('collection-count-overlay')
    expect(overlays).toHaveLength(1)
  })

  it('renders placeholder for albums without image_url', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    const placeholders = screen.getAllByTestId('album-placeholder')
    expect(placeholders).toHaveLength(1)
  })

  it('does not render when albums array is empty', () => {
    const { container } = render(
      <AlbumPromptRow
        label="Recently Added"
        albums={[]}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AlbumPromptRow.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AlbumPromptRow**

Create `frontend/src/components/AlbumPromptRow.jsx`:

```jsx
export default function AlbumPromptRow({ label, albums, albumCollectionMap, selectedIds, onToggleSelect }) {
  if (!albums || albums.length === 0) return null

  return (
    <div>
      <div className="text-[10px] font-medium text-text-dim uppercase tracking-wider px-3 py-1">{label}</div>
      <div className="flex gap-2 px-3 pb-2 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {albums.map(album => {
          const collectionIds = albumCollectionMap[album.service_id] || []
          const count = collectionIds.length
          const isSelected = selectedIds.has(album.service_id)

          return (
            <button
              key={album.service_id}
              className={`relative flex-shrink-0 rounded-md overflow-hidden border-2 transition-all duration-150 ${
                isSelected
                  ? 'border-accent shadow-[0_0_8px_rgba(var(--accent-rgb,99,102,241),0.4)]'
                  : 'border-transparent'
              }`}
              style={{ width: 56, height: 56 }}
              onClick={() => onToggleSelect(album.service_id)}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${album.name}`}
            >
              {album.image_url ? (
                <img
                  src={album.image_url}
                  alt={album.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div data-testid="album-placeholder" className="w-full h-full bg-surface-2" />
              )}

              {count > 0 && (
                <div
                  data-testid="collection-count-overlay"
                  className={`absolute inset-0 bg-black/50 flex items-center justify-center ${
                    isSelected ? 'items-end justify-end pb-1 pr-1' : ''
                  }`}
                >
                  <span className={`text-white font-bold ${isSelected ? 'text-[10px]' : 'text-sm'}`}>
                    {count}
                  </span>
                </div>
              )}

              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center" data-testid="selected-overlay">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AlbumPromptRow.test.jsx`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlbumPromptRow.jsx frontend/src/components/AlbumPromptRow.test.jsx
git commit -m "feat: add AlbumPromptRow component with collection count overlay

- Horizontal scrollable row of album thumbnails (56px)
- Semi-transparent overlay with collection count for albums in collections
- Placeholder for albums without cover art
- Hidden when album list is empty

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: AlbumPromptRow — Selection State

**Files:**
- Modify: `frontend/src/components/AlbumPromptRow.test.jsx`
- (No code changes needed — selection rendering is already in Task 1 implementation)

- [ ] **Step 1: Add selection tests to AlbumPromptRow.test.jsx**

Append to the existing describe block in `AlbumPromptRow.test.jsx`:

```jsx
  it('shows checkmark overlay when album is selected', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set(['a1'])}
        onToggleSelect={() => {}}
      />
    )
    const overlay = screen.getByTestId('selected-overlay')
    expect(overlay).toBeInTheDocument()
  })

  it('calls onToggleSelect with album service_id on click', async () => {
    const onToggleSelect = vi.fn()
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /select album one/i }))
    expect(onToggleSelect).toHaveBeenCalledWith('a1')
  })

  it('shows both checkmark and collection count when selected and in collections', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={COLLECTION_MAP}
        selectedIds={new Set(['a1'])}
        onToggleSelect={() => {}}
      />
    )
    expect(screen.getByTestId('selected-overlay')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AlbumPromptRow.test.jsx`
Expected: PASS (all 8 tests — implementation already handles selection from Task 1)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AlbumPromptRow.test.jsx
git commit -m "test: add selection state tests for AlbumPromptRow

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: AlbumPromptBar — Container with Data Fetching & Selection

**Files:**
- Create: `frontend/src/components/AlbumPromptBar.jsx`
- Create: `frontend/src/components/AlbumPromptBar.test.jsx`

- [ ] **Step 1: Write failing tests for AlbumPromptBar**

Create `frontend/src/components/AlbumPromptBar.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlbumPromptBar from './AlbumPromptBar'
import { vi } from 'vitest'

// Mock apiFetch
vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../api'

const COLLECTIONS = [
  { id: 'col1', name: 'Chill' },
  { id: 'col2', name: 'Workout' },
]

const HOME_DATA = {
  recently_added: [
    { service_id: 'ra1', name: 'New Album', image_url: 'https://example.com/new.jpg' },
  ],
  today: [
    { service_id: 'rp1', name: 'Played Today', image_url: 'https://example.com/today.jpg' },
  ],
  this_week: [
    { service_id: 'rp2', name: 'Played This Week', image_url: 'https://example.com/week.jpg' },
  ],
}

function renderBar(overrides = {}) {
  const defaults = {
    albumCollectionMap: {},
    collections: COLLECTIONS,
    session: { access_token: 'test-token' },
    onBulkAdd: vi.fn(),
    onCreate: vi.fn(),
  }
  return render(<AlbumPromptBar {...defaults} {...overrides} />)
}

describe('AlbumPromptBar', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({
      json: () => Promise.resolve(HOME_DATA),
    })
  })

  it('fetches home data and renders two rows', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
    })
  })

  it('does not render action button when no albums selected', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /add to collection/i })).not.toBeInTheDocument()
  })

  it('shows action button after selecting an album', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /select new album/i }))
    expect(screen.getByRole('button', { name: /add to collection/i })).toBeInTheDocument()
  })

  it('opens CollectionPicker when action button clicked', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /select new album/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.getByRole('listbox', { name: /collection picker/i })).toBeInTheDocument()
  })

  it('hides entire bar when home data has no albums', async () => {
    apiFetch.mockResolvedValue({
      json: () => Promise.resolve({
        recently_added: [],
        today: [],
        this_week: [],
      }),
    })
    const { container } = renderBar()
    // Wait for fetch to complete
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled()
    })
    // Allow state update
    await waitFor(() => {
      expect(container.querySelector('[data-testid="album-prompt-bar"]')).not.toBeInTheDocument()
    })
  })

  it('shares selection state across rows for duplicate albums', async () => {
    apiFetch.mockResolvedValue({
      json: () => Promise.resolve({
        recently_added: [
          { service_id: 'shared1', name: 'Shared Album', image_url: 'https://example.com/s.jpg' },
        ],
        today: [
          { service_id: 'shared1', name: 'Shared Album', image_url: 'https://example.com/s.jpg' },
        ],
        this_week: [],
      }),
    })
    renderBar()
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
    })
    // Click the first instance of the shared album
    const buttons = screen.getAllByRole('button', { name: /select shared album/i })
    await userEvent.click(buttons[0])
    // Both instances should show as selected
    const overlays = screen.getAllByTestId('selected-overlay')
    expect(overlays).toHaveLength(2)
  })

  it('clears selection and closes picker after successful bulk add', async () => {
    const onBulkAdd = vi.fn().mockResolvedValue(undefined)
    renderBar({ onBulkAdd })
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
    })
    // Select album
    await userEvent.click(screen.getByRole('button', { name: /select new album/i }))
    // Open picker
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    // Click collection in picker
    await userEvent.click(screen.getByText('Chill'))
    expect(onBulkAdd).toHaveBeenCalledWith('col1', ['ra1'])
    // Selection should be cleared
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /add to collection/i })).not.toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AlbumPromptBar.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AlbumPromptBar**

Create `frontend/src/components/AlbumPromptBar.jsx`:

```jsx
import { useState, useEffect } from 'react'
import AlbumPromptRow from './AlbumPromptRow'
import CollectionPicker from './CollectionPicker'
import { apiFetch } from '../api'

function mergeRecentlyPlayed(today, thisWeek) {
  const seen = new Set()
  const merged = []
  for (const album of [...(today ?? []), ...(thisWeek ?? [])]) {
    if (!seen.has(album.service_id)) {
      seen.add(album.service_id)
      merged.push(album)
    }
  }
  return merged
}

export default function AlbumPromptBar({ albumCollectionMap, collections, session, onBulkAdd, onCreate }) {
  const [recentlyAdded, setRecentlyAdded] = useState([])
  const [recentlyPlayed, setRecentlyPlayed] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    apiFetch(`/home?tz=${encodeURIComponent(tz)}`, {}, session)
      .then(r => r.json())
      .then(data => {
        setRecentlyAdded(data.recently_added ?? [])
        setRecentlyPlayed(mergeRecentlyPlayed(data.today, data.this_week))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [session])

  function handleToggleSelect(serviceId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }

  async function handleBulkAdd(collectionId) {
    const ids = [...selectedIds]
    await onBulkAdd(collectionId, ids)
    setSelectedIds(new Set())
    setPickerOpen(false)
  }

  if (!loaded) return null
  if (recentlyAdded.length === 0 && recentlyPlayed.length === 0) return null

  return (
    <div data-testid="album-prompt-bar" className="border-t border-border bg-surface">
      <AlbumPromptRow
        label="Recently Added"
        albums={recentlyAdded}
        albumCollectionMap={albumCollectionMap}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
      />
      <AlbumPromptRow
        label="Recently Played"
        albums={recentlyPlayed}
        albumCollectionMap={albumCollectionMap}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
      />

      {selectedIds.size > 0 && (
        <div className="flex justify-center py-2">
          <button
            className="px-4 py-1.5 text-sm font-medium bg-text text-bg rounded-lg"
            aria-label="Add to Collection"
            onClick={() => setPickerOpen(true)}
          >
            Add to Collection
          </button>
        </div>
      )}

      {pickerOpen && (
        <CollectionPicker
          albumIds={[...selectedIds]}
          collections={collections}
          albumCollectionMap={albumCollectionMap}
          onBulkAdd={handleBulkAdd}
          onCreate={onCreate}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AlbumPromptBar.test.jsx`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlbumPromptBar.jsx frontend/src/components/AlbumPromptBar.test.jsx
git commit -m "feat: add AlbumPromptBar container with data fetching and selection

- Fetches home data for recently added/played albums
- Local selection state with toggle
- Action button appears when 1+ albums selected
- Opens existing CollectionPicker for collection assignment
- Clears selection after successful bulk add
- Hidden when no albums available

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Integrate AlbumPromptBar into CollectionsPane and App.jsx

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`
- Modify: `frontend/src/components/CollectionsPane.test.jsx`
- Modify: `frontend/src/App.jsx` (lines 5, 868-885 mobile, 1174-1198 desktop)

- [ ] **Step 1: Add integration test to CollectionsPane.test.jsx**

Add a new test to the existing test file. First read the current test file to understand patterns, then append:

```jsx
// Add import at top (if not already present):
// import AlbumPromptBar from './AlbumPromptBar'

// Mock apiFetch for AlbumPromptBar's home data fetch
vi.mock('../api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({
    json: () => Promise.resolve({ recently_added: [], today: [], this_week: [] }),
  })),
}))

// Add test:
it('renders AlbumPromptBar when props are provided', () => {
  render(
    <CollectionsPane
      collections={[]}
      onEnter={() => {}}
      onDelete={() => {}}
      onRename={() => {}}
      onCreate={() => {}}
      onFetchAlbums={() => Promise.resolve([])}
      albumCollectionMap={{}}
      collectionsForPicker={[]}
      session={{ access_token: 'test' }}
      onBulkAdd={() => {}}
    />
  )
  expect(screen.getByTestId('album-prompt-bar')).toBeInTheDocument()
})
```

Note: This test needs the apiFetch mock to return home data so AlbumPromptBar renders. If the existing test file already mocks apiFetch differently, adapt the mock to co-exist. The key assertion is that the `album-prompt-bar` testid appears in the DOM.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`
Expected: FAIL — AlbumPromptBar not rendered, `album-prompt-bar` not found

- [ ] **Step 3: Update CollectionsPane to accept and render AlbumPromptBar**

In `frontend/src/components/CollectionsPane.jsx`:

Add import at top:
```jsx
import AlbumPromptBar from './AlbumPromptBar'
```

Update the function signature to accept new props:
```jsx
export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onRename, onFetchAlbums, albumCollectionMap, collectionsForPicker, session, onBulkAdd, onCreateCollection }) {
```

Add `AlbumPromptBar` at the bottom of the component's return, just before the closing `</div>`:

Replace the final structure so the collections list and prompt bar coexist in a flex column. The outer div already has `flex flex-col h-full overflow-hidden`. Add the prompt bar after the scrollable collection list:

```jsx
      <AlbumPromptBar
        albumCollectionMap={albumCollectionMap || {}}
        collections={collectionsForPicker || []}
        session={session}
        onBulkAdd={onBulkAdd || (() => {})}
        onCreate={onCreateCollection || (() => {})}
      />
```

Place this right before the final `</div>` of the component return (after the `</div>` that closes the `flex-1 overflow-y-auto` div, at the same level).

- [ ] **Step 4: Update App.jsx to pass new props to CollectionsPane**

In both the mobile layout (around line 875) and desktop layout (around line 1181), update the `<CollectionsPane>` to pass the new props:

```jsx
<CollectionsPane
  collections={/* existing collections prop */}
  onEnter={handleEnterCollection}
  onDelete={handleDeleteCollection}
  onRename={handleRenameCollection}
  onCreate={handleCreateCollection}
  onFetchAlbums={handleFetchCollectionAlbums}
  albumCollectionMap={albumCollectionMap}
  collectionsForPicker={collections}
  session={session}
  onBulkAdd={async (collectionId, albumIds) => {
    const res = await apiFetch(`/collections/${collectionId}/albums/bulk`, {
      method: 'POST',
      body: JSON.stringify({ service_ids: albumIds }),
    }, sessionRef.current)
    if (!res.ok) throw new Error('Failed to bulk add')
    const data = await res.json()
    setAlbumCollectionMap(prev => {
      const next = { ...prev }
      albumIds.forEach(id => {
        if (!next[id]) next[id] = []
        if (!next[id].includes(collectionId)) {
          next[id] = [...next[id], collectionId]
        }
      })
      return next
    })
    if (data.album_count != null) {
      setCollections(prev => prev.map(c =>
        c.id === collectionId ? { ...c, album_count: data.album_count } : c
      ))
    }
  }}
  onCreateCollection={handleCreateCollection}
/>
```

Apply this to both the mobile `view === 'collections'` block and the desktop `view === 'collections'` block.

- [ ] **Step 5: Run CollectionsPane tests**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass. If existing CollectionsPane tests break because they don't pass the new props, update them to pass `albumCollectionMap={{}}` and other new props with safe defaults.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CollectionsPane.jsx frontend/src/components/CollectionsPane.test.jsx frontend/src/App.jsx
git commit -m "feat: integrate AlbumPromptBar into collections page

- CollectionsPane renders AlbumPromptBar at bottom
- App.jsx passes albumCollectionMap, session, collections, and
  bulk-add handler down to CollectionsPane
- Prompt bar bulk-add updates albumCollectionMap and collection counts

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Manual Smoke Test & Edge Case Cleanup

**Files:**
- Possibly: `frontend/src/components/AlbumPromptBar.jsx`
- Possibly: `frontend/src/components/AlbumPromptRow.jsx`

- [ ] **Step 1: Start dev server and test visually**

Run: `cd frontend && npm run dev`

Verify on collections page:
1. Album Prompt Bar appears at bottom with two rows
2. Scroll works horizontally with smooth momentum
3. Albums in collections show count overlay
4. Tap selects album, checkmark + glow appears
5. Action button appears, opens CollectionPicker
6. Selecting collection adds album, clears selection, overlay count updates
7. If both rows are empty, bar is hidden
8. Album appearing in both rows shares selection state

- [ ] **Step 2: Fix any visual/functional issues found**

Address any spacing, z-index, or interaction issues. Common fixes:
- Adjust z-index if prompt bar overlaps with playback bar or tab bar
- Ensure the collections list scrollable area accounts for prompt bar height (no content hidden behind it)

- [ ] **Step 3: Run full test suite one final time**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: album prompt bar visual and edge case cleanup

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
