# Organize Column Completion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Organize column with drag-reorder for collection albums, bulk-add from library, and collection playback (auto-advance through albums).

**Architecture:** No backend changes — all three features are frontend-only. Drag-reorder uses `@dnd-kit/core` + `@dnd-kit/sortable` and calls the existing `PUT /collections/{id}/albums/reorder` endpoint. Bulk-add introduces a selection overlay + floating action bar that calls `POST /collections/{id}/albums/bulk`. Collection playback adds client-side state tracking that auto-advances albums via the existing polling loop.

**Tech Stack:** React 19, Vite 7, Vitest 4, React Testing Library, @dnd-kit/core, @dnd-kit/sortable

**Spec:** `docs/specs/2026-04-03-organize-column-completion-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/AlbumTable.jsx` | Modify | Add `reorderable` + `onReorder` props; render drag handles when reorderable; wrap list in DnD context |
| `frontend/src/components/AlbumTable.test.jsx` | Modify | Tests for drag handle rendering and reorder callback |
| `frontend/src/components/CollectionDetailHeader.jsx` | Modify | Add play button for collection playback |
| `frontend/src/components/CollectionDetailHeader.test.jsx` | Modify | Tests for play button |
| `frontend/src/components/BulkAddBar.jsx` | Create | Floating action bar for multi-select: count display, collection picker, clear button |
| `frontend/src/components/BulkAddBar.test.jsx` | Create | Tests for BulkAddBar rendering and interactions |
| `frontend/src/App.jsx` | Modify | Wire reorder handler, selection state + BulkAddBar, collection playback state + auto-advance |
| `frontend/src/App.test.jsx` | Modify | Integration tests for new features |

---

## Chunk 1: Drag-Reorder

### Task 1: Install @dnd-kit

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd frontend && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify install**

```bash
cd frontend && node -e "require('@dnd-kit/core'); require('@dnd-kit/sortable'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: install @dnd-kit for drag-reorder

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add drag handles to AlbumTable

**Files:**
- Modify: `frontend/src/components/AlbumTable.jsx`
- Modify: `frontend/src/components/AlbumTable.test.jsx`

**Context:** `AlbumTable` currently accepts albums and renders them via `MobileAlbumCard` (line 53) and `DesktopAlbumRow` (line 127). When `reorderable` is true, we:
1. Skip sorting (collection order IS the order)
2. Show a drag handle (⠿) on each row
3. Wrap the list in DnD context and fire `onReorder` on drop

- [ ] **Step 1: Write the failing test — drag handle renders when reorderable**

Add to `frontend/src/components/AlbumTable.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AlbumTable from './AlbumTable'

// Mock useIsMobile to control mobile/desktop rendering
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const ALBUMS = [
  { spotify_id: 'a1', name: 'Album A', artists: ['Artist 1'], release_date: '2024-01-01', added_at: '2024-06-01', image_url: null },
  { spotify_id: 'a2', name: 'Album B', artists: ['Artist 2'], release_date: '2024-02-01', added_at: '2024-06-02', image_url: null },
]

