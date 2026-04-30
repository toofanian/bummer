import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, afterEach } from 'vitest'

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    session: { access_token: 'test-jwt', user: { id: 'user-123' } },
    loading: false,
    logout: vi.fn(),
  }),
}))

vi.mock('./supabaseClient', () => ({
  default: { auth: { signInWithOtp: vi.fn() } }
}))

import App from './App'

// Suppress React act() warnings for async state updates in these tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // Ensure tests don't hit onboarding gate
  localStorage.setItem('spotify_client_id', 'test-client-id')
})

afterEach(() => {
  console.error.mockRestore()
  vi.restoreAllMocks()
  localStorage.removeItem('spotify_client_id')
})

const CACHE_KEY = 'bsi_albums_cache'

const CACHED_ALBUMS = [
  { service_id: 'abc123', name: 'Cached Album', artists: ['Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' }
]

function seedLocalStorageCache(albums = CACHED_ALBUMS) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ albums, total: albums.length, cachedAt: new Date().toISOString() }))
}

function clearLocalStorageCache() {
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem('library_view')
}

// Helper to build a fetch mock that returns given JSON
function mockFetchSuccess(data) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  })
}

// Default successful responses for library + collections
const LIBRARY_OK = { albums: [], total: 0, last_synced: null }
const COLLECTIONS_OK = []
const HOME_OK = { recently_played: [], rediscover: [], recommended: [] }

// Default /library/sync response — empty library, done immediately.
// Individual tests can override with their own sync page sequences.
const SYNC_DONE = {
  albums: [],
  synced_this_page: 0,
  spotify_total: 0,
  next_offset: 0,
  done: true,
}

function setupSuccessfulFetch() {
  // library/albums → empty
  // library/sync → done immediately
  // library/sync-complete → ok
  // collections → empty list
  // home → empty sections
  global.fetch = vi.fn().mockImplementation((url, options) => {
    if (url.includes('/library/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
    }
    if (url.includes('/library/albums') && !url.includes('/tracks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
    }
    if (url.includes('/collections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
    }
    if (url.includes('/home')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('App — onboarding auth gate', () => {
  beforeEach(() => {
    // Override the default beforeEach that seeds spotify_client_id — these
    // tests need the gate active.
    localStorage.removeItem('spotify_client_id')
  })

  it('auto-reconnects returning users — calls /auth/spotify-status and persists client_id', async () => {
    // We assert the reconnect by observing: (a) spotify-status was hit,
    // (b) client_id was hydrated into localStorage, (c) after hydration the
    // OnboardingWizard is NOT shown. initiateLogin itself is window.location
    // and can't be asserted directly without mocking the hook module, so we
    // verify its observable side effects.
    let statusCalled = false
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/auth/spotify-status')) {
        statusCalled = true
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ has_credentials: true, client_id: 'saved-cid' }),
        })
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    // Stub crypto.subtle so initiateLogin doesn't throw in jsdom
    if (!window.crypto?.subtle) {
      Object.defineProperty(window, 'crypto', {
        value: {
          getRandomValues: (arr) => arr,
          subtle: { digest: async () => new ArrayBuffer(32) },
        },
        configurable: true,
      })
    }
    // jsdom's window.location.assign is read-only; redefine as a stub.
    const origLocation = window.location
    delete window.location
    window.location = { ...origLocation, assign: vi.fn(), pathname: '/' }

    render(<App />)
    await waitFor(() => expect(localStorage.getItem('spotify_client_id')).toBe('saved-cid'))
    expect(statusCalled).toBe(true)
    // OnboardingWizard must NOT be rendered
    expect(screen.queryByRole('heading', { name: /connect spotify/i })).not.toBeInTheDocument()

    window.location = origLocation
  })

  it('shows OnboardingWizard when backend reports no credentials', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/auth/spotify-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ has_credentials: false, client_id: null }),
        })
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
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
    await waitFor(() =>
      expect(screen.getByText(/choose your music service/i)).toBeInTheDocument(),
    )
    expect(localStorage.getItem('spotify_client_id')).toBeNull()
  })

  it('falls back to OnboardingWizard when spotify-status fetch fails', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/auth/spotify-status')) {
        return Promise.reject(new Error('network down'))
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
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
    await waitFor(() =>
      expect(screen.getByText(/choose your music service/i)).toBeInTheDocument(),
    )
  })
})

