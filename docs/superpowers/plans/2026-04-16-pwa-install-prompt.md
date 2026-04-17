# PWA Install Prompt & Settings Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the settings dropdown with a full settings page that includes PWA install instructions and links feedback to GitHub Discussions.

**Architecture:** The gear icon becomes a view navigation trigger (`setView('settings')`). A new `SettingsPage` component renders the full page with sections: Install App, Send Feedback, Log Out, Delete Account. Platform detection uses `navigator.userAgent` to show relevant install instructions.

**Tech Stack:** React 19, Vitest, React Testing Library, Tailwind CSS 4

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/SettingsPage.jsx` | Create | Full settings page with all sections |
| `frontend/src/components/SettingsPage.test.jsx` | Create | Tests for settings page |
| `frontend/src/components/SettingsMenu.jsx` | Delete | Replaced by SettingsPage |
| `frontend/src/components/SettingsMenu.test.jsx` | Delete | Replaced by SettingsPage tests |
| `frontend/src/App.jsx` | Modify | Wire `view === 'settings'`, pass `setView` to gear icon trigger |

---

### Task 1: Create SettingsPage component with back navigation

**Files:**
- Create: `frontend/src/components/SettingsPage.test.jsx`
- Create: `frontend/src/components/SettingsPage.jsx`

- [ ] **Step 1: Write failing tests for SettingsPage rendering and back button**

```jsx
// frontend/src/components/SettingsPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }))
vi.mock('../supabaseClient', () => ({
  default: { auth: { signOut } },
}))

vi.stubGlobal('fetch', vi.fn())

import SettingsPage from './SettingsPage'

const fakeSession = { access_token: 'supabase-jwt' }

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a heading', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/SettingsPage.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create minimal SettingsPage component**

```jsx
// frontend/src/components/SettingsPage.jsx
import { useState } from 'react'
import supabase from '../supabaseClient'
import { apiFetch } from '../api'

export default function SettingsPage({ onLogout, session, onBack }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="bg-transparent border-none text-text-dim p-1.5 cursor-pointer hover:text-text transition-colors duration-150"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-text">Settings</h1>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/SettingsPage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SettingsPage.jsx frontend/src/components/SettingsPage.test.jsx
git commit -m "feat: scaffold SettingsPage with back navigation"
```

---

### Task 2: Add Install App section with platform detection

**Files:**
- Modify: `frontend/src/components/SettingsPage.test.jsx`
- Modify: `frontend/src/components/SettingsPage.jsx`

- [ ] **Step 1: Write failing tests for install instructions**

Append to `SettingsPage.test.jsx` inside the `describe` block:

```jsx
  it('shows install app section', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByText(/install app/i)).toBeInTheDocument()
  })

  it('shows iOS instructions when user agent contains iPhone', () => {
    const original = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true })
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument()
    Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true })
  })

  it('shows Chrome instructions when user agent contains Chrome', () => {
    const original = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: 'Chrome/100', configurable: true })
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByText(/install.*address bar/i)).toBeInTheDocument()
    Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true })
  })
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd frontend && npx vitest run src/components/SettingsPage.test.jsx`
Expected: FAIL — "install app" text not found

- [ ] **Step 3: Add install section to SettingsPage**

Add this helper function above the component default export in `SettingsPage.jsx`:

```jsx
function getInstallInstructions() {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) {
    return 'In Safari, tap the Share button then "Add to Home Screen".'
  }
  if (/Android/.test(ua)) {
    return 'Tap the browser menu (three dots) and select "Add to Home Screen" or "Install App".'
  }
  if (/Chrome/.test(ua)) {
    return 'Click the install icon in your browser\'s address bar.'
  }
  if (/Firefox/.test(ua)) {
    return 'Firefox doesn\'t support PWA install yet. Try opening this page in Chrome or Edge.'
  }
  return 'Look for an "Install" or "Add to Home Screen" option in your browser\'s menu.'
}
```

Add this JSX inside the `max-w-lg` div, after the header div:

