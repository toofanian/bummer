// App.mobile-layout.test.jsx (separate file to avoid conflicting with existing App.test.jsx)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ today: [], this_week: [], recently_added: [], rediscover: [], recommended: [] }) })
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