// Loading progress messages tests removed — full-screen loading messages
// no longer exist after cold start refactor (issue #26)

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
    // Track whether library/albums has been called yet — first time fails, after that succeeds
    let libraryCalled = false
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      // playback/state polls from usePlayback — always resolve quietly
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      // library/albums: fail the first time, succeed on retry
      if (url.includes('/library/albums')) {
        if (!libraryCalled) {
          libraryCalled = true
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
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

    // Wait for error state — library/albums failed so Retry button appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    // Click Retry — this time library/albums succeeds
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

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
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
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
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
      expect(screen.getByRole('button', { name: /^library( syncing)?$/i })).toBeInTheDocument()
    })
  })
})

describe('App — Home nav integration', () => {
  it('Home nav button exists and is active by default', async () => {
    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    const homeButton = await screen.findByRole('button', { name: /home/i })
    expect(homeButton).toBeInTheDocument()
    expect(homeButton.className).toContain('active')

    clearLocalStorageCache()
  })

  it('renders three nav buttons: Home, Library, Collections', async () => {
    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    expect(await screen.findByRole('button', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^library( syncing)?$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collections/i })).toBeInTheDocument()

    clearLocalStorageCache()
  })
})

describe('App — localStorage cache + syncing pulse', () => {
  it('renders albums immediately from localStorage cache without showing loading screen', async () => {
    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }

      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1, syncing: false }) })
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

    expect(screen.queryByText(/syncing your spotify library/i)).not.toBeInTheDocument()
    // Default view is now 'home', switch to Albums to see cached albums
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    expect(await screen.findByText('Cached Album')).toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('pulses Library label while background fetch is in progress', async () => {
    seedLocalStorageCache()
    let resolveSync
    global.fetch = vi.fn().mockImplementation((url, options) => {
      // Gate the sync endpoint: keep syncing=true until the test releases it.
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return new Promise(resolve => { resolveSync = resolve })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1, last_synced: null }),
        })
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

    await waitFor(() => {
      const libraryBtn = screen.getByRole('button', { name: /^library$/i })
      expect(libraryBtn.querySelector('.animate-pulse')).toBeInTheDocument()
    })

    // Release the sync call with done=true so the loop terminates.
    resolveSync({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
    await waitFor(() => {
      const libraryBtn = screen.getByRole('button', { name: /^library$/i })
      expect(libraryBtn.querySelector('.animate-pulse')).not.toBeInTheDocument()
    })

    clearLocalStorageCache()
  })

  it('stops pulsing Library label after background fetch completes', async () => {
    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }

      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1, syncing: false }) })
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
    await userEvent.click(await screen.findByRole('button', { name: /^library$/i }))
    await screen.findByText('Cached Album')
    await waitFor(() => {
      const libraryBtn = screen.getByRole('button', { name: /^library$/i })
      expect(libraryBtn.querySelector('.animate-pulse')).not.toBeInTheDocument()
    })

    clearLocalStorageCache()
  })

  it('does not apply paddingRight on mobile when pane is open', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }

      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const { container } = render(<App />)
    // On mobile, use BottomTabBar to navigate to library
    await userEvent.click(await screen.findByRole('button', { name: /library/i }))
    await screen.findByText('Cached Album')

    // Mobile layout never applies paddingRight (no side panes)
    const appDiv = container.querySelector('.app')
    expect(appDiv.style.paddingRight).toBe('')

    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    clearLocalStorageCache()
  })

  it('does not apply paddingRight on desktop when pane is open (overlay)', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }

      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const { container } = render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    await screen.findByText('Cached Album')

    await userEvent.click(screen.getByRole('button', { name: /now playing/i }))

    const appDiv = container.querySelector('.app')
    expect(appDiv.style.paddingRight).toBe('')

    clearLocalStorageCache()
  })

  it('desktop nav shows Library instead of Albums', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    // Desktop nav should have "Library" button, not "Albums"
    const libraryBtn = await screen.findByRole('button', { name: /^library( syncing)?$/i })
    expect(libraryBtn).toBeInTheDocument()
    // There should be no standalone "Albums" nav button
    const navButtons = screen.getAllByRole('button')
    const albumsOnlyBtn = navButtons.find(b => /^albums/i.test(b.textContent) && !/library/i.test(b.textContent))
    expect(albumsOnlyBtn).toBeUndefined()

    clearLocalStorageCache()
  })

  it('shows LibraryViewToggle when Library tab is active', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    // Click Library to activate it
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))

    // LibraryViewToggle should render with Albums and Artists tabs
    expect(screen.getByRole('tab', { name: /albums/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /artists/i })).toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('clicking Artists pill shows ArtistsView', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const albumsWithArtists = [
      { service_id: 'abc123', name: 'Test Album', artists: ['Test Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' },
    ]
    seedLocalStorageCache(albumsWithArtists)
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }


      if (url.includes('/library/albums')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: albumsWithArtists, total: 1 }) })
      if (url.includes('/collections')) return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      if (url.includes('/home')) return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Click Library, then switch to Artists
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    await userEvent.click(screen.getByRole('tab', { name: /artists/i }))

    // Should show ArtistsView with artist rows
    expect(await screen.findByTestId('artist-row-Test Artist')).toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('clicking Albums pill shows AlbumTable', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }


      if (url.includes('/library/albums')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })
      if (url.includes('/collections')) return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      if (url.includes('/home')) return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Click Library, switch to Artists, then back to Albums
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    await userEvent.click(screen.getByRole('tab', { name: /artists/i }))
    await userEvent.click(screen.getByRole('tab', { name: /albums/i }))

    // Should show AlbumTable content
    expect(await screen.findByText('Cached Album')).toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('librarySubView resets to albums when navigating away and back', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const albumsWithArtists = [
      { service_id: 'abc123', name: 'Test Album', artists: ['Test Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' },
    ]
    seedLocalStorageCache(albumsWithArtists)
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }


      if (url.includes('/library/albums')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: albumsWithArtists, total: 1 }) })
      if (url.includes('/collections')) return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      if (url.includes('/home')) return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Switch to Library, then to Artists sub-view
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    await userEvent.click(screen.getByRole('tab', { name: /artists/i }))
    expect(await screen.findByTestId('artist-row-Test Artist')).toBeInTheDocument()

    // Navigate away to Collections
    await userEvent.click(screen.getByRole('button', { name: /collections/i }))

    // Navigate back to Library — should reset to Albums (not persist Artists)
    await userEvent.click(screen.getByRole('button', { name: /^library( syncing)?$/i }))
    expect(screen.queryByTestId('artist-row-Test Artist')).not.toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('updates localStorage after background fetch completes', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache()
    const freshAlbums = [
      ...CACHED_ALBUMS,
      { service_id: 'new123', name: 'New Album', artists: ['New Artist'], image_url: null, release_date: '2025', total_tracks: 8, added_at: '2025-01-01T00:00:00Z' }
    ]
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }

      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: freshAlbums, total: 2, syncing: false }) })
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
    // Switch to Albums view to see album content
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    await screen.findByText('New Album')

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY))
    expect(stored.albums).toHaveLength(2)

    clearLocalStorageCache()
  })

  it('library always opens in albums view regardless of localStorage', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const albumsWithArtists = [
      { service_id: 'abc123', name: 'Test Album', artists: ['Test Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' },
    ]
    seedLocalStorageCache(albumsWithArtists)
    localStorage.setItem('library_view', 'artists')

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }


      if (url.includes('/library/albums')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: albumsWithArtists, total: 1 }) })
      if (url.includes('/collections')) return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      if (url.includes('/home')) return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Navigate to Library — should open in Albums view (localStorage 'artists' is overridden)
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    // Should NOT see artist row — sub-view resets to albums regardless of localStorage
    expect(screen.queryByTestId('artist-row-Test Artist')).not.toBeInTheDocument()

    clearLocalStorageCache()
    localStorage.removeItem('library_view')
  })

  it('writes library_view to localStorage when the sub-view changes', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const albumsWithArtists = [
      { service_id: 'abc123', name: 'Test Album', artists: ['Test Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' },
    ]
    seedLocalStorageCache(albumsWithArtists)

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }


      if (url.includes('/library/albums')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: albumsWithArtists, total: 1 }) })
      if (url.includes('/collections')) return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      if (url.includes('/home')) return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    // Default should be albums
    expect(localStorage.getItem('library_view')).toBe('albums')

    await userEvent.click(screen.getByRole('tab', { name: /artists/i }))
    expect(localStorage.getItem('library_view')).toBe('artists')

    await userEvent.click(screen.getByRole('tab', { name: /albums/i }))
    expect(localStorage.getItem('library_view')).toBe('albums')

    clearLocalStorageCache()
    localStorage.removeItem('library_view')
  })
})