```jsx
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Install App</h2>
          <p className="text-sm text-text">
            Bummer works best as an installed app. {getInstallInstructions()}
          </p>
        </section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/SettingsPage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SettingsPage.jsx frontend/src/components/SettingsPage.test.jsx
git commit -m "feat: add Install App section with platform-specific instructions"
```

---

### Task 3: Add Send Feedback, Log Out, and Delete Account sections

**Files:**
- Modify: `frontend/src/components/SettingsPage.test.jsx`
- Modify: `frontend/src/components/SettingsPage.jsx`

- [ ] **Step 1: Write failing tests for remaining sections**

Append to `SettingsPage.test.jsx` inside the `describe` block:

```jsx
  it('has a GitHub Discussions link for feedback', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    const link = screen.getByRole('link', { name: /send feedback/i })
    expect(link).toHaveAttribute('href', 'https://github.com/toofanian/bummer/discussions')
  })

  it('calls onLogout when Log Out is clicked', () => {
    const onLogout = vi.fn()
    render(<SettingsPage onLogout={onLogout} session={fakeSession} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(onLogout).toHaveBeenCalled()
  })

  it('shows delete account button', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument()
  })

  it('opens delete confirmation modal and requires typing DELETE', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    const confirm = screen.getByRole('button', { name: /permanently delete/i })
    expect(confirm).toBeDisabled()
    const input = screen.getByPlaceholderText(/DELETE/)
    fireEvent.change(input, { target: { value: 'delete' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: 'DELETE' } })
    expect(confirm).not.toBeDisabled()
  })

  it('calls DELETE /auth/account and signs out on confirm', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
    const origLocation = window.location
    delete window.location
    window.location = { ...origLocation, reload: vi.fn(), assign: vi.fn() }

    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    fireEvent.change(screen.getByPlaceholderText(/DELETE/), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain('/auth/account')
    expect(opts.method).toBe('DELETE')
    expect(opts.headers.Authorization).toBe('Bearer supabase-jwt')
    await waitFor(() => expect(signOut).toHaveBeenCalled())

    window.location = origLocation
  })

  it('shows error when delete request fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'Server error' }) })
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    fireEvent.change(screen.getByPlaceholderText(/DELETE/), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument())
    expect(signOut).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd frontend && npx vitest run src/components/SettingsPage.test.jsx`
Expected: FAIL — links/buttons not found

- [ ] **Step 3: Add remaining sections to SettingsPage**

Replace the return statement in `SettingsPage.jsx` with the full page. The delete account logic is lifted from `SettingsMenu.jsx`:

```jsx
export default function SettingsPage({ onLogout, session, onBack }) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleDeleteConfirm() {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await apiFetch('/auth/account', { method: 'DELETE' }, session)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? 'Failed to delete account')
      }
      localStorage.clear()
      await supabase.auth.signOut()
      window.location.assign('/')
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  function closeDeleteModal() {
    setDeleteModalOpen(false)
    setConfirmText('')
    setDeleteError('')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="bg-transparent border-none text-text-dim p-1.5 cursor-pointer hover:text-text transition-colors duration-150"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-text">Settings</h1>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Install App</h2>
          <p className="text-sm text-text">
            Bummer works best as an installed app. {getInstallInstructions()}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Feedback</h2>
          <a
            href="https://github.com/toofanian/bummer/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text hover:text-accent transition-colors duration-150 no-underline"
          >
            Send Feedback
          </a>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Account</h2>
          <button
            onClick={onLogout}
            className="text-left text-sm text-text bg-transparent border-none cursor-pointer p-0 hover:text-accent transition-colors duration-150"
          >
            Log Out
          </button>
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="text-left text-sm text-red-400 bg-transparent border-none cursor-pointer p-0 hover:text-red-300 transition-colors duration-150"
          >
            Delete account
          </button>
        </section>
      </div>

      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal() }}
        >
          <div className="bg-surface border border-border rounded-lg p-6 max-w-md w-full flex flex-col gap-4">
            <h2 className="text-lg font-bold text-text">Delete account?</h2>
            <p className="text-sm text-text-dim">
              This will permanently delete your Bummer account and all associated data —
              your Spotify tokens, collections, tags, ratings, play history, and library
              snapshots. This cannot be undone.
            </p>
            <p className="text-sm text-text-dim">
              Type <span className="font-mono text-text">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="bg-gray-800 rounded-lg px-3 py-2 text-white border border-gray-700 focus:outline-none focus:border-white font-mono text-sm"
              autoFocus
            />
            {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 py-2 text-sm text-text bg-transparent border border-border rounded hover:bg-hover transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={confirmText !== 'DELETE' || deleting}
                className="px-4 py-2 text-sm text-white bg-red-600 border-none rounded hover:bg-red-500 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting\u2026' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/SettingsPage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SettingsPage.jsx frontend/src/components/SettingsPage.test.jsx
git commit -m "feat: add feedback, logout, and delete account sections to SettingsPage"
```

