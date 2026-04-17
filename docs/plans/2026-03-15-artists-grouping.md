# Artists Grouping View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Artists" sub-view within the Library tab that groups saved albums by artist, with artist detail pages.

**Architecture:** Client-side only — no new API calls. Group the existing `albums` array by artist name. A `LibraryViewToggle` pill switches between Albums/Artists sub-views. Clicking an artist navigates to a detail page showing that artist's albums in the existing `AlbumTable`.

**Tech Stack:** React, Vitest, React Testing Library

**Spec:** `docs/specs/2026-03-14-artists-grouping-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/LibraryViewToggle.jsx` | Create | Pill toggle: Albums/Artists with album count |
| `frontend/src/components/LibraryViewToggle.test.jsx` | Create | Tests for pill toggle |
| `frontend/src/components/ArtistsView.jsx` | Create | Artist list + artist detail (handles own internal nav) |
| `frontend/src/components/ArtistsView.test.jsx` | Create | Tests for artist list, search filtering, detail navigation |
| `frontend/src/App.jsx` | Modify | Add `libraryView` state, render toggle + conditional view |
| `frontend/src/App.test.jsx` | Modify | Tests for Library tab rename, toggle rendering, view switching |

---

## Chunk 1: LibraryViewToggle Component

### Task 1: LibraryViewToggle

**Files:**
- Create: `frontend/src/components/LibraryViewToggle.jsx`
- Create: `frontend/src/components/LibraryViewToggle.test.jsx`

- [ ] **Step 1: Write failing tests**

