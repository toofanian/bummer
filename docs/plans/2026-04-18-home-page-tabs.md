# Home Page Tabs + Digest Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert home page from stacked sections to tabbed (mobile) / columnar (desktop) layout, and rename "changelog" to "digest" throughout the frontend.

**Architecture:** Home page mirrors the ChangelogView pattern: `useIsMobile()` hook determines layout. Mobile renders a tab bar + one section at a time. Desktop renders 4 equal-width scrollable columns. The digest rename is a straightforward find-and-replace across 6 files.

**Tech Stack:** React, Vite, Vitest, React Testing Library, Tailwind CSS

---

### Task 1: Rename ChangelogView to DigestView

**Files:**
- Rename: `frontend/src/components/ChangelogView.jsx` → `frontend/src/components/DigestView.jsx`
- Rename: `frontend/src/components/ChangelogView.test.jsx` → `frontend/src/components/DigestView.test.jsx`
- Modify: `frontend/src/components/BottomTabBar.jsx:19`
- Modify: `frontend/src/components/BottomTabBar.test.jsx:18`
- Modify: `frontend/src/App.jsx` (lines 7, 87, 759, 900, 902, 994, 1117-1120, 1217, 1219)

- [ ] **Step 1: Rename component files**

```bash
cd frontend/src/components
mv ChangelogView.jsx DigestView.jsx
mv ChangelogView.test.jsx DigestView.test.jsx
```

- [ ] **Step 2: Update DigestView.jsx — rename component and internal state**

In `DigestView.jsx`, change the export:

```jsx
// was: export default function ChangelogView({ onPlay, session }) {
export default function DigestView({ onPlay, session }) {
```

Change internal `ChangelogSection` to `ChangesSection` (rename the function definition and all 4 JSX references to it).

Change the default tab state:

```jsx
// was: const [activeTab, setActiveTab] = useState('changelog')
const [activeTab, setActiveTab] = useState('changes')
```

Update the tab map array:

```jsx
// was: {['changelog', 'history', 'stats'].map(tab => (
{['changes', 'history', 'stats'].map(tab => (
```

Update the tab label conditional:

```jsx
// was: {tab === 'changelog' ? 'Changes' : tab === 'history' ? 'History' : 'Stats'}
{tab === 'changes' ? 'Changes' : tab === 'history' ? 'History' : 'Stats'}
```

Update the tab content conditional:

```jsx
// was: {activeTab === 'changelog' && (
{activeTab === 'changes' && (
```

- [ ] **Step 3: Update DigestView.test.jsx — rename import**

```jsx
// was: import ChangelogView from './ChangelogView'
import DigestView from './DigestView'
```

Replace all `<ChangelogView` with `<DigestView` in JSX (5 occurrences).

Rename the describe block:

```jsx
// was: describe('ChangelogView', () => {
describe('DigestView', () => {
```

- [ ] **Step 4: Update BottomTabBar.jsx — rename label and id**

Change the TABS entry at line 19:

```jsx
// was: { id: 'changelog', label: 'Changelog', icon: (
{ id: 'digest', label: 'Digest', icon: (
```

- [ ] **Step 5: Update BottomTabBar.test.jsx — update assertion**

Change line 18:

```jsx
// was: expect(screen.getByRole('button', { name: /changelog/i })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /digest/i })).toBeInTheDocument()
```

- [ ] **Step 6: Update App.jsx — all changelog references**

Replace import (line 7):

```jsx
// was: import ChangelogView from './components/ChangelogView'
import DigestView from './components/DigestView'
```

Replace all `'changelog'` string literals with `'digest'` in view state comparisons and setters. These are at lines 87, 759, 900, 994, 1117, 1119, 1120, 1217. Specifically:

- `view !== 'changelog'` → `view !== 'digest'`
- `view === 'changelog'` → `view === 'digest'`
- `setView('changelog')` → `setView('digest')`
- `? 'Changelog'` → `? 'Digest'`
- `aria-label="Library changelog"` → `aria-label="Library digest"`
- `title="Library Changelog"` → `title="Library Digest"`

Replace both `<ChangelogView` JSX tags with `<DigestView`.

