# Cold Start: Remove Full-Screen Spinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop users into the main UI immediately on cold start instead of showing a full-screen spinner. Show pulsing nav indicators while data loads, and inline spinners on pages that have no data yet.

**Architecture:** Replace the single `loading` boolean with granular `albumsLoading` and `collectionsLoading` states. Remove the full-screen spinner early-return. Each view handles its own empty/loading state inline. Nav buttons (desktop header + mobile BottomTabBar) pulse when their data is still loading.

**Tech Stack:** React state, Tailwind CSS `animate-pulse`/`animate-spin`

---

### Task 1: Replace `loading` state with `albumsLoading` in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:35-37` (state declarations)
- Modify: `frontend/src/App.jsx:107-124` (loadData cold/warm start)
- Modify: `frontend/src/App.jsx:157-171` (loadData server fetch)
- Modify: `frontend/src/App.jsx:213-229` (loadData finally block)

- [ ] **Step 1: Write failing test — cold start renders main UI immediately, no full-screen spinner**

In `frontend/src/App.test.jsx`, add to the `App — sync/loading bug fixes` describe block:

```jsx
it('cold start drops into main UI immediately without full-screen spinner', async () => {
  clearLocalStorageCache()

  let resolveAlbums
  const albumsPromise = new Promise(res => { resolveAlbums = res })

  global.fetch = vi.fn().mockImplementation((url, options) => {
    // Albums fetch hangs
    if (url.includes('/library/albums') && !url.includes('/tracks')) {
      return albumsPromise
    }
    if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
    }
    if (url.includes('/library/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    if (url.includes('/collections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
    }
    if (url.includes('/home')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })

  render(<App />)

  // Main UI should be visible immediately — no full-screen spinner
  // The header/nav should be present even though albums haven't loaded
  await waitFor(() => {
    expect(screen.queryByText(/syncing your library/i)).not.toBeInTheDocument()
  })
  // Home tab is default view, should be rendering
  expect(screen.getByText('Home')).toBeInTheDocument()

  // Cleanup: resolve pending fetch
  resolveAlbums({ ok: true, json: () => Promise.resolve({ albums: [], total: 0 }) })
  await waitFor(() => {})
  clearLocalStorageCache()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — cold start still shows full-screen spinner

- [ ] **Step 3: Implement state changes in App.jsx**

Replace state declarations at line 35-37:

```jsx
// OLD:
const [loading, setLoading] = useState(true)
const [loadingMessage, setLoadingMessage] = useState('Loading...')

// NEW:
const [albumsLoading, setAlbumsLoading] = useState(true)
const [collectionsLoading, setCollectionsLoading] = useState(true)
```

Update cold start path at lines 119-124:

```jsx
// OLD:
} else {
  // Cold start: loading screen with progress message
  setAlbums([])
  setLoading(true)
  setLoadingMessage('Syncing your library...')
}