describe('App — playback state persistence on reload', () => {
  const PLAYING_ALBUMS = [
    { service_id: 'album-1', name: 'Currently Playing Album', artists: ['Artist A'], image_url: null, release_date: '2023', total_tracks: 12, added_at: '2023-01-01T00:00:00Z' },
    { service_id: 'album-2', name: 'Other Album', artists: ['Artist B'], image_url: null, release_date: '2022', total_tracks: 10, added_at: '2022-01-01T00:00:00Z' },
  ]

  const PLAYBACK_STATE_PLAYING = {
    is_playing: true,
    track: { name: 'Track 1', album: 'Currently Playing Album', album_service_id: 'album-1', artists: ['Artist A'] },
    device: { name: 'My Speaker' },
  }

  const PLAYBACK_STATE_STOPPED = {
    is_playing: false,
    track: null,
    device: null,
  }

  function setupFetchWithPlayback(playbackState, albums = PLAYING_ALBUMS) {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(playbackState) })
      }

      if (url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ tracks: [] }) })
      }
      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums, total: albums.length }) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      if (url.includes('/digest/ensure-snapshot')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  }

  it('syncs playingId from Spotify playback state when app loads with active playback', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache(PLAYING_ALBUMS)
    setupFetchWithPlayback(PLAYBACK_STATE_PLAYING)

    render(<App />)

    // Navigate to Library to see album rows
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))

    // The currently playing album row should have the now-playing class,
    // which means playingId was synced from the playback state
    await waitFor(() => {
      const row = document.getElementById('row-album-album-1')
      expect(row).toBeTruthy()
      expect(row.classList.contains('now-playing')).toBe(true)
    })

    clearLocalStorageCache()
  })

  it('does not override explicit user play action with playback sync', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache(PLAYING_ALBUMS)
    setupFetchWithPlayback(PLAYBACK_STATE_PLAYING)

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))

    // Wait for playback sync to set playingId to album-1
    await waitFor(() => {
      const row = document.getElementById('row-album-album-1')
      expect(row).toBeTruthy()
      expect(row.classList.contains('now-playing')).toBe(true)
    })

    // album-2 should NOT be marked as playing
    const album2Row = document.getElementById('row-album-album-2')
    expect(album2Row).toBeTruthy()
    expect(album2Row.classList.contains('now-playing')).toBe(false)

    clearLocalStorageCache()
  })

  it('resolves now-playing album by service_id when two albums share a name', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const DUPLICATE_NAME_ALBUMS = [
      { service_id: 'frank-iero-parachutes', name: 'Parachutes', artists: ['Frank Iero'], image_url: null, release_date: '2016', total_tracks: 11, added_at: '2016-01-01T00:00:00Z' },
      { service_id: 'coldplay-parachutes', name: 'Parachutes', artists: ['Coldplay'], image_url: null, release_date: '2000', total_tracks: 10, added_at: '2000-01-01T00:00:00Z' },
    ]

    const DUPLICATE_PLAYBACK = {
      is_playing: true,
      track: { name: 'Yellow', album: 'Parachutes', album_service_id: 'coldplay-parachutes', artists: ['Coldplay'] },
      device: { name: 'My Speaker' },
    }

    seedLocalStorageCache(DUPLICATE_NAME_ALBUMS)
    setupFetchWithPlayback(DUPLICATE_PLAYBACK, DUPLICATE_NAME_ALBUMS)

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))

    // Only the Coldplay row should be marked as now-playing, matched via album_service_id
    await waitFor(() => {
      const coldplayRow = document.getElementById('row-album-coldplay-parachutes')
      expect(coldplayRow).toBeTruthy()
      expect(coldplayRow.classList.contains('now-playing')).toBe(true)
    })

    const frankRow = document.getElementById('row-album-frank-iero-parachutes')
    expect(frankRow).toBeTruthy()
    expect(frankRow.classList.contains('now-playing')).toBe(false)

    clearLocalStorageCache()
  })

  it('does not sync playingId when playback is stopped', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache(PLAYING_ALBUMS)
    setupFetchWithPlayback(PLAYBACK_STATE_STOPPED)

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))

    // Wait for albums to render
    await waitFor(() => {
      expect(document.getElementById('row-album-album-1')).toBeTruthy()
    })

    // No album should be marked as playing
    expect(document.querySelector('.now-playing')).toBeFalsy()

    clearLocalStorageCache()
  })
})