- [ ] **Step 7: Run all tests**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass. DigestView tests use the renamed component, BottomTabBar tests check for "digest" label.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/DigestView.jsx frontend/src/components/DigestView.test.jsx frontend/src/components/BottomTabBar.jsx frontend/src/components/BottomTabBar.test.jsx frontend/src/App.jsx
git add frontend/src/components/ChangelogView.jsx frontend/src/components/ChangelogView.test.jsx
git commit -m "Rename ChangelogView to DigestView throughout frontend (#80)"
```

Note: `git add` the old paths to stage the deletion if `git mv` wasn't used.

---

### Task 2: Rewrite HomePage — tests first

**Files:**
- Modify: `frontend/src/components/HomePage.test.jsx`
- Modify: `frontend/src/components/HomePage.jsx`

The new HomePage uses `useIsMobile()` to switch between mobile tabs and desktop columns. Each section renders albums as a vertical list (thumbnail + name + artist per row), not the horizontal-scroll AlbumRow cards.

- [ ] **Step 1: Write new tests for the tabbed/columnar HomePage**

Replace `frontend/src/components/HomePage.test.jsx` with:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import HomePage from './HomePage'
import { useIsMobile } from '../hooks/useIsMobile'

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false)
}))

const HOME_DATA = {
  today: [
    { service_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
  ],
  this_week: [
    { service_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
  ],
  recently_added: [
    { service_id: 'a5', name: 'New Album', artists: ['Artist D'], image_url: 'https://img/5.jpg' },
  ],
  rediscover: [
    { service_id: 'a3', name: 'Old Gem', artists: ['Artist C'], image_url: 'https://img/3.jpg' },
  ],
  recommended: [
    { service_id: 'a4', name: 'Try This', artists: ['Artist A'], image_url: 'https://img/4.jpg' },
  ],
}

beforeEach(() => {
  vi.restoreAllMocks()
  useIsMobile.mockReturnValue(false)
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_DATA) })
  )
})

describe('HomePage', () => {
  // Desktop: columns
  it('renders all four columns on desktop', async () => {
    useIsMobile.mockReturnValue(false)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.getByText('You Might Like')).toBeInTheDocument()
      expect(screen.getByText('Rediscover')).toBeInTheDocument()
    })
  })

  it('renders album names in desktop columns', async () => {
    useIsMobile.mockReturnValue(false)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Today Album')).toBeInTheDocument()
      expect(screen.getByText('New Album')).toBeInTheDocument()
      expect(screen.getByText('Try This')).toBeInTheDocument()
      expect(screen.getByText('Old Gem')).toBeInTheDocument()
    })
  })

  // Mobile: tabs
  it('renders tab switcher on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /recently played/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /recently added/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /you might like/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /rediscover/i })).toBeInTheDocument()
    })
  })

  it('defaults to Recently Played tab on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Today Album')).toBeInTheDocument()
      // Other sections not visible
      expect(screen.queryByText('Old Gem')).not.toBeInTheDocument()
    })
  })

  it('switches tabs on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Today Album')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: /rediscover/i }))
    await waitFor(() => {
      expect(screen.getByText('Old Gem')).toBeInTheDocument()
      expect(screen.queryByText('Today Album')).not.toBeInTheDocument()
    })
  })

  // Deduplication
  it('deduplicates albums in Recently Played (keeps first occurrence)', async () => {
    const duped = {
      ...HOME_DATA,
      this_week: [
        { service_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
        { service_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
      ],
    }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(duped) })
    )
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      const items = screen.getAllByText('Today Album')
      expect(items).toHaveLength(1)
    })
  })

  // onPlay callback
  it('calls onPlay when an album is clicked', async () => {
    const onPlay = vi.fn()
    render(<HomePage onPlay={onPlay} />)
    await waitFor(() => {
      expect(screen.getByText('Today Album')).toBeInTheDocument()
    })
    screen.getByText('Today Album').closest('[data-testid]').click()
    expect(onPlay).toHaveBeenCalledWith('a1')
  })

  // Empty states
  it('shows per-section empty state when a section has no albums', async () => {
    const sparse = {
      today: [], this_week: [], recently_added: [],
      rediscover: HOME_DATA.rediscover, recommended: [],
    }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(sparse) })
    )
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    // Default tab (Recently Played) should show empty message
    await waitFor(() => {
      expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
    })
  })

  it('shows global empty state when all sections are empty', async () => {
    const empty = { today: [], this_week: [], recently_added: [], rediscover: [], recommended: [] }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(empty) })
    )
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/start playing albums/i)).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}))
    render(<HomePage onPlay={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --run src/components/HomePage.test.jsx
```

Expected: most tests FAIL because HomePage still uses the old stacked layout with AlbumRow (no tabs, no columns, no `useIsMobile`).

- [ ] **Step 3: Rewrite HomePage.jsx**

Replace `frontend/src/components/HomePage.jsx` with:

```jsx
import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import { useIsMobile } from '../hooks/useIsMobile'

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

function AlbumList({ albums, onPlay }) {
  if (!albums || albums.length === 0) {
    return <div className="px-4 py-6 text-text-dim text-sm italic">Nothing yet</div>
  }

  return (
    <div>
      {albums.map(album => (
        <div
          key={album.service_id}
          data-testid={`album-item-${album.service_id}`}
          onClick={() => onPlay(album.service_id)}
          className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2"
        >
          {album.image_url && (
            <img src={album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text truncate">{album.name ?? 'Unknown album'}</div>
            <div className="text-xs text-text-dim truncate">{album.artists?.join(', ') ?? 'Unknown artist'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'played', label: 'Recently Played' },
  { id: 'added', label: 'Recently Added' },
  { id: 'recommended', label: 'You Might Like' },
  { id: 'rediscover', label: 'Rediscover' },
]

export default function HomePage({ onPlay, session }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('played')

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    apiFetch(`/home?tz=${encodeURIComponent(tz)}`, {}, session)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p className="p-6 text-text-dim">Loading...</p>

  const sections = data ? {
    played: mergeRecentlyPlayed(data.today, data.this_week),
    added: data.recently_added ?? [],
    recommended: data.recommended ?? [],
    rediscover: data.rediscover ?? [],
  } : { played: [], added: [], recommended: [], rediscover: [] }

  const isEmpty = Object.values(sections).every(s => s.length === 0)

  if (!data || isEmpty) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-text-dim text-base">
        <p>Start playing albums to see your listening history here.</p>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex border-b border-border flex-shrink-0" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${
                activeTab === tab.id ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <AlbumList albums={sections[activeTab]} onPlay={onPlay} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {TABS.map((tab, i) => (
        <div key={tab.id} className={`flex-1 overflow-y-auto${i < TABS.length - 1 ? ' border-r border-border' : ''}`}>
          <div className="px-4 pt-3 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">{tab.label}</div>
          <AlbumList albums={sections[tab.id]} onPlay={onPlay} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --run src/components/HomePage.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass (HomePage + DigestView + BottomTabBar + everything else).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HomePage.jsx frontend/src/components/HomePage.test.jsx
git commit -m "Rewrite HomePage as tabbed (mobile) / columnar (desktop) layout (#80)"
```