// NEW:
} else {
  // Cold start: drop into UI, data will load in background
  setAlbums([])
  setAlbumsLoading(true)
}
```

Update warm start path at lines 114-118:

```jsx
// OLD:
if (!isColdStart) {
  setAlbums(cached.albums)
  setLoading(false)
  setSyncing(true)

// NEW:
if (!isColdStart) {
  setAlbums(cached.albums)
  setAlbumsLoading(false)
  setSyncing(true)
```

Update collections promise (line 127-155) — set `collectionsLoading` false when done:

At start of the collections IIFE (after `const collectionsPromise = (async () => {`), no change needed. At the end, after `setAlbumCollectionMap(map)` (line 151), add:

```jsx
setAlbumCollectionMap(map)
setCollectionsLoading(false)
```

And in the catch block at line 152-154:

```jsx
} catch {
  setCollectionsLoading(false)
}
```

Update server albums fetch section (lines 157-171). After `setAlbums(serverAlbums)` inside the `if (serverAlbums.length > 0)` block, and the `if (isColdStart)` block we added in the prior commit:

```jsx
if (serverAlbums.length > 0) {
  setAlbums(serverAlbums)
  setAlbumsLoading(false)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      albums: serverAlbums,
      total: serverAlbums.length,
      cachedAt: new Date().toISOString(),
    }))
  } catch { /* storage full or unavailable */ }
}
```

Remove the `if (isColdStart)` block we added in the prior commit (lines 164-167) — no longer needed since we always set `albumsLoading(false)` here regardless of cold/warm.

Remove the `setLoadingMessage` call inside the sync loop (lines 187-190) — no loading message UI anymore.

Remove `setLoadingMessage('Loading collections...')` at line 216.

Update the `finally` block (lines 227-230):

```jsx
} finally {
  setAlbumsLoading(false)
  setSyncing(false)
}
```

- [ ] **Step 4: Remove full-screen spinner early-return**

Delete lines 653-658:

```jsx
// DELETE THIS ENTIRE BLOCK:
if (loading) return (
  <div className="flex flex-col items-center justify-center h-dvh gap-4">
    <div className="w-9 h-9 border-[3px] border-border border-t-accent rounded-full animate-spin" />
    {loadingMessage && <p className="text-sm text-text-dim">{loadingMessage}</p>}
  </div>
)
```

- [ ] **Step 5: Update error early-return**

The error screen at lines 660-671 references `loading`. Update:

```jsx
if (error) return (
  <div className="p-8">
    <p className="text-[#f88]">Error: {error}</p>
    <button
      onClick={loadData}
      disabled={albumsLoading}
      className="mt-4 px-5 py-2 bg-surface-2 text-text border border-border rounded-lg text-base disabled:text-text-dim disabled:cursor-default transition-colors duration-150 hover:bg-hover"
    >
      {albumsLoading ? 'Loading...' : 'Retry'}
    </button>
  </div>
)
```

- [ ] **Step 6: Update `loading` prop passed to AlbumTable**

At line 713 (mobile) and the equivalent desktop line, `loading` is passed to AlbumTable. Update both:

```jsx
loading={albumsLoading}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.jsx --reporter=verbose 2>&1 | tail -30`
Expected: New test passes. Some existing tests may fail due to `loading` → `albumsLoading` rename — we'll fix those in Task 4.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "Replace loading with albumsLoading/collectionsLoading, remove full-screen spinner [26]"
```

---

### Task 2: Add pulse indicators to nav buttons

**Files:**
- Modify: `frontend/src/App.jsx:874-899` (desktop nav buttons)
- Modify: `frontend/src/App.jsx:838-848` (BottomTabBar usage)
- Modify: `frontend/src/components/BottomTabBar.jsx:26,41` (accept + use collectionsLoading)

- [ ] **Step 1: Write failing test — Library pulses during albumsLoading, Collections pulses during collectionsLoading**

In `frontend/src/App.test.jsx`, add:

```jsx
it('Library nav pulses while albums are loading on cold start', async () => {
  clearLocalStorageCache()

  let resolveAlbums
  const albumsPromise = new Promise(res => { resolveAlbums = res })

  global.fetch = vi.fn().mockImplementation((url, options) => {
    if (url.includes('/library/albums') && !url.includes('/tracks')) {
      return albumsPromise
    }
    if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
    }
    if (url.includes('/library/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    if (url.includes('/collections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
    }
    if (url.includes('/home')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })

  render(<App />)

  // Library button text should pulse while albums loading
  await waitFor(() => {
    const libraryBtn = screen.getByRole('button', { name: /library/i })
    expect(libraryBtn.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  // Resolve albums fetch
  resolveAlbums({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })

  // After albums load + sync completes, pulse should stop
  await waitFor(() => {
    const libraryBtn = screen.getByRole('button', { name: /library/i })
    expect(libraryBtn.querySelector('.animate-pulse')).not.toBeInTheDocument()
  })

  clearLocalStorageCache()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx -t "Library nav pulses" --reporter=verbose 2>&1 | tail -20`

- [ ] **Step 3: Update desktop nav — Library button**

