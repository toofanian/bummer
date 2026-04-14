import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, afterEach } from 'vitest'
import App from './App'

// Suppress React act() warnings for async state updates in these tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
  vi.restoreAllMocks()
})

// Helper to build a fetch mock that returns given JSON
function mockFetchSuccess(data) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

// Default successful responses for auth + library + collections
const AUTH_OK = { authenticated: true }
const LIBRARY_OK = { albums: [] }
const COLLECTIONS_OK = []

function setupSuccessfulFetch() {
  // auth/status → authenticated
  // library/albums → empty
  // collections → empty list
  let callCount = 0
  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/auth/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(AUTH_OK) })
    }
    if (url.includes('/library/albums')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
    }
    if (url.includes('/collections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('App — loading progress messages', () => {
  // ----------------------------------------------------------------
  // 4. "Checking authentication..." message appears immediately
  // ----------------------------------------------------------------
  it('shows "Checking authentication..." message while auth is pending', async () => {
    // Auth resolves after a tick so we can observe the initial message
    let resolveAuth
    const authPromise = new Promise(res => { resolveAuth = res })

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/auth/status')) {
        return authPromise.then(() => ({ ok: true, json: () => Promise.resolve(AUTH_OK) }))
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Before auth resolves we should see the auth message
    expect(screen.getByText(/checking authentication/i)).toBeInTheDocument()

    // Unblock auth so the component can finish loading
    resolveAuth()
    await waitFor(() => expect(screen.queryByText(/checking authentication/i)).not.toBeInTheDocument())
  })

  // ----------------------------------------------------------------
  // 5. "Syncing your Spotify library..." message appears after auth
  // ----------------------------------------------------------------
  it('shows "Syncing your Spotify library..." message while library is loading', async () => {
    let resolveLibrary
    const libraryPromise = new Promise(res => { resolveLibrary = res })

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/auth/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(AUTH_OK) })
      }
      if (url.includes('/library/albums')) {
        return libraryPromise.then(() => ({ ok: true, json: () => Promise.resolve(LIBRARY_OK) }))
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // After auth resolves, the library sync message should appear
    await waitFor(() => expect(screen.getByText(/syncing your spotify library/i)).toBeInTheDocument())

    // Unblock library so the component can finish
    resolveLibrary()
    await waitFor(() => expect(screen.queryByText(/syncing your spotify library/i)).not.toBeInTheDocument())
  })

  // ----------------------------------------------------------------
  // 6. "Loading collections..." message appears while collections load
  // ----------------------------------------------------------------
  it('shows "Loading collections..." message while collections are loading', async () => {
    let resolveCollections
    const collectionsPromise = new Promise(res => { resolveCollections = res })

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/auth/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(AUTH_OK) })
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
      }
      if (url.includes('/collections')) {
        return collectionsPromise.then(() => ({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) }))
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // After auth+library resolve, collections message should appear
    await waitFor(() => expect(screen.getByText(/loading collections/i)).toBeInTheDocument())

    // Unblock collections so the component can finish
    resolveCollections()
    await waitFor(() => expect(screen.queryByText(/loading collections/i)).not.toBeInTheDocument())
  })
})

describe('App — load failure handling', () => {
  // ----------------------------------------------------------------
  // 1. When initial fetch fails, error screen shows a Retry button
  // ----------------------------------------------------------------
  it('shows an error message and a Retry button when the initial fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<App />)

    // Wait for the error state to render
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })

    // A Retry button must be present
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  // ----------------------------------------------------------------
  // 2. Clicking Retry re-triggers the data load (succeeds on 2nd call)
  // ----------------------------------------------------------------
  it('clicking Retry re-triggers the data load and clears the error on success', async () => {
    // Track whether auth/status has been called yet — first time fails, after that succeeds
    let authCalled = false
    global.fetch = vi.fn().mockImplementation((url) => {
      // playback/state polls from usePlayback — always resolve quietly
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      // auth/status: fail the first time, succeed on retry
      if (url.includes('/auth/status')) {
        if (!authCalled) {
          authCalled = true
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(AUTH_OK) })
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Wait for error state — auth/status failed so Retry button appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    // Click Retry — this time auth/status succeeds
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    // After retry succeeds, the error screen (and Retry button) should be gone
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    })
  })

  // ----------------------------------------------------------------
  // 3. When a collection album fetch fails, app still loads (partial data)
  // ----------------------------------------------------------------
  it('loads successfully even when a collection album fetch fails', async () => {
    const collections = [
      { id: 'col-1', name: 'Road trip', album_count: 2, updated_at: '2025-01-01T00:00:00Z' },
    ]

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/auth/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(AUTH_OK) })
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
      }
      if (url.includes('/collections/col-1/albums')) {
        // This specific fetch fails — should NOT crash the whole app
        return Promise.reject(new Error('Collection fetch failed'))
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(collections) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // The app should still render (no fatal error, error screen should NOT appear)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    })

    // The main UI header/nav should be present (app loaded)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /albums/i })).toBeInTheDocument()
    })
  })
})
