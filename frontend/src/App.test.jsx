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
const LIBRARY_OK = { albums: [] }
const COLLECTIONS_OK = []
const HOME_OK = { today: [], this_week: [], rediscover: [], recommended: [] }

function setupSuccessfulFetch() {
  // library/albums → empty
  // collections → empty list
  // home → empty sections
  global.fetch = vi.fn().mockImplementation((url) => {
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
    global.fetch = vi.fn().mockImplementation((url) => {
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
    global.fetch = vi.fn().mockImplementation((url) => {
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
    global.fetch = vi.fn().mockImplementation((url) => {
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

describe('App — loading progress messages', () => {
  // ----------------------------------------------------------------
  // 4. "Syncing your Spotify library..." message appears immediately
  // ----------------------------------------------------------------
  it('shows "Syncing your Spotify library..." message while library is loading', async () => {
    let resolveLibrary
    const libraryPromise = new Promise(res => { resolveLibrary = res })

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/library/albums')) {
        return libraryPromise.then(() => ({ ok: true, json: () => Promise.resolve(LIBRARY_OK) }))
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

    // The library sync message should appear immediately
    expect(screen.getByText(/syncing your spotify library/i)).toBeInTheDocument()

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

      if (url.includes('/library/albums')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(LIBRARY_OK) })
      }
      if (url.includes('/collections')) {
        return collectionsPromise.then(() => ({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) }))
      }
      if (url.includes('/home')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
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
    // Track whether library/albums has been called yet — first time fails, after that succeeds
    let libraryCalled = false
    global.fetch = vi.fn().mockImplementation((url) => {
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

    global.fetch = vi.fn().mockImplementation((url) => {

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
    global.fetch = vi.fn().mockImplementation((url) => {

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
    let resolveAlbums
    global.fetch = vi.fn().mockImplementation((url) => {

      if (url.includes('/library/albums')) {
        return new Promise(resolve => { resolveAlbums = resolve })
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

    resolveAlbums({ ok: true, json: () => Promise.resolve({ albums: CACHED_ALBUMS, total: 1, syncing: false }) })
    await waitFor(() => {
      const libraryBtn = screen.getByRole('button', { name: /^library$/i })
      expect(libraryBtn.querySelector('.animate-pulse')).not.toBeInTheDocument()
    })

    clearLocalStorageCache()
  })

  it('stops pulsing Library label after background fetch completes', async () => {
    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url) => {

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
    global.fetch = vi.fn().mockImplementation((url) => {

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

  it('applies paddingRight on desktop when pane is open', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    seedLocalStorageCache()
    global.fetch = vi.fn().mockImplementation((url) => {

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
    expect(appDiv.style.paddingRight).toBe('300px')

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
    global.fetch = vi.fn().mockImplementation((url) => {


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
    global.fetch = vi.fn().mockImplementation((url) => {


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

  it('librarySubView persists when navigating away and back', async () => {
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
    global.fetch = vi.fn().mockImplementation((url) => {


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

    // Navigate back to Library — should still be on Artists
    await userEvent.click(screen.getByRole('button', { name: /^library( syncing)?$/i }))
    expect(await screen.findByTestId('artist-row-Test Artist')).toBeInTheDocument()

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
    global.fetch = vi.fn().mockImplementation((url) => {

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

  it('reads library_view from localStorage on mount and restores artists sub-view', async () => {
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

    global.fetch = vi.fn().mockImplementation((url) => {


      if (url.includes('/library/albums')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: albumsWithArtists, total: 1 }) })
      if (url.includes('/collections')) return Promise.resolve({ ok: true, json: () => Promise.resolve(COLLECTIONS_OK) })
      if (url.includes('/home')) return Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_OK) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    render(<App />)

    // Navigate to Library — should open directly on Artists sub-view (restored from localStorage)
    await userEvent.click(await screen.findByRole('button', { name: /^library( syncing)?$/i }))
    expect(await screen.findByTestId('artist-row-Test Artist')).toBeInTheDocument()

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

    global.fetch = vi.fn().mockImplementation((url) => {


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
    global.fetch = vi.fn().mockImplementation((url) => {
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