In `frontend/src/components/LibraryViewToggle.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import LibraryViewToggle from './LibraryViewToggle'

describe('LibraryViewToggle', () => {
  it('renders Albums and Artists tabs', () => {
    render(<LibraryViewToggle activeView="albums" onViewChange={() => {}} albumCount={42} />)
    expect(screen.getByRole('tab', { name: /albums/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /artists/i })).toBeInTheDocument()
  })

  it('shows album count in Albums label', () => {
    render(<LibraryViewToggle activeView="albums" onViewChange={() => {}} albumCount={342} />)
    expect(screen.getByRole('tab', { name: /albums/i })).toHaveTextContent('Albums (342)')
  })

  it('marks the active tab as selected', () => {
    render(<LibraryViewToggle activeView="artists" onViewChange={() => {}} albumCount={10} />)
    expect(screen.getByRole('tab', { name: /artists/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /albums/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onViewChange when a tab is clicked', async () => {
    const onChange = vi.fn()
    render(<LibraryViewToggle activeView="albums" onViewChange={onChange} albumCount={10} />)
    await userEvent.click(screen.getByRole('tab', { name: /artists/i }))
    expect(onChange).toHaveBeenCalledWith('artists')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/LibraryViewToggle.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

In `frontend/src/components/LibraryViewToggle.jsx`:

```jsx
export default function LibraryViewToggle({ activeView, onViewChange, albumCount }) {
  return (
    <div role="tablist" className="inline-flex bg-surface-2 rounded-full p-0.5 gap-0.5">
      <button
        role="tab"
        aria-selected={activeView === 'albums'}
        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-150 border-none cursor-pointer ${
          activeView === 'albums' ? 'bg-surface text-text' : 'bg-transparent text-text-dim hover:text-text'
        }`}
        onClick={() => onViewChange('albums')}
      >
        Albums ({albumCount})
      </button>
      <button
        role="tab"
        aria-selected={activeView === 'artists'}
        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-150 border-none cursor-pointer ${
          activeView === 'artists' ? 'bg-surface text-text' : 'bg-transparent text-text-dim hover:text-text'
        }`}
        onClick={() => onViewChange('artists')}
      >
        Artists
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/LibraryViewToggle.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git -C frontend/.. add frontend/src/components/LibraryViewToggle.jsx frontend/src/components/LibraryViewToggle.test.jsx
git -C frontend/.. commit -m "feat: add LibraryViewToggle pill component

- Albums/Artists pill toggle with role=tablist
- Shows album count in Albums label
- Styled as rounded pill with active state

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: ArtistsView Component

### Task 2: ArtistsView — Artist List

**Files:**
- Create: `frontend/src/components/ArtistsView.jsx`
- Create: `frontend/src/components/ArtistsView.test.jsx`

- [ ] **Step 1: Write failing tests for artist list rendering**

In `frontend/src/components/ArtistsView.test.jsx`:

```jsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ArtistsView from './ArtistsView'

const ALBUMS = [
  { spotify_id: 'a1', name: 'OK Computer', artists: ['Radiohead'], image_url: '/rc1.jpg', release_date: '1997', added_at: '2024-01-01', total_tracks: 12 },
  { spotify_id: 'a2', name: 'Kid A', artists: ['Radiohead'], image_url: '/rc2.jpg', release_date: '2000', added_at: '2024-02-01', total_tracks: 10 },
  { spotify_id: 'a3', name: 'Blue Train', artists: ['John Coltrane'], image_url: '/jc1.jpg', release_date: '1958', added_at: '2024-03-01', total_tracks: 5 },
  { spotify_id: 'a4', name: 'Dummy', artists: ['Portishead'], image_url: '/ph1.jpg', release_date: '1994', added_at: '2024-04-01', total_tracks: 11 },
]

const defaultProps = {
  albums: ALBUMS,
  search: '',
  onFetchTracks: vi.fn().mockResolvedValue([]),
  onPlay: vi.fn(),
  onPlayTrack: vi.fn(),
  playingId: null,
  playingTrackName: null,
  collections: [],
  albumCollectionMap: {},
  onToggleCollection: vi.fn(),
  onCreateCollection: vi.fn(),
}

describe('ArtistsView — artist list', () => {
  it('groups albums by artist and shows sorted artist names', () => {
    render(<ArtistsView {...defaultProps} />)
    const artists = screen.getAllByTestId(/^artist-row-/)
    const names = artists.map(el => within(el).getByTestId('artist-name').textContent)
    expect(names).toEqual(['John Coltrane', 'Portishead', 'Radiohead'])
  })

  it('shows album count per artist', () => {
    render(<ArtistsView {...defaultProps} />)
    const radioheadRow = screen.getByTestId('artist-row-Radiohead')
    expect(radioheadRow).toHaveTextContent('2 albums')
  })

  it('shows composite thumbnail from up to 4 album covers', () => {
    render(<ArtistsView {...defaultProps} />)
    const radioheadRow = screen.getByTestId('artist-row-Radiohead')
    const images = within(radioheadRow).getAllByRole('img')
    expect(images.length).toBe(2) // Radiohead has 2 albums
  })

  it('filters artists by artist name matching search', () => {
    render(<ArtistsView {...defaultProps} search="coltrane" />)
    const artists = screen.getAllByTestId(/^artist-row-/)
    expect(artists.length).toBe(1)
    expect(artists[0]).toHaveTextContent('John Coltrane')
  })

  it('filters artists by album name matching search (shows all artist albums)', () => {
    render(<ArtistsView {...defaultProps} search="kid a" />)
    const artists = screen.getAllByTestId(/^artist-row-/)
    expect(artists.length).toBe(1)
    expect(artists[0]).toHaveTextContent('Radiohead')
    // Should still show both Radiohead albums (all albums preserved when artist matches via album)
  })

  it('shows empty state when no artists match search', () => {
    render(<ArtistsView {...defaultProps} search="zzzzz" />)
    expect(screen.queryAllByTestId(/^artist-row-/)).toHaveLength(0)
    expect(screen.getByText(/no artists/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ArtistsView.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write artist list implementation**

In `frontend/src/components/ArtistsView.jsx`:

```jsx
import { useState, useMemo } from 'react'
import AlbumTable from './AlbumTable'
import { useIsMobile } from '../hooks/useIsMobile'

function groupByArtist(albums) {
  const map = {}
  for (const album of albums) {
    for (const artist of album.artists) {
      if (!map[artist]) map[artist] = []
      map[artist].push(album)
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, albums]) => ({ name, albums }))
}

function filterArtistGroups(groups, search) {
  if (!search) return groups
  const q = search.toLowerCase()
  return groups.filter(group =>
    group.name.toLowerCase().includes(q) ||
    group.albums.some(a => a.name.toLowerCase().includes(q))
  )
}

