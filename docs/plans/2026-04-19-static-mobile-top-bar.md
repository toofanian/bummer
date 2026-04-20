# Static Mobile Top Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile top bar static across all bottom-tab views — same layout regardless of which view is active.

**Architecture:** Replace the dynamic mobile header (changing title + conditional controls) with a static bar showing "Bummer" branding + search/settings icons. Relocate the library Albums/Artists toggle into an inline tab bar within the library content area. Relocate the create-collection button/input into the CollectionsPane content area. Search icon uses `visibility: hidden` on views without search to reserve space.

**Tech Stack:** React, Tailwind CSS, Vitest + React Testing Library

---

## File Structure

| File | Change | Responsibility |
|------|--------|---------------|
| `frontend/src/App.jsx` | Modify (lines 777-850, 852-900) | Static header JSX; inline library tab bar below header |
| `frontend/src/components/CollectionsPane.jsx` | Modify | Add inline create-collection button + input at top of list |
| `frontend/src/components/CollectionsPane.test.jsx` | Modify | Tests for inline create button |
| `frontend/src/App.mobile-layout.test.jsx` | Modify | Tests for static header, search visibility, library tabs |
| `frontend/src/components/LibraryViewToggle.jsx` | No change | Desktop still uses it from desktop header; mobile no longer uses it |

---

### Task 1: Static Mobile Header

Replace the dynamic mobile header with a static layout. The header renders identically on every view.

**Files:**
- Modify: `frontend/src/App.mobile-layout.test.jsx`
- Modify: `frontend/src/App.jsx:777-850`

- [ ] **Step 1: Write failing tests for static header**

Add to `frontend/src/App.mobile-layout.test.jsx`:

```jsx
it('shows Bummer branding in mobile header', async () => {
  mockMatchMedia(true)
  render(<App />)
  const header = await waitFor(() => document.querySelector('header'))
  expect(header.textContent).toContain('Bummer')
})

it('does not show dynamic view title in mobile header', async () => {
  mockMatchMedia(true)
  render(<App />)
  const header = await waitFor(() => document.querySelector('header'))
  // Should not contain the old dynamic titles
  expect(header.textContent).not.toContain('Home')
  expect(header.textContent).not.toContain('Library')
  expect(header.textContent).not.toContain('Digest')
})

it('shows settings button in mobile header', async () => {
  mockMatchMedia(true)
  render(<App />)
  await waitFor(() => document.querySelector('header'))
  expect(screen.getByLabelText('Settings')).toBeInTheDocument()
})

it('shows search button in mobile header on all views', async () => {
  mockMatchMedia(true)
  render(<App />)
  await waitFor(() => document.querySelector('header'))
  // Search button should exist in DOM (rendered) on home view
  expect(screen.getByLabelText('Search')).toBeInTheDocument()
})

it('hides search button visually on views without search', async () => {
  mockMatchMedia(true)
  render(<App />)
  // Home is the default view — search should be invisible
  const searchBtn = await waitFor(() => screen.getByLabelText('Search'))
  expect(searchBtn).toHaveStyle({ visibility: 'hidden' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/App.mobile-layout.test.jsx`
Expected: FAIL — header still shows "Home" not "Bummer", search button conditional

- [ ] **Step 3: Implement static header**

In `frontend/src/App.jsx`, replace lines 777-850 (the mobile `<header>` block) with:

```jsx
<header className="sticky top-0 z-[100] bg-surface border-b border-border flex items-center px-4 py-2 gap-3" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
  <h1 className="flex-1 text-base font-semibold">Bummer</h1>
  <button
    onClick={() => setSearchOpen(true)}
    aria-label="Search"
    className="bg-transparent border-none p-1.5 cursor-pointer transition-colors duration-150 text-text-dim hover:text-text"
    title="Search"
    style={{ visibility: (view === 'library' || view === 'collections') ? 'visible' : 'hidden' }}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  </button>
  <button
    onClick={() => setView('settings')}
    aria-label="Settings"
    className={`bg-transparent border-none p-1.5 cursor-pointer transition-colors duration-150 ${view === 'settings' ? 'text-text' : 'text-text-dim hover:text-text'}`}
    title="Settings"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </button>
</header>
```

Key changes:
- `<h1>` always shows "Bummer" with `flex-1` to push icons right
- Search button always rendered, `visibility` toggled by view
- Settings button always rendered (unchanged)
- Removed: `LibraryViewToggle`, create collection input/button, dynamic title

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/App.mobile-layout.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.mobile-layout.test.jsx
git commit -m "Make mobile header static with Bummer branding [94]