describe('App — library sync loop', () => {
  // ----------------------------------------------------------------
  // Plan Task 11: cold-start renders progress counter during multi-page sync
  // ----------------------------------------------------------------
  it('drives a multi-page sync loop on cold start and renders synced albums', async () => {
    clearLocalStorageCache()

    const SYNCED_ALBUM = {
      service_id: 'synced1',
      name: 'Synced Album',
      artists: ['Artist'],
      image_url: null,
      release_date: '2020',
      total_tracks: 10,
      added_at: '2021-01-01T00:00:00Z',
    }

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        const body = JSON.parse(options.body)
        if (body.offset === 0) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              albums: Array.from({ length: 50 }, (_, i) => ({
                service_id: `page1-${i}`, name: `Album ${i}`, artists: ['A'], image_url: null,
                release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z',
              })),
              synced_this_page: 50,
              spotify_total: 51,
              next_offset: 50,
              done: false,
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            albums: [SYNCED_ALBUM],
            synced_this_page: 1,
            spotify_total: 51,
            next_offset: 51,
            done: true,
          }),
        })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ albums: [], total: 0, last_synced: null }),
        })
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

    // Switch to Library view — the synced album should eventually appear.
    await userEvent.click(await screen.findByRole('button', { name: /^library$/i }))
    expect(await screen.findByText('Synced Album')).toBeInTheDocument()

    // Verify /library/sync was called exactly twice (two pages)
    const syncCalls = global.fetch.mock.calls.filter(
      c => c[0].includes('/library/sync') && !c[0].includes('/sync-complete') && c[1]?.method === 'POST'
    )
    expect(syncCalls.length).toBe(2)

    // Verify /library/sync-complete was called once with all accumulated albums
    const syncCompleteCalls = global.fetch.mock.calls.filter(
      c => c[0].includes('/library/sync-complete') && c[1]?.method === 'POST'
    )
    expect(syncCompleteCalls.length).toBe(1)
  })

  // ----------------------------------------------------------------
  // Plan Task 12: warm-start renders cached data and runs silent sync
  // ----------------------------------------------------------------
  it('renders cached data immediately on warm start and runs silent sync', async () => {
    const CACHED_ALBUM = {
      service_id: 'cached1',
      name: 'Cached Album',
      artists: ['Artist'],
      image_url: null,
      release_date: '2020',
      total_tracks: 10,
      added_at: '2021-01-01T00:00:00Z',
    }

    seedLocalStorageCache([CACHED_ALBUM])

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            albums: [CACHED_ALBUM],
            synced_this_page: 1,
            spotify_total: 1,
            next_offset: 1,
            done: true,
          }),
        })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            albums: [CACHED_ALBUM],
            total: 1,
            last_synced: '2026-04-09T00:00:00Z',
          }),
        })
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

    // Switch to Library and verify cached album is visible
    await userEvent.click(await screen.findByRole('button', { name: /^library$/i }))
    expect(await screen.findByText('Cached Album')).toBeInTheDocument()

    // No cold-start progress message should appear for warm start
    expect(screen.queryByText(/syncing \d+ of \d+/i)).not.toBeInTheDocument()

    // Sync was still called in the background
    await waitFor(() => {
      const syncCalls = global.fetch.mock.calls.filter(
        c => c[0].includes('/library/sync') && !c[0].includes('/sync-complete') && c[1]?.method === 'POST'
      )
      expect(syncCalls.length).toBeGreaterThanOrEqual(1)
    })

    clearLocalStorageCache()
  })

  // ----------------------------------------------------------------
  // Plan Task 13: sync error mid-loop preserves cached data
  // ----------------------------------------------------------------
  it('preserves cached data when sync errors mid-loop', async () => {
    const CACHED_ALBUM = {
      service_id: 'cached1',
      name: 'Still Here',
      artists: ['Artist'],
      image_url: null,
      release_date: '2020',
      total_tracks: 10,
      added_at: '2021-01-01T00:00:00Z',
    }

    seedLocalStorageCache([CACHED_ALBUM])

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        // Sync fails
        return Promise.reject(new Error('Network error'))
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            albums: [CACHED_ALBUM],
            total: 1,
            last_synced: '2026-04-09T00:00:00Z',
          }),
        })
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

    // Switch to Library view — cached album should still be visible despite
    // the sync error.
    await userEvent.click(await screen.findByRole('button', { name: /^library$/i }))
    expect(await screen.findByText('Still Here')).toBeInTheDocument()

    clearLocalStorageCache()
  })
})

