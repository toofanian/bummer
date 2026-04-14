import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuth } from './useAuth'

vi.mock('../supabaseClient', () => ({
  default: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })),
      signOut: vi.fn(),
    },
  },
}))

import supabase from '../supabaseClient'

describe('useAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null session while loading', () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    const { result } = renderHook(() => useAuth())
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('returns session when user is logged in', async () => {
    const fakeSession = { user: { id: 'user-123' }, access_token: 'tok' }
    supabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession } })
    const { result } = renderHook(() => useAuth())
    await act(async () => {})
    expect(result.current.session).toEqual(fakeSession)
    expect(result.current.loading).toBe(false)
  })

  it('calls supabase.auth.signOut on logout()', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    supabase.auth.signOut.mockResolvedValue({})
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.logout() })
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})

describe('useAuth preview mode', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns a synthesized session without calling supabase.auth when VITE_VERCEL_ENV is "preview"', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'preview')

    const getSession = vi.fn()
    const onAuthStateChange = vi.fn()
    vi.doMock('../supabaseClient', () => ({
      default: {
        auth: { getSession, onAuthStateChange, signOut: vi.fn() },
      },
    }))

    const { useAuth: useAuthPreview } = await import('./useAuth')
    const { result } = renderHook(() => useAuthPreview())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.session).not.toBeNull()
    expect(result.current.session.user.id).toBe(
      '00000000-0000-0000-0000-000000000001'
    )
    expect(result.current.session.access_token).toBe('PREVIEW_FAKE')
    expect(getSession).not.toHaveBeenCalled()
    expect(onAuthStateChange).not.toHaveBeenCalled()
  })

  it('falls through to real supabase.auth when VITE_VERCEL_ENV is not "preview"', async () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'production')

    const getSession = vi
      .fn()
      .mockResolvedValue({ data: { session: null } })
    const onAuthStateChange = vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    vi.doMock('../supabaseClient', () => ({
      default: {
        auth: { getSession, onAuthStateChange, signOut: vi.fn() },
      },
    }))

    const { useAuth: useAuthProd } = await import('./useAuth')
    renderHook(() => useAuthProd())

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(onAuthStateChange).toHaveBeenCalled()
  })
})