- Replace dynamic title with static 'Bummer' text
- Search icon always rendered, visibility:hidden on non-search views
- Settings gear always visible
- Remove LibraryViewToggle and create collection controls from header

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Inline Library Tab Bar

Add an Albums/Artists tab bar at the top of the library content area on mobile, matching the tab styling from HomePage and DigestView.

**Files:**
- Modify: `frontend/src/App.mobile-layout.test.jsx`
- Modify: `frontend/src/App.jsx:859-900` (mobile library content area)

- [ ] **Step 1: Write failing tests for inline library tabs**

Add to `frontend/src/App.mobile-layout.test.jsx`:

```jsx
import userEvent from '@testing-library/user-event'

it('shows Albums/Artists tabs in library content area on mobile', async () => {
  mockMatchMedia(true)
  render(<App />)
  // Navigate to library view
  const libraryTab = await waitFor(() => screen.getByRole('tab', { name: /library/i }))
  await userEvent.click(libraryTab)
  // Should find Albums and Artists tabs inside the content area (not header)
  const albumsTab = await waitFor(() => screen.getByRole('tab', { name: /albums/i }))
  const artistsTab = screen.getByRole('tab', { name: /artists/i })
  expect(albumsTab).toBeInTheDocument()
  expect(artistsTab).toBeInTheDocument()
  // Tabs should NOT be inside the header
  const header = document.querySelector('header')
  expect(header).not.toContainElement(albumsTab)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.mobile-layout.test.jsx`
Expected: FAIL — no Albums/Artists tabs in content area (they were in the header, now removed)

- [ ] **Step 3: Implement inline library tab bar**

In `frontend/src/App.jsx`, find the mobile library content block (around line 859):

```jsx
{view === 'library' && (
  <div className="flex-1 overflow-y-auto">
```

Replace with:

```jsx
{view === 'library' && (
  <div className="flex-1 flex flex-col overflow-hidden">
    <div className="flex border-b border-border flex-shrink-0" role="tablist">
      <button
        role="tab"
        aria-selected={librarySubView === 'albums'}
        onClick={() => setLibrarySubView('albums')}
        className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${
          librarySubView === 'albums' ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'
        }`}
      >
        Albums ({albums.length})
      </button>
      <button
        role="tab"
        aria-selected={librarySubView === 'artists'}
        onClick={() => setLibrarySubView('artists')}
        className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${
          librarySubView === 'artists' ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'
        }`}
      >
        Artists{artistCount != null ? ` (${artistCount})` : ''}
      </button>
    </div>
    <div className="flex-1 overflow-y-auto">
```

And close the extra `</div>` after the library content block's closing `</div>`.

The tab styling matches HomePage and DigestView exactly:
- `flex-1 py-2 text-xs font-bold tracking-wider uppercase`
- Active: `text-text border-b-2 border-accent`
- Inactive: `text-text-dim hover:text-text`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/App.mobile-layout.test.jsx`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd frontend && npx vitest run`
Expected: All tests pass. If `LibraryViewToggle.test.jsx` tests fail, check whether they test mobile-specific behavior that no longer applies.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.mobile-layout.test.jsx
git commit -m "Add inline Albums/Artists tab bar in library content area [94]

- Tab bar matches HomePage/DigestView styling (uppercase, border-accent)
- Replaces pill toggle that was removed from header in previous commit

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Polish Tab Styling

Unify and improve tab styling across all mobile tab bars (HomePage, DigestView, new library tabs). Changes: taller tap targets, animated sliding underline, opacity-based active/inactive contrast. No new colors — uses existing `text`, `text-dim`, `accent` tokens only.

**Files:**
- Create: `frontend/src/components/TabBar.jsx`
- Create: `frontend/src/components/TabBar.test.jsx`
- Modify: `frontend/src/components/HomePage.jsx:72-86`
- Modify: `frontend/src/components/DigestView.jsx:274-283`
- Modify: `frontend/src/App.jsx` (library tabs from Task 2)
- Modify: `frontend/src/tailwind.css` (add tab underline animation utility)

- [ ] **Step 1: Add tab underline CSS utility**

In `frontend/src/tailwind.css`, add inside the `@layer utilities` block:

```css
  .tab-underline {
    position: relative;
  }
  .tab-underline::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 0;
    height: 2px;
    background: var(--color-accent);
    transition: width 0.2s ease, left 0.2s ease;
  }
  .tab-underline[aria-selected="true"]::after {
    width: 100%;
    left: 0;
  }
```