describe('App — sync/loading bug fixes', () => {
  const ALBUM_A = { service_id: 'a1', name: 'Album A', artists: ['Art1'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' }
  const ALBUM_B = { service_id: 'b2', name: 'Album B', artists: ['Art2'], image_url: null, release_date: '2021', total_tracks: 8, added_at: '2022-01-01T00:00:00Z' }
  const ALBUM_C = { service_id: 'c3', name: 'Album C', artists: ['Art3'], image_url: null, release_date: '2022', total_tracks: 12, added_at: '2023-01-01T00:00:00Z' }

  // 1. Albums not cleared during sync — old data stays visible while sync pages accumulate
  it('does not clear albums during multi-page sync', async () => {
    // Seed cache so we have a warm start with existing albums
    seedLocalStorageCache([ALBUM_A])

    let syncPage1Resolve
    const syncPage1Promise = new Promise(res => { syncPage1Resolve = res })

    global.fetch = vi.fn().mockImplementation((url, options) => {
      // Sync page 1: returns ALBUM_B, not done yet — blocks until released
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        const body = JSON.parse(options.body)
        if (body.offset === 0) {
          return syncPage1Promise
        }
        // Page 2: returns ALBUM_C, done
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          albums: [ALBUM_C],
          done: true,
          next_offset: 2,
          spotify_total: 3,
          synced_this_page: 1,
        })})
      }
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [ALBUM_A], total: 1, last_synced: null }) })
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

    // Switch to Library to see albums
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))

    // Album A from cache should be visible
    expect(await screen.findByText('Album A')).toBeInTheDocument()

    // Release sync page 1 — albums should NOT be wiped during sync
    syncPage1Resolve({ ok: true, json: () => Promise.resolve({
      albums: [ALBUM_A, ALBUM_B],
      done: false,
      next_offset: 1,
      spotify_total: 3,
      synced_this_page: 2,
    })})

    // Album A must remain visible while sync is in progress (not wiped)
    // Wait a tick for the sync to process
    await waitFor(() => {
      expect(screen.getByText('Album A')).toBeInTheDocument()
    })

    // After full sync completes, all albums should show
    await waitFor(() => {
      expect(screen.getByText('Album A')).toBeInTheDocument()
    })

    clearLocalStorageCache()
  })

  // 2. Collections fetched before sync completes
  it('fetches collections in parallel with sync, not after', async () => {
    seedLocalStorageCache([ALBUM_A])

    const fetchOrder = []
    let syncResolve
    const syncPromise = new Promise(res => { syncResolve = res })

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        fetchOrder.push('sync-complete')
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        fetchOrder.push('sync')
        return syncPromise
      }
      if (url.includes('/collections') && !url.includes('/albums')) {
        fetchOrder.push('collections')
        return Promise.resolve({ ok: true, json: () => Promise.resolve([
          { id: 'col-1', name: 'Test Collection', album_count: 0, updated_at: '2025-01-01T00:00:00Z' },
        ]) })
      }
      if (url.includes('/collections/col-1/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [] }) })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [ALBUM_A], total: 1, last_synced: null }) })
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Collections should be fetched even while sync is still pending
    await waitFor(() => {
      expect(fetchOrder).toContain('collections')
    })

    // Sync is still pending — verify collections were requested before sync finished
    expect(fetchOrder.indexOf('collections')).toBeLessThanOrEqual(fetchOrder.indexOf('sync'))

    // Now complete the sync
    syncResolve({ ok: true, json: () => Promise.resolve({
      albums: [ALBUM_A],
      done: true,
      next_offset: 1,
      spotify_total: 1,
      synced_this_page: 1,
    })})

    // Wait for everything to settle
    await waitFor(() => {
      expect(fetchOrder).toContain('sync-complete')
    })

    clearLocalStorageCache()
  })

  // 3. sync-complete called with accumulated albums
  it('calls sync-complete with all accumulated albums from sync pages', async () => {
    seedLocalStorageCache([ALBUM_A])

    let syncCompleteBody = null

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        syncCompleteBody = JSON.parse(options.body)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        const body = JSON.parse(options.body)
        if (body.offset === 0) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({
            albums: [ALBUM_A, ALBUM_B],
            done: false,
            next_offset: 2,
            spotify_total: 3,
            synced_this_page: 2,
          })})
        }
        // Page 2
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          albums: [ALBUM_C],
          done: true,
          next_offset: 3,
          spotify_total: 3,
          synced_this_page: 1,
        })})
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [ALBUM_A], total: 1, last_synced: null }) })
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

    // Wait for sync-complete to be called
    await waitFor(() => {
      expect(syncCompleteBody).not.toBeNull()
    })

    // Verify it received all 3 albums from both pages
    expect(syncCompleteBody.albums).toHaveLength(3)
    expect(syncCompleteBody.albums.map(a => a.service_id)).toEqual(['a1', 'b2', 'c3'])

    clearLocalStorageCache()
  })

  // 4. Cold start renders albums immediately after Supabase cache returns, before sync completes
  it('renders albums and hides spinner on cold start as soon as Supabase cache returns, before sync completes', async () => {
    clearLocalStorageCache()

    const SERVER_ALBUMS = [
      { service_id: 'srv1', name: 'Server Album', artists: ['Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' },
    ]

    let resolveSync
    const syncPromise = new Promise(res => { resolveSync = res })

    global.fetch = vi.fn().mockImplementation((url, options) => {
      // Sync hangs until explicitly resolved
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return syncPromise
      }
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      // Supabase cache returns albums immediately
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: SERVER_ALBUMS, total: 1, last_synced: null }) })
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

    // Spinner should disappear and Library nav should be available even though sync is still pending
    const libraryBtn = await screen.findByRole('button', { name: /^library( syncing)?$/i })
    await userEvent.click(libraryBtn)
    expect(await screen.findByText('Server Album')).toBeInTheDocument()

    // The cold-start loading message should NOT be visible
    expect(screen.queryByText(/syncing your library/i)).not.toBeInTheDocument()

    // Now resolve sync so the component can finish cleanly
    resolveSync({ ok: true, json: () => Promise.resolve({
      albums: SERVER_ALBUMS,
      done: true,
      next_offset: 1,
      spotify_total: 1,
      synced_this_page: 1,
    })})

    // Verify sync completes — syncing pulse should eventually stop
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^library$/i })
      expect(btn.querySelector('.animate-pulse')).not.toBeInTheDocument()
    })

    clearLocalStorageCache()
  })

  // 5. Cold start drops into main UI immediately without full-screen spinner
  it('cold start drops into main UI immediately without full-screen spinner', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    clearLocalStorageCache()

    let resolveLibrary
    const libraryPromise = new Promise(res => { resolveLibrary = res })
    let resolveCollections
    const collectionsPromise = new Promise(res => { resolveCollections = res })

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return libraryPromise
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/collections')) {
        return collectionsPromise
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // No full-screen "syncing your library" message should appear
    expect(screen.queryByText(/syncing your library/i)).not.toBeInTheDocument()

    // Main UI should render immediately — Home button visible in nav
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()

    // Clean up: resolve pending promises so component unmounts cleanly
    resolveLibrary({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
    resolveCollections({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
    await waitFor(() => {})
  })

  // 6. Existing state preserved on loadData — collections/albumCollectionMap not cleared
  it('does not clear collections state at start of loadData', async () => {
    seedLocalStorageCache([ALBUM_A])

    const collectionsData = [
      { id: 'col-1', name: 'My Collection', album_count: 1, updated_at: '2025-01-01T00:00:00Z' },
    ]

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          albums: [ALBUM_A],
          done: true,
          next_offset: 1,
          spotify_total: 1,
          synced_this_page: 1,
        })})
      }
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/collections/col-1/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [ALBUM_A] }) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(collectionsData) })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [ALBUM_A], total: 1, last_synced: null }) })
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Wait for initial load to complete — collections should be populated
    await waitFor(() => {
      const calls = global.fetch.mock.calls
      const syncCompleteCalls = calls.filter(([u]) => u.includes('/library/sync-complete'))
      expect(syncCompleteCalls.length).toBeGreaterThanOrEqual(1)
    })

    // Navigate to Collections tab — our collection should be visible
    await userEvent.click(await screen.findByRole('button', { name: /collections/i }))
    expect(await screen.findByText('My Collection')).toBeInTheDocument()

    clearLocalStorageCache()
  })
})

