import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockDigest = vi.fn()
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr) => { arr.fill(1); return arr },
    subtle: { digest: mockDigest },
  },
  writable: true,
})

vi.stubGlobal('localStorage', (() => {
  let store = {}
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
})())

vi.stubGlobal('fetch', vi.fn())

import { useSpotifyAuth } from './useSpotifyAuth'

describe('useSpotifyAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockDigest.mockResolvedValue(new ArrayBuffer(32))
  })

  it('returns null access token when no tokens in localStorage', () => {
    const { result } = renderHook(() => useSpotifyAuth())
    expect(result.current.accessToken).toBeNull()
  })

  it('returns access token from localStorage when not expired', () => {
    localStorage.setItem('spotify_access_token', 'tok-123')
    localStorage.setItem('spotify_expires_at', String(Date.now() + 3600000))
    const { result } = renderHook(() => useSpotifyAuth())
    expect(result.current.accessToken).toBe('tok-123')
  })

  it('initiateLogin sets code_verifier in localStorage and redirects', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true })
    localStorage.setItem('spotify_client_id', 'my-client-id')

    const { result } = renderHook(() => useSpotifyAuth())
    await act(async () => { await result.current.initiateLogin() })

    expect(localStorage.getItem('spotify_pkce_verifier')).toBeTruthy()
    expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('accounts.spotify.com/authorize'))
  })

  it('handleCallback exchanges code for tokens', async () => {
    localStorage.setItem('spotify_pkce_verifier', 'test-verifier')
    localStorage.setItem('spotify_client_id', 'my-client-id')
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-tok',
        refresh_token: 'ref-tok',
        expires_in: 3600,
      }),
    })

    const { result } = renderHook(() => useSpotifyAuth())
    await act(async () => { await result.current.handleCallback('auth-code') })

    expect(localStorage.getItem('spotify_access_token')).toBe('new-tok')
    expect(localStorage.getItem('spotify_expires_in')).toBe('3600')
  })

  // H2: refresh_token must NOT be stored in localStorage
  it('handleCallback does not store refresh_token in localStorage', async () => {
    localStorage.setItem('spotify_pkce_verifier', 'test-verifier')
    localStorage.setItem('spotify_client_id', 'my-client-id')
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-tok',
        refresh_token: 'ref-tok',
        expires_in: 3600,
      }),
    })

    const { result } = renderHook(() => useSpotifyAuth())
    await act(async () => { await result.current.handleCallback('auth-code') })

    expect(localStorage.getItem('spotify_refresh_token')).toBeNull()
  })

  it('logout clears all spotify keys from localStorage', () => {
    localStorage.setItem('spotify_access_token', 'tok')
    localStorage.setItem('spotify_expires_at', '123')
    localStorage.setItem('spotify_expires_in', '3600')
    localStorage.setItem('spotify_client_id', 'cid')

    const { result } = renderHook(() => useSpotifyAuth())
    act(() => result.current.logout())

    expect(localStorage.getItem('spotify_access_token')).toBeNull()
    expect(localStorage.getItem('spotify_expires_in')).toBeNull()
  })

  // H2: logout should not reference spotify_refresh_token (it's not stored)
  it('logout does not attempt to clear spotify_refresh_token', () => {
    // Set it manually to verify logout doesn't touch it
    localStorage.setItem('spotify_refresh_token', 'should-not-be-touched')
    const { result } = renderHook(() => useSpotifyAuth())
    act(() => result.current.logout())
    // logout only clears keys it knows about; refresh_token is not among them
    expect(localStorage.getItem('spotify_refresh_token')).toBe('should-not-be-touched')
  })

  // M2: getAccessToken refreshes via backend, not Spotify directly
  it('getAccessToken calls backend refresh endpoint when token expired', async () => {
    localStorage.setItem('spotify_access_token', 'old-tok')
    localStorage.setItem('spotify_expires_at', String(Date.now() - 120000)) // expired

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-tok',
        expires_at: '2026-05-01T13:00:00+00:00',
      }),
    })

    const session = { access_token: 'supabase-jwt' }
    const { result } = renderHook(() => useSpotifyAuth())
    let token
    await act(async () => { token = await result.current.getAccessToken(session) })

    expect(token).toBe('refreshed-tok')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh-spotify-token'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer supabase-jwt',
        }),
      }),
    )
    expect(localStorage.getItem('spotify_access_token')).toBe('refreshed-tok')
  })

  it('getAccessToken returns null when no session provided and token expired', async () => {
    localStorage.setItem('spotify_access_token', 'old-tok')
    localStorage.setItem('spotify_expires_at', String(Date.now() - 120000))

    const { result } = renderHook(() => useSpotifyAuth())
    let token
    await act(async () => { token = await result.current.getAccessToken() })

    expect(token).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('getAccessToken returns stored token when not expired', async () => {
    localStorage.setItem('spotify_access_token', 'valid-tok')
    localStorage.setItem('spotify_expires_at', String(Date.now() + 3600000))

    const { result } = renderHook(() => useSpotifyAuth())
    let token
    await act(async () => { token = await result.current.getAccessToken() })

    expect(token).toBe('valid-tok')
    expect(fetch).not.toHaveBeenCalled()
  })

  describe('preview proxy login', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.stubEnv('VITE_VERCEL_ENV', 'preview')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    // M1: Preview login now uses hidden form POST (CORS-exempt) with token in body
    it('submits hidden form to prod proxy URL', async () => {
      Object.defineProperty(window, 'location', {
        value: { assign: vi.fn(), origin: 'https://preview-123.vercel.app' },
        writable: true,
      })
      localStorage.setItem('spotify_client_id', 'my-client-id')

      // Spy on appendChild without replacing it (React needs it)
      const appendSpy = vi.spyOn(document.body, 'appendChild')
      // Mock HTMLFormElement.submit to prevent navigation
      HTMLFormElement.prototype.submit = vi.fn()

      const { useSpotifyAuth: useSpotifyAuthPreview } = await import('./useSpotifyAuth')
      const { result } = renderHook(() => useSpotifyAuthPreview())
      await act(async () => {
        await result.current.initiateLogin('supabase-jwt-token')
      })

      // Find the form among all appendChild calls (React also appends)
      const formCall = appendSpy.mock.calls.find(([el]) => el instanceof HTMLFormElement)
      expect(formCall).toBeTruthy()
      const form = formCall[0]
      expect(form.method).toBe('post')
      expect(form.action).toContain('/api/auth/preview-login')
      // Token in hidden input, not URL
      const tokenInput = form.querySelector('input[name="supabase_token"]')
      expect(tokenInput.value).toBe('supabase-jwt-token')
      expect(HTMLFormElement.prototype.submit).toHaveBeenCalled()
      expect(localStorage.getItem('spotify_pkce_verifier')).toBeNull()

      appendSpy.mockRestore()
    })

    it('uses VITE_PROD_ORIGIN for the proxy form action', async () => {
      Object.defineProperty(window, 'location', {
        value: { assign: vi.fn(), origin: 'https://preview-123.vercel.app' },
        writable: true,
      })
      localStorage.setItem('spotify_client_id', 'cid')

      const appendSpy = vi.spyOn(document.body, 'appendChild')
      HTMLFormElement.prototype.submit = vi.fn()

      const { useSpotifyAuth: useSpotifyAuthPreview } = await import('./useSpotifyAuth')
      const { result } = renderHook(() => useSpotifyAuthPreview())
      await act(async () => {
        await result.current.initiateLogin('tok')
      })

      const formCall = appendSpy.mock.calls.find(([el]) => el instanceof HTMLFormElement)
      const form = formCall[0]
      expect(form.action).toMatch(/^https?:\/\//)
      expect(form.action).toContain('/api/auth/preview-login')

      appendSpy.mockRestore()
    })
  })

  it('initiateLogin does direct PKCE on prod (not preview)', async () => {
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', { value: { assign: assignMock }, writable: true })
    localStorage.setItem('spotify_client_id', 'my-client-id')

    const { result } = renderHook(() => useSpotifyAuth())
    await act(async () => { await result.current.initiateLogin() })

    expect(assignMock).toHaveBeenCalledWith(expect.stringContaining('accounts.spotify.com/authorize'))
    expect(localStorage.getItem('spotify_pkce_verifier')).toBeTruthy()
  })
})