describe('AlbumTable reorderable', () => {
  it('shows drag handles when reorderable is true', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onFetchTracks={vi.fn()}
        reorderable
        onReorder={vi.fn()}
      />
    )
    const handles = screen.getAllByLabelText('Drag to reorder')
    expect(handles).toHaveLength(2)
  })

  it('does not show drag handles when reorderable is false', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onFetchTracks={vi.fn()}
      />
    )
    expect(screen.queryByLabelText('Drag to reorder')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/AlbumTable.test.jsx
```

Expected: FAIL — "Drag to reorder" not found.

- [ ] **Step 3: Implement drag handles in AlbumTable**

In `frontend/src/components/AlbumTable.jsx`:

**3a.** Add imports at top of file (after line 1):

```jsx
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

**3b.** Add `reorderable` and `onReorder` to the props destructure (line 283–296):

```jsx
export default function AlbumTable({
  albums,
  loading,
  onFetchTracks,
  onPlay,
  onPlayTrack,
  playingId,
  playingTrackId,
  playingTrackName = null,
  collections,
  albumCollectionMap,
  onToggleCollection,
  onCreateCollection,
  reorderable = false,
  onReorder,
}) {
```

**3c.** When `reorderable` is true, skip sorting — use albums as-is. Replace the `sorted` memo (line 330):

```jsx
const sorted = useMemo(() => {
  if (reorderable) return albums  // preserve collection order
  return sortAlbums(albums, sortKey, sortDir)
}, [albums, sortKey, sortDir, reorderable])
```

**3d.** Create a `SortableDesktopRow` wrapper component (add before the main export):

```jsx
function SortableDesktopRow({ album, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: album.spotify_id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td className="px-1 py-1.5 align-middle w-8">
        <button
          {...listeners}
          aria-label="Drag to reorder"
          className="bg-transparent border-none text-text-dim cursor-grab active:cursor-grabbing p-1 text-base touch-none select-none"
        >
          ⠿
        </button>
      </td>
      {/* Re-render the DesktopAlbumRow content inline — we can't nest <tr> in <tr>,
          so we extract the row as a component that renders <td> cells directly */}
    </tr>
  )
}
```

Actually, because `DesktopAlbumRow` returns `<tr>` elements, we need a different approach. We'll make `DesktopAlbumRow` accept a `dragHandleProps` prop and render the handle in its first `<td>` when present. Then wrap rows with `useSortable` in the parent.

**Revised 3d.** Modify `DesktopAlbumRow` (line 127) to accept `dragHandleProps`:

Add to the `DesktopAlbumRow` function signature:

```jsx
const DesktopAlbumRow = memo(function DesktopAlbumRow({ album, isExpanded, isPlaying, expandedEntry, playingTrackId, playingTrackName, onPlay, onPlayTrack, onExpand, navigateRow, collections, albumCollectionIds, onToggleCollection, onCreateCollection, dragHandleProps, sortableStyle, sortableRef }) {
```

In the `<tr>` at line 150, add ref and style:

```jsx
<tr
  key={album.spotify_id}
  id={`row-album-${album.spotify_id}`}
  ref={sortableRef}
  style={sortableStyle}
  className={`album-row border-b border-border transition-colors duration-100 hover:bg-hover focus:outline-none focus:bg-selected focus:shadow-[inset_3px_0_0_var(--color-accent)]${isPlaying ? ' now-playing bg-now-playing' : ''}`}
  tabIndex={0}
  onKeyDown={handleAlbumKeyDown}
  onClick={() => onPlay && onPlay(album.spotify_id)}
>
  {dragHandleProps && (
    <td className="px-1 py-1.5 align-middle" style={{ width: 32 }}>
      <button
        {...dragHandleProps}
        aria-label="Drag to reorder"
        className="bg-transparent border-none text-text-dim cursor-grab active:cursor-grabbing p-1 text-base touch-none select-none"
        onClick={e => e.stopPropagation()}
      >
        ⠿
      </button>
    </td>
  )}
```

**3e.** Create a `SortableAlbumRow` wrapper that uses `useSortable` and passes handle props down. Add before the main export:

```jsx
function SortableAlbumRow({ album, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: album.spotify_id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <DesktopAlbumRow
      album={album}
      {...rest}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  )
}
```

**3f.** Similarly for mobile, modify `MobileAlbumCard` to accept `dragHandleProps` and render the handle:

Add `dragHandleProps`, `sortableRef`, `sortableStyle` to `MobileAlbumCard` props (line 53):

```jsx
const MobileAlbumCard = memo(function MobileAlbumCard({ album, isExpanded, isPlaying, exp, playingTrackName, onPlay, onPlayTrack, collections, albumCollectionIds, onToggleCollection, onCreateCollection, onExpand, dragHandleProps, sortableRef, sortableStyle }) {
```

Wrap the outer `<div>` with ref and style, and add the handle before the album art:

```jsx
return (
  <div ref={sortableRef} style={sortableStyle}>
    <div
      data-testid={`album-card-${album.spotify_id}`}
      className={`album-card flex items-center gap-3 px-4 py-2.5 border-b border-border cursor-pointer transition-colors duration-100 min-h-16 active:bg-selected${isPlaying ? ' now-playing bg-now-playing' : ''}`}
      onClick={() => onPlay && onPlay(album.spotify_id)}
    >
      {dragHandleProps && (
        <button
          {...dragHandleProps}
          aria-label="Drag to reorder"
          className="bg-transparent border-none text-text-dim cursor-grab active:cursor-grabbing p-1 text-lg touch-none select-none flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          ⠿
        </button>
      )}
```

Create `SortableMobileCard`:

```jsx
function SortableMobileCard({ album, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: album.spotify_id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <MobileAlbumCard
      album={album}
      {...rest}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  )
}
```

**3g.** In the main `AlbumTable` export, add DnD sensors and context. Add after `const isMobile = useIsMobile()` (line 302):

```jsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
)

function handleDragEnd(event) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = sorted.findIndex(a => a.spotify_id === active.id)
  const newIndex = sorted.findIndex(a => a.spotify_id === over.id)
  if (oldIndex === -1 || newIndex === -1) return
  const reordered = arrayMove(sorted, oldIndex, newIndex)
  onReorder?.(reordered.map(a => a.spotify_id))
}
```

**3h.** Wrap the desktop `<tbody>` contents (line 392–418). When `reorderable`, use `DndContext` + `SortableContext` and render `SortableAlbumRow` instead of `DesktopAlbumRow`. Also add the drag-handle column header:

```jsx
{/* Desktop rendering */}
<table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
  <thead>
    <tr>
      {reorderable && <th className="sticky top-0 z-[2] bg-bg border-b border-border" style={{ width: 32 }}></th>}
      <th className="sticky top-0 z-[2] bg-bg border-b border-border" style={{ width: 36 }}></th>
      <th className="sticky top-0 z-[2] bg-bg border-b border-border" style={{ width: 52 }}></th>
      {/* ... existing COLUMNS headers ... */}
    </tr>
  </thead>
  {reorderable ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map(a => a.spotify_id)} strategy={verticalListSortingStrategy}>
        <tbody>
          {sorted.map(album => (
            <SortableAlbumRow
              key={album.spotify_id}
              album={album}
              isExpanded={!!expanded[album.spotify_id]}
              isPlaying={playingId === album.spotify_id}
              expandedEntry={expanded[album.spotify_id]}
              playingTrackId={playingTrackId}
              playingTrackName={playingTrackName}
              onPlay={onPlay}
              onPlayTrack={onPlayTrack}
              onExpand={handleExpand}
              navigateRow={navigateRow}
              collections={collections}
              albumCollectionIds={(albumCollectionMap && albumCollectionMap[album.spotify_id]) || EMPTY_ARRAY}
              onToggleCollection={onToggleCollection}
              onCreateCollection={onCreateCollection}
            />
          ))}
        </tbody>
      </SortableContext>
    </DndContext>
  ) : (
    <tbody>
      {sorted.map(album => (
        <DesktopAlbumRow key={album.spotify_id} album={album} /* ...existing props... */ />
      ))}
    </tbody>
  )}
</table>
```

Do the same wrapping for the mobile rendering path, using `SortableMobileCard` instead of `MobileAlbumCard`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/AlbumTable.test.jsx
```

Expected: PASS — both "shows drag handles" and "does not show drag handles" tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlbumTable.jsx frontend/src/components/AlbumTable.test.jsx
git commit -m "feat: add drag-reorder handles to AlbumTable

- New reorderable + onReorder props
- DnD context with @dnd-kit/sortable wrapping
- Drag handles on both desktop and mobile rows
- Skips sorting when reorderable (preserves collection order)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Wire reorder in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

**Context:** The collection detail view renders `AlbumTable` at lines 479–491 (mobile) and 682–694 (desktop). We need to pass `reorderable` and `onReorder` to both, and the `onReorder` handler calls `PUT /collections/{view.id}/albums/reorder`.

- [ ] **Step 1: Write the failing test — reorder API call**

Add to `frontend/src/App.test.jsx`:

```jsx
it('calls reorder API when albums are reordered in collection detail', async () => {
  // Setup: mock fetch to return auth, albums, collections, and collection albums
  // Navigate into a collection, then trigger onReorder with a new order
  // Assert: fetch was called with PUT /collections/{id}/albums/reorder and correct body
})
```

The exact test depends on the existing App.test.jsx patterns. Write a test that:
1. Mocks `fetch` to simulate being authenticated with albums and collections
2. Navigates into a collection (clicks collection card)
3. Verifies `reorderable` prop is passed to AlbumTable (via the presence of drag handles)

```jsx
describe('Collection drag-reorder', () => {
  it('shows drag handles in collection detail view', async () => {
    // Mock the full fetch chain: auth → albums → collections → collection albums
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: true }) }) // auth
      .mockResolvedValueOnce({ ok: true, json: () => ({ albums: ALBUMS, total: 2 }) }) // library
      .mockResolvedValueOnce({ ok: true, json: () => ([{ id: 'c1', name: 'Late Night', album_count: 2 }]) }) // collections
      .mockResolvedValueOnce({ ok: true, json: () => ({ albums: ALBUMS }) }) // collection albums (eager)
      .mockResolvedValueOnce({ ok: true, json: () => ({}) }) // ensure-snapshot
      .mockResolvedValueOnce({ ok: true, json: () => ({ albums: ALBUMS }) }) // enter collection

    render(<App />)
    await screen.findByText('Late Night')
    await userEvent.click(screen.getByText('Late Night'))
    await screen.findByLabelText('Drag to reorder')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/App.test.jsx -t "drag handles"
```

Expected: FAIL — "Drag to reorder" not found (AlbumTable not passed `reorderable`).

- [ ] **Step 3: Implement reorder wiring in App.jsx**

Add a `handleReorderCollectionAlbums` function after `handleUpdateCollectionDescription` (around line 358):

```jsx
async function handleReorderCollectionAlbums(albumIds) {
  // Optimistic: reorder local state immediately
  setCollectionAlbums(prev => {
    const byId = Object.fromEntries(prev.map(a => [a.spotify_id, a]))
    return albumIds.map(id => byId[id]).filter(Boolean)
  })
  // Fire API call
  try {
    await fetch(`${API}/collections/${view.id}/albums/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ album_ids: albumIds }),
    })
  } catch {
    // On failure, re-fetch to restore server order
    const res = await fetch(`${API}/collections/${view.id}/albums`)
    const data = await res.json()
    setCollectionAlbums(data.albums)
  }
}
```

Then pass `reorderable` and `onReorder` to both AlbumTable instances in the collection detail view. At lines 479–491 (mobile) and 682–694 (desktop), add:

```jsx
<AlbumTable
  albums={filterAlbums(collectionAlbums, search)}
  loading={false}
  onFetchTracks={handleFetchTracks}
  onPlay={handlePlay}
  onPlayTrack={handlePlayTrack}
  playingId={playback.is_playing ? playingId : null}
  playingTrackName={playback.track?.name ?? null}
  collections={collections}
  albumCollectionMap={albumCollectionMap}
  onToggleCollection={handleToggleCollection}
  onCreateCollection={handleCreateCollection}
  reorderable
  onReorder={handleReorderCollectionAlbums}
/>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/App.test.jsx -t "drag handles"
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: wire drag-reorder for collection albums

- handleReorderCollectionAlbums with optimistic update + API call
- Pass reorderable + onReorder to AlbumTable in collection detail view

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Bulk Add

### Task 4: Create BulkAddBar component

**Files:**
- Create: `frontend/src/components/BulkAddBar.jsx`
- Create: `frontend/src/components/BulkAddBar.test.jsx`

**Context:** A floating bar at the bottom of the viewport shown when 1+ albums are selected. Displays count, "Add to Collection" button that opens a collection picker, and a clear (×) button.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/BulkAddBar.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import BulkAddBar from './BulkAddBar'

const COLLECTIONS = [
  { id: 'c1', name: 'Late Night' },
  { id: 'c2', name: 'Road Trip' },
]

describe('BulkAddBar', () => {
  it('shows selected count', () => {
    render(
      <BulkAddBar
        selectedCount={3}
        collections={COLLECTIONS}
        onAddToCollection={vi.fn()}
        onClear={vi.fn()}
      />
    )
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('calls onClear when × is clicked', async () => {
    const onClear = vi.fn()
    render(
      <BulkAddBar
        selectedCount={2}
        collections={COLLECTIONS}
        onAddToCollection={vi.fn()}
        onClear={onClear}
      />
    )
    await userEvent.click(screen.getByLabelText('Clear selection'))
    expect(onClear).toHaveBeenCalled()
  })

  it('shows collection picker and calls onAddToCollection', async () => {
    const onAdd = vi.fn()
    render(
      <BulkAddBar
        selectedCount={2}
        collections={COLLECTIONS}
        onAddToCollection={onAdd}
        onClear={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText('Add to Collection'))
    await userEvent.click(screen.getByText('Late Night'))
    expect(onAdd).toHaveBeenCalledWith('c1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/BulkAddBar.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement BulkAddBar**

Create `frontend/src/components/BulkAddBar.jsx`:

```jsx
import { useState } from 'react'

export default function BulkAddBar({ selectedCount, collections, onAddToCollection, onClear }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border px-4 py-3 flex items-center gap-3 shadow-lg"
         style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
      <span className="text-sm font-semibold text-text">{selectedCount} selected</span>
      <div className="relative ml-auto">
        <button
          className="bg-accent text-white border-none rounded px-3 py-1.5 text-sm font-semibold cursor-pointer"
          onClick={() => setPickerOpen(p => !p)}
        >
          Add to Collection
        </button>
        {pickerOpen && (
          <div className="absolute bottom-full mb-2 right-0 bg-surface border border-border rounded shadow-lg min-w-48 max-h-48 overflow-y-auto">
            {collections.map(c => (
              <button
                key={c.id}
                className="w-full text-left px-3 py-2 text-sm text-text bg-transparent border-none cursor-pointer hover:bg-hover"
                onClick={() => {
                  onAddToCollection(c.id)
                  setPickerOpen(false)
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        aria-label="Clear selection"
        className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1"
        onClick={onClear}
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/BulkAddBar.test.jsx
```

Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BulkAddBar.jsx frontend/src/components/BulkAddBar.test.jsx
git commit -m "feat: add BulkAddBar component for multi-select add

- Shows selected count, collection picker dropdown, clear button
- Floating bar at bottom of viewport

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Add selection overlay to AlbumTable

**Files:**
- Modify: `frontend/src/components/AlbumTable.jsx`
- Modify: `frontend/src/components/AlbumTable.test.jsx`

**Context:** When `selectable` is true, tapping/clicking the album art toggles selection. A checkbox overlay appears on selected albums. The `selectedIds` (Set) and `onToggleSelect` callback are passed as props.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/AlbumTable.test.jsx`:

```jsx
describe('AlbumTable selectable', () => {
  it('shows checkbox overlay when album art is clicked in selectable mode', async () => {
    const onToggleSelect = vi.fn()
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onFetchTracks={vi.fn()}
        selectable
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    )
    // Click on album art area
    const artCells = screen.getAllByRole('img')
    await userEvent.click(artCells[0])
    expect(onToggleSelect).toHaveBeenCalledWith('a1')
  })

  it('shows checkmark on selected albums', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onFetchTracks={vi.fn()}
        selectable
        selectedIds={new Set(['a1'])}
        onToggleSelect={vi.fn()}
      />
    )
    expect(screen.getByTestId('select-check-a1')).toBeInTheDocument()
    expect(screen.queryByTestId('select-check-a2')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/AlbumTable.test.jsx -t "selectable"
```

Expected: FAIL

- [ ] **Step 3: Implement selection overlay**

Add `selectable`, `selectedIds`, and `onToggleSelect` to the AlbumTable props:

```jsx
export default function AlbumTable({
  // ...existing props...
  reorderable = false,
  onReorder,
  selectable = false,
  selectedIds,
  onToggleSelect,
}) {
```

In `DesktopAlbumRow`, modify the album art `<td>` (line 168–179). When `selectable` is true, clicking the art toggles selection instead of playing. Add `selectable`, `isSelected`, `onToggleSelect` props to `DesktopAlbumRow`:

```jsx
<td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle relative"
    onClick={selectable ? (e) => { e.stopPropagation(); onToggleSelect(album.spotify_id) } : undefined}
    style={selectable ? { cursor: 'pointer' } : undefined}
>
  {isPlaying ? (
    /* ...existing equalizer... */
  ) : album.image_url
    ? <img src={album.image_url} alt={album.name} width={40} height={40} className="rounded-sm object-cover block" />
    : <img src={null} alt="No cover" width={40} height={40} className="rounded-sm object-cover block" style={{ background: '#333' }} />
  }
  {selectable && isSelected && (
    <span data-testid={`select-check-${album.spotify_id}`} className="absolute inset-0 flex items-center justify-center bg-accent/70 rounded-sm">
      <span className="text-white text-lg">✓</span>
    </span>
  )}
</td>
```

Apply the same pattern to `MobileAlbumCard`'s album art section (line 61–75). When `selectable`, clicking the art `<div>` toggles selection instead of propagating to the row's `onPlay`:

```jsx
<div className="relative flex-shrink-0 w-11 h-11"
     onClick={selectable ? (e) => { e.stopPropagation(); onToggleSelect(album.spotify_id) } : undefined}
     style={selectable ? { cursor: 'pointer' } : undefined}
>
  {album.image_url
    ? <img src={album.image_url} alt={album.name} width={44} height={44} className="w-11 h-11 rounded object-cover flex-shrink-0" />
    : <div className="w-11 h-11 rounded bg-surface-2" />
  }
  {selectable && isSelected && (
    <span data-testid={`select-check-${album.spotify_id}`} className="absolute inset-0 flex items-center justify-center bg-accent/70 rounded">
      <span className="text-white text-lg">✓</span>
    </span>
  )}
  {/* ...existing playing indicator... */}
</div>
```

Pass `selectable`, `isSelected`, `onToggleSelect` from the parent AlbumTable to both row components.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/AlbumTable.test.jsx -t "selectable"
```

Expected: PASS

- [ ] **Step 5: Run full AlbumTable tests**

```bash
cd frontend && npx vitest run src/components/AlbumTable.test.jsx
```

Expected: All tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AlbumTable.jsx frontend/src/components/AlbumTable.test.jsx
git commit -m "feat: add selectable mode with checkbox overlay to AlbumTable

- New selectable, selectedIds, onToggleSelect props
- Checkbox overlay on album art for selected albums
- Clicking art in selectable mode toggles selection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Wire bulk add in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

**Context:** Add selection state, render `BulkAddBar` when 1+ selected, wire the bulk add API call. Selection only active in the library view.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/App.test.jsx`:

```jsx
describe('Bulk add', () => {
  it('shows BulkAddBar when albums are selected in library', async () => {
    // Mock fetch chain, render App, navigate to library
    // Click on album art to select
    // Assert BulkAddBar appears with "1 selected"
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/App.test.jsx -t "BulkAddBar"
```

Expected: FAIL

- [ ] **Step 3: Implement bulk add wiring**

In `frontend/src/App.jsx`:

**3a.** Add import:

```jsx
import BulkAddBar from './components/BulkAddBar'
```

**3b.** Add selection state (after line 28):

```jsx
const [selectedAlbumIds, setSelectedAlbumIds] = useState(new Set())
```

**3c.** Add toggle and clear handlers:

```jsx
function handleToggleSelect(spotifyId) {
  setSelectedAlbumIds(prev => {
    const next = new Set(prev)
    if (next.has(spotifyId)) next.delete(spotifyId)
    else next.add(spotifyId)
    return next
  })
}

function handleClearSelection() {
  setSelectedAlbumIds(new Set())
}
```

**3d.** Add bulk add handler:

```jsx
async function handleBulkAdd(collectionId) {
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
      if (!next[id]) next[id] = []
      if (!next[id].includes(collectionId)) {
        next[id] = [...next[id], collectionId]
      }
    })
    return next
  })
  // Update collection album count
  setCollections(prev => prev.map(c =>
    c.id === collectionId ? { ...c, album_count: (c.album_count || 0) + ids.length } : c
  ))
  setSelectedAlbumIds(new Set())
}
```

**3e.** Clear selection on view change — add to nav handlers and to the effect or event that changes view:

```jsx
// Clear selection when leaving library
useEffect(() => {
  if (view !== 'library') setSelectedAlbumIds(new Set())
}, [view])
```

**3f.** Add Escape key handler for clearing selection. Add a global keydown effect:

```jsx
useEffect(() => {
  function handleKeyDown(e) {
    if (e.key === 'Escape' && selectedAlbumIds.size > 0) {
      setSelectedAlbumIds(new Set())
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [selectedAlbumIds.size])
```

**3g.** Pass selectable props to AlbumTable in the **library** view (NOT collection detail view). At lines 418–430 (mobile) and 621–633 (desktop):

```jsx
<AlbumTable
  albums={filterAlbums(albums, search)}
  loading={loading}
  onFetchTracks={handleFetchTracks}
  onPlay={handlePlay}
  onPlayTrack={handlePlayTrack}
  playingId={playback.is_playing ? playingId : null}
  playingTrackName={playback.track?.name ?? null}
  collections={collections}
  albumCollectionMap={albumCollectionMap}
  onToggleCollection={handleToggleCollection}
  onCreateCollection={handleCreateCollection}
  selectable
  selectedIds={selectedAlbumIds}
  onToggleSelect={handleToggleSelect}
/>
```

**3h.** Render BulkAddBar when selection is active. Add before the closing `</div>` of the mobile layout (before line 553) and desktop layout (after PlaybackBar area):

```jsx
{selectedAlbumIds.size > 0 && (
  <BulkAddBar
    selectedCount={selectedAlbumIds.size}
    collections={collections}
    onAddToCollection={handleBulkAdd}
    onClear={handleClearSelection}
  />
)}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/App.test.jsx -t "BulkAddBar"
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: wire bulk add with selection state and BulkAddBar

- selectedAlbumIds state (Set) for multi-select in library view
- handleBulkAdd calls POST /collections/{id}/albums/bulk
- BulkAddBar shown when 1+ albums selected
- Escape clears selection, selection clears on view change

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Collection Playback

### Task 7: Add play button to CollectionDetailHeader

**Files:**
- Modify: `frontend/src/components/CollectionDetailHeader.jsx`
- Modify: `frontend/src/components/CollectionDetailHeader.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/CollectionDetailHeader.test.jsx`:

```jsx
it('shows play button and calls onPlay when clicked', async () => {
  const onPlay = vi.fn()
  render(
    <CollectionDetailHeader
      name="Late Night"
      description={null}
      albumCount={5}
      onBack={() => {}}
      onDescriptionChange={() => {}}
      onPlay={onPlay}
    />
  )
  const playBtn = screen.getByLabelText('Play collection')
  await userEvent.click(playBtn)
  expect(onPlay).toHaveBeenCalled()
})

it('does not show play button when albumCount is 0', () => {
  render(
    <CollectionDetailHeader
      name="Empty"
      description={null}
      albumCount={0}
      onBack={() => {}}
      onDescriptionChange={() => {}}
      onPlay={() => {}}
    />
  )
  expect(screen.queryByLabelText('Play collection')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/CollectionDetailHeader.test.jsx -t "play button"
```

Expected: FAIL — "Play collection" not found.

- [ ] **Step 3: Implement play button**

Modify `frontend/src/components/CollectionDetailHeader.jsx`:

```jsx
export default function CollectionDetailHeader({ name, description, albumCount, onBack, onDescriptionChange, onPlay }) {
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
      {albumCount > 0 && onPlay && (
        <button
          aria-label="Play collection"
          className="bg-accent text-white border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer flex-shrink-0 hover:brightness-110 transition-all duration-150"
          onClick={onPlay}
        >
          ▶
        </button>
      )}
      <span className="text-sm text-text-dim flex-shrink-0">{albumCount} albums</span>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/CollectionDetailHeader.test.jsx
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CollectionDetailHeader.jsx frontend/src/components/CollectionDetailHeader.test.jsx
git commit -m "feat: add play button to CollectionDetailHeader

- Play button (▶) shown when albumCount > 0
- Calls onPlay callback

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Implement collection playback state and auto-advance

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

**Context:** New `collectionPlayback` state tracks which collection is playing and the current album index. The play button starts the first album. The polling loop detects when the current album finishes and starts the next.

The polling loop lives in `usePlayback.js` (line 23–46), which polls `/playback/state` every 3s. The response includes `track.album` (album name string) and `is_playing`. We detect album completion by checking if the Spotify context changed away from the current collection album's URI.

However, `usePlayback` only returns `state` — it doesn't expose a callback for poll events. Rather than modifying `usePlayback`, we'll handle auto-advance in App.jsx via a `useEffect` that watches `playback` state changes.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/App.test.jsx`:

```jsx
describe('Collection playback', () => {
  it('starts playing first album when collection play button is clicked', async () => {
    // Mock fetch chain with collection containing 3 albums
    // Navigate to collection detail, click play button
    // Assert: play was called with the first album's context URI
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/App.test.jsx -t "collection play button"
```

Expected: FAIL

- [ ] **Step 3: Implement collection playback**

In `frontend/src/App.jsx`:

**3a.** Add collection playback state (after `selectedAlbumIds` state):

```jsx
// Collection playback: auto-advance through albums in a collection
// Shape: null | { collectionId: string, albumIds: string[], currentIndex: number }
const [collectionPlayback, setCollectionPlayback] = useState(null)
const collectionPlaybackRef = useRef(null)
collectionPlaybackRef.current = collectionPlayback
```

**3b.** Add `handlePlayCollection` function:

```jsx
async function handlePlayCollection() {
  if (!isInCollection || !collectionAlbums.length) return
  const albumIds = collectionAlbums.map(a => a.spotify_id)
  setCollectionPlayback({ collectionId: view.id, albumIds, currentIndex: 0 })
  await handlePlay(albumIds[0])
}
```

**3c.** Add auto-advance effect. This watches `playback` state and detects when the current album finishes:

```jsx
useEffect(() => {
  const cp = collectionPlaybackRef.current
  if (!cp) return

  const currentAlbumId = cp.albumIds[cp.currentIndex]
  const currentAlbum = albums.find(a => a.spotify_id === currentAlbumId) ||
                       collectionAlbums.find(a => a.spotify_id === currentAlbumId)
  if (!currentAlbum) return

  // If playback stopped or the album name no longer matches the collection album,
  // the current album may have finished
  const playbackAlbumName = playback.track?.album
  const isCurrentAlbumPlaying = playbackAlbumName === currentAlbum.name

  if (!isCurrentAlbumPlaying && playingId === currentAlbumId) {
    // The album we were playing has changed context — advance to next
    const nextIndex = cp.currentIndex + 1
    if (nextIndex < cp.albumIds.length) {
      setCollectionPlayback(prev => prev ? { ...prev, currentIndex: nextIndex } : null)
      handlePlay(cp.albumIds[nextIndex])
    } else {
      // Collection finished
      setCollectionPlayback(null)
    }
  }
}, [playback.track?.album, playback.is_playing])
```

**3d.** Clear collection playback when the user navigates away from the collection:

```jsx
// In the existing view-change effect or add a new one:
useEffect(() => {
  if (!isInCollection) return
  // If user navigated to a different collection, clear playback for the old one
  if (collectionPlayback && view.id !== collectionPlayback.collectionId) {
    setCollectionPlayback(null)
  }
}, [view])
```

**3e.** Pass `onPlay` to `CollectionDetailHeader` in both mobile (line 471–477) and desktop (line 674–679):

```jsx
<CollectionDetailHeader
  name={view.name}
  description={view.description ?? null}
  albumCount={filterAlbums(collectionAlbums, search).length}
  onBack={() => setView('collections')}
  onDescriptionChange={(desc) => handleUpdateCollectionDescription(view.id, desc)}
  onPlay={handlePlayCollection}
/>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/App.test.jsx -t "collection play"
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: implement collection playback with auto-advance

- collectionPlayback state tracks active collection and album index
- handlePlayCollection starts first album in collection order
- Auto-advance effect detects album context change and starts next album
- Collection playback clears on navigation or when all albums played

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Cleanup

### Task 9: Update backlog and run E2E smoke test

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Update BACKLOG.md**

Mark the completed items:

```markdown
- [x] Frontend: drag-reorder UI for collection albums
- [x] Frontend: BulkAddBar component for multi-select add
- [ ] Frontend: cover art picker UI  ← remove this line (dropped per spec)
- [x] **Collection playback** — play a collection as an album sequence in curated order, front-to-back
```

And remove the cover art picker line entirely (feature dropped).

- [ ] **Step 2: Run E2E smoke test**

```bash
cd frontend && npx playwright test tests/smoke.spec.js
```

Expected: PASS (smoke test covers basic app load and navigation).

- [ ] **Step 3: Commit**

```bash
git add BACKLOG.md
git commit -m "docs: update backlog — mark organize column features complete

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