describe('App — listen counts', () => {
  it('fetches /library/listen-counts after library loads', async () => {
    seedLocalStorageCache()

    let listenCountsFetched = false
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/listen-counts')) {
        listenCountsFetched = true
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ counts: { abc123: 5 } }) })
      }
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })
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

    await waitFor(() => {
      expect(listenCountsFetched).toBe(true)
    })

    clearLocalStorageCache()
  })

  it('increments listen count locally after playing an album', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const TEST_ALBUMS = [
      { service_id: 'play-test-1', name: 'Playable Album', artists: ['Artist'], image_url: null, release_date: '2020', total_tracks: 10, added_at: '2021-01-01T00:00:00Z' },
    ]
    seedLocalStorageCache(TEST_ALBUMS)

    let historyLogCalled = false
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/listen-counts')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ counts: { 'play-test-1': 3 } }) })
      }
      if (url.includes('/home/history/log') && options?.method === 'POST') {
        historyLogCalled = true
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: TEST_ALBUMS, total: 1 }) })
      }
      if (url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ tracks: [] }) })
      }
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ is_playing: false, track: null, device: null }) })
      }
      if (url.includes('/playback/play')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/collections')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      }
      if (url.includes('/home') && !url.includes('/history')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Navigate to Library and wait for albums to render
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    expect(await screen.findByText('Playable Album')).toBeInTheDocument()

    // Wait for listen counts to load — the count should show "3"
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    // Double-click the album row to trigger play
    const albumRow = document.getElementById('row-album-play-test-1')
    await userEvent.dblClick(albumRow)

    // After playing, the listen count should increment from 3 to 4
    await waitFor(() => {
      expect(historyLogCalled).toBe(true)
    })
    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    clearLocalStorageCache()
  })

  it('does not block library loading if listen-counts fails', async () => {
    seedLocalStorageCache()

    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/listen-counts')) {
        return Promise.reject(new Error('listen-counts failed'))
      }
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1 }) })
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

    // Library should still load despite listen-counts failure
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    expect(await screen.findByText('Cached Album')).toBeInTheDocument()

    clearLocalStorageCache()
  })
})