In `frontend/src/App.jsx`, the desktop Library button (around line 884):

```jsx
// OLD:
<span className={syncing ? 'animate-pulse' : undefined}>Library</span>

// NEW:
<span className={(albumsLoading || syncing) ? 'animate-pulse' : undefined}>Library</span>
```

- [ ] **Step 4: Update desktop nav — Collections button**

The desktop Collections button (around line 898):

```jsx
// OLD:
Collections

// NEW:
<span className={collectionsLoading ? 'animate-pulse' : undefined}>Collections</span>
```

- [ ] **Step 5: Pass props to BottomTabBar**

In `frontend/src/App.jsx` at the BottomTabBar usage (line 838):

```jsx
<BottomTabBar
  activeTab={view === 'home' || view === 'library' || view === 'collections' ? view : 'collections'}
  onTabChange={(tab) => {
    if (tab === 'digest') {
      setDigestOpen(d => !d)
    } else {
      setView(tab)
      setSearch('')
    }
  }}
  syncing={albumsLoading || syncing}
  collectionsLoading={collectionsLoading}
/>
```

- [ ] **Step 6: Update BottomTabBar to pulse Collections tab**

In `frontend/src/components/BottomTabBar.jsx`, update the component:

```jsx
// OLD (line 26):
export default function BottomTabBar({ activeTab, onTabChange, syncing }) {

// NEW:
export default function BottomTabBar({ activeTab, onTabChange, syncing, collectionsLoading }) {
```

Update the span at line 41:

```jsx
// OLD:
<span className={`text-xs${tab.id === 'library' && syncing ? ' animate-pulse' : ''}`}>{tab.label}</span>

// NEW:
<span className={`text-xs${(tab.id === 'library' && syncing) || (tab.id === 'collections' && collectionsLoading) ? ' animate-pulse' : ''}`}>{tab.label}</span>
```

- [ ] **Step 7: Run tests**

