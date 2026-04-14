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

vi.mock('../hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    initiateLogin: vi.fn(),
    handleCallback: vi.fn().mockResolvedValue({
      access_token: 'acc', refresh_token: 'ref', expires_in: 3600,
    }),
    accessToken: null,
    logout: vi.fn(),
  }),
}))

vi.stubGlobal('fetch', vi.fn())

import OnboardingWizard from './OnboardingWizard'

const fakeSession = { access_token: 'supabase-jwt' }

describe('OnboardingWizard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
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
    expect(screen.getByText(/By connecting Spotify, you agree/i)).toBeInTheDocument()
  })

  it('posts tokens and calls onComplete after OAuth callback', async () => {
    // Simulate landing on the callback URL with ?code=
    window.history.replaceState({}, '', '/auth/spotify/callback?code=abc')
    localStorage.setItem('spotify_client_id', 'cid')
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    const onComplete = vi.fn()
    render(<OnboardingWizard session={fakeSession} onComplete={onComplete} />)
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    // Must have posted to /auth/spotify-token
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/spotify-token'),
      expect.objectContaining({ method: 'POST' }),
    )
    window.history.replaceState({}, '', '/')
  })

  it('does NOT render a "Yes, store it" consent button anywhere', () => {
    render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /yes, store it/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /no thanks/i })).not.toBeInTheDocument()
  })

  it('displays the Spotify redirect URI on the client_id step', () => {
    render(<OnboardingWizard session={fakeSession} onComplete={vi.fn()} />)
    // matches either configured env value or localhost fallback
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
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'Server error' }) })
    const onComplete = vi.fn()
    render(<OnboardingWizard session={fakeSession} onComplete={onComplete} />)
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument())
    expect(onComplete).not.toHaveBeenCalled()
    window.history.replaceState({}, '', '/')
  })
})
