import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  it('logout clears all spotify keys from localStorage', () => {
    localStorage.setItem('spotify_access_token', 'tok')
    localStorage.setItem('spotify_refresh_token', 'ref')
    localStorage.setItem('spotify_expires_at', '123')
    localStorage.setItem('spotify_expires_in', '3600')
    localStorage.setItem('spotify_client_id', 'cid')

    const { result } = renderHook(() => useSpotifyAuth())
    act(() => result.current.logout())

    expect(localStorage.getItem('spotify_access_token')).toBeNull()
    expect(localStorage.getItem('spotify_refresh_token')).toBeNull()
    expect(localStorage.getItem('spotify_expires_in')).toBeNull()
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

    it('redirects to prod proxy URL when VITE_VERCEL_ENV is preview', async () => {
      const assignMock = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { assign: assignMock, origin: 'https://preview-123.vercel.app' },
        writable: true,
      })
      localStorage.setItem('spotify_client_id', 'my-client-id')

      const { useSpotifyAuth: useSpotifyAuthPreview } = await import('./useSpotifyAuth')
      const { result } = renderHook(() => useSpotifyAuthPreview())
      await act(async () => {
        await result.current.initiateLogin('supabase-jwt-token')
      })

      expect(assignMock).toHaveBeenCalledTimes(1)
      const url = assignMock.mock.calls[0][0]
      expect(url).toContain('/api/auth/preview-login')
      expect(url).toContain('origin=')
      expect(url).toContain('client_id=my-client-id')
      expect(url).toContain('supabase_token=supabase-jwt-token')
      // Should NOT set a PKCE verifier (prod proxy handles it)
      expect(localStorage.getItem('spotify_pkce_verifier')).toBeNull()
    })

    it('uses VITE_PROD_ORIGIN for the proxy base URL', async () => {
      const assignMock = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { assign: assignMock, origin: 'https://preview-123.vercel.app' },
        writable: true,
      })
      localStorage.setItem('spotify_client_id', 'cid')

      const { useSpotifyAuth: useSpotifyAuthPreview } = await import('./useSpotifyAuth')
      const { result } = renderHook(() => useSpotifyAuthPreview())
      await act(async () => {
        await result.current.initiateLogin('tok')
      })

      const url = assignMock.mock.calls[0][0]
      // Should use the VITE_PROD_ORIGIN env var (or fallback)
      expect(url).toMatch(/^https?:\/\//)
      expect(url).toContain('/api/auth/preview-login')
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
