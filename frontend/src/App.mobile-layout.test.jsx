// App.mobile-layout.test.jsx (separate file to avoid conflicting with existing App.test.jsx)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

// Mock fetch to handle the full loadData chain
beforeEach(() => {
  // Ensure tests don't hit onboarding gate
  localStorage.setItem('spotify_client_id', 'test-client-id')
  global.fetch = vi.fn().mockImplementation((url, options) => {
    if (url.includes('/library/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }
    if (url.includes('/library/sync') && !url.includes('/sync-complete') && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          albums: [],
          synced_this_page: 0,
          spotify_total: 0,
          next_offset: 0,
          done: true,
        }),
      })
    }
    if (url.includes('/library/albums') && !url.includes('/tracks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ albums: [], total: 0, last_synced: null }) })
    }
    if (url.includes('/collections')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    if (url.includes('/home')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ recently_played: [], recently_added: [], rediscover: [], recommended: [] }) })
    }
    if (url.includes('/digest/changelog')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    }
    if (url.includes('/digest/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ days: [], has_more: false, next_cursor: null }) })
    }
    if (url.includes('/digest/stats')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ period_days: 30, top_albums: [], top_artists: [] }) })
    }
    // Default for playback polling etc
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

describe('App layout', () => {
  it('renders without crashing on desktop', () => {
    mockMatchMedia(false) // > 768px
    expect(() => render(<App />)).not.toThrow()
  })

  it('renders without crashing on mobile', () => {
    mockMatchMedia(true) // <= 768px
    expect(() => render(<App />)).not.toThrow()
  })

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
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('hides search button visually on views without search', async () => {
    mockMatchMedia(true)
    render(<App />)
    const searchBtn = await waitFor(() => screen.getByLabelText('Search'))
    expect(searchBtn).toHaveStyle({ visibility: 'hidden' })
  })

  it('shows Albums/Artists tabs in library content area on mobile', async () => {
    mockMatchMedia(true)
    render(<App />)
    // Navigate to library view via bottom tab bar
    const libraryTab = await waitFor(() => screen.getByRole('button', { name: /library/i }))
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

  it('digest columns have bottom padding and hidden scrollbars on desktop', async () => {
    mockMatchMedia(false) // desktop
    render(<App />)
    // Navigate to digest view via sidebar
    const digestBtn = await waitFor(() => screen.getByLabelText('Library digest'))
    await userEvent.click(digestBtn)
    // Wait for digest content to render
    await waitFor(() => {
      expect(screen.getByText('Library Changes')).toBeInTheDocument()
    })
    // Each digest column should have pb-20 and prompt-row-scroll
    const columns = document.querySelectorAll('.overflow-y-auto.pb-20.prompt-row-scroll')
    expect(columns.length).toBe(3)
  })

  it('reserves MiniPlaybackBar padding even when no track is playing (Connect a device state)', async () => {
    mockMatchMedia(true) // mobile
    render(<App />)
    // Wait for the app to finish loading and render the mobile layout
    const contentArea = await waitFor(() => screen.getByTestId('mobile-content-area'))
    // MiniPlaybackBar shows "Connect a device" when no track/device/playing,
    // so content area should reserve the full 106px (50px tab bar + 56px mini bar)
    expect(contentArea.style.paddingBottom).toContain('106px')
  })
})