function ArtistThumbnail({ albums, artistName }) {
  const covers = albums.slice(0, 4).map(a => a.image_url).filter(Boolean)
  if (covers.length === 0) {
    return (
      <div className="w-11 h-11 rounded bg-surface-2 flex items-center justify-center text-text-dim text-lg font-semibold flex-shrink-0">
        {artistName.charAt(0).toUpperCase()}
      </div>
    )
  }
  return (
    <div className="w-11 h-11 rounded overflow-hidden flex-shrink-0 grid grid-cols-2 grid-rows-2 gap-px bg-surface-2">
      {covers.map((url, i) => (
        <img key={i} src={url} alt="" className="w-full h-full object-cover" />
      ))}
    </div>
  )
}

export default function ArtistsView({
  albums,
  search,
  onFetchTracks,
  onPlay,
  onPlayTrack,
  playingId,
  playingTrackName,
  collections,
  albumCollectionMap,
  onToggleCollection,
  onCreateCollection,
}) {
  const [selectedArtist, setSelectedArtist] = useState(null)
  const isMobile = useIsMobile()

  const allGroups = useMemo(() => groupByArtist(albums), [albums])
  const filteredGroups = useMemo(() => filterArtistGroups(allGroups, search), [allGroups, search])

  // Artist detail view
  if (selectedArtist) {
    const artistAlbums = albums.filter(a => a.artists.includes(selectedArtist))
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
          <button
            className="text-sm text-text-dim transition-colors duration-150 hover:text-text"
            onClick={() => setSelectedArtist(null)}
          >
            ← Back
          </button>
          <h2 className="text-base font-semibold">{selectedArtist}</h2>
          <span className="text-sm text-text-dim">{artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AlbumTable
            albums={artistAlbums}
            loading={false}
            onFetchTracks={onFetchTracks}
            onPlay={onPlay}
            onPlayTrack={onPlayTrack}
            playingId={playingId}
            playingTrackName={playingTrackName}
            collections={collections}
            albumCollectionMap={albumCollectionMap}
            onToggleCollection={onToggleCollection}
            onCreateCollection={onCreateCollection}
          />
        </div>
      </div>
    )
  }

  // Artist list view
  if (filteredGroups.length === 0) {
    return <p className="p-4 text-sm text-text-dim italic">No artists found.</p>
  }

  return (
    <div className="flex flex-col">
      {filteredGroups.map(group => (
        <div
          key={group.name}
          data-testid={`artist-row-${group.name}`}
          className={`flex items-center gap-3 border-b border-border cursor-pointer transition-colors duration-100 hover:bg-hover ${
            isMobile ? 'px-4 py-2.5 min-h-16' : 'px-4 py-2'
          }`}
          onClick={() => setSelectedArtist(group.name)}
        >
          <ArtistThumbnail albums={group.albums} artistName={group.name} />
          <div className="flex-1 min-w-0">
            <div data-testid="artist-name" className="text-sm font-semibold text-text truncate">{group.name}</div>
            <div className="text-xs text-text-dim">{group.albums.length} {group.albums.length === 1 ? 'album' : 'albums'}</div>
          </div>
          <span className="text-text-dim text-sm flex-shrink-0">›</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ArtistsView.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Write failing tests for artist detail navigation**

Add to `frontend/src/components/ArtistsView.test.jsx`:

```jsx
describe('ArtistsView — artist detail', () => {
  it('navigates to artist detail when an artist row is clicked', async () => {
    render(<ArtistsView {...defaultProps} />)
    await userEvent.click(screen.getByTestId('artist-row-Radiohead'))
    expect(screen.getByText('← Back')).toBeInTheDocument()
    expect(screen.getByText('Radiohead')).toBeInTheDocument()
    expect(screen.getByText('2 albums')).toBeInTheDocument()
  })

  it('shows all albums by the selected artist in an AlbumTable', async () => {
    render(<ArtistsView {...defaultProps} />)
    await userEvent.click(screen.getByTestId('artist-row-Radiohead'))
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
    expect(screen.getByText('Kid A')).toBeInTheDocument()
    expect(screen.queryByText('Blue Train')).not.toBeInTheDocument()
  })

  it('returns to artist list when Back is clicked', async () => {
    render(<ArtistsView {...defaultProps} />)
    await userEvent.click(screen.getByTestId('artist-row-Radiohead'))
    await userEvent.click(screen.getByText('← Back'))
    expect(screen.getByTestId('artist-row-Radiohead')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests to verify they pass (implementation already handles detail view)**

Run: `cd frontend && npx vitest run src/components/ArtistsView.test.jsx`
Expected: PASS (9 tests)

- [ ] **Step 7: Commit**

```bash
git -C frontend/.. add frontend/src/components/ArtistsView.jsx frontend/src/components/ArtistsView.test.jsx
git -C frontend/.. commit -m "feat: add ArtistsView component with grouping and detail navigation

- Groups albums by artist name, sorted alphabetically
- Composite thumbnail grid (up to 4 album covers)
- Search filters by artist name or album name
- Artist detail shows filtered AlbumTable with back navigation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: App.jsx Integration

### Task 3: Wire ArtistsView and LibraryViewToggle into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`

- [ ] **Step 1: Write failing tests for integration**

Add to `frontend/src/App.test.jsx` (or create a focused test file if App.test.jsx is large):

```jsx
// Test: Desktop nav shows "Library" instead of "Albums"
// Test: LibraryViewToggle renders when Library tab is active
// Test: Clicking Artists pill shows ArtistsView
// Test: Clicking Albums pill shows AlbumTable
// Test: libraryView persists when navigating away and back
```

The specific test code depends on the existing App.test.jsx structure. The agent should:

1. Verify the desktop nav button text changed from "Albums (N)" to "Library"
2. Verify `LibraryViewToggle` renders inside the `<nav>` when `view === 'library'`
3. Verify clicking "Artists" tab in the toggle renders `ArtistsView`
4. Verify clicking "Albums" tab shows `AlbumTable`
5. Verify switching to Collections and back preserves the active sub-view

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/App.test.jsx`

- [ ] **Step 3: Modify App.jsx**

Key changes to `frontend/src/App.jsx`:

1. Add import: `import ArtistsView from './components/ArtistsView'`
2. Add import: `import LibraryViewToggle from './components/LibraryViewToggle'`
3. State `librarySubView` already exists (line 30): `const [librarySubView, setLibrarySubView] = useState('albums')`

**Desktop layout changes:**

- Rename the "Albums" nav button to "Library" (remove album count from this button)
- After the Library nav button (inside `<nav>`), conditionally render `LibraryViewToggle` when `view === 'library'`:
  ```jsx
  {view === 'library' && (
    <LibraryViewToggle
      activeView={librarySubView}
      onViewChange={setLibrarySubView}
      albumCount={albums.length}
    />
  )}
  ```
- Remove the existing `<h1>Library ...</h1>` (line 449) — replace with just the version badge or remove entirely since "Library" is now the tab name
- In the `view === 'library'` section, conditionally render based on `librarySubView`:
  ```jsx
  {view === 'library' && (
    <div className="flex-1 overflow-y-auto">
      {librarySubView === 'albums' ? (
        <AlbumTable ... />
      ) : (
        <ArtistsView
          albums={albums}
          search={search}
          onFetchTracks={handleFetchTracks}
          onPlay={handlePlay}
          onPlayTrack={handlePlayTrack}
          playingId={playback.is_playing ? playingId : null}
          playingTrackName={playback.track?.name ?? null}
          collections={collections}
          albumCollectionMap={albumCollectionMap}
          onToggleCollection={handleToggleCollection}
          onCreateCollection={handleCreateCollection}
        />
      )}
    </div>
  )}
  ```

**Mobile layout changes:**

- Add `LibraryViewToggle` in the mobile header when `view === 'library'`:
  ```jsx
  {view === 'library' && (
    <LibraryViewToggle
      activeView={librarySubView}
      onViewChange={setLibrarySubView}
      albumCount={albums.length}
    />
  )}
  ```
  Place this between the `<h1>` and the search input in the mobile header.
- In the mobile `view === 'library'` section, same conditional render as desktop (AlbumTable vs ArtistsView based on `librarySubView`).

**Important:** Pass unfiltered `albums` (not `filterAlbums(albums, search)`) to `ArtistsView` — ArtistsView handles its own filtering via the `search` prop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: PASS

- [ ] **Step 5: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git -C frontend/.. add frontend/src/App.jsx frontend/src/App.test.jsx
git -C frontend/.. commit -m "feat: integrate Artists grouping view into Library tab

- Rename desktop 'Albums' tab to 'Library'
- Add LibraryViewToggle pill in nav (desktop) and header (mobile)
- Conditionally render AlbumTable or ArtistsView based on active sub-view
- ArtistsView receives unfiltered albums and search string

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