- [ ] **Step 2: Write failing test for TabBar component**

Create `frontend/src/components/TabBar.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TabBar from './TabBar'

describe('TabBar', () => {
  const tabs = [
    { id: 'one', label: 'One' },
    { id: 'two', label: 'Two' },
    { id: 'three', label: 'Three' },
  ]

  it('renders all tabs', () => {
    render(<TabBar tabs={tabs} activeTab="one" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'One' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Two' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Three' })).toBeInTheDocument()
  })

  it('marks active tab with aria-selected', () => {
    render(<TabBar tabs={tabs} activeTab="two" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabChange when tab clicked', async () => {
    const onChange = vi.fn()
    render(<TabBar tabs={tabs} activeTab="one" onTabChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Three' }))
    expect(onChange).toHaveBeenCalledWith('three')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/TabBar.test.jsx`
Expected: FAIL — TabBar module doesn't exist

- [ ] **Step 4: Implement TabBar component**

Create `frontend/src/components/TabBar.jsx`:

```jsx
export default function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div className="flex border-b border-border flex-shrink-0" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`tab-underline flex-1 py-3 text-xs font-semibold tracking-wider uppercase transition-all duration-200 bg-transparent border-none cursor-pointer ${
            activeTab === tab.id ? 'text-text' : 'text-text-dim'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

Key styling decisions:
- `py-3` (12px vertical) — taller than before (`py-2` was 8px), bigger tap target
- `font-semibold` instead of `font-bold` — slightly lighter, less shouty
- `tab-underline` CSS class — animated underline via pseudo-element
- Active uses `text-text`, inactive uses `text-text-dim` — existing tokens, no new colors
- Removed `border-b-2 border-accent` inline styling — replaced by CSS pseudo-element animation

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/TabBar.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TabBar.jsx frontend/src/components/TabBar.test.jsx frontend/src/tailwind.css
git commit -m "Add shared TabBar component with animated underline [94]

- Reusable tab bar for mobile views
- Animated underline via CSS transition on pseudo-element
- Taller tap targets (py-3), font-semibold typography

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Replace HomePage tabs with TabBar**

In `frontend/src/components/HomePage.jsx`, replace lines 72-86 (the mobile tab bar):

```jsx
<TabBar
  tabs={TABS.map(t => ({ id: t.id, label: t.shortLabel }))}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

Add import at top:
```jsx
import TabBar from './TabBar'
```

- [ ] **Step 8: Replace DigestView tabs with TabBar**

In `frontend/src/components/DigestView.jsx`, replace lines 274-283 (the mobile tab bar):

```jsx
<TabBar
  tabs={[
    { id: 'changes', label: 'Changes' },
    { id: 'history', label: 'History' },
    { id: 'stats', label: 'Stats' },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

Add import at top:
```jsx
import TabBar from './TabBar'
```

- [ ] **Step 9: Replace library inline tabs with TabBar**

In `frontend/src/App.jsx`, replace the inline library tab bar (added in Task 2) with:

```jsx
<TabBar
  tabs={[
    { id: 'albums', label: `Albums (${albums.length})` },
    { id: 'artists', label: `Artists${artistCount != null ? ` (${artistCount})` : ''}` },
  ]}
  activeTab={librarySubView}
  onTabChange={setLibrarySubView}
/>
```

Add import at top:
```jsx
import TabBar from './components/TabBar'
```

- [ ] **Step 10: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass. HomePage and DigestView tests should still pass since the rendered structure (role="tablist", role="tab", aria-selected) is identical.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/HomePage.jsx frontend/src/components/DigestView.jsx frontend/src/App.jsx
git commit -m "Adopt shared TabBar in HomePage, DigestView, and library tabs [94]

- Consistent styling across all mobile tab bars
- Animated underline, taller tap targets

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Inline Create Collection Button

Move the create-collection button and name input from the (now-static) header into the CollectionsPane content area. The state (`showCollectionCreate`, `collectionCreateName`) and handler (`handleCreateCollection`) stay in App.jsx and are passed as props.

**Files:**
- Modify: `frontend/src/components/CollectionsPane.test.jsx`
- Modify: `frontend/src/components/CollectionsPane.jsx:157,280-292`
- Modify: `frontend/src/App.jsx` (pass new props to CollectionsPane in mobile block)

- [ ] **Step 1: Write failing tests for inline create button**

Add to `frontend/src/components/CollectionsPane.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock useIsMobile to return true for mobile tests
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => true,
}))

// Minimal import after mocks
import CollectionsPane from './CollectionsPane'

describe('CollectionsPane inline create', () => {
  const baseProps = {
    collections: [],
    onEnter: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onFetchAlbums: vi.fn(),
    albumCollectionMap: {},
    collectionsForPicker: [],
    session: { access_token: 'test' },
    onBulkAdd: vi.fn(),
    onCreateCollection: vi.fn(),
    onReorder: null,
    showCreate: false,
    onShowCreateChange: vi.fn(),
    createName: '',
    onCreateNameChange: vi.fn(),
    onCreateSubmit: vi.fn(),
  }

  it('renders create collection button when showCreate is false', () => {
    render(<CollectionsPane {...baseProps} />)
    expect(screen.getByLabelText('Create collection')).toBeInTheDocument()
  })

  it('renders name input when showCreate is true', () => {
    render(<CollectionsPane {...baseProps} showCreate={true} />)
    expect(screen.getByPlaceholderText(/collection name/i)).toBeInTheDocument()
  })

  it('calls onShowCreateChange when create button clicked', async () => {
    render(<CollectionsPane {...baseProps} />)
    await userEvent.click(screen.getByLabelText('Create collection'))
    expect(baseProps.onShowCreateChange).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`
Expected: FAIL — CollectionsPane doesn't accept or render `showCreate` props yet

- [ ] **Step 3: Add create button to CollectionsPane**

In `frontend/src/components/CollectionsPane.jsx`, update the function signature to accept new props:

```jsx
export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onRename, onFetchAlbums, albumCollectionMap, collectionsForPicker, session, onBulkAdd, onCreateCollection, onReorder, showCreate, onShowCreateChange, createName, onCreateNameChange, onCreateSubmit }) {
```

Then, in the return JSX, add a create bar above the collection list. Find the line (around 280):

```jsx
return (
    <div className="w-full flex flex-col h-full overflow-hidden">
```

After the opening `<div>`, add:

```jsx
      {isMobile && (
        <div className="flex items-center px-4 py-2 border-b border-border flex-shrink-0">
          {showCreate ? (
            <input
              autoFocus
              className="bg-surface-2 text-text border border-border rounded-full px-3 py-1 text-sm flex-1 min-w-0"
              placeholder="Collection name\u2026"
              value={createName}
              onChange={e => onCreateNameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && createName.trim()) {
                  onCreateSubmit(createName.trim())
                } else if (e.key === 'Escape') {
                  onShowCreateChange(false)
                }
              }}
              onBlur={() => onShowCreateChange(false)}
            />
          ) : (
            <button
              className="bg-transparent border-none text-text-dim cursor-pointer p-1.5 rounded transition-colors duration-150 hover:text-text"
              onClick={() => onShowCreateChange(true)}
              aria-label="Create collection"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 4: Pass create props from App.jsx**

In `frontend/src/App.jsx`, find the mobile `CollectionsPane` render (around line 905-942). Add the new props:

```jsx
showCreate={showCollectionCreate}
onShowCreateChange={setShowCollectionCreate}
createName={collectionCreateName}
onCreateNameChange={setCollectionCreateName}
onCreateSubmit={(name) => {
  handleCreateCollection(name)
  setCollectionCreateName('')
  setShowCollectionCreate(false)
}}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/CollectionsPane.test.jsx`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CollectionsPane.jsx frontend/src/components/CollectionsPane.test.jsx frontend/src/App.jsx
git commit -m "Move create collection button into CollectionsPane content area [94]

- Add inline create button/input at top of collections list (mobile only)
- Pass create state as props from App.jsx
- Desktop create button in header unchanged

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Verify and Clean Up

Run full suite, check for dead code, verify desktop is untouched.

**Files:**
- Modify: `frontend/src/App.jsx` (if cleanup needed)

- [ ] **Step 1: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Verify desktop header is unchanged**

Read `frontend/src/App.jsx` around line 1084-1183 (desktop header block). Confirm it still has:
- "Bummer" logo
- Navigation buttons (Home, Library, Collections)
- LibraryViewToggle (when in library)
- Create collection button/input (when in collections)
- Search input
- Digest and Settings buttons

No changes should have been made to the desktop block.

- [ ] **Step 3: Check for dead imports**

If `LibraryViewToggle` is no longer referenced in the mobile block but is still used in the desktop block, no cleanup needed. If it's no longer imported at all, remove the import.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add frontend/src/App.jsx
git commit -m "Clean up dead code from static header refactor [94]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
