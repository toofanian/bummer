import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.stubGlobal('localStorage', (() => {
  let store = {}
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
})())

const mockInitiateLogin = vi.fn()
vi.mock('../hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    initiateLogin: mockInitiateLogin,
    handleCallback: vi.fn().mockResolvedValue({
      access_token: 'acc', refresh_token: 'ref', expires_in: 3600,
    }),
    accessToken: null,
    logout: vi.fn(),
  }),
}))

let mockIsPreview = false
vi.mock('../previewMode', () => ({
  get IS_PREVIEW() { return mockIsPreview },
}))

vi.stubGlobal('fetch', vi.fn())

import OnboardingWizard from './OnboardingWizard'

const fakeSession = { access_token: 'supabase-jwt' }

describe('OnboardingWizard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    // Default fetch mock: handle /auth/spotify-status (client ID pre-fill)
    // and any other fetches. Tests that need specific fetch behavior override this.
    fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/auth/spotify-status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ has_credentials: false, client_id: null }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  })

  describe('service selector', () => {
    it('renders service selector when no service is chosen', () => {
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      expect(screen.getByText(/choose your music service/i)).toBeInTheDocument()
      expect(screen.getByText(/spotify/i)).toBeInTheDocument()
      expect(screen.getByText(/apple music/i)).toBeInTheDocument()
    })

    it('shows Spotify setup after selecting Spotify', () => {
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      fireEvent.click(screen.getByText('Spotify'))
      expect(screen.getByRole('heading', { name: /connect spotify/i })).toBeInTheDocument()
    })

    it('shows Apple Music setup after selecting Apple Music', () => {
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      fireEvent.click(screen.getByText('Apple Music'))
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
    })

    it('skips service selector when spotify_client_id exists', () => {
      localStorage.setItem('spotify_client_id', 'existing-id')
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      expect(screen.queryByText(/choose your music service/i)).not.toBeInTheDocument()
      expect(screen.getByPlaceholderText(/client id/i)).toBeInTheDocument()
    })

    it('skips service selector on Spotify OAuth callback', () => {
      window.history.replaceState({}, '', '/auth/spotify/callback?code=abc')
      localStorage.setItem('spotify_client_id', 'cid')
      fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      expect(screen.queryByText(/choose your music service/i)).not.toBeInTheDocument()
    })
  })

  describe('Spotify setup', () => {
    beforeEach(() => {
      // Pre-select Spotify to skip service selector
      localStorage.setItem('music_service_type', 'spotify')
    })

    it('renders step 1: enter client id', () => {
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      expect(screen.getByPlaceholderText(/client id/i)).toBeInTheDocument()
    })

    it('saves client_id to localStorage on submit', async () => {
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      fireEvent.change(screen.getByPlaceholderText(/client id/i), {
        target: { value: 'my-client-id' }
      })
      fireEvent.click(screen.getByRole('button', { name: /connect spotify/i }))
      await waitFor(() => {
        expect(localStorage.getItem('spotify_client_id')).toBe('my-client-id')
      })
    })

    it('shows consent language on the client_id step', () => {
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      expect(screen.getByText(/Bummer can read and modify your library/i)).toBeInTheDocument()
    })

    it('posts tokens and calls onComplete after OAuth callback', async () => {
      window.history.replaceState({}, '', '/auth/spotify/callback?code=abc')
      localStorage.setItem('spotify_client_id', 'cid')
      fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      const onComplete = vi.fn()
      render(<OnboardingWizard session={fakeSession} onComplete={onComplete} />)
      await waitFor(() => expect(onComplete).toHaveBeenCalled())
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/spotify-token'),
        expect.objectContaining({ method: 'POST' }),
      )
      window.history.replaceState({}, '', '/')
    })

    it('displays the Spotify redirect URI on the client_id step', () => {
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      const uri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173/auth/spotify/callback'
      expect(screen.getByText(uri)).toBeInTheDocument()
    })

    it('copies the redirect URI to clipboard when copy button is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue()
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      const uri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173/auth/spotify/callback'
      fireEvent.click(screen.getByRole('button', { name: /copy redirect uri/i }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(uri))
    })

    it('shows "Copied" feedback after successful clipboard copy', async () => {
      const writeText = vi.fn().mockResolvedValue()
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /copy redirect uri/i }))
      await waitFor(() => expect(screen.getAllByText(/copied/i).length).toBeGreaterThan(0))
    })

    it('shows error when token storage fails after OAuth callback', async () => {
      window.history.replaceState({}, '', '/auth/spotify/callback?code=abc')
      localStorage.setItem('spotify_client_id', 'cid')
      fetch.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/auth/spotify-status')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ has_credentials: false, client_id: null }) })
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ detail: 'Server error' }) })
      })
      const onComplete = vi.fn()
      render(<OnboardingWizard session={fakeSession} onComplete={onComplete} />)
      await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument())
      expect(onComplete).not.toHaveBeenCalled()
      window.history.replaceState({}, '', '/')
    })
  })

  describe('Apple Music setup', () => {
    it('shows coming soon message', () => {
      localStorage.setItem('music_service_type', 'apple_music')
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
    })

    it('has a back button that returns to service selector', () => {
      localStorage.setItem('music_service_type', 'apple_music')
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /back/i }))
      expect(screen.getByText(/choose your music service/i)).toBeInTheDocument()
    })
  })

  describe('proxy callback (preview mode)', () => {
    it('calls onComplete without token exchange when proxy_success=true', async () => {
      window.history.replaceState({}, '', '/?proxy_success=true')
      localStorage.setItem('music_service_type', 'spotify')
      const onComplete = vi.fn()
      render(<OnboardingWizard session={fakeSession} onComplete={onComplete} />)
      await waitFor(() => expect(onComplete).toHaveBeenCalled())
      // Should NOT call fetch for token exchange (spotify-status pre-fill is ok)
      const tokenCalls = fetch.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('/auth/spotify-token'))
      expect(tokenCalls).toHaveLength(0)
      window.history.replaceState({}, '', '/')
    })

    it('still does normal PKCE exchange when code= is present (not proxy)', async () => {
      window.history.replaceState({}, '', '/auth/spotify/callback?code=abc')
      localStorage.setItem('spotify_client_id', 'cid')
      fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      const onComplete = vi.fn()
      render(<OnboardingWizard session={fakeSession} onComplete={onComplete} />)
      await waitFor(() => expect(onComplete).toHaveBeenCalled())
      // Should call fetch for token storage
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/spotify-token'),
        expect.objectContaining({ method: 'POST' }),
      )
      window.history.replaceState({}, '', '/')
    })
  })

  describe('preview mode UI', () => {
    beforeEach(() => {
      mockIsPreview = true
    })

    afterEach(() => {
      mockIsPreview = false
    })

    it('does not show proxy redirect URI note in UI', () => {
      localStorage.setItem('music_service_type', 'spotify')
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      expect(screen.queryByText(/callback-proxy/i)).not.toBeInTheDocument()
    })

    it('passes supabase token to initiateLogin on preview', async () => {
      localStorage.setItem('music_service_type', 'spotify')
      render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
      fireEvent.change(screen.getByPlaceholderText(/client id/i), {
        target: { value: 'my-client-id' }
      })
      fireEvent.click(screen.getByRole('button', { name: /connect spotify/i }))
      await waitFor(() => {
        expect(mockInitiateLogin).toHaveBeenCalledWith('supabase-jwt')
      })
    })
  })
})