describe('App — create collection from nav bar', () => {
  it('shows a create collection button in nav when on collections view', async () => {
    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    // Navigate to Collections
    await userEvent.click(await screen.findByRole('button', { name: /collections/i }))

    // The "+" button should be visible
    expect(screen.getByRole('button', { name: /create collection/i })).toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('does not show create collection button when not on collections view', async () => {
    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    // Default view is home — no create button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /create collection/i })).not.toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('clicking create collection button shows an input', async () => {
    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /collections/i }))
    await userEvent.click(screen.getByRole('button', { name: /create collection/i }))

    expect(screen.getByPlaceholderText(/collection name/i)).toBeInTheDocument()

    clearLocalStorageCache()
  })

  it('pressing Enter in create collection input creates collection and hides input', async () => {
    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/library/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC_DONE) })
      }
      if (url.includes('/library/albums') && !url.includes('/tracks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
      }
      // POST to /collections creates a collection
      if (url.includes('/collections') && options?.method === 'POST' && !url.includes('/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'new-col', name: 'Road trip', album_count: 0 }) })
      }
      // GET /collections/:id/albums
      if (url.includes('/collections') && url.includes('/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [] }) })
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

    await userEvent.click(await screen.findByRole('button', { name: /collections/i }))
    await userEvent.click(screen.getByRole('button', { name: /create collection/i }))

    const input = screen.getByPlaceholderText(/collection name/i)
    await userEvent.type(input, 'Road trip{Enter}')

    // Input should be gone, "+" button should be back
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/collection name/i)).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create collection/i })).toBeInTheDocument()

    // Verify the collection creation API was called
    const createCalls = global.fetch.mock.calls.filter(
      ([url, opts]) => url.includes('/collections') && opts?.method === 'POST' && !url.includes('/albums')
    )
    expect(createCalls.length).toBeGreaterThanOrEqual(1)

    clearLocalStorageCache()
  })

  it('pressing Escape in create collection input hides it without creating', async () => {
    seedLocalStorageCache()
    setupSuccessfulFetch()

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: /collections/i }))
    await userEvent.click(screen.getByRole('button', { name: /create collection/i }))

    const input = screen.getByPlaceholderText(/collection name/i)
    await userEvent.type(input, 'Road trip{Escape}')

    // Input should be gone, "+" button should be back
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/collection name/i)).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /create collection/i })).toBeInTheDocument()

    // No collection creation API call
    const createCalls = global.fetch.mock.calls.filter(
      ([url, opts]) => url.includes('/collections') && opts?.method === 'POST' && !url.includes('/albums')
    )
    expect(createCalls.length).toBe(0)

    clearLocalStorageCache()
  })
})