---

### Task 4: Wire SettingsPage into App.jsx and remove old SettingsMenu

**Files:**
- Modify: `frontend/src/App.jsx:29,718-742,912-970`
- Delete: `frontend/src/components/SettingsMenu.jsx`
- Delete: `frontend/src/components/SettingsMenu.test.jsx`

- [ ] **Step 1: Update App.jsx — add settings view and replace SettingsMenu import**

In `App.jsx`:

Replace the import:
```jsx
// old
import SettingsMenu from './components/SettingsMenu'
// new
import SettingsPage from './components/SettingsPage'
```

The gear icon needs to be inline in the header now (both mobile and desktop). Replace both `<SettingsMenu onLogout={handleLogout} session={session} />` occurrences (lines ~742 and ~970) with:

```jsx
          <button
            onClick={() => setView('settings')}
            aria-label="Settings"
            className="bg-transparent border-none text-text-dim p-1.5 cursor-pointer hover:text-text transition-colors duration-150"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
```

- [ ] **Step 2: Add settings view rendering in mobile layout**

In the mobile layout's content area (after the `isInCollection` block, before `selectedAlbumIds.size > 0` check), add:

```jsx
          {view === 'settings' && (
            <SettingsPage onLogout={handleLogout} session={session} onBack={() => setView('home')} />
          )}
```

- [ ] **Step 3: Add settings view rendering in desktop layout**

In the desktop layout's content area (follow the same pattern as mobile — after existing view blocks), add:

```jsx
        {view === 'settings' && (
          <SettingsPage onLogout={handleLogout} session={session} onBack={() => setView('home')} />
        )}
```

- [ ] **Step 4: Update header title for settings view (mobile)**

In the mobile header h1 (line ~723), update the ternary to include settings:

```jsx
{view === 'home' ? 'Home' : view === 'library' ? 'Library' : view === 'collections' ? 'Collections' : view === 'settings' ? 'Settings' : view?.name ?? 'Collection'}
```

- [ ] **Step 5: Hide search bar and other nav elements when on settings page**

In the mobile header, the search bar is conditionally shown. Add `&& view !== 'settings'` to its condition:

```jsx
{(view === 'library' || view === 'collections' || isInCollection) && view !== 'settings' && (
```

The `BottomTabBar` activeTab logic should treat settings like a neutral state:

```jsx
activeTab={view === 'home' || view === 'library' || view === 'collections' ? view : view === 'settings' ? null : 'collections'}
```

- [ ] **Step 6: Delete old SettingsMenu files**

```bash
git rm frontend/src/components/SettingsMenu.jsx frontend/src/components/SettingsMenu.test.jsx
```

- [ ] **Step 7: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All pass. SettingsMenu tests gone, SettingsPage tests pass, no broken imports.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "feat: wire SettingsPage into App, remove old dropdown menu"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Start dev server**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: Verify mobile layout**
- Gear icon in header opens settings page (full view replacement)
- Back button returns to home
- Install App section shows platform-appropriate instructions
- Send Feedback links to GitHub Discussions
- Log Out works
- Delete Account modal works
- Bottom tab bar still visible on settings page

- [ ] **Step 3: Verify desktop layout**
- Same checks as mobile
- Settings page replaces main content area

- [ ] **Step 4: Commit spec and plan docs**

```bash
git add docs/
git commit -m "docs: add design spec and implementation plan for settings page"
```