Run: `cd frontend && npx vitest run src/App.test.jsx --reporter=verbose 2>&1 | tail -30`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/BottomTabBar.jsx frontend/src/App.test.jsx
git commit -m "Add pulse indicators to Library and Collections nav during loading [26]"
```

---

### Task 3: Add inline loading spinners to Library and Collections views

**Files:**
- Modify: `frontend/src/App.jsx:708-745` (mobile library view)
- Modify: `frontend/src/App.jsx:748-766` (mobile collections view)
- Modify: `frontend/src/App.jsx:935-960` (desktop library view)
- Modify: `frontend/src/App.jsx:962-985` (desktop collections view)

- [ ] **Step 1: Write failing test — Library view shows inline spinner when albumsLoading and no albums**

In `frontend/src/App.test.jsx`:

```jsx
it('shows inline spinner in Library view on cold start while albums load', async () => {
  clearLocalStorageCache()

  let resolveAlbums
  const albumsPromise = new Promise(res => { resolveAlbums = res })

  global.fetch = vi.fn().mockImplementation((url, options) => {
    if (url.includes('/library/albums') && !url.includes('/tracks')) {
      return albumsPromise
    }
    if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
      return new Promise(() => {}) // hang
    }
    if (url.includes('/collections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
    }
    if (url.includes('/home')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })

  render(<App />)

  // Navigate to Library
  const libraryBtn = await screen.findByRole('button', { name: /library/i })
  await userEvent.click(libraryBtn)

  // Should show inline spinner, not full-screen
  await waitFor(() => {
    expect(screen.getByTestId('inline-loading-spinner')).toBeInTheDocument()
  })

  // Resolve albums
  resolveAlbums({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })

  // Spinner should disappear, album should render
  await waitFor(() => {
    expect(screen.queryByTestId('inline-loading-spinner')).not.toBeInTheDocument()
  })
  expect(screen.getByText('Cached Album')).toBeInTheDocument()

  clearLocalStorageCache()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx -t "inline spinner" --reporter=verbose 2>&1 | tail -20`

- [ ] **Step 3: Add inline spinner to Library view (mobile + desktop)**

In both mobile (line ~708) and desktop (line ~935) library view sections, wrap the existing content:

```jsx
{view === 'library' && (
  <div className="flex-1 overflow-y-auto">
    {albumsLoading && albums.length === 0 ? (
      <div data-testid="inline-loading-spinner" className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-[2.5px] border-border border-t-accent rounded-full animate-spin" />
      </div>
    ) : librarySubView === 'albums' ? (
      <AlbumTable ... />
    ) : (
      <ArtistsView ... />
    )}
  </div>
)}
```

Keep all existing props on AlbumTable and ArtistsView unchanged.

- [ ] **Step 4: Add inline spinner to Collections view (mobile + desktop)**

In both mobile (line ~748) and desktop (line ~962) collections view sections:

```jsx
{view === 'collections' && (
  <div className="flex-1 overflow-y-auto">
    {collectionsLoading && collections.length === 0 ? (
      <div data-testid="inline-loading-spinner" className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-[2.5px] border-border border-t-accent rounded-full animate-spin" />
      </div>
    ) : (
      <CollectionsPane ... />
    )}
  </div>
)}
```

Keep all existing props on CollectionsPane unchanged.

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/App.test.jsx --reporter=verbose 2>&1 | tail -30`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "Add inline loading spinners to Library and Collections views [26]"
```

---

### Task 4: Fix existing tests broken by loading → albumsLoading rename

**Files:**
- Modify: `frontend/src/App.test.jsx` (multiple locations)

The rename from `loading` to `albumsLoading` and removal of `loadingMessage` will break tests that:
- Assert on `syncing your library` loading message (no longer shown)
- Assert on `loading collections` message (no longer shown)
- Expect a full-screen spinner early-return

- [ ] **Step 1: Find and list all broken tests**

Run: `cd frontend && npx vitest run src/App.test.jsx --reporter=verbose 2>&1 | grep -E 'FAIL|✗|×'`

Identify each failing test.

- [ ] **Step 2: Fix each broken test**

For each failing test, update assertions. Common fixes:
- Tests checking for `syncing your library` message: remove or replace with checking for inline spinner / nav pulse
- Tests checking for `loading collections` message: remove or replace with checking for collections pulse
- Tests expecting full-screen spinner: update to check for inline spinner or nav state
- Any reference to `loading` in test assertions about the UI state: update to match new behavior

The cold-start test from the prior commit (`renders albums and hides spinner on cold start as soon as Supabase cache returns, before sync completes`) should still work conceptually but may need assertion updates since there's no spinner to hide — instead verify the Library nav pulse stops and albums are visible.

- [ ] **Step 3: Run full test suite**

Run: `cd frontend && npx vitest run src/App.test.jsx --reporter=verbose 2>&1 | tail -40`
Expected: ALL tests pass

- [ ] **Step 4: Run BottomTabBar tests too**

Run: `cd frontend && npx vitest run src/components/BottomTabBar.test.jsx --reporter=verbose 2>&1 | tail -20`

Fix any failures from the new `collectionsLoading` prop.

- [ ] **Step 5: Run full frontend test suite**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: ALL tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.test.jsx frontend/src/components/BottomTabBar.test.jsx
git commit -m "Update tests for loading state refactor [26]"
```

---

### Task 5: Clean up unused state and dead code

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Remove `loadingMessage` state**

Delete the `const [loadingMessage, setLoadingMessage] = useState(...)` declaration (was line 36). Search for any remaining references to `loadingMessage` or `setLoadingMessage` and remove them.

- [ ] **Step 2: Verify no remaining references to old `loading` state**

Search for `setLoading(` and `loading` in App.jsx to confirm all have been updated to `albumsLoading`/`setAlbumsLoading`. The `authLoading` reference (line 57) is unrelated — leave it.

Also check that `loading` prop passed to AlbumTable uses `albumsLoading`.

- [ ] **Step 3: Run full test suite**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: ALL tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "Remove unused loadingMessage state and dead code [26]"
```
